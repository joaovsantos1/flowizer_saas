import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ─── Extensões do PostgreSQL ───────────────────────────────────────────────
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ─── Tabela de usuários ───────────────────────────────────────────────────
  // ATENÇÃO: phone e email são armazenados CRIPTOGRAFADOS (AES-256)
  // Nunca consultar por phone/email diretamente — usar phone_hash para lookup
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.string('email_encrypted', 512).notNullable(); // AES-256
    table.string('email_hash', 64).notNullable().unique(); // SHA-256 para lookup
    table.string('phone_encrypted', 512).notNullable(); // AES-256
    table.string('phone_hash', 64).notNullable().unique(); // SHA-256 para lookup
    table.string('password_hash', 255).notNullable(); // bcrypt
    table.enum('role', ['user', 'admin']).notNullable().defaultTo('user');
    table.enum('status', ['active', 'suspended', 'deleted']).notNullable().defaultTo('active');
    table.enum('subscription_status', [
      'trialing', 'active', 'past_due', 'canceled', 'unpaid'
    ]).notNullable().defaultTo('trialing');
    table.string('stripe_customer_id', 255).nullable();
    table.string('stripe_subscription_id', 255).nullable();
    table.timestamp('trial_ends_at').nullable();
    table.timestamp('subscription_ends_at').nullable();
    table.jsonb('preferences').notNullable().defaultTo('{}');
    table.boolean('is_email_verified').notNullable().defaultTo(false);
    table.string('email_verification_token', 255).nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable(); // soft delete

    // Índices para performance — NUNCA index em campos criptografados
    table.index('email_hash');
    table.index('phone_hash');
    table.index('stripe_customer_id');
    table.index('subscription_status');
    table.index('status');
  });

  // ─── Tabela de refresh tokens ────────────────────────────────────────────
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable().unique(); // SHA-256 do token real
    table.string('family', 255).notNullable(); // detecção de reutilização
    table.timestamp('expires_at').notNullable();
    table.boolean('revoked').notNullable().defaultTo(false);
    table.string('ip_address', 45).nullable();
    table.string('user_agent', 512).nullable();
    table.timestamps(true, true);

    table.index('user_id');
    table.index(['token_hash', 'revoked']);
  });

  // ─── Tabela de transações financeiras ────────────────────────────────────
  // amount_encrypted: valor AES-256. Nunca em texto puro.
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('type', ['income', 'expense']).notNullable();
    table.string('amount_encrypted', 512).notNullable(); // AES-256
    table.decimal('amount_cents', 15, 0).notNullable(); // para cálculos (sem decimais)
    table.string('category', 100).notNullable();
    table.string('description_encrypted', 1024).nullable(); // AES-256
    table.string('description_plain', 255).nullable(); // versão sem dados sensíveis para filtros
    table.date('transaction_date').notNullable();
    table.string('source', 50).notNullable().defaultTo('whatsapp'); // whatsapp | dashboard | api
    table.string('currency', 3).notNullable().defaultTo('BRL');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    // CRÍTICO: sempre filtrar por user_id em TODAS as queries
    table.index(['user_id', 'transaction_date']);
    table.index(['user_id', 'type']);
    table.index(['user_id', 'category']);
    table.index('user_id');
  });

  // ─── Tabela de lembretes ─────────────────────────────────────────────────
  await knex.schema.createTable('reminders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.string('message_encrypted', 1024).nullable(); // AES-256
    table.timestamp('scheduled_at').notNullable();
    table.string('recurrence', 100).nullable(); // cron expression
    table.enum('status', ['pending', 'sent', 'failed', 'canceled']).notNullable().defaultTo('pending');
    table.integer('retry_count').notNullable().defaultTo(0);
    table.timestamp('last_sent_at').nullable();
    table.timestamp('next_run_at').nullable();
    table.timestamps(true, true);

    table.index(['user_id', 'status']);
    table.index(['status', 'scheduled_at']); // para o job scheduler
    table.index('user_id');
  });

  // ─── Tabela de conversas WhatsApp ────────────────────────────────────────
  // Apenas metadados — nunca conteúdo completo das mensagens
  await knex.schema.createTable('whatsapp_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('wa_message_id', 255).nullable().unique();
    table.enum('intent', [
      'add_expense', 'add_income', 'list_transactions',
      'add_reminder', 'list_reminders', 'get_balance',
      'get_report', 'help', 'unknown'
    ]).notNullable().defaultTo('unknown');
    table.jsonb('parsed_data').notNullable().defaultTo('{}'); // sem dados sensíveis
    table.enum('status', ['pending', 'processed', 'failed']).notNullable().defaultTo('pending');
    table.string('error_message', 512).nullable();
    table.timestamp('message_timestamp').notNullable();
    table.timestamps(true, true);

    table.index(['user_id', 'created_at']);
    table.index('status');
  });

  // ─── Tabela de eventos de assinatura (auditoria Stripe) ──────────────────
  await knex.schema.createTable('subscription_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('stripe_event_id', 255).notNullable().unique();
    table.string('event_type', 100).notNullable();
    table.jsonb('event_data').notNullable().defaultTo('{}'); // sem dados de cartão
    table.enum('processed', ['yes', 'no', 'error']).notNullable().defaultTo('no');
    table.timestamps(true, true);

    table.index(['user_id', 'event_type']);
    table.index('stripe_event_id');
  });

  // ─── Row Level Security (RLS) — isolamento por usuário ───────────────────
  // Garante que mesmo queries com bug não exponham dados de outros usuários
  await knex.raw(`
    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

    -- Política: aplicação usa role específico, só vê seus dados
    CREATE POLICY transactions_isolation ON transactions
      USING (user_id = current_setting('app.current_user_id', true)::uuid);

    CREATE POLICY reminders_isolation ON reminders
      USING (user_id = current_setting('app.current_user_id', true)::uuid);

    CREATE POLICY sessions_isolation ON whatsapp_sessions
      USING (user_id = current_setting('app.current_user_id', true)::uuid);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('subscription_events');
  await knex.schema.dropTableIfExists('whatsapp_sessions');
  await knex.schema.dropTableIfExists('reminders');
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('users');
}
