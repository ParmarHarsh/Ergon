import test from "node:test";
import assert from "node:assert/strict";
import { readConfig, readRepositoryConfig } from "../packages/config/src/index.js";

const productionEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_PROFILE: "staging",
  PROCESS_ROLE: "api",
  PORT: "4000",
  APP_URL: "https://app.ergon.example",
  ALLOWED_ORIGINS: "https://app.ergon.example",
  DATABASE_URL: "postgresql://user:password@db.example.com:5432/ergon",
  REPOSITORY_BACKEND: "postgres",
  SESSION_SECRET: "replace-with-at-least-thirty-two-characters",
  STORAGE_BACKEND: "s3",
  S3_BUCKET: "ergon-private",
  S3_REGION: "ca-central-1",
  MAX_UPLOAD_MB: "25"
};

test("production config fails fast when core env vars are missing", () => {
  const { DATABASE_URL, ...missingDatabase } = productionEnv;
  assert.throws(() => readConfig(missingDatabase), /DATABASE_URL/);
});

test("production config rejects wildcard CORS and weak session secrets", () => {
  assert.throws(() => readConfig({ ...productionEnv, ALLOWED_ORIGINS: "*" }), /ALLOWED_ORIGINS/);
  assert.throws(() => readConfig({ ...productionEnv, SESSION_SECRET: "short" }), /SESSION_SECRET/);
  assert.throws(() => readConfig({ ...productionEnv, ENABLE_DEMO_DATA: "true" }), /ENABLE_DEMO_DATA/);
});

test("production config rejects invalid ports and origins", () => {
  assert.throws(() => readConfig({ ...productionEnv, PORT: "70000" }), /PORT/);
  assert.throws(() => readConfig({ ...productionEnv, ALLOWED_ORIGINS: "not-a-url" }), /valid absolute HTTPS URLs/);
  assert.throws(() => readConfig({ ...productionEnv, APP_URL: "http://app.ergon.example" }), /HTTPS/);
});

test("production config accepts optional integrations as absent", () => {
  const config = readConfig(productionEnv);
  assert.equal(config.repositoryBackend, "postgres");
  assert.equal(config.databaseUrl, productionEnv.DATABASE_URL);
  assert.equal(config.enableDemoData, false);
  assert.equal(config.storageBackend, "s3");
  assert.equal(config.deploymentProfile, "staging");
  assert.equal(config.runsApi, true);
  assert.equal(config.runsWorker, false);
  assert.equal(config.recoveryDeliveryProvider, "disabled");
});

test("SMTP recovery delivery config validates required safe settings", () => {
  const smtpEnv = {
    ...productionEnv,
    RECOVERY_DELIVERY_PROVIDER: "smtp",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USE_TLS: "true",
    SMTP_FROM_EMAIL: "security@ergon.example"
  };
  const config = readConfig(smtpEnv);
  assert.equal(config.recoveryDeliveryProvider, "smtp");
  assert.equal(config.smtpHost, "smtp.example.com");
  assert.equal(config.smtpPort, 465);
  assert.equal(config.smtpUseTls, true);
  assert.equal(config.smtpFromEmail, "security@ergon.example");

  assert.throws(() => readConfig({ ...smtpEnv, SMTP_HOST: "" }), /SMTP_HOST/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_PORT: "70000" }), /SMTP_PORT/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_FROM_EMAIL: "" }), /SMTP_FROM_EMAIL/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_FROM_EMAIL: "bad-address" }), /SMTP_FROM_EMAIL/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_USERNAME: "user-only" }), /SMTP_USERNAME and SMTP_PASSWORD/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_PASSWORD: "password-only" }), /SMTP_USERNAME and SMTP_PASSWORD/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_HOST: "smtp.example.com\r\nBcc: attacker@example.com" }), /SMTP_HOST/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_FROM_EMAIL: "security@example.com\nBcc: attacker@example.com" }), /SMTP_FROM_EMAIL/);
  assert.throws(() => readConfig({ ...smtpEnv, APP_URL: "https://localhost" }), /localhost reset origin/);
  assert.throws(() => readConfig({ ...smtpEnv, SMTP_USE_TLS: "false" }), /SMTP_USE_TLS/);
  assert.throws(() => readConfig({ ...smtpEnv, RECOVERY_EXPOSE_TEST_TOKEN: "true" }), /RECOVERY_EXPOSE_TEST_TOKEN/);
});

test("SMTP recovery validation errors do not reveal secrets", () => {
  const secret = "super-secret-smtp-password";
  assert.throws(
    () => readConfig({ ...productionEnv, RECOVERY_DELIVERY_PROVIDER: "smtp", SMTP_USERNAME: "smtp-user", SMTP_PASSWORD: secret }),
    (error) => {
      assert.equal(String(error.message).includes(secret), false);
      return /SMTP_HOST/.test(error.message);
    }
  );
});

