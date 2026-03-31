import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { computeHmac, timingSafeEqual } from '../encryption/EncryptionService.js';

// ─── Interface do provider (abstração) ───────────────────────────────────────

export interface IncomingMessage {
  messageId: string;
  from: string;          // número do remetente (E.164: +5511999999999)
  body: string;          // texto da mensagem
  timestamp: Date;
  type: 'text' | 'audio' | 'image' | 'document' | 'location';
}

export interface MessageProvider {
  /**
   * Envia mensagem de texto para um número WhatsApp.
   * @param to - número no formato E.164
   * @param message - texto a enviar (máx 4096 chars)
   */
  sendText(to: string, message: string): Promise<void>;

  /**
   * Valida assinatura do webhook recebido.
   * @returns true se o webhook é legítimo
   */
  validateWebhook(
    headers: Record<string, string>,
    rawBody: string
  ): boolean;

  /**
   * Parseia o payload do webhook para IncomingMessage.
   * @returns null se não for mensagem de texto ou inválida
   */
  parseWebhook(body: unknown): IncomingMessage | null;
}

// ─── Evolution API Adapter ────────────────────────────────────────────────────

class EvolutionAdapter implements MessageProvider {
  private readonly baseUrl = config.EVOLUTION_API_URL!;
  private readonly apiKey = config.EVOLUTION_API_KEY!;
  private readonly webhookSecret = config.EVOLUTION_WEBHOOK_SECRET!;

  async sendText(to: string, message: string): Promise<void> {
    // Truncar mensagem ao limite do WhatsApp
    const truncated = message.slice(0, 4096);

    try {
      await axios.post(
        `${this.baseUrl}/message/sendText/${process.env['WA_INSTANCE'] ?? 'default'}`,
        {
          number: to.replace(/\D/g, ''), // apenas dígitos
          text: truncated,
        },
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
    } catch (error) {
      logger.error('Falha ao enviar mensagem WhatsApp (Evolution)', {
        error,
        to: '[REDACTED]', // nunca logar números de telefone
      });
      throw new Error('Falha ao enviar mensagem WhatsApp');
    }
  }

  validateWebhook(headers: Record<string, string>, rawBody: string): boolean {
    const signature = headers['x-evolution-signature'] ?? '';
    if (!signature) return false;
    const expected = computeHmac(this.webhookSecret, rawBody);
    return timingSafeEqual(signature, expected);
  }

  parseWebhook(body: unknown): IncomingMessage | null {
    try {
      const payload = body as Record<string, unknown>;
      const event = payload['event'] as string;

      if (event !== 'messages.upsert') return null;

      const data = payload['data'] as Record<string, unknown>;
      const messages = data?.['messages'] as unknown[];
      if (!Array.isArray(messages) || messages.length === 0) return null;

      const msg = messages[0] as Record<string, unknown>;

      // Apenas processar mensagens de texto recebidas (não enviadas por nós)
      if (msg['fromMe']) return null;
      if (msg['type'] !== 'conversation' && msg['type'] !== 'extendedTextMessage') return null;

      const body_ = (msg['message'] as Record<string, string>)?.['conversation']
        ?? (msg['message'] as Record<string, Record<string, string>>)?.['extendedTextMessage']?.['text']
        ?? '';

      if (!body_.trim()) return null;

      return {
        messageId: msg['key'] ? (msg['key'] as Record<string, string>)['id'] : crypto.randomUUID(),
        from: '+' + String(msg['from'] ?? '').replace(/\D/g, ''),
        body: body_.slice(0, 500), // limitar para prevenir ataques
        timestamp: new Date((msg['messageTimestamp'] as number ?? 0) * 1000),
        type: 'text',
      };
    } catch {
      return null;
    }
  }
}

// ─── Meta (Facebook) API Adapter ─────────────────────────────────────────────

class MetaAdapter implements MessageProvider {
  private readonly accessToken = config.META_ACCESS_TOKEN!;
  private readonly phoneNumberId = config.META_PHONE_NUMBER_ID!;
  private readonly appSecret = config.META_APP_SECRET!;

  async sendText(to: string, message: string): Promise<void> {
    const truncated = message.slice(0, 4096);

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/\D/g, ''),
          type: 'text',
          text: { body: truncated },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
    } catch (error) {
      logger.error('Falha ao enviar mensagem WhatsApp (Meta)', { error });
      throw new Error('Falha ao enviar mensagem WhatsApp');
    }
  }

  /**
   * Valida assinatura do webhook da Meta usando HMAC-SHA256.
   * Ref: https://developers.facebook.com/docs/whatsapp/webhooks/security
   */
  validateWebhook(headers: Record<string, string>, rawBody: string): boolean {
    const signature = headers['x-hub-signature-256'] ?? '';
    if (!signature.startsWith('sha256=')) return false;

    const receivedHash = signature.slice(7);
    const expectedHash = computeHmac(this.appSecret, rawBody);
    return timingSafeEqual(receivedHash, expectedHash);
  }

  parseWebhook(body: unknown): IncomingMessage | null {
    try {
      const payload = body as Record<string, unknown>;
      const entry = (payload['entry'] as unknown[])?.[0] as Record<string, unknown>;
      const changes = (entry?.['changes'] as unknown[])?.[0] as Record<string, unknown>;
      const value = changes?.['value'] as Record<string, unknown>;
      const messages = value?.['messages'] as unknown[];

      if (!Array.isArray(messages) || messages.length === 0) return null;

      const msg = messages[0] as Record<string, unknown>;
      if (msg['type'] !== 'text') return null;

      const textBody = (msg['text'] as Record<string, string>)?.['body'] ?? '';
      if (!textBody.trim()) return null;

      return {
        messageId: String(msg['id'] ?? crypto.randomUUID()),
        from: '+' + String(msg['from'] ?? '').replace(/\D/g, ''),
        body: textBody.slice(0, 500),
        timestamp: new Date(Number(msg['timestamp'] ?? 0) * 1000),
        type: 'text',
      };
    } catch {
      return null;
    }
  }

  /**
   * Verifica o desafio de verificação de webhook da Meta.
   */
  verifyChallenge(query: Record<string, string>): string | null {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
      return challenge ?? null;
    }
    return null;
  }
}

// ─── Factory: instancia o adapter correto ─────────────────────────────────────

export function createMessageProvider(): MessageProvider {
  switch (config.WA_PROVIDER) {
    case 'evolution':
      return new EvolutionAdapter();
    case 'meta':
      return new MetaAdapter();
    default:
      throw new Error(`Provider WhatsApp não suportado: ${config.WA_PROVIDER}`);
  }
}

export const messageProvider = createMessageProvider();
