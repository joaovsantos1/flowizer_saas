import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/stripe/StripeService.js';
import { logSecurity } from '../utils/logger.js';

// ─── NOTA DE ARQUITETURA ──────────────────────────────────────────────────────
//
// Os webhooks do WhatsApp NÃO são mais processados pelo backend.
// O n8n recebe os eventos da Evolution API diretamente via webhook.
// O backend apenas:
//   1. Expõe /internal/check-access para o n8n validar acesso
//   2. Expõe /internal/transactions e /internal/reminders para persistência
//   3. Processa webhooks do Stripe para atualizar status de assinaturas
//
// Ver: src/routes/internal.ts e src/controllers/internalController.ts

// ─── Webhook Stripe ───────────────────────────────────────────────────────────

export async function stripeWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      res.status(400).json({ error: 'Assinatura Stripe ausente' });
      return;
    }

    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';

    await stripeService.processWebhook(rawBody, signature);
    res.json({ received: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Assinatura')) {
      logSecurity({ event: 'stripe_webhook_invalid_signature', ip: req.ip, severity: 'critical' });
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}
