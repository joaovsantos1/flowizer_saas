import Stripe from 'stripe';
import { config } from '../../config/index.js';
import { db } from '../../config/database.js';
import { logAudit, logError } from '../../utils/logger.js';
import { timingSafeEqual } from '../encryption/EncryptionService.js';

const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
  timeout: 10000,
  maxNetworkRetries: 3,
});

// ─── Serviço de assinaturas ───────────────────────────────────────────────────

export class StripeService {
  /**
   * Cria um novo cliente Stripe e inicia o período de trial.
   * Chamado no registro do usuário.
   */
  async createCustomerWithTrial(user: {
    id: string;
    name: string;
  }): Promise<{ customerId: string; subscriptionId: string }> {
    // Criar cliente Stripe — NUNCA armazenar dados de cartão
    const customer = await stripe.customers.create({
      name: user.name,
      // email e phone omitidos aqui para minimizar dados na Stripe
      metadata: {
        userId: user.id,
        env: config.NODE_ENV,
      },
    });

    // Criar assinatura com trial de 7 dias (sem cartão obrigatório no trial)
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: config.STRIPE_PRICE_ID_MONTHLY }],
      trial_period_days: config.STRIPE_TRIAL_DAYS,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId: user.id },
    });

    // Salvar IDs no banco
    await db('users').where({ id: user.id }).update({
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      trial_ends_at: new Date(
        Date.now() + config.STRIPE_TRIAL_DAYS * 24 * 60 * 60 * 1000
      ),
      subscription_status: 'trialing',
    });

    logAudit({
      userId: user.id,
      action: 'subscription_created',
      resourceType: 'subscription',
      resourceId: subscription.id,
    });

    return {
      customerId: customer.id,
      subscriptionId: subscription.id,
    };
  }

  /**
   * Gera URL do Customer Portal para o usuário gerenciar assinatura.
   * O portal da Stripe cuida de cartões, faturamento e cancelamento.
   */
  async createPortalSession(
    userId: string,
    returnUrl: string
  ): Promise<string> {
    const user = await db('users')
      .select('stripe_customer_id')
      .where({ id: userId })
      .first();

    if (!user?.stripe_customer_id) {
      throw new Error('Usuário não possui conta Stripe');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl,
    });

    return session.url;
  }

  /**
   * Cria sessão de checkout para adicionar cartão após o trial.
   */
  async createCheckoutSession(
    userId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const user = await db('users')
      .select('stripe_customer_id', 'stripe_subscription_id')
      .where({ id: userId })
      .first();

    if (!user?.stripe_customer_id) {
      throw new Error('Usuário não possui conta Stripe');
    }

    const session = await stripe.checkout.sessions.create({
      customer: user.stripe_customer_id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: config.STRIPE_PRICE_ID_MONTHLY, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: { userId },
    });

    return session.url!;
  }

  /**
   * Processa webhook da Stripe com validação de assinatura.
   * Idempotente — reprocessar o mesmo evento é seguro.
   */
  async processWebhook(
    rawBody: string,
    signature: string
  ): Promise<void> {
    let event: Stripe.Event;

    try {
      // Valida assinatura usando timing-safe comparison internamente da Stripe
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      throw new Error(`Assinatura do webhook Stripe inválida: ${err}`);
    }

    // Idempotência: verificar se já processamos este evento
    const existing = await db('subscription_events')
      .where({ stripe_event_id: event.id })
      .first();

    if (existing?.processed === 'yes') {
      return; // Já processado — ignorar
    }

    // Registrar evento antes de processar
    await db('subscription_events').insert({
      user_id: await this.getUserIdFromEvent(event),
      stripe_event_id: event.id,
      event_type: event.type,
      event_data: this.sanitizeEventData(event.data),
      processed: 'no',
    }).onConflict('stripe_event_id').ignore();

    try {
      await this.handleStripeEvent(event);

      await db('subscription_events')
        .where({ stripe_event_id: event.id })
        .update({ processed: 'yes' });
    } catch (error) {
      await db('subscription_events')
        .where({ stripe_event_id: event.id })
        .update({ processed: 'error' });
      throw error;
    }
  }

  private async handleStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata['userId'];
        if (!userId) break;
        logAudit({ userId, action: 'trial_ending_soon', resourceType: 'subscription', resourceId: sub.id });
        // Aqui: enviar notificação via WhatsApp
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata['userId'];
        if (!userId) break;
        await db('users').where({ id: userId }).update({
          subscription_status: this.mapStripeStatus(sub.status),
          stripe_subscription_id: sub.id,
          subscription_ends_at: sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null,
        });
        logAudit({ userId, action: 'subscription_updated', resourceType: 'subscription', resourceId: sub.id });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata['userId'];
        if (!userId) break;
        await db('users').where({ id: userId }).update({
          subscription_status: 'canceled',
        });
        logAudit({ userId, action: 'subscription_canceled', resourceType: 'subscription', resourceId: sub.id });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await db('users')
          .where({ stripe_customer_id: customerId })
          .update({ subscription_status: 'past_due' });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await db('users')
          .where({ stripe_customer_id: customerId })
          .update({ subscription_status: 'active' });
        break;
      }
    }
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): string {
    const map: Record<string, string> = {
      trialing: 'trialing',
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'unpaid',
      incomplete: 'past_due',
      incomplete_expired: 'canceled',
      paused: 'past_due',
    };
    return map[status] ?? 'canceled';
  }

  private async getUserIdFromEvent(event: Stripe.Event): Promise<string> {
    const obj = event.data.object as Record<string, unknown>;
    const userId = (obj['metadata'] as Record<string, string>)?.['userId'];
    if (userId) return userId;

    const customerId = obj['customer'] as string;
    if (customerId) {
      const user = await db('users')
        .select('id')
        .where({ stripe_customer_id: customerId })
        .first();
      return user?.id ?? 'unknown';
    }
    return 'unknown';
  }

  /**
   * Remove dados de pagamento sensíveis antes de armazenar no banco.
   * Nunca armazenar dados de cartão, mesmo que mascarados.
   */
  private sanitizeEventData(data: Stripe.Event.Data): Record<string, unknown> {
    const obj = { ...data.object } as Record<string, unknown>;
    // Remover qualquer referência a dados de pagamento
    delete obj['payment_method_details'];
    delete obj['payment_intent'];
    delete obj['source'];
    return { object_type: (data.object as { object?: string }).object ?? 'unknown' };
  }
}

export const stripeService = new StripeService();
