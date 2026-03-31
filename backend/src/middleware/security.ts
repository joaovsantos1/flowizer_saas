import { Request, Response, NextFunction, Application } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import hpp from 'hpp';
import xss from 'xss';
import { config } from '../config/index.js';
import { logSecurity } from '../utils/logger.js';

// ─── Helmet: headers de segurança HTTP ───────────────────────────────────────

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 ano
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: true,
});

// ─── CORS configuração restrita ───────────────────────────────────────────────

const allowedOrigins = [
  config.APP_URL,
  ...(config.NODE_ENV === 'development' ? ['http://localhost:3001', 'http://localhost:5173'] : []),
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (mobile, Postman em dev)
    if (!origin && config.NODE_ENV === 'development') {
      callback(null, true);
      return;
    }
    if (origin && allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logSecurity({ event: 'cors_blocked', severity: 'medium' });
      callback(new Error('CORS: origem não permitida'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 86400, // 24h cache do preflight
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

// Rate limit geral
export const generalRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar IP real atrás de proxy
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip;
    return ip ?? 'unknown';
  },
  handler: (req, res) => {
    logSecurity({
      event: 'rate_limit_exceeded',
      ip: req.ip,
      severity: 'medium',
    });
    res.status(429).json({
      error: 'Muitas requisições. Tente novamente mais tarde.',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000 / 60) + ' minutos',
    });
  },
});

// Rate limit para auth (mais restritivo)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 tentativas de login
  skipSuccessfulRequests: true, // não contar sucessos
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip) ?? 'unknown';
  },
  handler: (req, res) => {
    logSecurity({
      event: 'auth_rate_limit_exceeded',
      ip: req.ip,
      severity: 'high',
    });
    res.status(429).json({
      error: 'Muitas tentativas de login. Aguarde 15 minutos.',
    });
  },
});

// Rate limit para webhooks
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip) ?? 'unknown';
  },
});

// ─── Sanitização de Input ─────────────────────────────────────────────────────

/**
 * Sanitiza todos os campos de string no body, query e params.
 * Remove XSS e caracteres de controle potencialmente perigosos.
 */
export function sanitizeInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query) as typeof req.query;
  }
  // Params são apenas strings simples — sanitizar diretamente
  if (req.params) {
    for (const key of Object.keys(req.params)) {
      const val = req.params[key];
      if (typeof val === 'string') {
        req.params[key] = xss(val.trim());
      }
    }
  }
  next();
}

function sanitizeObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return xss(obj.trim()) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      sanitized[xss(key)] = sanitizeObject(value);
    }
    return sanitized as T;
  }
  return obj;
}

// ─── Middleware de request ID ─────────────────────────────────────────────────

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-ID', id);
  (req as Request & { id: string }).id = id;
  next();
}

// ─── Registra todos os middlewares de segurança na aplicação ──────────────────

export function applySecurityMiddleware(app: Application): void {
  app.set('trust proxy', 1); // Confiar no primeiro proxy (nginx)
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestId);
  app.use(generalRateLimit);
  app.use(hpp()); // Previne HTTP Parameter Pollution
  app.use(sanitizeInput);
}
