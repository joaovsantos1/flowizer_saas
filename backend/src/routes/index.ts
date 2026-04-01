import { Router, Request, Response, NextFunction } from "express";
import {
  authenticate,
  requireActiveSubscription,
  requireRole,
} from "../middleware/auth.js";
import { authRateLimit, webhookRateLimit } from "../middleware/security.js";
import * as authController from "../controllers/authController.js";
import * as webhookController from "../controllers/webhookController.js";
import { internalRouter } from "./internal.js";
import { db } from "../config/database";
import { config } from "../config/index";
import { decrypt } from "../services/encryption/EncryptionService.js";
import { logAudit } from "../utils/logger.js";
import { z } from "zod";

const router = Router();

// ─── Health check (sem autenticação) ─────────────────────────────────────────
router.get("/health", async (_req, res) => {
  try {
    await db.raw("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// ─── Autenticação ─────────────────────────────────────────────────────────────
router.post("/auth/register", authRateLimit, authController.register);
router.post("/auth/login", authRateLimit, authController.login);
router.post("/auth/refresh", authRateLimit, authController.refreshAccessToken);
router.post("/auth/logout", authenticate, authController.logout);

// ─── Webhooks ─────────────────────────────────────────────────────────────────
// NOTA: O webhook do WhatsApp NÃO existe mais aqui.
// O n8n recebe os webhooks da Evolution API diretamente.
// O backend recebe apenas o webhook do Stripe para atualizar assinaturas.
router.post(
  "/webhooks/stripe",
  webhookRateLimit,
  webhookController.stripeWebhook,
);

// ─── Canal interno n8n → backend ──────────────────────────────────────────────
// Protegido por internalAuth (Bearer token + IP allowlist opcional)
// Ver nginx.conf para restrição de rede.
router.use("/internal", internalRouter);

// ─── API protegida (requer auth + assinatura ativa) ───────────────────────────

// Transações
router.get(
  "/transactions",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub; // CRÍTICO: sempre do token, nunca do body

    const QuerySchema = z.object({
      page: z.coerce.number().min(1).max(1000).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      type: z.enum(["income", "expense", "all"]).default("all"),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      category: z.string().max(100).optional(),
    });

    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Parâmetros inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, limit, type, startDate, endDate, category } = parsed.data;
    const offset = (page - 1) * limit;

    const query = db("transactions")
      .where({ user_id: userId }) // ISOLAMENTO: sempre filtrar por user_id
      .whereNull("deleted_at")
      .select(
        "id",
        "type",
        "amount_cents",
        "category",
        "description_plain",
        "transaction_date",
        "created_at",
      )
      .orderBy("transaction_date", "desc")
      .limit(limit)
      .offset(offset);

    if (type !== "all") void query.where({ type });
    if (startDate) void query.where("transaction_date", ">=", startDate);
    if (endDate) void query.where("transaction_date", "<=", endDate);
    if (category) void query.where({ category });

    const [transactions, countResult] = await Promise.all([
      query,
      db("transactions")
        .where({ user_id: userId })
        .whereNull("deleted_at")
        .count("id as count")
        .first(),
    ]);

    // Retornar amount em reais (não em centavos) — nunca retornar campos criptografados
    const formatted = transactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount_cents) / 100,
      amount_cents: undefined, // remover do response
    }));

    res.json({
      data: formatted,
      pagination: {
        page,
        limit,
        total: Number(countResult?.["count"] ?? 0),
        pages: Math.ceil(Number(countResult?.["count"] ?? 0) / limit),
      },
    });
  },
);

// Criar transação via dashboard
router.post(
  "/transactions",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;

    const CreateSchema = z.object({
      type: z.enum(["income", "expense"]),
      amount: z.number().positive().max(999999999),
      category: z.string().min(1).max(100).trim(),
      description: z.string().max(255).trim().optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      currency: z.enum(["BRL", "USD", "EUR"]).default("BRL"),
    });

    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { type, amount, category, description, date, currency } = parsed.data;
    const { encrypt } =
      await import("../services/encryption/EncryptionService.js");

    const [tx] = await db("transactions")
      .insert({
        user_id: userId,
        type,
        amount_encrypted: encrypt(String(amount)),
        amount_cents: Math.round(amount * 100),
        category,
        description_encrypted: description ? encrypt(description) : null,
        description_plain: category,
        transaction_date: date ?? new Date().toISOString().split("T")[0],
        source: "dashboard",
        currency,
      })
      .returning([
        "id",
        "type",
        "amount_cents",
        "category",
        "transaction_date",
      ]);

    logAudit({
      userId,
      action: "transaction_created",
      resourceType: "transaction",
      resourceId: tx?.id,
    });

    res.status(201).json({
      ...tx,
      amount: Number(tx?.amount_cents ?? 0) / 100,
    });
  },
);

