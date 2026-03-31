import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../config/database.js';
import { logSecurity, logAccess } from '../utils/logger.js';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;       // user_id
  role: 'user' | 'admin';
  subscriptionStatus: string;
  iat: number;
  exp: number;
  jti: string;       // JWT ID único — para revogação
}

// Extende o tipo de Request do Express
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      startTime?: number;
    }
  }
}

// ─── Lista negra de tokens (tokens revogados antes da expiração) ──────────────
// Em produção, usar Redis com TTL = tempo até expiração do token
const revokedTokens = new Set<string>();

// ─── Middleware principal de autenticação ─────────────────────────────────────

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  req.startTime = Date.now();

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logSecurity({
      event: 'auth_missing_token',
      ip: req.ip,
      severity: 'low',
    });
    res.status(401).json({ error: 'Token de autenticação não fornecido' });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;

    // Verificar se o token foi revogado
    if (revokedTokens.has(payload.jti)) {
      logSecurity({
        userId: payload.sub,
        event: 'auth_revoked_token',
        ip: req.ip,
        severity: 'high',
      });
      res.status(401).json({ error: 'Token revogado' });
      return;
    }

    // Verificar se usuário ainda existe e está ativo
    const user = await db('users')
      .select('id', 'status', 'subscription_status', 'role')
      .where({ id: payload.sub, deleted_at: null })
      .first();

    if (!user) {
      logSecurity({
        userId: payload.sub,
        event: 'auth_user_not_found',
        ip: req.ip,
        severity: 'medium',
      });
      res.status(401).json({ error: 'Usuário não encontrado' });
      return;
    }

    if (user.status === 'suspended') {
      logSecurity({
        userId: payload.sub,
        event: 'auth_suspended_user',
        ip: req.ip,
        severity: 'medium',
      });
      res.status(403).json({ error: 'Conta suspensa' });
      return;
    }

    // Atualiza payload com dados frescos do banco (não confiar só no JWT)
    req.user = {
      ...payload,
      role: user.role,
      subscriptionStatus: user.subscription_status,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      logSecurity({
        event: 'auth_invalid_token',
        ip: req.ip,
        severity: 'medium',
      });
      res.status(401).json({ error: 'Token inválido' });
      return;
    }
    next(error);
  }
}

// ─── Middleware de verificação de assinatura ──────────────────────────────────

export function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  const allowedStatuses = ['trialing', 'active'];
  if (!allowedStatuses.includes(req.user.subscriptionStatus)) {
    logAccess({
      userId: req.user.sub,
      action: 'subscription_blocked',
      path: req.path,
      statusCode: 402,
    });
    res.status(402).json({
      error: 'Assinatura inativa',
      code: 'SUBSCRIPTION_REQUIRED',
      subscriptionStatus: req.user.subscriptionStatus,
    });
    return;
  }

  next();
}

// ─── Middleware de role ───────────────────────────────────────────────────────

export function requireRole(role: 'admin' | 'user') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    if (role === 'admin' && req.user.role !== 'admin') {
      logSecurity({
        userId: req.user.sub,
        event: 'auth_insufficient_permissions',
        ip: req.ip,
        severity: 'medium',
      });
      res.status(403).json({ error: 'Permissão insuficiente' });
      return;
    }

    next();
  };
}

// ─── Geração de tokens ────────────────────────────────────────────────────────

import crypto from 'crypto';

export function generateAccessToken(user: {
  id: string;
  role: 'user' | 'admin';
  subscription_status: string;
}): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: user.id,
    role: user.role,
    subscriptionStatus: user.subscription_status,
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: 'whatsapp-saas',
    audience: 'whatsapp-saas-client',
  });
}

export function generateRefreshToken(): {
  token: string;
  hash: string;
  family: string;
} {
  const token = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const family = crypto.randomUUID();
  return { token, hash, family };
}

export function revokeToken(jti: string): void {
  revokedTokens.add(jti);
}
