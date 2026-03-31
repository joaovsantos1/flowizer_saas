import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// ─── Schema de validação de variáveis de ambiente ───────────────────────────
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),

  // Segurança
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY deve ter 64 hex chars (32 bytes)"),
  ENCRYPTION_IV_LENGTH: z.coerce.number().default(16),

  // Banco de dados
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),

  // WhatsApp
  WA_PROVIDER: z.enum(["evolution", "meta"]),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith("sk_")
    .default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith("whsec_")
    .default("whsec_placeholder"),
  STRIPE_PRICE_ID_MONTHLY: z
    .string()
    .startsWith("price_")
    .default("price_placeholder"),
  STRIPE_TRIAL_DAYS: z.coerce.number().default(7),

  // IA
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_MAX_TOKENS: z.coerce.number().default(500),
  AI_TIMEOUT_MS: z.coerce.number().default(10000),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // n8n → Backend (canal interno seguro)
  WA_BOT_NUMBER: z.string().default("+5511999999999"),

  N8N_INTERNAL_SECRET: z
    .string()
    .min(32, "N8N_INTERNAL_SECRET deve ter pelo menos 32 caracteres"),
  N8N_ALLOWED_IPS: z.string().default(""), // IPs permitidos separados por vírgula, vazio = apenas token

  // Logging
  BACKUP_CRON: z.string().default("0 2 * * *"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${msgs?.join(", ")}`)
      .join("\n");

    // Falhar rápido — configuração inválida é fatal
    console.error(
      "[CONFIG] Variáveis de ambiente inválidas:\n" + errorMessages,
    );
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type { EnvConfig };