test("MFA configuration validates feature flag, encryption key, and issuer safely", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const localDisabled = readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_ENABLED: "false" });
  assert.equal(localDisabled.mfaEnabled, false);
  assert.equal(localDisabled.mfaEncryptionKey, null);
  assert.equal(localDisabled.mfaTotpIssuer, "Ergon");

  assert.throws(() => readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_ENABLED: "true" }), /MFA_ENCRYPTION_KEY/);
  assert.throws(() => readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: "not-base64" }), /MFA_ENCRYPTION_KEY/);
  assert.throws(() => readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: Buffer.alloc(31, 1).toString("base64") }), /32 bytes/);
  assert.throws(() => readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_TOTP_ISSUER: "Ergon\nBcc: attacker@example.com" }), /MFA_TOTP_ISSUER/);
  assert.throws(() => readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_TOTP_ISSUER: "x".repeat(65) }), /MFA_TOTP_ISSUER/);

  const localEnabled = readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: key, MFA_TOTP_ISSUER: "Ergon Test" });
  assert.equal(localEnabled.mfaEnabled, true);
  assert.equal(localEnabled.mfaEncryptionKey.length, 32);
  assert.equal(localEnabled.mfaTotpIssuer, "Ergon Test");

  assert.throws(
    () => readConfig({ ...productionEnv, MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: "super-secret-mfa-key" }),
    (error) => {
      assert.equal(String(error.message).includes("super-secret-mfa-key"), false);
      return /MFA_ENCRYPTION_KEY/.test(error.message);
    }
  );
  assert.throws(() => readConfig({ ...productionEnv, MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: Buffer.alloc(32, 0).toString("base64") }), /placeholder/);
  const productionMfa = readConfig({ ...productionEnv, MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: key });
  assert.equal(productionMfa.mfaEnabled, true);
});

test("deployment profiles and process roles fail closed outside local development", () => {
  const local = readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file" });
  assert.equal(local.deploymentProfile, "local");
  assert.equal(local.processRole, "api-and-worker");
  assert.equal(local.runsApi, true);
  assert.equal(local.runsWorker, true);
  assert.throws(() => readConfig({ ...productionEnv, DEPLOYMENT_PROFILE: "" }), /DEPLOYMENT_PROFILE/);
  assert.throws(() => readConfig({ ...productionEnv, PROCESS_ROLE: "" }), /PROCESS_ROLE/);
  assert.throws(() => readConfig({ ...productionEnv, PROCESS_ROLE: "api-and-worker" }), /limited to local development/);
  assert.throws(() => readConfig({ ...productionEnv, DEPLOYMENT_PROFILE: "closed-pilot" }), /closed-pilot requires/);
  const pilot = readConfig({
    ...productionEnv,
    DEPLOYMENT_PROFILE: "closed-pilot",
    PROCESS_ROLE: "worker",
    MALWARE_SCAN_ENABLED: "true",
    MALWARE_SCAN_REQUIRED_IN_PRODUCTION: "true",
    MALWARE_SCANNER_PROVIDER: "clamav",
    MALWARE_SCAN_FAIL_POLICY: "closed"
  });
  assert.equal(pilot.runsApi, false);
  assert.equal(pilot.runsWorker, true);
});

test("production storage and malware scanning config fail safely", () => {
  assert.throws(() => readConfig({ ...productionEnv, STORAGE_BACKEND: "local" }), /must be s3/);
  assert.throws(() => readConfig({ ...productionEnv, S3_BUCKET: "" }), /S3_BUCKET/);
  assert.throws(() => readConfig({ ...productionEnv, MALWARE_SCAN_ENABLED: "true", MALWARE_SCANNER_PROVIDER: "mock" }), /mock is not allowed/);
  const local = readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", STORAGE_BACKEND: "local" });
  assert.equal(local.queueMaxRetries, 3);
  assert.equal(local.queueLeaseMs, 300000);
  assert.equal(local.malwareScanEnabled, false);
  assert.equal(local.malwareScanFailPolicy, "open");
  assert.throws(() => readConfig({ ...productionEnv, MALWARE_SCAN_ENABLED: "true", MALWARE_SCAN_REQUIRED_IN_PRODUCTION: "true", MALWARE_SCANNER_PROVIDER: "clamav", MALWARE_SCAN_FAIL_POLICY: "open" }), /non-mock scanner adapter/);
  const hardened = readConfig({ ...productionEnv, MALWARE_SCAN_ENABLED: "true", MALWARE_SCAN_REQUIRED_IN_PRODUCTION: "true", MALWARE_SCANNER_PROVIDER: "clamav", MALWARE_SCAN_FAIL_POLICY: "closed", CLAMAV_HOST: "clamav.internal" });
  assert.equal(hardened.malwareScannerProvider, "clamav");
  assert.equal(hardened.malwareScanFailPolicy, "closed");
});

test("repository config requires Postgres in production without requiring unrelated runtime settings", () => {
  assert.throws(() => readRepositoryConfig({ NODE_ENV: "production", REPOSITORY_BACKEND: "file" }), /must be postgres/);
  const config = readRepositoryConfig({ NODE_ENV: "production", REPOSITORY_BACKEND: "postgres", DATABASE_URL: productionEnv.DATABASE_URL });
  assert.equal(config.repositoryBackend, "postgres");
  assert.equal(config.databaseUrl, productionEnv.DATABASE_URL);
});

test("AI is optional and OpenAI configuration is required only when enabled", () => {
  const disabled = readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", AI_ENABLED: "false" });
  assert.equal(disabled.aiEnabled, false);
  assert.throws(() => readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", AI_ENABLED: "true" }), /OPENAI_API_KEY and OPENAI_MODEL/);
  const mock = readConfig({
    NODE_ENV: "development",
    REPOSITORY_BACKEND: "file",
    AI_ENABLED: "true",
    AI_PROVIDER: "mock",
    AI_CONFIDENCE_THRESHOLD: "0.8",
    AI_REVIEW_REQUIRED_THRESHOLD: "0.7"
  });
  assert.equal(mock.aiProvider, "mock");
  assert.throws(() => readConfig({ ...productionEnv, AI_ENABLED: "true", AI_PROVIDER: "mock" }), /not allowed in production/);
});