// Soft delete de transação
router.delete(
  "/transactions/:id",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const { id } = req.params;

    // CRÍTICO: where user_id garante que usuário só pode deletar seus próprios dados
    const deleted = await db("transactions")
      .where({ id, user_id: userId })
      .whereNull("deleted_at")
      .update({ deleted_at: new Date() });

    if (!deleted) {
      res.status(404).json({ error: "Transação não encontrada" });
      return;
    }

    logAudit({
      userId,
      action: "transaction_deleted",
      resourceType: "transaction",
      resourceId: id,
    });
    res.json({ message: "Transação removida" });
  },
);

// Lembretes
router.get(
  "/reminders",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;

    const reminders = await db("reminders")
      .where({ user_id: userId }) // ISOLAMENTO
      .whereNot({ status: "canceled" })
      .select(
        "id",
        "title",
        "scheduled_at",
        "recurrence",
        "status",
        "next_run_at",
        "recurrence_until",
      )
      .orderBy("scheduled_at", "asc")
      .limit(50);

    res.json({ data: reminders });
  },
);

// Resumo financeiro para o dashboard
router.get(
  "/dashboard/summary",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().split("T")[0];

    const [summary, byCategory] = await Promise.all([
      db("transactions")
        .where({ user_id: userId })
        .whereBetween("transaction_date", [monthStart, today!])
        .whereNull("deleted_at")
        .select(
          db.raw(
            "SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as total_income",
          ),
          db.raw(
            "SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as total_expense",
          ),
          db.raw("COUNT(*) as transaction_count"),
        )
        .first(),
      db("transactions")
        .where({ user_id: userId, type: "expense" })
        .whereBetween("transaction_date", [monthStart, today!])
        .whereNull("deleted_at")
        .groupBy("category")
        .select("category", db.raw("SUM(amount_cents) as total"))
        .orderBy("total", "desc")
        .limit(10),
    ]);

    const totalIncome = Number(summary?.["total_income"] ?? 0) / 100;
    const totalExpense = Number(summary?.["total_expense"] ?? 0) / 100;

    res.json({
      period: { start: monthStart, end: today },
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      transactionCount: Number(summary?.["transaction_count"] ?? 0),
      topCategories: byCategory.map((c) => ({
        category: c.category,
        total: Number(c.total) / 100,
      })),
    });
  },
);

// Portal Stripe
router.post(
  "/billing/portal",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stripeService } =
        await import("../services/stripe/StripeService.js");
      const returnUrl = req.body.returnUrl ?? `${config.APP_URL}/profile`;
      const url = await stripeService.createPortalSession(
        req.user!.sub,
        returnUrl,
      );
      res.json({ url });
    } catch (error) {
      if (config.NODE_ENV !== "production") {
        res.status(503).json({
          error:
            "Portal Stripe indisponível em desenvolvimento. Configure STRIPE_SECRET_KEY real para usar.",
          devMode: true,
        });
        return;
      }
      next(error);
    }
  },
);

// Rota de admin (apenas admins)
router.get(
  "/admin/users",
  authenticate,
  requireRole("admin"),
  async (_req, res: Response) => {
    const users = await db("users")
      .whereNull("deleted_at")
      .select(
        "id",
        "name",
        "role",
        "subscription_status",
        "status",
        "created_at",
      )
      .orderBy("created_at", "desc")
      .limit(100);
    res.json({ data: users });
  },
);

// ─── POST /reminders (rota pública para usuários, não usa internalAuth) ───────
router.post(
  "/reminders",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { z } = await import("zod");
      const Schema = z.object({
        title: z.string().min(1).max(255).trim(),
        scheduledAt: z.string().datetime(),
        message: z.string().max(500).trim().optional(),
        recurrence: z
          .enum(["once", "daily", "weekly", "monthly"])
          .default("once"),
        recurrenceUntil: z.string().datetime().optional(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const { title, scheduledAt, message, recurrence } = parsed.data;
      const userId = req.user!.sub;
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate < new Date()) {
        res.status(400).json({ error: "Data não pode ser no passado" });
        return;
      }
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);
      if (scheduledDate > maxDate) {
        res.status(400).json({ error: "Máximo 1 ano no futuro" });
        return;
      }
      const { encrypt } =
        await import("../services/encryption/EncryptionService.js");
      const [reminder] = await db("reminders")
        .insert({
          user_id: userId,
          title: title.slice(0, 255),
          message_encrypted: message ? encrypt(message) : null,
          scheduled_at: scheduledDate,
          next_run_at: scheduledDate,
          recurrence: recurrence === "once" ? null : recurrence,
          recurrence_until: parsed.data.recurrenceUntil
            ? new Date(parsed.data.recurrenceUntil)
            : null,
        })
        .returning([
          "id",
          "title",
          "scheduled_at",
          "recurrence",
          "status",
          "recurrence_until",
        ]);
      logAudit({
        userId,
        action: "reminder_created",
        resourceType: "reminder",
        resourceId: reminder?.id,
      });
      res.status(201).json(reminder);
    } catch (e) {
      next(e);
    }
  },
);

