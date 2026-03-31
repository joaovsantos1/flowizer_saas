import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { timingSafeEqual } from '../services/encryption/EncryptionService.js';
import { logSecurity } from '../utils/logger.js';

// ─── Middleware: autentica requisições vindas do n8n ─────────────────────────
//
// Segurança em duas camadas:
//   1. Bearer token (obrigatório) — validado com timing-safe comparison
//   2. IP allowlist (opcional) — se N8N_ALLOWED_IPS estiver configurado
//
// O n8n deve enviar:
//   Authorization: Bearer <N8N_INTERNAL_SECRET>
//
// NUNCA expor endpoints /internal/* para a internet pública.
// Garantir via Nginx que /api/v1/internal/* só aceita tráfego interno.

// Lista de IPs permitidos (carregada uma vez na inicialização)
const allowedIPs: Set<string> = new Set(
  config.N8N_ALLOWED_IPS
    ? config.N8N_ALLOWED_IPS.split(',').map((ip) => ip.trim()).filter(Boolean)
    : []
);

export function internalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const clientIP =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.ip ??
    '';

  // 1. Verificar IP allowlist (se configurada)
  if (allowedIPs.size > 0 && !allowedIPs.has(clientIP)) {
    logSecurity({
      event: 'internal_ip_blocked',
      ip: clientIP,
      severity: 'high',
    });
    res.status(403).json({ error: 'Acesso negado: IP não autorizado' });
    return;
  }

  // 2. Verificar Bearer token
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logSecurity({
      event: 'internal_missing_token',
      ip: clientIP,
      severity: 'high',
    });
    res.status(401).json({ error: 'Token interno ausente' });
    return;
  }

  const providedToken = authHeader.slice(7);

  // Timing-safe comparison — previne timing attacks
  const expectedHex = Buffer.from(config.N8N_INTERNAL_SECRET).toString('hex');
  const providedHex = Buffer.from(providedToken).toString('hex');

  if (!timingSafeEqual(expectedHex, providedHex)) {
    logSecurity({
      event: 'internal_invalid_token',
      ip: clientIP,
      severity: 'critical',
    });
    res.status(401).json({ error: 'Token interno inválido' });
    return;
  }

  next();
}
