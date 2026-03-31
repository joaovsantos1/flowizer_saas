import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../config/database.js';
import { encrypt, decrypt } from '../services/encryption/EncryptionService.js';
import { logAudit, logError } from '../utils/logger.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateTransactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().positive().max(999_999_999),
  category: z.string().min(1).max(100).trim().regex(/^[\wÀ-ÿ\s\-]+$/u),
  description: z.string().max(255).trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ReportQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  breakdown: z.enum(['category', 'type', 'day', 'week']).default('category'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── Controllers ──────────────────────────────────────────────────────────────

export async function createTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // userId vem SEMPRE do token JWT — nunca do body da requisição
    const userId = req.user!.sub;

    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { type, amount, category, description, date, currency, metadata } = parsed.data;

    // Converter para centavos para evitar problemas de ponto flutuante
    const amountCents = Math.round(amount * 100);

    // Validação de negócio: data não pode ser mais de 1 ano atrás
    if (date) {
      const txDate = new Date(date);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (txDate < oneYearAgo) {
        res.status(400).json({ error: 'Data não pode ser mais de 1 ano atrás' });
        return;
      }
      if (txDate > new Date()) {
        res.status(400).json({ error: 'Data não pode ser no futuro' });
        return;
      }
    }

    const [tx] = await db('transactions').insert({
      user_id: userId,
      type,
      amount_encrypted: encrypt(String(amount)),
      amount_cents: amountCents,
      category,
      description_encrypted: description ? encrypt(description) : null,
      description_plain: category, // campo sem dados sensíveis, para filtros
      transaction_date: date ?? new Date().toISOString().split('T')[0],
      source: 'dashboard',
      currency,
      metadata: metadata ?? {},
    }).returning(['id', 'type', 'amount_cents', 'category', 'transaction_date', 'currency', 'created_at']);

    logAudit({
      userId,
      action: 'transaction_created',
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
      currency: tx?.currency,
      created_at: tx?.created_at,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const { id } = req.params;

    // ISOLAMENTO: where user_id + id — nunca apenas por id
    const tx = await db('transactions')
      .where({ id, user_id: userId })
      .whereNull('deleted_at')
      .first();

    if (!tx) {
      res.status(404).json({ error: 'Transação não encontrada' });
      return;
    }

    // Descriptografar descrição apenas quando explicitamente solicitado
    const description = tx.description_encrypted
      ? decrypt(tx.description_encrypted)
      : null;

    res.json({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount_cents) / 100,
      category: tx.category,
      description,
      transaction_date: tx.transaction_date,
      currency: tx.currency,
      source: tx.source,
      created_at: tx.created_at,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const { id } = req.params;

    // Soft delete — NUNCA deletar fisicamente dados financeiros
    const deleted = await db('transactions')
      .where({ id, user_id: userId })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    if (!deleted) {
      res.status(404).json({ error: 'Transação não encontrada' });
      return;
    }

    logAudit({
      userId,
      action: 'transaction_deleted',
      resourceType: 'transaction',
      resourceId: id,
    });

    res.json({ message: 'Transação removida com sucesso' });
  } catch (error) {
    next(error);
  }
}

// ─── Relatório financeiro ─────────────────────────────────────────────────────

export async function getReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.sub;

    const parsed = ReportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parâmetros inválidos' });
      return;
    }

    const { period, breakdown, startDate, endDate } = parsed.data;

    // Calcular datas do período
    const { start, end } = startDate && endDate
      ? { start: startDate, end: endDate }
      : computePeriodDates(period);

    // Query base sempre filtrada por user_id
    const baseQuery = db('transactions')
      .where({ user_id: userId })
      .whereBetween('transaction_date', [start, end])
      .whereNull('deleted_at');

    // Totais gerais
    const totals = await baseQuery.clone().select(
      db.raw("SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END)::int as total_income"),
      db.raw("SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)::int as total_expense"),
      db.raw('COUNT(*)::int as count')
    ).first();

    // Breakdown por dimensão solicitada
    let breakdownData: Array<Record<string, unknown>> = [];

    if (breakdown === 'category') {
      breakdownData = await baseQuery.clone()
        .select('category', 'type')
        .select(db.raw('SUM(amount_cents)::int as total'))
        .groupBy('category', 'type')
        .orderBy('total', 'desc');
    } else if (breakdown === 'day') {
      breakdownData = await baseQuery.clone()
        .select('transaction_date')
        .select(
          db.raw("SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END)::int as income"),
          db.raw("SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)::int as expense")
        )
        .groupBy('transaction_date')
        .orderBy('transaction_date', 'asc');
    } else if (breakdown === 'week') {
      breakdownData = await baseQuery.clone()
        .select(db.raw("DATE_TRUNC('week', transaction_date)::date as week_start"))
        .select(
          db.raw("SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END)::int as income"),
          db.raw("SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)::int as expense")
        )
        .groupByRaw("DATE_TRUNC('week', transaction_date)")
        .orderByRaw("DATE_TRUNC('week', transaction_date) ASC");
    }

    const totalIncome = Number(totals?.['total_income'] ?? 0);
    const totalExpense = Number(totals?.['total_expense'] ?? 0);

    res.json({
      period: { start, end, type: period },
      summary: {
        totalIncome: totalIncome / 100,
        totalExpense: totalExpense / 100,
        balance: (totalIncome - totalExpense) / 100,
        transactionCount: Number(totals?.['count'] ?? 0),
        savingsRate: totalIncome > 0
          ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
          : 0,
      },
      breakdown: breakdownData.map((row) => ({
        ...row,
        // Converter centavos para reais em todos os campos numéricos
        total: row['total'] ? Number(row['total']) / 100 : undefined,
        income: row['income'] ? Number(row['income']) / 100 : undefined,
        expense: row['expense'] ? Number(row['expense']) / 100 : undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
}

// ─── Helper: calcular datas por período ──────────────────────────────────────

function computePeriodDates(period: string): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0]!;
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString().split('T')[0]!, end: today };
    }
    case 'quarter': {
      const quarterStart = new Date(year, Math.floor(month / 3) * 3, 1);
      return { start: quarterStart.toISOString().split('T')[0]!, end: today };
    }
    case 'year':
      return { start: `${year}-01-01`, end: today };
    case 'month':
    default: {
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      return { start, end: today };
    }
  }
}
