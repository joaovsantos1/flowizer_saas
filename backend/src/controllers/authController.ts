import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../config/database";
import {
  hashPassword,
  verifyPassword,
  encrypt,
  generateSecureToken,
} from "../services/encryption/EncryptionService.js";
import {
  generateAccessToken,
  generateRefreshToken,
  revokeToken,
  type JWTPayload,
} from "../middleware/auth.js";
import { stripeService } from "../services/stripe/StripeService.js";
import { logAccess, logAudit, logSecurity } from "../utils/logger.js";
import jwt from "jsonwebtoken";
import { config } from "../config/index";

// ─── Schemas de validação ─────────────────────────────────────────────────────

const RegisterSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase().trim(),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{1,14}$/,
      "Telefone deve estar no formato E.164: +5511999999999",
    ),
  password: z
    .string()
    .min(8, "Senha deve ter pelo menos 8 caracteres")
    .regex(/[A-Z]/, "Senha deve ter pelo menos uma maiúscula")
    .regex(/[a-z]/, "Senha deve ter pelo menos uma minúscula")
    .regex(/[0-9]/, "Senha deve ter pelo menos um número")
    .regex(/[^A-Za-z0-9]/, "Senha deve ter pelo menos um caractere especial"),
});

const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(96).max(200),
});

