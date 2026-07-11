import { generate, generateSecret, generateURI, verify } from "otplib";

export const MFA_TOTP_ALGORITHM = "sha1";
export const MFA_TOTP_DIGITS = 6;
export const MFA_TOTP_PERIOD_SECONDS = 30;
export const MFA_TOTP_SKEW_STEPS = 1;
export const MFA_PENDING_ENROLLMENT_TTL_MS = 10 * 60 * 1000;
export const MFA_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_LOGIN_CHALLENGE_MAX_ATTEMPTS = 5;

export function createTotpEnrollment({ issuer, label }) {
  const secret = generateSecret({ length: 20 });
  const otpauthUri = generateURI({
    issuer,
    label,
    secret,
    algorithm: MFA_TOTP_ALGORITHM,
    digits: MFA_TOTP_DIGITS,
    period: MFA_TOTP_PERIOD_SECONDS
  });
  return { secret, otpauthUri, issuer, label };
}

export async function generateTotpCode(secret, epochSeconds = Math.floor(Date.now() / 1000)) {
  return generate({
    secret,
    epoch: epochSeconds,
    algorithm: MFA_TOTP_ALGORITHM,
    digits: MFA_TOTP_DIGITS,
    period: MFA_TOTP_PERIOD_SECONDS
  });
}

export async function verifyTotpCode({ secret, code, lastAcceptedCounter = null, epochSeconds = Math.floor(Date.now() / 1000) }) {
  const token = String(code || "").trim();
  if (!/^\d{6}$/.test(token)) return { valid: false };
  try {
    const result = await verify({
      secret,
      token,
      epoch: epochSeconds,
      algorithm: MFA_TOTP_ALGORITHM,
      digits: MFA_TOTP_DIGITS,
      period: MFA_TOTP_PERIOD_SECONDS,
      epochTolerance: MFA_TOTP_PERIOD_SECONDS * MFA_TOTP_SKEW_STEPS,
      afterTimeStep: lastAcceptedCounter === null || lastAcceptedCounter === undefined ? undefined : Number(lastAcceptedCounter)
    });
    if (!result.valid) return { valid: false };
    return { valid: true, counter: result.timeStep };
  } catch {
    return { valid: false };
  }
}
