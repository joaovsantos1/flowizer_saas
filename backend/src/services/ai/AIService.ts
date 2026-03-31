import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

// ─── Schema de validação para saída da IA ────────────────────────────────────
// A IA sugere → backend valida. NUNCA executar conteúdo da IA sem validar.

const ParsedIntentSchema = z.discriminatedUnion('intent', [
  // Adicionar gasto
  z.object({
    intent: z.literal('add_expense'),
    amount: z.number().positive().max(999999999), // máximo R$ 9.99M
    category: z.string().min(1).max(100).regex(/^[a-zA-ZÀ-ÿ0-9 _-]+$/),
    description: z.string().max(255).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  }),

  // Adicionar receita
  z.object({
    intent: z.literal('add_income'),
    amount: z.number().positive().max(999999999),
    category: z.string().min(1).max(100).regex(/^[a-zA-ZÀ-ÿ0-9 _-]+$/),
    description: z.string().max(255).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  }),

  // Listar transações
  z.object({
    intent: z.literal('list_transactions'),
    period: z.enum(['today', 'week', 'month', 'year', 'custom']).default('month'),
    type: z.enum(['income', 'expense', 'all']).default('all'),
    category: z.string().max(100).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),

  // Adicionar lembrete
  z.object({
    intent: z.literal('add_reminder'),
    title: z.string().min(1).max(255),
    scheduledAt: z.string().datetime(),
    message: z.string().max(500).optional(),
    recurrence: z.enum(['once', 'daily', 'weekly', 'monthly']).default('once'),
  }),

  // Listar lembretes
  z.object({
    intent: z.literal('list_reminders'),
    status: z.enum(['pending', 'all']).default('pending'),
  }),

  // Consultar saldo/resumo
  z.object({
    intent: z.literal('get_balance'),
    period: z.enum(['today', 'week', 'month', 'year']).default('month'),
  }),

  // Relatório
  z.object({
    intent: z.literal('get_report'),
    period: z.enum(['week', 'month', 'year']).default('month'),
    breakdown: z.enum(['category', 'type', 'date']).default('category'),
  }),

  // Ajuda
  z.object({
    intent: z.literal('help'),
  }),

  // Não reconhecido
  z.object({
    intent: z.literal('unknown'),
    message: z.string().max(500).optional(),
  }),
]);

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

// ─── Prompt do sistema para a IA ─────────────────────────────────────────────
// Instruções explícitas para retornar apenas JSON estruturado

const SYSTEM_PROMPT = `Você é um assistente financeiro pessoal via WhatsApp. 
Interprete a mensagem do usuário e retorne APENAS um objeto JSON válido.

REGRAS CRÍTICAS:
1. Retorne SOMENTE JSON — sem texto, markdown ou explicações
2. O campo "intent" é obrigatório em todas as respostas
3. Valores monetários devem ser números (não strings): 50.00, não "R$ 50"
4. Datas no formato ISO: YYYY-MM-DD
5. Timestamps no formato ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
6. NUNCA invente dados não fornecidos pelo usuário
7. Se incerto, use intent "unknown"

INTENTS DISPONÍVEIS:
- add_expense: registrar gasto (requer: amount, category)
- add_income: registrar receita (requer: amount, category)
- list_transactions: listar transações (opcional: period, type, category)
- add_reminder: criar lembrete (requer: title, scheduledAt)
- list_reminders: listar lembretes
- get_balance: consultar saldo do período
- get_report: relatório financeiro
- help: ajuda
- unknown: não reconhecido

EXEMPLOS:
Usuário: "gastei 50 reais no mercado hoje"
{"intent":"add_expense","amount":50,"category":"Alimentação","description":"mercado","date":"${new Date().toISOString().split('T')[0]}"}

Usuário: "recebi salário de 5000"
{"intent":"add_income","amount":5000,"category":"Salário","date":"${new Date().toISOString().split('T')[0]}"}

Usuário: "me lembra de pagar o aluguel amanhã às 9h"
{"intent":"add_reminder","title":"Pagar aluguel","scheduledAt":"${new Date(Date.now() + 86400000).toISOString().split('T')[0]}T09:00:00.000Z"}`;

// ─── Serviço principal de IA ──────────────────────────────────────────────────

export class AIService {
  private readonly apiUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly headers = {
    'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };

  /**
   * Interpreta mensagem do WhatsApp e retorna intent estruturado.
   * 
   * SEGURANÇA: A IA nunca executa ações diretamente.
   * Retorna JSON que o backend valida com Zod antes de salvar.
   */
  async parseMessage(
    message: string,
    userId: string
  ): Promise<ParsedIntent> {
    // Sanitização básica: limitar tamanho para prevenir prompt injection
    const sanitizedMessage = message
      .slice(0, 500)
      .replace(/[<>]/g, '') // remover potencial HTML
      .trim();

    if (!sanitizedMessage) {
      return { intent: 'unknown', message: 'Mensagem vazia' };
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: config.AI_MODEL,
          max_tokens: config.AI_MAX_TOKENS,
          temperature: 0.1, // baixa temperatura = mais determinístico
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: sanitizedMessage },
          ],
        },
        {
          headers: this.headers,
          timeout: config.AI_TIMEOUT_MS,
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Resposta vazia da IA');
      }

      // Parse e validação com Zod — NUNCA confiar cegamente na IA
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.warn('IA retornou JSON inválido', { userId });
        return { intent: 'unknown', message: 'Não entendi o formato' };
      }

      const validated = ParsedIntentSchema.safeParse(parsed);
      if (!validated.success) {
        logger.warn('IA retornou schema inválido', {
          userId,
          errors: validated.error.flatten(),
        });
        return { intent: 'unknown', message: 'Dados inválidos da IA' };
      }

      // Validações de negócio adicionais (além do schema Zod)
      const result = validated.data;
      if (result.intent === 'add_expense' || result.intent === 'add_income') {
        // Nunca aceitar datas no futuro para transações
        if (result.date) {
          const txDate = new Date(result.date);
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (txDate > tomorrow) {
            return {
              intent: 'unknown',
              message: 'Não aceito transações com data no futuro',
            };
          }
        }
      }

      return result;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          logger.warn('Rate limit da IA atingido', { userId });
          throw new Error('Serviço de IA temporariamente sobrecarregado');
        }
        if (error.code === 'ECONNABORTED') {
          throw new Error('Timeout na IA — tente novamente');
        }
      }
      throw error;
    }
  }

  /**
   * Gera resposta amigável em português para enviar via WhatsApp.
   * Chamado APÓS a ação ser executada com sucesso pelo backend.
   */
  async generateResponse(
    intent: ParsedIntent,
    result: Record<string, unknown>
  ): Promise<string> {
    switch (intent.intent) {
      case 'add_expense':
        return `✅ Gasto registrado!\n💸 *${formatCurrency(intent.amount)}* em ${intent.category}${intent.description ? ` (${intent.description})` : ''}`;

      case 'add_income':
        return `✅ Receita registrada!\n💰 *${formatCurrency(intent.amount)}* em ${intent.category}`;

      case 'add_reminder':
        return `✅ Lembrete criado!\n🔔 *${intent.title}*\n📅 ${formatDateTime(intent.scheduledAt)}`;

      case 'get_balance': {
        const balance = result['balance'] as number ?? 0;
        const income = result['totalIncome'] as number ?? 0;
        const expense = result['totalExpense'] as number ?? 0;
        const emoji = balance >= 0 ? '📈' : '📉';
        return `${emoji} *Resumo do mês*\n\n💰 Receitas: ${formatCurrency(income)}\n💸 Gastos: ${formatCurrency(expense)}\n📊 Saldo: *${formatCurrency(balance)}*`;
      }

      case 'unknown':
        return `🤔 Não entendi. Tente:\n• "gastei R$ 50 no mercado"\n• "recebi salário de R$ 5000"\n• "me lembra de pagar a conta às 10h"\n• "quanto gastei esse mês"\n\nDigite *ajuda* para mais opções.`;

      case 'help':
        return getHelpMessage();

      default:
        return '✅ Ação realizada com sucesso!';
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getHelpMessage(): string {
  return `📱 *Comandos disponíveis*\n\n` +
    `💸 *Gastos:*\n"gastei R$ 50 no mercado"\n"paguei R$ 200 de conta de luz"\n\n` +
    `💰 *Receitas:*\n"recebi salário de R$ 5000"\n"ganhei R$ 300 de freelance"\n\n` +
    `🔔 *Lembretes:*\n"me lembra de pagar o aluguel amanhã às 9h"\n"lembrete toda segunda às 8h: reunião"\n\n` +
    `📊 *Consultas:*\n"quanto gastei esse mês"\n"meu saldo de hoje"\n"relatório da semana"\n\n` +
    `_Dúvidas? Acesse o dashboard em ${config.APP_URL}_`;
}

export const aiService = new AIService();
