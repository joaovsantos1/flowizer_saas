import crypto from "crypto";
import bcrypt from "bcrypt";
import { config } from "../../config/index";

const ALGORITHM = "aes-256-gcm";
const BCRYPT_ROUNDS = 12; // Nunca menos que 10
const KEY = Buffer.from(config.ENCRYPTION_KEY, "hex"); // 32 bytes

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface EncryptedPayload {
  iv: string; // hex
  tag: string; // hex - authentication tag do GCM
  data: string; // hex - ciphertext
}

// ─── Criptografia simétrica AES-256-GCM ──────────────────────────────────────

/**
 * Criptografa dado sensível para armazenamento no banco.
 * Usa AES-256-GCM com IV aleatório e authentication tag.
 * Cada chamada gera um IV único — NUNCA reutiliza IVs.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  const iv = crypto.randomBytes(config.ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };

  // Armazena como JSON base64 — opaco para inspeção direta no banco
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Descriptografa dado previamente criptografado com `encrypt()`.
 * Autentica o ciphertext via GCM tag antes de retornar dados.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  try {
    const payload: EncryptedPayload = JSON.parse(
      Buffer.from(ciphertext, "base64").toString("utf8"),
    );

    const iv = Buffer.from(payload.iv, "hex");
    const tag = Buffer.from(payload.tag, "hex");
    const data = Buffer.from(payload.data, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

    return decrypted.toString("utf8");
  } catch {
    // Nunca vazar detalhes do erro de descriptografia
    throw new Error(
      "Falha ao descriptografar: dado corrompido ou chave inválida",
    );
  }
}

/**
 * Verifica se uma string está no formato criptografado.
 * Útil para migrações e validação de integridade.
 */
export function isEncrypted(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<EncryptedPayload>;
    return !!(payload.iv && payload.tag && payload.data);
  } catch {
    return false;
  }
}

// ─── Hash de senhas com bcrypt ────────────────────────────────────────────────

/**
 * Gera hash seguro de senha com bcrypt.
 * Rounds=12 para equilíbrio entre segurança e performance (~300ms).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compara senha em texto com hash armazenado.
 * Usa timing-safe comparison do bcrypt internamente.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Geração de tokens seguros ───────────────────────────────────────────────

/**
 * Gera token aleatório criptograficamente seguro (para refresh tokens, etc).
 */
export function generateSecureToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Gera hash HMAC-SHA256 para validação de webhooks.
 */
export function computeHmac(secret: string, payload: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
}

/**
 * Comparação timing-safe para validação de assinaturas.
 * Previne timing attacks em comparações de strings secretas.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
