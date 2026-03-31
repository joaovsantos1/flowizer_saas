import winston from 'winston';
import { config } from '../config/index.js';

// ─── Campos que NUNCA devem aparecer em logs ──────────────────────────────────
const SENSITIVE_FIELDS = new Set([
  'password', 'senha', 'token', 'secret', 'authorization',
  'phone', 'telefone', 'cpf', 'cnpj', 'card', 'cvv',
  'account', 'balance', 'saldo', 'credit', 'debit',
  'refreshToken', 'accessToken', 'apiKey', 'api_key',
  'encryption_key', 'private_key', 'webhook_secret',
]);

/**
 * Sanitiza recursivamente objetos para remoção de dados sensíveis.
 * Substitui valores sensíveis por '[REDACTED]'.
 */
function sanitizeLog(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Nunca logar strings longas que podem ser tokens/chaves
    if (obj.length > 200) return '[STRING_TRUNCATED]';
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLog(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(lowerKey) || [...SENSITIVE_FIELDS].some(f => lowerKey.includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeLog(value, depth + 1);
    }
  }
  return sanitized;
}

// ─── Formato customizado com sanitização ─────────────────────────────────────
const sanitizeFormat = winston.format((info) => {
  const sanitized = sanitizeLog(info) as typeof info;
  return sanitized;
});

// ─── Configuração do logger ───────────────────────────────────────────────────
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    sanitizeFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'whatsapp-saas',
    env: config.NODE_ENV,
  },
  transports: [
    // Arquivo: todos os logs
    new winston.transports.File({
      filename: 'logs/app.log',
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 14,
      tailable: true,
    }),
    // Arquivo: apenas erros
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 20 * 1024 * 1024,
      maxFiles: 30,
    }),
  ],
});

// Console apenas em desenvolvimento
if (config.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// ─── Helpers de log estruturado ───────────────────────────────────────────────

export function logAccess(meta: {
  userId?: string;
  action: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
}): void {
  logger.info('ACCESS', { ...meta, type: 'access' });
}

export function logSecurity(meta: {
  userId?: string;
  event: string;
  ip?: string;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}): void {
  logger.warn('SECURITY', { ...meta, type: 'security' });
}

export function logError(meta: {
  userId?: string;
  error: Error | unknown;
  context?: string;
  operation?: string;
}): void {
  const err = meta.error instanceof Error ? meta.error : new Error(String(meta.error));
  logger.error('ERROR', {
    type: 'error',
    context: meta.context,
    operation: meta.operation,
    userId: meta.userId,
    message: err.message,
    stack: config.NODE_ENV === 'production' ? undefined : err.stack,
  });
}

export function logAudit(meta: {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}): void {
  logger.info('AUDIT', { ...meta, type: 'audit' });
}

export { logger };