// ─── Registro ────────────────────────────────────────────────────────────────

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { name, email, phone, password } = parsed.data;

    // Hashes para lookup (nunca armazenar email/phone em texto puro)
    const emailHash = crypto.createHash("sha256").update(email).digest("hex");
    const phoneHash = crypto.createHash("sha256").update(phone).digest("hex");

    // Verificar duplicatas usando hashes (não texto puro)
    const existing = await db("users")
      .where({ email_hash: emailHash })
      .orWhere({ phone_hash: phoneHash })
      .first();

    if (existing) {
      // Resposta genérica para não vazar qual campo já existe
      res.status(409).json({ error: "Usuário já cadastrado" });
      return;
    }

    // Hash da senha + criptografia de campos sensíveis
    const [passwordHash, emailEncrypted, phoneEncrypted] = await Promise.all([
      hashPassword(password),
      Promise.resolve(encrypt(email)),
      Promise.resolve(encrypt(phone)),
    ]);

    // Inserir usuário
    const [user] = await db("users")
      .insert({
        name,
        email_encrypted: emailEncrypted,
        email_hash: emailHash,
        phone_encrypted: phoneEncrypted,
        phone_hash: phoneHash,
        password_hash: passwordHash,
      })
      .returning(["id", "name", "role", "subscription_status"]);

    if (!user) throw new Error("Falha ao criar usuário");

    // Criar cliente Stripe com trial (ignorar erro em dev com chave fake)
    try {
      await stripeService.createCustomerWithTrial({
        id: user.id,
        name: user.name,
      });
    } catch (stripeErr) {
      // Em desenvolvimento com STRIPE_SECRET_KEY fake: setar trial manualmente
      if (config.NODE_ENV === "production") throw stripeErr;
      await db("users")
        .where({ id: user.id })
        .update({
          subscription_status: "trialing",
          trial_ends_at: new Date(
            Date.now() + config.STRIPE_TRIAL_DAYS * 24 * 60 * 60 * 1000,
          ),
        });
    }

    // Gerar tokens
    const accessToken = generateAccessToken(user);
    const {
      token: refreshToken,
      hash: refreshHash,
      family,
    } = generateRefreshToken();

    await db("refresh_tokens").insert({
      user_id: user.id,
      token_hash: refreshHash,
      family,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      ip_address: req.ip?.slice(0, 45),
      user_agent: req.headers["user-agent"]?.slice(0, 512),
    });

    logAudit({
      userId: user.id,
      action: "user_registered",
      resourceType: "user",
    });

    res.status(201).json({
      message: "Conta criada com sucesso! Trial de 7 dias ativo.",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        subscriptionStatus: user.subscription_status,
        trialDays: config.STRIPE_TRIAL_DAYS,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email ou senha inválidos" });
      return;
    }

    const { email, password } = parsed.data;
    const emailHash = crypto.createHash("sha256").update(email).digest("hex");

    const user = await db("users")
      .select(
        "id",
        "name",
        "password_hash",
        "role",
        "subscription_status",
        "status",
        "deleted_at",
      )
      .where({ email_hash: emailHash })
      .first();

    // Sempre fazer bcrypt compare para prevenir timing attacks
    const dummyHash = "$2b$12$invalidhashfortimingsafety.padding.padding.pad";
    const passwordValid = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, dummyHash); // timing-safe quando user não existe

    if (!user || !passwordValid || user.deleted_at) {
      logSecurity({
        event: "login_failed",
        ip: req.ip,
        severity: "medium",
      });
      // Mensagem genérica — não revelar se email existe ou não
      res.status(401).json({ error: "Email ou senha inválidos" });
      return;
    }

    if (user.status === "suspended") {
      res
        .status(403)
        .json({ error: "Conta suspensa. Entre em contato com o suporte." });
      return;
    }

    const accessToken = generateAccessToken(user);
    const {
      token: refreshToken,
      hash: refreshHash,
      family,
    } = generateRefreshToken();

    await db("refresh_tokens").insert({
      user_id: user.id,
      token_hash: refreshHash,
      family,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ip_address: req.ip?.slice(0, 45),
      user_agent: req.headers["user-agent"]?.slice(0, 512),
    });

    logAccess({
      userId: user.id,
      action: "login",
      ip: req.ip,
      statusCode: 200,
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        subscriptionStatus: user.subscription_status,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Refresh de token ─────────────────────────────────────────────────────────

export async function refreshAccessToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Refresh token inválido" });
      return;
    }

    const { refreshToken } = parsed.data;
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const storedToken = await db("refresh_tokens")
      .where({ token_hash: tokenHash, revoked: false })
      .where("expires_at", ">", new Date())
      .first();

    if (!storedToken) {
      logSecurity({
        event: "refresh_token_invalid",
        ip: req.ip,
        severity: "high",
      });
      res.status(401).json({ error: "Refresh token inválido ou expirado" });
      return;
    }

    // Detectar reutilização de token (Token Rotation)
    const familyTokens = await db("refresh_tokens")
      .where({ family: storedToken.family, revoked: true })
      .count("id as count")
      .first();

    if (Number(familyTokens?.["count"] ?? 0) > 0) {
      // Token da família foi reutilizado — possível ataque. Revogar TODOS da família.
      await db("refresh_tokens")
        .where({ family: storedToken.family })
        .update({ revoked: true });
      logSecurity({
        userId: storedToken.user_id,
        event: "refresh_token_reuse_detected",
        ip: req.ip,
        severity: "critical",
      });
      res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
      return;
    }

    // Revogar token atual
    await db("refresh_tokens")
      .where({ id: storedToken.id })
      .update({ revoked: true });

    // Buscar dados atualizados do usuário
    const user = await db("users")
      .select("id", "role", "subscription_status", "name")
      .where({ id: storedToken.user_id, status: "active", deleted_at: null })
      .first();

    if (!user) {
      res.status(401).json({ error: "Usuário não encontrado" });
      return;
    }

    // Gerar novos tokens
    const newAccessToken = generateAccessToken(user);
    const {
      token: newRefreshToken,
      hash: newHash,
      family,
    } = generateRefreshToken();

    await db("refresh_tokens").insert({
      user_id: user.id,
      token_hash: newHash,
      family: storedToken.family, // manter mesma família para detecção de reutilização
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ip_address: req.ip?.slice(0, 45),
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    next(error);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(req: Request, res: Response): Promise<void> {
  if (req.user) {
    revokeToken(req.user.jti);

    // Revogar refresh tokens do usuário
    await db("refresh_tokens")
      .where({ user_id: req.user.sub, revoked: false })
      .update({ revoked: true });

    logAudit({ userId: req.user.sub, action: "logout" });
  }

  res.json({ message: "Logout realizado com sucesso" });
}
