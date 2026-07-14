import { normalizeAzureOpenAiEndpoint } from "../../ai/src/providers.js";

export function readRepositoryConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const repositoryBackend = env.REPOSITORY_BACKEND || (env.DATABASE_URL ? "postgres" : "file");

  if (!["postgres", "file"].includes(repositoryBackend)) {
    throw new Error("REPOSITORY_BACKEND must be postgres or file");
  }

  if (repositoryBackend === "postgres" && !env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when REPOSITORY_BACKEND=postgres");
  }

  if (isProduction && repositoryBackend !== "postgres") {
    throw new Error("REPOSITORY_BACKEND must be postgres in production");
  }

  return {
    nodeEnv,
    isProduction,
    repositoryBackend,
    databaseUrl: env.DATABASE_URL || ""
  };
}

export function readConfig(env = process.env) {
  const repositoryConfig = readRepositoryConfig(env);
  const { nodeEnv, isProduction, repositoryBackend } = repositoryConfig;
  const deploymentProfile = env.DEPLOYMENT_PROFILE || (isProduction ? "" : "local");
  if (!["local", "staging", "closed-pilot"].includes(deploymentProfile)) {
    throw new Error("DEPLOYMENT_PROFILE must be local, staging, or closed-pilot and must be explicit in production");
  }
  const isSecureDeployment = deploymentProfile !== "local";
  if (isSecureDeployment && !isProduction) throw new Error(`${deploymentProfile} requires NODE_ENV=production`);
  if (isProduction && deploymentProfile === "local") throw new Error("DEPLOYMENT_PROFILE=local is not allowed in production");
  const processRole = env.PROCESS_ROLE || (deploymentProfile === "local" ? "api-and-worker" : "");
  if (!["api", "worker", "api-and-worker"].includes(processRole)) {
    throw new Error("PROCESS_ROLE must be api, worker, or api-and-worker and must be explicit outside local development");
  }
  if (isSecureDeployment && processRole === "api-and-worker") {
    throw new Error("PROCESS_ROLE=api-and-worker is limited to local development; deploy separate api and worker processes");
  }
  const allowedOrigins = (env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isSecureDeployment) {
    const required = ["DEPLOYMENT_PROFILE", "PROCESS_ROLE", "PORT", "APP_URL", "ALLOWED_ORIGINS", "DATABASE_URL", "SESSION_SECRET", "STORAGE_BACKEND", "MAX_UPLOAD_MB"];
    const missing = required.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing required ${deploymentProfile} environment variables: ${missing.join(", ")}`);
    }
  }

  const port = Number.parseInt(env.PORT || "4000", 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  if (isSecureDeployment && allowedOrigins.includes("*")) {
    throw new Error("ALLOWED_ORIGINS must not include * in production");
  }

  if (isSecureDeployment) {
    try {
      const appUrl = new URL(env.APP_URL);
      const originUrls = allowedOrigins.map((origin) => new URL(origin));
      if (appUrl.protocol !== "https:" || originUrls.some((origin) => origin.protocol !== "https:")) throw new Error("HTTPS required");
    } catch {
      throw new Error("APP_URL and ALLOWED_ORIGINS must contain valid absolute HTTPS URLs in production");
    }
  }

  if (isSecureDeployment && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET is required in production and must be at least 32 characters");
  }

  if (isSecureDeployment && env.ENABLE_DEMO_DATA === "true") {
    throw new Error("ENABLE_DEMO_DATA must not be true in production");
  }

  const maxUploadMb = Number.parseInt(env.MAX_UPLOAD_MB || "25", 10);
  if (!Number.isInteger(maxUploadMb) || maxUploadMb <= 0) {
    throw new Error("MAX_UPLOAD_MB must be a positive integer");
  }

  const storageBackend = env.STORAGE_BACKEND || env.UPLOAD_STORAGE_BACKEND || "local";
  if (!["local", "s3"].includes(storageBackend)) throw new Error("STORAGE_BACKEND must be local or s3");
  if (isSecureDeployment && storageBackend !== "s3") throw new Error(`STORAGE_BACKEND must be s3 for ${deploymentProfile}`);
  if (storageBackend === "s3" && (!env.S3_BUCKET || !env.S3_REGION)) {
    throw new Error("S3_BUCKET and S3_REGION are required when STORAGE_BACKEND=s3");
  }
  if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }

  const queueBackend = env.QUEUE_BACKEND || "local";
  if (queueBackend !== "local") throw new Error("QUEUE_BACKEND currently supports local only");
  const queueConcurrency = boundedInteger(env.QUEUE_CONCURRENCY || "1", "QUEUE_CONCURRENCY", 1, 16);
  const queueMaxRetries = boundedInteger(env.QUEUE_MAX_RETRIES || "3", "QUEUE_MAX_RETRIES", 1, 10);
  const queueLeaseMs = boundedInteger(env.QUEUE_LEASE_MS || "300000", "QUEUE_LEASE_MS", 5_000, 3_600_000);
  const queueHeartbeatMs = boundedInteger(env.QUEUE_HEARTBEAT_MS || "30000", "QUEUE_HEARTBEAT_MS", 1_000, 300_000);
  const queuePollMs = boundedInteger(env.QUEUE_POLL_MS || "1000", "QUEUE_POLL_MS", 100, 60_000);
  const queueShutdownTimeoutMs = boundedInteger(env.QUEUE_SHUTDOWN_TIMEOUT_MS || "30000", "QUEUE_SHUTDOWN_TIMEOUT_MS", 1_000, 300_000);
  if (queueHeartbeatMs >= queueLeaseMs) throw new Error("QUEUE_HEARTBEAT_MS must be less than QUEUE_LEASE_MS");

  const malwareScanEnabled = env.MALWARE_SCAN_ENABLED === "true";
  const malwareScanRequiredInProduction = env.MALWARE_SCAN_REQUIRED_IN_PRODUCTION === "true";
  const malwareScannerProvider = env.MALWARE_SCANNER_PROVIDER || "mock";
  const malwareScanTimeoutMs = boundedInteger(env.CLAMAV_TIMEOUT_MS || env.MALWARE_SCAN_TIMEOUT_MS || "10000", "CLAMAV_TIMEOUT_MS", 100, 120_000);
  const malwareScanFailPolicy = env.MALWARE_SCAN_FAIL_POLICY || (isSecureDeployment ? "closed" : "open");
  const clamavHost = env.CLAMAV_HOST || "127.0.0.1";
  const clamavPort = boundedInteger(env.CLAMAV_PORT || "3310", "CLAMAV_PORT", 1, 65_535);
  if (!["mock", "clamav"].includes(malwareScannerProvider)) throw new Error("MALWARE_SCANNER_PROVIDER must be mock or clamav");
  if (!["open", "closed"].includes(malwareScanFailPolicy)) throw new Error("MALWARE_SCAN_FAIL_POLICY must be open or closed");
  if (isSecureDeployment && malwareScanEnabled && malwareScannerProvider === "mock") {
    throw new Error("MALWARE_SCANNER_PROVIDER=mock is not allowed in production");
  }
  if (isSecureDeployment && malwareScanRequiredInProduction && (!malwareScanEnabled || malwareScannerProvider !== "clamav" || malwareScanFailPolicy !== "closed")) {
    throw new Error("Production-required malware scanning needs an enabled non-mock scanner adapter");
  }
  if (deploymentProfile === "closed-pilot" && (!malwareScanEnabled || !malwareScanRequiredInProduction || malwareScannerProvider !== "clamav" || malwareScanFailPolicy !== "closed")) {
    throw new Error("closed-pilot requires enabled, required, fail-closed ClamAV scanning");
  }

  const trustProxy = env.TRUST_PROXY === "true";
  const sessionCookieSameSite = (env.SESSION_COOKIE_SAME_SITE || (isSecureDeployment ? "None" : "Lax")).toLowerCase();
  if (!["lax", "strict", "none"].includes(sessionCookieSameSite)) throw new Error("SESSION_COOKIE_SAME_SITE must be Lax, Strict, or None");

  const aiEnabled = env.AI_ENABLED === "true";
  const aiProvider = env.AI_PROVIDER || "openai";
  const aiMaxFileTextChars = positiveInteger(env.AI_MAX_FILE_TEXT_CHARS || "12000", "AI_MAX_FILE_TEXT_CHARS");
  const aiTimeoutMs = boundedInteger(env.AI_TIMEOUT_MS || "30000", "AI_TIMEOUT_MS", 1_000, 120_000);
  const aiMaxOutputTokens = boundedInteger(env.AI_MAX_OUTPUT_TOKENS || "2000", "AI_MAX_OUTPUT_TOKENS", 256, 16_000);
  const aiConfidenceThreshold = unitInterval(env.AI_CONFIDENCE_THRESHOLD || "0.8", "AI_CONFIDENCE_THRESHOLD");
  const aiReviewRequiredThreshold = unitInterval(env.AI_REVIEW_REQUIRED_THRESHOLD || "0.7", "AI_REVIEW_REQUIRED_THRESHOLD");
  if (aiReviewRequiredThreshold > aiConfidenceThreshold) {
    throw new Error("AI_REVIEW_REQUIRED_THRESHOLD must be less than or equal to AI_CONFIDENCE_THRESHOLD");
  }
  if (aiEnabled && !["openai", "azure_openai", "mock"].includes(aiProvider)) {
    throw new Error("AI_PROVIDER must be mock, openai, or azure_openai when AI is enabled");
  }
  if (isSecureDeployment && aiEnabled && aiProvider === "mock") {
    throw new Error("AI_PROVIDER=mock is not allowed in production");
  }
  if (aiEnabled && aiProvider === "openai" && (!env.OPENAI_API_KEY || !env.OPENAI_MODEL)) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required when AI_ENABLED=true and AI_PROVIDER=openai");
  }
  let azureOpenAiEndpoint = env.AZURE_OPENAI_ENDPOINT || "";
  if (aiEnabled && aiProvider === "azure_openai") {
    const requiredAzureVariables = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"];
    const missingAzureVariables = requiredAzureVariables.filter((name) => !env[name]);
    if (missingAzureVariables.length > 0) {
      throw new Error(`Missing required Azure OpenAI environment variables: ${missingAzureVariables.join(", ")}`);
    }
    azureOpenAiEndpoint = normalizeAzureOpenAiEndpoint(azureOpenAiEndpoint);
  }

  const loginRateLimitMaxAttempts = boundedInteger(env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || "10", "LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 3, 1_000);
  const loginRateLimitWindowMs = boundedInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS || "900000", "LOGIN_RATE_LIMIT_WINDOW_MS", 10_000, 86_400_000);
  const mfaEnabled = env.MFA_ENABLED === undefined || env.MFA_ENABLED === "" ? false : parseBoolean(env.MFA_ENABLED, "MFA_ENABLED");
  const mfaTotpIssuer = stringWithoutHeaderBreaks(env.MFA_TOTP_ISSUER || "Ergon", "MFA_TOTP_ISSUER");
  if (!mfaTotpIssuer || mfaTotpIssuer.length > 64) throw new Error("MFA_TOTP_ISSUER must be between 1 and 64 characters");
  const mfaEncryptionKey = mfaEnabled ? decodeMfaEncryptionKey(env.MFA_ENCRYPTION_KEY || "", isSecureDeployment) : null;
  const recoveryDeliveryProvider = env.RECOVERY_DELIVERY_PROVIDER || "disabled";
  if (!["disabled", "smtp"].includes(recoveryDeliveryProvider)) throw new Error("RECOVERY_DELIVERY_PROVIDER must be disabled or smtp");
  const recoveryExposeTestToken = env.RECOVERY_EXPOSE_TEST_TOKEN === "true";
  if (isSecureDeployment && recoveryExposeTestToken) {
    throw new Error("RECOVERY_EXPOSE_TEST_TOKEN must not be true outside local development");
  }
  const smtpPort = env.SMTP_PORT ? boundedInteger(env.SMTP_PORT, "SMTP_PORT", 1, 65_535) : 587;
  const smtpUseTls = env.SMTP_USE_TLS === undefined || env.SMTP_USE_TLS === "" ? true : parseBoolean(env.SMTP_USE_TLS, "SMTP_USE_TLS");
  const smtpHost = stringWithoutHeaderBreaks(env.SMTP_HOST || "", "SMTP_HOST");
  const smtpUsername = stringWithoutHeaderBreaks(env.SMTP_USERNAME || "", "SMTP_USERNAME");
  const smtpPassword = stringWithoutHeaderBreaks(env.SMTP_PASSWORD || "", "SMTP_PASSWORD");
  const smtpFromEmail = stringWithoutHeaderBreaks(env.SMTP_FROM_EMAIL || "", "SMTP_FROM_EMAIL").toLowerCase();
  if (Boolean(smtpUsername) !== Boolean(smtpPassword)) throw new Error("SMTP_USERNAME and SMTP_PASSWORD must be configured together");
  if (recoveryDeliveryProvider === "smtp") {
    if (!smtpHost) throw new Error("SMTP_HOST is required when RECOVERY_DELIVERY_PROVIDER=smtp");
    if (!smtpFromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpFromEmail)) throw new Error("SMTP_FROM_EMAIL must be a valid email address");
    if (!env.APP_URL) throw new Error("APP_URL is required when RECOVERY_DELIVERY_PROVIDER=smtp");
    const resetOrigin = new URL(env.APP_URL);
    if (isSecureDeployment && ["localhost", "127.0.0.1", "::1"].includes(resetOrigin.hostname)) throw new Error("APP_URL must not use a localhost reset origin in secure deployment profiles");
    if (isSecureDeployment && !smtpUseTls) throw new Error("SMTP_USE_TLS must be true in secure deployment profiles");
  }

  const logLevel = env.LOG_LEVEL || "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel)) throw new Error("LOG_LEVEL must be debug, info, warn, or error");

  return {
    nodeEnv,
    isProduction,
    deploymentProfile,
    isSecureDeployment,
    processRole,
    runsApi: ["api", "api-and-worker"].includes(processRole),
    runsWorker: ["worker", "api-and-worker"].includes(processRole),
    logLevel,
    port,
    apiHost: env.API_HOST || (isProduction ? "0.0.0.0" : "127.0.0.1"),
    workerHealthPort: boundedInteger(env.WORKER_HEALTH_PORT || "4001", "WORKER_HEALTH_PORT", 1, 65_535),
    workerHealthHost: env.WORKER_HEALTH_HOST || (isProduction ? "0.0.0.0" : "127.0.0.1"),
    appUrl: env.APP_URL || "http://localhost:5173",
    allowedOrigins,
    databaseUrl: repositoryConfig.databaseUrl,
    repositoryBackend,
    sessionSecret: env.SESSION_SECRET || "development-only-session-secret-change-me",
    storageBackend,
    uploadStorageBackend: storageBackend,
    uploadDir: env.UPLOAD_DIR || "data/private-storage",
    maxUploadMb,
    s3Bucket: env.S3_BUCKET || "",
    s3Region: env.S3_REGION || "",
    s3Endpoint: env.S3_ENDPOINT || "",
    s3AccessKeyId: env.S3_ACCESS_KEY_ID || "",
    s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY || "",
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    signedUrlExpirySeconds: boundedInteger(env.SIGNED_URL_EXPIRY_SECONDS || "300", "SIGNED_URL_EXPIRY_SECONDS", 60, 3_600),
    queueBackend,
    queueConcurrency,
    queueMaxRetries,
    queueLeaseMs,
    queueHeartbeatMs,
    queuePollMs,
    queueShutdownTimeoutMs,
    malwareScanEnabled,
    malwareScanRequiredInProduction,
    malwareScannerProvider,
    malwareScanTimeoutMs,
    malwareScanFailPolicy,
    clamavHost,
    clamavPort,
    trustProxy,
    loginRateLimitMaxAttempts,
    loginRateLimitWindowMs,
    mfaEnabled,
    mfaEncryptionKey,
    mfaTotpIssuer,
    recoveryDeliveryProvider,
    recoveryExposeTestToken,
    smtpHost,
    smtpPort,
    smtpUseTls,
    smtpUsername,
    smtpPassword,
    smtpFromEmail,
    sessionCookieSameSite: sessionCookieSameSite[0].toUpperCase() + sessionCookieSameSite.slice(1),
    enableDemoData: env.ENABLE_DEMO_DATA === "true",
    adminEmail: env.ADMIN_EMAIL || "admin@ergon.local",
    adminPassword: env.ADMIN_PASSWORD || "",
    aiEnabled,
    aiProvider,
    aiMaxFileTextChars,
    aiTimeoutMs,
    aiMaxOutputTokens,
    aiConfidenceThreshold,
    aiReviewRequiredThreshold,
    openAiApiKey: env.OPENAI_API_KEY || "",
    openAiModel: env.OPENAI_MODEL || "",
    azureOpenAiEndpoint,
    azureOpenAiApiKey: env.AZURE_OPENAI_API_KEY || "",
    azureOpenAiDeployment: env.AZURE_OPENAI_DEPLOYMENT || ""
  };
}

function positiveInteger(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function unitInterval(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${name} must be between 0 and 1`);
  return parsed;
}

function boundedInteger(value, name, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return parsed;
}

function parseBoolean(value, name) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function stringWithoutHeaderBreaks(value, name) {
  const text = String(value || "").trim();
  if (/[\r\n]/.test(text)) throw new Error(`${name} must not contain line breaks`);
  return text;
}

function decodeMfaEncryptionKey(value, isSecureDeployment) {
  const text = String(value || "").trim();
  if (!text) throw new Error("MFA_ENCRYPTION_KEY is required when MFA_ENABLED=true");
  let decoded;
  try {
    decoded = Buffer.from(text, "base64");
  } catch {
    throw new Error("MFA_ENCRYPTION_KEY must be a Base64-encoded 32-byte key");
  }
  if (decoded.length !== 32 || decoded.toString("base64") !== text.replace(/=+$/, "") + "=".repeat((4 - (text.replace(/=+$/, "").length % 4)) % 4)) {
    throw new Error("MFA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  if (isSecureDeployment && decoded.every((byte) => byte === 0)) {
    throw new Error("MFA_ENCRYPTION_KEY must not be an obvious placeholder");
  }
  return decoded;
}
