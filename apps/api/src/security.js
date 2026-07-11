import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, salt, hash] = String(storedHash).split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const derived = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function signSessionId(sessionId, secret) {
  const sig = createHmac("sha256", secret).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

export function generateResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token) {
  return createHash("sha256").update(String(token)).digest("base64url");
}

export function encryptMfaSecret(secret, encryptionKey) {
  assertMfaKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url")
  };
}

export function decryptMfaSecret(payload, encryptionKey) {
  assertMfaKey(encryptionKey);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(payload.iv || "", "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag || "", "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext || "", "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function generateMfaChallengeToken() {
  return randomBytes(32).toString("base64url");
}

export function hashMfaChallengeToken(token) {
  return createHash("sha256").update(String(token)).digest("base64url");
}

export function hashMfaRecoveryCode(code) {
  return createHash("sha256").update(normalizeMfaRecoveryCode(code)).digest("base64url");
}

export function generateMfaRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => randomBytes(15).toString("base64url").toUpperCase().match(/.{1,5}/g).join("-"));
}

export function normalizeMfaRecoveryCode(code) {
  return String(code || "").trim().replace(/[\s-]/g, "").toUpperCase();
}

function assertMfaKey(encryptionKey) {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) throw new Error("MFA encryption key must be exactly 32 bytes");
}

export function verifySignedSession(value, secret) {
  if (!value || !value.includes(".")) return null;
  const index = value.lastIndexOf(".");
  const sessionId = value.slice(0, index);
  const signature = value.slice(index + 1);
  const expected = signSessionId(sessionId, secret).slice(index + 1);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return sessionId;
}
