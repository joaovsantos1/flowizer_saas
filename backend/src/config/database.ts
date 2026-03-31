import knex, { type Knex } from 'knex';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: config.DB_SSL ? { rejectUnauthorized: true } : false,
    // Timeout de conexão para detectar problemas cedo
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  },
  pool: {
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  // Previne SQL injection via parâmetros tipados
  asyncStackTraces: config.NODE_ENV !== 'production',
  debug: false, // NUNCA logar queries em produção (podem ter dados sensíveis)
};

export const db = knex(knexConfig);

// ─── Health check da conexão ──────────────────────────────────────────────────

export async function testDatabaseConnection(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    logger.info('Conexão com o banco estabelecida com sucesso');
  } catch (error) {
    logger.error('Falha ao conectar ao banco de dados', { error });
    throw error;
  }
}

// ─── Migrations: schema do banco ─────────────────────────────────────────────
// Execute: npm run migrate

export const migrations: Knex.MigratorConfig = {
  directory: './migrations',
  tableName: 'knex_migrations',
};
