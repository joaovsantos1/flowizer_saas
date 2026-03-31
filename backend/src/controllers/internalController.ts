import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../config/database.js';
import { encrypt } from '../services/encryption/EncryptionService.js';
import { logAccess, logAudit, logSecurity } from '../utils/logger.js';

// ─── Statuses que permitem acesso ─────────────────────────────────────────────
const ACTIVE_STATUSES = new Set(['trialing', 'active']);

// ─── POST /internal/check-access ─────────────────────────────────────────────
//
// Chamado pelo n8n ANTES de acionar a IA.
// O n8n envia o telefone do usuário; o backend responde com o status.
// n8n decide se libera ou bloqueia — nunca confia no status sem consultar aqui.

const CheckAccessSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Telefone deve estar no formato E.164: +5511999999999'),
});

export async function checkAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = CheckAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Formato de telefone inválido',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { phone } = parsed.data;
    const phoneHash = crypto.createHash('sha256').update(phone).digest('hex');

    const user = await db('users')
      .select('id', 'name', 'status', 'subscription_status', 'trial_ends_at', 'subscription_ends_at')
      .where({ phone_hash: phoneHash })
      .whereNull('deleted_at')
      .first();

    // Usuário não cadastrado
    if (!user) {
      logAccess({ action: 'check_access_unknown_phone', statusCode: 200 });
      res.json({
        found: false,
        access: 'blocked',
        status: 'not_registered',
        message: 'Usuário não encontrado. Cadastre-se em nosso site para começar.',
      });
      return;
    }

    // Usuário suspenso
    if (user.status === 'suspended') {
      logSecurity({ userId: user.id, event: 'check_access_suspended', severity: 'medium' });
      res.json({
        found: true,
        access: 'blocked',
        status: 'suspended',
        userId: user.id,
        message: 'Conta suspensa. Entre em contato com o suporte.',
      });
      return;
    }

    const hasAccess = ACTIVE_STATUSES.has(user.subscription_status);

    logAccess({
      userId: user.id,
      action: 'check_access',
      statusCode: 200,
    });

    // Resposta completa para o n8n — inclui userId para que o n8n
    // possa enviá-lo de volta ao chamar endpoints de persistência
    res.json({
      found: true,
      access: hasAccess ? 'allowed' : 'blocked',
      status: user.subscription_status,
      userId: user.id,
      name: user.name,
      // Mensagem pronta para o n8n enviar ao usuário se bloqueado
      message: hasAccess
        ? null
        : getBlockedMessage(user.subscription_status),
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /internal/transactions ─────────────────────────────────────────────
//
// n8n chama após a IA interpretar uma intenção de gasto/receita.
// Backend valida, criptografa e persiste. Nunca confia 100% nos dados da IA.

const InternalTransactionSchema = z.object({
  userId: z.string().uuid('userId inválido'),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive('Valor deve ser positivo').max(999_999_999),
  category: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .regex(/^[\wÀ-ÿ\s\-]+$/u, 'Categoria com caracteres inválidos'),
  description: z.string().max(255).trim().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .transform((d) => {
      if (!d) return new Date().toISOString().split('T')[0]!;
      // Rejeitar datas no futuro
      if (new Date(d) > new Date()) throw new Error('Data não pode ser no futuro');
      // Rejeitar datas com mais de 1 ano
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (new Date(d) < oneYearAgo) throw new Error('Data mais de 1 ano no passado');
      return d;
    }),
  currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
});

export async function internalCreateTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = InternalTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Dados de transação inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { userId, type, amount, category, description, date, currency } = parsed.data;

    // Verificar que o usuário existe e tem acesso — NUNCA confiar só no userId vindo do n8n
    const user = await db('users')
      .select('id', 'subscription_status', 'status')
      .where({ id: userId, deleted_at: null })
      .first();

    if (!user || !ACTIVE_STATUSES.has(user.subscription_status) || user.status !== 'active') {
      logSecurity({ userId, event: 'internal_transaction_access_denied', severity: 'high' });
      res.status(403).json({ error: 'Usuário sem acesso ativo' });
      return;
    }

    const amountCents = Math.round(amount * 100);

    const [tx] = await db('transactions')
      .insert({
        user_id: userId,
        type,
        amount_encrypted: encrypt(String(amount)),
        amount_cents: amountCents,
        category,
        description_encrypted: description ? encrypt(description) : null,
        description_plain: category,
        transaction_date: date,
        source: 'whatsapp', // origem sempre whatsapp quando vem do n8n
        currency,
      })
      .returning(['id', 'type', 'amount_cents', 'category', 'transaction_date']);

    logAudit({
      userId,
      action: 'transaction_created_via_n8n',
      resourceType: 'transaction',
      resourceId: tx?.id,
      details: { type, category, currency },
    });

    res.status(201).json({
      id: tx?.id,
      type: tx?.type,
      amount: Number(tx?.amount_cents ?? 0) / 100,
      category: tx?.category,
      transaction_date: tx?.transaction_date,
      currency,
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /internal/reminders ─────────────────────────────────────────────────
//
// n8n chama para criar lembretes após a IA interpretar a intenção.

const InternalReminderSchema = z.object({
  userId: z.string().uuid('userId inválido'),
  title: z.string().min(1).max(255).trim(),
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt deve ser ISO 8601' })
    .transform((d) => {
      const date = new Date(d);
      if (date < new Date()) throw new Error('Lembrete não pode ser no passado');
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);
      if (date > maxDate) throw new Error('Lembrete não pode ser mais de 1 ano no futuro');
      return date;
    }),
  message: z.string().max(500).trim().optional(),
  recurrence: z.enum(['once', 'daily', 'weekly', 'monthly']).default('once'),
});

export async function internalCreateReminder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = InternalReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Dados de lembrete inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { userId, title, scheduledAt, message, recurrence } = parsed.data;

    // Verificar acesso do usuário
    const user = await db('users')
      .select('id', 'subscription_status', 'status')
      .where({ id: userId, deleted_at: null })
      .first();

    if (!user || !ACTIVE_STATUSES.has(user.subscription_status) || user.status !== 'active') {
      res.status(403).json({ error: 'Usuário sem acesso ativo' });
      return;
    }

    const [reminder] = await db('reminders')
      .insert({
        user_id: userId,
        title,
        message_encrypted: message ? encrypt(message) : null,
        scheduled_at: scheduledAt,
        next_run_at: scheduledAt,
        recurrence: recurrence === 'once' ? null : recurrence,
      })
      .returning(['id', 'title', 'scheduled_at', 'recurrence']);

    logAudit({
      userId,
      action: 'reminder_created_via_n8n',
      resourceType: 'reminder',
      resourceId: reminder?.id,
    });

    res.status(201).json({
      id: reminder?.id,
      title: reminder?.title,
      scheduled_at: reminder?.scheduled_at,
      recurrence: reminder?.recurrence ?? 'once',
    });
  } catch (error) {
    next(error);
  }
}

// ─── GET /internal/user-summary ──────────────────────────────────────────────
//
// n8n pode chamar para obter resumo financeiro e incluir na resposta da IA.

export async function internalUserSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;

    if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) {
      res.status(400).json({ error: 'userId inválido' });
      return;
    }

    // Verificar acesso
    const user = await db('users')
      .select('id', 'name', 'subscription_status', 'status')
      .where({ id: userId, deleted_at: null })
      .first();

    if (!user || !ACTIVE_STATUSES.has(user.subscription_status)) {
      res.status(403).json({ error: 'Usuário sem acesso ativo' });
      return;
    }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0]!;

    const summary = await db('transactions')
      .where({ user_id: userId })
      .whereBetween('transaction_date', [monthStart, today])
      .whereNull('deleted_at')
      .select(
        db.raw("SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END)::int as total_income"),
        db.raw("SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)::int as total_expense"),
        db.raw('COUNT(*)::int as count')
      )
      .first();

    const totalIncome = Number(summary?.['total_income'] ?? 0);
    const totalExpense = Number(summary?.['total_expense'] ?? 0);

    res.json({
      userId: user.id,
      name: user.name,
      period: { start: monthStart, end: today },
      totalIncome: totalIncome / 100,
      totalExpense: totalExpense / 100,
      balance: (totalIncome - totalExpense) / 100,
      transactionCount: Number(summary?.['count'] ?? 0),
    });
  } catch (error) {
    next(error);
  }
}

// ─── Helper: mensagens de bloqueio por status ─────────────────────────────────

function getBlockedMessage(status: string): string {
  const messages: Record<string, string> = {
    past_due: '⚠️ Seu pagamento está pendente. Acesse o dashboard para regularizar e continuar usando o assistente.',
    canceled: '❌ Sua assinatura foi cancelada. Acesse o dashboard para reativar seu plano.',
    unpaid: '⚠️ Há um pagamento em aberto. Regularize para continuar usando o assistente.',
    not_registered: '👋 Você ainda não possui conta. Acesse nosso site para se cadastrar e começar seu trial grátis de 7 dias!',
  };
  return messages[status] ?? '❌ Acesso não autorizado. Acesse o dashboard para verificar sua conta.';
}