// ─── GET /profile ─────────────────────────────────────────────────────────────
router.get(
  "/profile",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { decrypt } =
        await import("../services/encryption/EncryptionService.js");
      const user = await db("users")
        .select(
          "id",
          "name",
          "role",
          "subscription_status",
          "trial_ends_at",
          "subscription_ends_at",
          "created_at",
        )
        .where({ id: req.user!.sub, deleted_at: null })
        .first();
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }
      res.json({ ...user });
    } catch (e) {
      next(e);
    }
  },
);

// ─── PATCH /profile ───────────────────────────────────────────────────────────
router.patch(
  "/profile",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { z } = await import("zod");
      const Schema = z.object({
        name: z.string().min(2).max(100).trim().optional(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Dados inválidos" });
        return;
      }
      await db("users")
        .where({ id: req.user!.sub })
        .update({ ...parsed.data, updated_at: new Date() });
      logAudit({ userId: req.user!.sub, action: "profile_updated" });
      res.json({ message: "Perfil atualizado" });
    } catch (e) {
      next(e);
    }
  },
);

// ─── PATCH /profile/phone ─────────────────────────────────────────────────────
router.patch(
  "/profile/phone",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { z } = await import("zod");
      const Schema = z.object({
        phone: z
          .string()
          .regex(
            /^\+[1-9]\d{7,14}$/,
            "Telefone deve estar no formato E.164: +5511999999999",
          ),
        password: z.string().min(1),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { verifyPassword, encrypt } =
        await import("../services/encryption/EncryptionService.js");
      const crypto = await import("crypto");

      // Verificar senha antes de alterar número
      const user = await db("users")
        .select("password_hash")
        .where({ id: req.user!.sub })
        .first();
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }
      const valid = await verifyPassword(
        parsed.data.password,
        user.password_hash,
      );
      if (!valid) {
        res.status(401).json({ error: "Senha incorreta" });
        return;
      }

      // Verificar se novo número já existe
      const newHash = crypto
        .createHash("sha256")
        .update(parsed.data.phone)
        .digest("hex");
      const existing = await db("users")
        .where({ phone_hash: newHash })
        .whereNot({ id: req.user!.sub })
        .first();
      if (existing) {
        res
          .status(409)
          .json({ error: "Este número já está cadastrado em outra conta" });
        return;
      }

      await db("users")
        .where({ id: req.user!.sub })
        .update({
          phone_encrypted: encrypt(parsed.data.phone),
          phone_hash: newHash,
          updated_at: new Date(),
        });
      logAudit({ userId: req.user!.sub, action: "phone_updated" });
      res.json({ message: "Número atualizado com sucesso" });
    } catch (e) {
      next(e);
    }
  },
);

// ─── DELETE /reminders/:id ────────────────────────────────────────────────────
router.delete(
  "/reminders/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const deleted = await db("reminders")
        .where({ id, user_id: userId })
        .update({ status: "canceled" });
      if (!deleted) {
        res.status(404).json({ error: "Lembrete não encontrado" });
        return;
      }
      logAudit({
        userId,
        action: "reminder_deleted",
        resourceType: "reminder",
        resourceId: id,
      });
      res.json({ message: "Lembrete excluído" });
    } catch (e) {
      next(e);
    }
  },
);

export { router };

// Relatórios (adicionado para o dashboard)
router.get(
  "/reports",
  authenticate,
  requireActiveSubscription,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { getReport } = await import("../controllers/financeController.js");
      return getReport(req, res, next);
    } catch (e) {
      next(e);
    }
  },
);

// Alterar senha
router.patch(
  "/auth/change-password",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { z } = await import("zod");
      const Schema = z.object({
        currentPassword: z.string().min(1),
        newPassword: z
          .string()
          .min(8)
          .regex(/[A-Z]/)
          .regex(/[a-z]/)
          .regex(/[0-9]/)
          .regex(/[^A-Za-z0-9]/),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Dados inválidos" });
        return;
      }

      const { verifyPassword, hashPassword } =
        await import("../services/encryption/EncryptionService.js");
      const user = await db("users")
        .select("password_hash")
        .where({ id: req.user!.sub })
        .first();
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }

      const valid = await verifyPassword(
        parsed.data.currentPassword,
        user.password_hash,
      );
      if (!valid) {
        res.status(401).json({ error: "Senha atual incorreta" });
        return;
      }

      const newHash = await hashPassword(parsed.data.newPassword);
      await db("users")
        .where({ id: req.user!.sub })
        .update({ password_hash: newHash });
      res.json({ message: "Senha alterada com sucesso" });
    } catch (e) {
      next(e);
    }
  },
);
