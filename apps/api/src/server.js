import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { readConfig } from "../../../packages/config/src/index.js";
import { createRepository } from "../../../packages/db/src/repository.js";
import { createEvidenceAiProvider, parseAiReviewInput } from "../../../packages/ai/src/index.js";
import { EVIDENCE_TAXONOMY, USER_ROLES, forbidden, parseEvidenceInput, parseFacilityInput, requiredString, toPublicUser, jsonError, unauthorized, validationError } from "../../../packages/shared/src/index.js";
import { getApplicableRules, generateReview, RULES_PACKS, COMPLIANCE_RULES } from "../../../packages/rules/src/index.js";
import { generateAuditPacketPdf } from "../../../packages/pdf/src/index.js";
import { createPrivateStorage } from "./storage.js";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaChallengeToken,
  generateMfaRecoveryCodes,
  generateResetToken,
  hashMfaChallengeToken,
  hashMfaRecoveryCode,
  hashPassword,
  hashResetToken,
  signSessionId,
  verifyPassword,
  verifySignedSession
} from "./security.js";
import {
  createTotpEnrollment,
  MFA_LOGIN_CHALLENGE_MAX_ATTEMPTS,
  MFA_LOGIN_CHALLENGE_TTL_MS,
  MFA_PENDING_ENROLLMENT_TTL_MS,
  verifyTotpCode
} from "./mfa.js";
import { createLoginRateLimiter } from "./rate-limit.js";
import { createRecoveryDelivery } from "./recovery-delivery.js";
import { createEvidenceAiService } from "./evidence-ai-service.js";
import { assertEvidenceDownloadAllowed, canProcessScannedEvidence, createMalwareScanner } from "./malware-scanner.js";
import { createEvidenceProcessingQueue } from "./processing-queue.js";
import { createReviewQueueService } from "./review-queue-service.js";
import { validateUploadedFile } from "./file-validation.js";
import { createOperationalLogger } from "./operational-logger.js";

const config = readConfig(process.env);
const logger = createOperationalLogger({ service: `ergon-${config.processRole}`, level: config.logLevel });
const repo = await createRepository(config);
const storage = createPrivateStorage(config);
const aiProvider = createEvidenceAiProvider(config);
const evidenceAiService = createEvidenceAiService({ config, repo, storage, provider: aiProvider });
const malwareScanner = createMalwareScanner(config);
const reviewQueueService = createReviewQueueService({ repo });
const loginRateLimiter = createLoginRateLimiter({ maxAttempts: config.loginRateLimitMaxAttempts, windowMs: config.loginRateLimitWindowMs });
const recoveryRequestIpLimiter = createLoginRateLimiter({ maxAttempts: 8, windowMs: 15 * 60 * 1000 });
const recoveryRequestEmailLimiter = createLoginRateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });
const recoveryResetLimiter = createLoginRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 });
const recoveryDelivery = createRecoveryDelivery(config, config.nodeEnv === "test" ? globalThis.__ERGON_RECOVERY_DELIVERY_DEPS__ || {} : {});
const processingQueue = createEvidenceProcessingQueue(config, {
  repo,
  logger,
  processor: async (job) => {
    const evidence = await repo.getEvidence(job.organizationId, job.evidenceId);
    if (!evidence || !canProcessScannedEvidence(evidence, config)) {
      const error = new Error("Evidence cannot be processed until its file scan is clean");
      error.code = "FILE_SCAN_BLOCKED";
      error.retryable = false;
      throw error;
    }
    const analysis = await evidenceAiService.processEvidence({
      organizationId: job.organizationId,
      evidenceId: job.evidenceId,
      userId: job.createdByUserId,
      processingJobId: job.id,
      createdByType: "system"
    });
    const facility = await repo.getFacility(job.organizationId, job.facilityId);
    if (facility) {
      const actor = job.createdByUserId ? await repo.findUserById(job.createdByUserId) : null;
      await generateAndPersistReview(actor || { id: null, organizationId: job.organizationId }, facility);
    }
    return analysis;
  },
  onEvent: async (action, job, metadata) => repo.logAudit({
    organizationId: job.organizationId,
    facilityId: job.facilityId,
    actorUserId: job.createdByUserId,
    action,
    entityType: "evidence_processing_job",
    entityId: job.id,
    metadata: { evidenceId: job.evidenceId, processingAttempts: job.processingAttempts, ...metadata }
  })
});
if (config.runsWorker) await processingQueue.start();
const DEFAULT_JSON_LIMIT_BYTES = 1024 * 1024;
const UPLOAD_JSON_LIMIT_BYTES = Math.ceil(config.maxUploadMb * 1024 * 1024 * 4 / 3) + 256 * 1024;

const server = http.createServer(async (req, res) => {
  const requestId = requestCorrelationId(req.headers["x-request-id"]);
  const startedAt = Date.now();
  req.context = { requestId };
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () => logger.info("http_request_completed", {
    requestId,
    method: req.method,
    route: req.context?.route || new URL(req.url || "/", "http://localhost").pathname,
    statusCode: res.statusCode,
    organizationId: req.context?.organizationId,
    userId: req.context?.userId,
    durationMs: Date.now() - startedAt
  }));
  try {
    await handleRequest(req, res);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      logger.error("http_request_failed", {
        requestId,
        method: req.method,
        route: req.context?.route || new URL(req.url || "/", "http://localhost").pathname,
        statusCode: error.status || 500,
        organizationId: req.context?.organizationId,
        userId: req.context?.userId,
        errorCode: error.code || "INTERNAL_ERROR",
        durationMs: Date.now() - startedAt
      });
    }
    sendJson(res, jsonError(error));
  }
});

const workerHealthServer = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  const path = new URL(req.url || "/", "http://localhost").pathname.replace(/\/$/, "") || "/";
  if (req.method === "GET" && path === "/health/live") return sendJson(res, { status: 200, body: { ok: true, service: "Ergon Worker", processRole: config.processRole } });
  if (req.method === "GET" && ["/health", "/health/ready"].includes(path)) return readiness(res, { service: "Ergon Worker", requireWorker: true });
  if (req.method === "GET" && path === "/metrics") {
    const queue = await processingQueue.healthCheck({ requireWorker: true });
    return sendJson(res, { status: queue.ok ? 200 : 503, body: { service: "Ergon Worker", processRole: config.processRole, queue } });
  }
  return sendJson(res, { status: 404, body: { error: "Route not found", code: "NOT_FOUND" } });
});

async function handleRequest(req, res) {
  applySecurityHeaders(res);
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  enforceTrustedOrigin(req);

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = req.method || "GET";
  req.context.route = path;

  if (method === "GET" && path === "/health/live") return sendJson(res, { status: 200, body: { ok: true, service: "Ergon API", processRole: config.processRole } });
  if (method === "GET" && ["/health", "/health/ready", "/api/health"].includes(path)) return readiness(res, { service: "Ergon API", requireWorker: config.runsWorker });

  if (method === "POST" && path === "/api/auth/login") return login(req, res);
  if (method === "POST" && path === "/api/auth/mfa/login/verify") return verifyMfaLogin(req, res);
  if (method === "POST" && path === "/api/auth/logout") return logout(req, res);
  if (method === "POST" && path === "/api/auth/recovery/request") return requestPasswordRecovery(req, res);
  if (method === "POST" && path === "/api/auth/recovery/reset") return resetPassword(req, res);
  if (method === "GET" && path === "/api/auth/recovery/test-token") return recoveryTestToken(res, url.searchParams.get("email"));

  const user = await requireSession(req);

  if (method === "GET" && path === "/api/auth/me") return sendJson(res, { status: 200, body: toPublicUser(user) });
  if (method === "GET" && path === "/api/auth/mfa/status") return mfaStatus(res, user);
  if (method === "POST" && path === "/api/auth/mfa/enrollment/start") return startMfaEnrollment(req, res, user);
  if (method === "POST" && path === "/api/auth/mfa/enrollment/confirm") return confirmMfaEnrollment(req, res, user);
  if (method === "POST" && path === "/api/auth/mfa/recovery-codes/regenerate") return regenerateMfaRecoveryCodes(req, res, user);
  if (method === "POST" && path === "/api/auth/mfa/disable") return disableMfa(req, res, user);
  if (method === "GET" && path === "/api/ai/status") return sendJson(res, { status: 200, body: { enabled: config.aiEnabled, provider: aiProvider.kind, model: aiProvider.model || null, queueBackend: config.queueBackend, storageBackend: config.storageBackend, malwareScanner: malwareScanner.kind } });
  if (method === "GET" && path === "/api/evidence-taxonomy") return sendJson(res, { status: 200, body: EVIDENCE_TAXONOMY });
  if (method === "GET" && path === "/api/organization") return currentOrganization(res, user);
  if (method === "GET" && path === "/api/users") return listUsers(res, user);
  if (method === "POST" && path === "/api/users") return createUserAccount(req, res, user);
  if (match(path, "/api/users/:id") && method === "PATCH") return updateUserAccount(req, res, user, params(path).id);

  if (path === "/api/facilities" && method === "GET") return listFacilities(res, user);
  if (path === "/api/facilities" && method === "POST") return createFacility(req, res, user);
  if (match(path, "/api/facilities/:id") && method === "GET") return getFacility(res, user, params(path).id);
  if (match(path, "/api/facilities/:id") && method === "PATCH") return updateFacility(req, res, user, params(path).id);
  if (match(path, "/api/facilities/:id") && method === "DELETE") return archiveFacility(res, user, params(path).id);
  if (match(path, "/api/facilities/:id/applicable-rules") && method === "GET") return applicableRules(res, user, params(path).id);

  if (path === "/api/rules-packs" && method === "GET") return sendJson(res, { status: 200, body: await repo.listRulesPacks() });
  if (match(path, "/api/rules-packs/:id") && method === "GET") return getRulesPack(res, params(path).id);
  if (path === "/api/rules" && method === "GET") return sendJson(res, { status: 200, body: await repo.listComplianceRules(Object.fromEntries(url.searchParams)) });

  if (path === "/api/evidence" && method === "GET") return listEvidence(res, user, url.searchParams.get("facilityId"), url.searchParams.get("includeArchived") === "true");
  if (path === "/api/evidence" && method === "POST") return createEvidence(req, res, user, false);
  if (path === "/api/evidence/upload" && method === "POST") return createEvidence(req, res, user, true);
  if (match(path, "/api/evidence/:id") && method === "GET") return getEvidence(res, user, params(path).id);
  if (match(path, "/api/evidence/:id") && method === "PATCH") return updateEvidence(req, res, user, params(path).id);
  if (match(path, "/api/evidence/:id") && method === "DELETE") return archiveEvidence(req, res, user, params(path).id);
  if (match(path, "/api/evidence/:id/legal-hold") && method === "POST") return setEvidenceLegalHold(req, res, user, params(path).id);
  if (match(path, "/api/evidence/:id/legal-hold") && method === "DELETE") return releaseEvidenceLegalHold(req, res, user, params(path).id);
  if (match(path, "/api/evidence/:id/restore") && method === "POST") return restoreEvidence(req, res, user, params(path).id);
  if (match(path, "/api/evidence/:id/retry-storage-deletion") && method === "POST") return retryEvidenceStorageDeletion(req, res, user, params(path).id);
  if (match(path, "/api/evidence/:id/download") && method === "GET") return downloadEvidence(res, user, params(path).id);
  if (match(path, "/api/evidence/:id/process-ai") && method === "POST") return processEvidenceAi(res, user, params(path).id);
  if (match(path, "/api/evidence/:id/retry-processing") && method === "POST") return retryEvidenceProcessing(res, user, params(path).id);
  if (match(path, "/api/evidence/:id/ai-analysis") && method === "GET") return getEvidenceAiAnalysis(res, user, params(path).id);
  if (match(path, "/api/evidence/:id/ai-analyses") && method === "GET") return getEvidenceAiHistory(res, user, params(path).id);
  if (match(path, "/api/evidence/:id/ai-review") && method === "PATCH") return reviewEvidenceAi(req, res, user, params(path).id);
  if (path === "/api/evidence-ai-analyses" && method === "GET") return listEvidenceAiAnalyses(res, user, url.searchParams.get("facilityId"));
  if (path === "/api/evidence-processing-jobs" && method === "GET") return listEvidenceProcessingJobs(res, user, url.searchParams.get("facilityId"));
  if (path === "/api/evidence-review-queue" && method === "GET") return listEvidenceReviewQueue(res, user, url.searchParams);

  if (path === "/api/audit-readiness/reviews" && method === "GET") return listReviews(res, user, url.searchParams.get("facilityId"));
  if (path === "/api/audit-readiness/reviews" && method === "POST") return createReview(req, res, user);
  if (match(path, "/api/audit-readiness/reviews/:id") && method === "GET") return getReview(res, user, params(path).id);
  if (match(path, "/api/audit-readiness/reviews/:id/gap-matrix") && method === "GET") return sendJson(res, { status: 200, body: await repo.getGapRows(user.organizationId, params(path).id) });
  if (match(path, "/api/audit-readiness/reviews/:id/score") && method === "GET") {
    const review = await requireReview(user.organizationId, params(path).id);
    return sendJson(res, { status: 200, body: { readinessScore: review.readinessScore, scoreExplanation: review.scoreExplanation } });
  }
  if (match(path, "/api/audit-readiness/reviews/:id/action-plan") && method === "GET") return sendJson(res, { status: 200, body: await repo.getActionItems(user.organizationId, params(path).id) });

  if (path === "/api/audit-packets" && method === "GET") return listPackets(res, user, url.searchParams.get("facilityId"), url.searchParams.get("includeArchived") === "true");
  if (path === "/api/audit-packets/export" && method === "POST") return exportPacket(req, res, user);
  if (match(path, "/api/audit-packets/:id/download") && method === "GET") return downloadPacket(res, user, params(path).id);
  if (match(path, "/api/audit-packets/:id") && method === "DELETE") return archivePacket(req, res, user, params(path).id);
  if (match(path, "/api/audit-packets/:id/legal-hold") && method === "POST") return setPacketLegalHold(req, res, user, params(path).id);
  if (match(path, "/api/audit-packets/:id/legal-hold") && method === "DELETE") return releasePacketLegalHold(req, res, user, params(path).id);
  if (match(path, "/api/audit-packets/:id/restore") && method === "POST") return restorePacket(req, res, user, params(path).id);
  if (match(path, "/api/audit-packets/:id/retry-storage-deletion") && method === "POST") return retryPacketStorageDeletion(req, res, user, params(path).id);

  if (path === "/api/lifecycle/retention/enforce" && method === "POST") return enforceRetention(req, res, user);

  if (path === "/api/expert-reviews" && method === "GET") return sendJson(res, { status: 200, body: await repo.listExpertReviews(user.organizationId) });
  if (path === "/api/expert-reviews" && method === "POST") return requestExpertReview(req, res, user);
  if (match(path, "/api/expert-reviews/:id") && method === "PATCH") return updateExpertReview(req, res, user, params(path).id);

  if (path === "/api/audit-logs" && method === "GET") return listAuditLogs(res, user, url.searchParams.get("facilityId"));

  const error = new Error("Route not found");
  error.status = 404;
  throw error;
}

async function login(req, res) {
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) throw validationError("Email and password are required");
  const rateKey = `${clientIp(req)}|${email}`;
  const rate = loginRateLimiter.check(rateKey);
  if (!rate.allowed) {
    logger.warn("login_rate_limited", { requestId: req.context.requestId, retryAfterSeconds: rate.retryAfterSeconds });
    const error = new Error("Too many failed login attempts. Try again later.");
    error.status = 429;
    error.code = "RATE_LIMITED";
    error.details = { retryAfterSeconds: rate.retryAfterSeconds };
    throw error;
  }
  const user = await repo.findUserByEmail(email);
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    loginRateLimiter.recordFailure(rateKey);
    throw unauthorized("Invalid credentials");
  }
  loginRateLimiter.reset(rateKey);
  const mfaSettings = config.mfaEnabled ? await repo.getUserMfaSettings(user.organizationId, user.id) : null;
  if (mfaSettings?.enabled) {
    const challengeToken = generateMfaChallengeToken();
    const challengeTokenHash = hashMfaChallengeToken(challengeToken);
    const expiresAt = new Date(Date.now() + MFA_LOGIN_CHALLENGE_TTL_MS).toISOString();
    await repo.createMfaLoginChallenge({
      organizationId: user.organizationId,
      userId: user.id,
      challengeTokenHash,
      expiresAt
    });
    return sendJson(res, { status: 200, body: { ok: true, mfaRequired: true, challengeToken, expiresAt } });
  }
  await createAuthenticatedSession(res, user, req);
}

async function createAuthenticatedSession(res, user, req, action = "login") {
  const session = await repo.createSession({
    organizationId: user.organizationId,
    userId: user.id,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
  });
  await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action, entityType: "user", entityId: user.id, metadata: {}, ipAddress: clientIp(req) });
  setCookie(res, "ciq.sid", signSessionId(session.id, config.sessionSecret), { maxAge: 8 * 60 * 60, httpOnly: true, sameSite: config.sessionCookieSameSite, secure: config.isProduction });
  sendJson(res, { status: 200, body: { user: toPublicUser(user) } });
}

async function verifyMfaLogin(req, res) {
  if (!config.mfaEnabled) throw unauthorized("Invalid MFA challenge");
  const body = await readJson(req);
  const challengeToken = String(body.challengeToken || "");
  const code = String(body.code || "");
  if (!challengeToken || !code) throw unauthorized("Invalid MFA code or recovery code");
  const challengeTokenHash = hashMfaChallengeToken(challengeToken);
  const challenge = await repo.getValidMfaLoginChallengeByHash(challengeTokenHash);
  if (!challenge) throw unauthorized("Invalid MFA code or recovery code");
  const user = await repo.findUserById(challenge.userId);
  const settings = user?.isActive ? await repo.getUserMfaSettings(challenge.organizationId, challenge.userId) : null;
  if (!user || !user.isActive || user.organizationId !== challenge.organizationId || !settings?.enabled) {
    await repo.recordMfaChallengeFailure({ challengeTokenHash, maxAttempts: MFA_LOGIN_CHALLENGE_MAX_ATTEMPTS });
    throw unauthorized("Invalid MFA code or recovery code");
  }
  const verified = await verifySecondFactor(user, settings, code, { allowRecoveryCode: true });
  if (!verified.ok) {
    await repo.recordMfaChallengeFailure({ challengeTokenHash, maxAttempts: MFA_LOGIN_CHALLENGE_MAX_ATTEMPTS });
    throw unauthorized("Invalid MFA code or recovery code");
  }
  const consumed = await repo.consumeMfaChallenge({ challengeTokenHash });
  if (!consumed) throw unauthorized("Invalid MFA code or recovery code");
  if (verified.method === "recovery_code") {
    await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action: "mfa_recovery_code_used", entityType: "user", entityId: user.id, metadata: {}, ipAddress: clientIp(req) });
  }
  await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action: "mfa_login_succeeded", entityType: "user", entityId: user.id, metadata: { method: verified.method }, ipAddress: clientIp(req) });
  await createAuthenticatedSession(res, user, req, "login");
}

async function mfaStatus(res, user) {
  const settings = config.mfaEnabled ? await repo.getUserMfaSettings(user.organizationId, user.id) : null;
  sendJson(res, { status: 200, body: { available: config.mfaEnabled, enabled: Boolean(settings?.enabled), issuer: config.mfaTotpIssuer } });
}

async function startMfaEnrollment(req, res, user) {
  requireMfaFeature();
  const body = await readJson(req);
  await requireCurrentPassword(user, body.currentPassword || body.password);
  const existing = await repo.getUserMfaSettings(user.organizationId, user.id);
  if (existing?.enabled) throw validationError("MFA is already enabled");
  const enrollment = createTotpEnrollment({ issuer: config.mfaTotpIssuer, label: user.email });
  const encryptedSecret = encryptMfaSecret(enrollment.secret, config.mfaEncryptionKey);
  const expiresAt = new Date(Date.now() + MFA_PENDING_ENROLLMENT_TTL_MS).toISOString();
  await repo.createPendingMfaEnrollment({
    organizationId: user.organizationId,
    userId: user.id,
    encryptedSecret,
    expiresAt
  });
  sendJson(res, {
    status: 200,
    body: {
      ok: true,
      manualSecret: enrollment.secret,
      otpauthUri: enrollment.otpauthUri,
      issuer: enrollment.issuer,
      label: enrollment.label,
      expiresAt
    }
  });
}

async function confirmMfaEnrollment(req, res, user) {
  requireMfaFeature();
  const body = await readJson(req);
  const settings = await repo.getUserMfaSettings(user.organizationId, user.id);
  if (!settings?.pendingSecretCiphertext) throw validationError("No pending MFA enrollment");
  if (new Date(settings.pendingEnrollmentExpiresAt).getTime() <= Date.now()) throw validationError("MFA enrollment expired");
  const secret = decryptMfaSecret({
    ciphertext: settings.pendingSecretCiphertext,
    iv: settings.pendingSecretIv,
    tag: settings.pendingSecretTag
  }, config.mfaEncryptionKey);
  const verified = await verifyTotpCode({ secret, code: body.code, lastAcceptedCounter: settings.lastAcceptedTotpCounter });
  if (!verified.valid) throw unauthorized("Invalid MFA code");
  const confirmed = await repo.confirmMfaEnrollment({
    organizationId: user.organizationId,
    userId: user.id,
    acceptedCounter: verified.counter,
    confirmedAt: new Date().toISOString()
  });
  if (!confirmed) throw validationError("No pending MFA enrollment");
  const recoveryCodes = generateMfaRecoveryCodes(10);
  await repo.replaceMfaRecoveryCodes({
    organizationId: user.organizationId,
    userId: user.id,
    codeHashes: recoveryCodes.map(hashMfaRecoveryCode)
  });
  await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action: "mfa_enabled", entityType: "user", entityId: user.id, metadata: {}, ipAddress: clientIp(req) });
  sendJson(res, { status: 200, body: { ok: true, enabled: true, recoveryCodes } });
}

async function regenerateMfaRecoveryCodes(req, res, user) {
  requireMfaFeature();
  const body = await readJson(req);
  await requireCurrentPassword(user, body.currentPassword || body.password);
  const settings = await requireEnabledMfaSettings(user);
  const verified = await verifyTotpOnly(user, settings, body.code);
  if (!verified) throw unauthorized("Invalid MFA code");
  const recoveryCodes = generateMfaRecoveryCodes(10);
  await repo.replaceMfaRecoveryCodes({
    organizationId: user.organizationId,
    userId: user.id,
    codeHashes: recoveryCodes.map(hashMfaRecoveryCode)
  });
  await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action: "mfa_recovery_codes_regenerated", entityType: "user", entityId: user.id, metadata: {}, ipAddress: clientIp(req) });
  sendJson(res, { status: 200, body: { ok: true, recoveryCodes } });
}

async function disableMfa(req, res, user) {
  requireMfaFeature();
  const body = await readJson(req);
  await requireCurrentPassword(user, body.currentPassword || body.password);
  const settings = await requireEnabledMfaSettings(user);
  const verified = await verifySecondFactor(user, settings, body.code, { allowRecoveryCode: true });
  if (!verified.ok) throw unauthorized("Invalid MFA code or recovery code");
  await repo.disableUserMfa({ organizationId: user.organizationId, userId: user.id });
  await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action: "mfa_disabled", entityType: "user", entityId: user.id, metadata: { method: verified.method }, ipAddress: clientIp(req) });
  sendJson(res, { status: 200, body: { ok: true, enabled: false } });
}

function requireMfaFeature() {
  if (!config.mfaEnabled) {
    const error = new Error("MFA is not available");
    error.status = 404;
    error.code = "NOT_FOUND";
    throw error;
  }
}

async function requireCurrentPassword(user, password) {
  if (!(await verifyPassword(String(password || ""), user.passwordHash))) throw unauthorized("Invalid credentials");
}

async function requireEnabledMfaSettings(user) {
  const settings = await repo.getUserMfaSettings(user.organizationId, user.id);
  if (!settings?.enabled) throw validationError("MFA is not enabled");
  return settings;
}

async function verifyTotpOnly(user, settings, code) {
  const secret = decryptMfaSecret({ ciphertext: settings.secretCiphertext, iv: settings.secretIv, tag: settings.secretTag }, config.mfaEncryptionKey);
  const verified = await verifyTotpCode({ secret, code, lastAcceptedCounter: settings.lastAcceptedTotpCounter });
  if (!verified.valid) return false;
  return Boolean(await repo.updateLastAcceptedTotpCounter({
    organizationId: user.organizationId,
    userId: user.id,
    counter: verified.counter
  }));
}

async function verifySecondFactor(user, settings, code, { allowRecoveryCode = false } = {}) {
  if (await verifyTotpOnly(user, settings, code)) return { ok: true, method: "totp" };
  if (!allowRecoveryCode) return { ok: false };
  const consumed = await repo.consumeMfaRecoveryCode({
    organizationId: user.organizationId,
    userId: user.id,
    codeHash: hashMfaRecoveryCode(code)
  });
  return consumed ? { ok: true, method: "recovery_code" } : { ok: false };
}

async function logout(req, res) {
  const sessionId = getSessionId(req);
  if (sessionId) await repo.deleteSession(sessionId);
  setCookie(res, "ciq.sid", "", { maxAge: 0, httpOnly: true, sameSite: config.sessionCookieSameSite, secure: config.isProduction });
  sendJson(res, { status: 200, body: { ok: true } });
}

async function requestPasswordRecovery(req, res) {
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const ipKey = `recovery-ip:${clientIp(req)}`;
  const emailKey = email ? `recovery-email:${email}` : "";
  const ipRate = recoveryRequestIpLimiter.check(ipKey);
  const emailRate = emailKey ? recoveryRequestEmailLimiter.check(emailKey) : { allowed: true };
  recoveryRequestIpLimiter.recordFailure(ipKey);
  if (emailKey) recoveryRequestEmailLimiter.recordFailure(emailKey);

  if (!ipRate.allowed || !emailRate.allowed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (!ipRate.allowed || !emailRate.allowed) {
      logger.warn("password_recovery_rate_limited", { requestId: req.context.requestId });
    }
    return sendPasswordRecoveryAccepted(res);
  }

  const user = await repo.findUserByEmail(email);
  if (user?.isActive) {
    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await repo.createPasswordResetToken({
      organizationId: user.organizationId,
      userId: user.id,
      tokenHash,
      requestedAt: new Date().toISOString(),
      expiresAt
    });
    const delivery = await recoveryDelivery.sendPasswordReset({
      user,
      token,
      resetUrl: buildPasswordResetUrl(token),
      expiresAt
    });
    if (!delivery.ok) {
      await repo.invalidatePasswordResetToken({
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash,
        invalidatedAt: new Date().toISOString()
      });
    }
    await repo.logAudit({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "password_reset.requested",
      entityType: "user",
      entityId: user.id,
      metadata: { expiresAt, deliveryStatus: delivery.status },
      ipAddress: clientIp(req)
    });
    await repo.logAudit({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: delivery.ok ? "password_recovery_delivery_sent" : "password_recovery_delivery_failed",
      entityType: "user",
      entityId: user.id,
      metadata: {
        provider: delivery.provider,
        status: delivery.status,
        messageAccepted: delivery.messageAccepted || undefined,
        errorCode: delivery.errorCode || undefined,
        smtpCommand: delivery.smtpCommand || undefined,
        smtpResponseCode: delivery.smtpResponseCode || undefined
      },
      ipAddress: clientIp(req)
    });
    logger.info("password_recovery_requested", { requestId: req.context.requestId, organizationId: user.organizationId, userId: user.id, deliveryStatus: delivery.status });
    if (delivery.ok) {
      logger.info("password_recovery_delivery_sent", { requestId: req.context.requestId, organizationId: user.organizationId, userId: user.id, provider: delivery.provider, messageId: delivery.messageId });
    } else {
      logger.warn("password_recovery_delivery_failed", {
        requestId: req.context.requestId,
        organizationId: user.organizationId,
        userId: user.id,
        provider: delivery.provider,
        errorCode: delivery.errorCode,
        smtpCommand: delivery.smtpCommand,
        smtpResponseCode: delivery.smtpResponseCode
      });
    }
  }

  return sendPasswordRecoveryAccepted(res);
}

async function resetPassword(req, res) {
  const rateKey = `recovery-reset:${clientIp(req)}`;
  const rate = recoveryResetLimiter.check(rateKey);
  if (!rate.allowed) {
    logger.warn("password_reset_rate_limited", { requestId: req.context.requestId });
    const error = new Error("Too many reset attempts. Try again later.");
    error.status = 429;
    error.code = "RATE_LIMITED";
    throw error;
  }
  recoveryResetLimiter.recordFailure(rateKey);

  const body = await readJson(req);
  const token = String(body.token || "").trim();
  const password = String(body.password || body.newPassword || "");
  if (!token) throw validationError("Invalid or expired reset token");
  assertPasswordPolicy(password);

  const tokenHash = hashResetToken(token);
  if (!(await repo.findValidPasswordResetToken(tokenHash))) {
    throw validationError("Invalid or expired reset token");
  }
  const result = await repo.completePasswordReset({
    tokenHash,
    passwordHash: await hashPassword(password),
    usedAt: new Date().toISOString()
  });
  if (!result) throw validationError("Invalid or expired reset token");

  recoveryResetLimiter.reset(rateKey);
  await repo.logAudit({
    organizationId: result.user.organizationId,
    actorUserId: result.user.id,
    action: "password_reset.completed",
    entityType: "user",
    entityId: result.user.id,
    metadata: { sessionsRevoked: true },
    ipAddress: clientIp(req)
  });
  setCookie(res, "ciq.sid", "", { maxAge: 0, httpOnly: true, sameSite: config.sessionCookieSameSite, secure: config.isProduction });
  sendJson(res, { status: 200, body: { ok: true, message: "Password has been reset. Please sign in with your new password." } });
}

async function recoveryTestToken(res, email) {
  if (!config.recoveryExposeTestToken) {
    const error = new Error("Route not found");
    error.status = 404;
    throw error;
  }
  const delivery = recoveryDelivery.getTestDelivery(email);
  if (!delivery) {
    const error = new Error("Test reset token not found");
    error.status = 404;
    throw error;
  }
  sendJson(res, { status: 200, body: delivery });
}

function sendPasswordRecoveryAccepted(res) {
  sendJson(res, {
    status: 202,
    body: {
      ok: true,
      message: "If that account exists, password reset instructions will be sent shortly."
    }
  });
}

function buildPasswordResetUrl(token) {
  const url = new URL(config.appUrl);
  url.hash = `/reset-password?token=${encodeURIComponent(token)}`;
  return url.toString();
}

function assertPasswordPolicy(password) {
  if (password.length < 12) throw validationError("password must be at least 12 characters");
}

async function requireSession(req) {
  const sessionId = getSessionId(req);
  if (!sessionId) throw unauthorized();
  const session = await repo.getSession(sessionId);
  if (!session) throw unauthorized();
  const user = await repo.findUserById(session.userId);
  if (!user || !user.isActive || user.organizationId !== session.organizationId) throw unauthorized();
  req.context.organizationId = user.organizationId;
  req.context.userId = user.id;
  return user;
}

function getSessionId(req) {
  const cookie = parseCookies(req.headers.cookie || "")["ciq.sid"];
  return verifySignedSession(cookie, config.sessionSecret);
}

async function currentOrganization(res, user) {
  const organization = await repo.getOrganization(user.organizationId);
  sendJson(res, { status: 200, body: organization });
}

async function listUsers(res, user) {
  requireRole(user, ["admin"]);
  const users = await repo.listUsersByOrganization(user.organizationId);
  sendJson(res, { status: 200, body: users.map(toPublicUser) });
}

async function createUserAccount(req, res, user) {
  requireRole(user, ["admin"]);
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError("A valid email address is required");
  const name = requiredString(body.name, "name");
  const role = normalizeUserRole(body.role);
  const password = String(body.password || "");
  if (password.length < 12) throw validationError("password must be at least 12 characters");
  if (await repo.findUserByEmail(email)) throw validationError("A user with this email already exists");
  const created = await repo.createUser({
    organizationId: user.organizationId,
    email,
    name,
    role,
    passwordHash: await hashPassword(password),
    isActive: true
  });
  await audit(user, null, "user.created", "user", created.id, { role });
  sendJson(res, { status: 201, body: toPublicUser(created) });
}

async function updateUserAccount(req, res, user, id) {
  requireRole(user, ["admin"]);
  const body = await readJson(req);
  const target = await repo.findUserById(id);
  if (!target || target.organizationId !== user.organizationId) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  const updates = {};
  if (body.name !== undefined) updates.name = requiredString(body.name, "name");
  if (body.role !== undefined) updates.role = normalizeUserRole(body.role);
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  if (Object.keys(updates).length === 0) throw validationError("No user updates provided");
  if (id === user.id && (updates.isActive === false || (updates.role && updates.role !== "admin"))) {
    throw validationError("Administrators cannot deactivate or demote their own account");
  }
  const updated = await repo.updateUser(user.organizationId, id, updates);
  await audit(user, null, "user.updated", "user", id, { role: updated.role, isActive: updated.isActive });
  sendJson(res, { status: 200, body: toPublicUser(updated) });
}

function normalizeUserRole(value) {
  const role = String(value || "").trim();
  if (!USER_ROLES.includes(role)) throw validationError(`role must be one of: ${USER_ROLES.join(", ")}`);
  return role;
}

async function listFacilities(res, user) {
  sendJson(res, { status: 200, body: await repo.listFacilities(user.organizationId) });
}

async function createFacility(req, res, user) {
  const input = parseFacilityInput(await readJson(req), user.organizationId);
  const facility = await repo.createFacility(input);
  const { rulesPack, rules } = getApplicableRules(facility);
  if (rulesPack) await repo.saveApplicableRules(user.organizationId, facility.id, rulesPack.rulesPackId, rules);
  const persistedFacility = await repo.getFacility(user.organizationId, facility.id);
  await audit(user, facility.id, "facility.created", "facility", facility.id, { name: facility.name });
  sendJson(res, { status: 201, body: { ...persistedFacility, rulesPack, applicableRuleCount: rules.length } });
}

async function getFacility(res, user, id) {
  const facility = await requireFacility(user.organizationId, id);
  sendJson(res, { status: 200, body: facility });
}

async function updateFacility(req, res, user, id) {
  await requireFacility(user.organizationId, id);
  const updates = parseFacilityInput({ ...(await repo.getFacility(user.organizationId, id)), ...(await readJson(req)) }, user.organizationId);
  const facility = await repo.updateFacility(user.organizationId, id, updates);
  const { rulesPack, rules } = getApplicableRules(facility);
  if (rulesPack) await repo.saveApplicableRules(user.organizationId, facility.id, rulesPack.rulesPackId, rules);
  const persistedFacility = await repo.getFacility(user.organizationId, facility.id);
  await audit(user, facility.id, "facility.updated", "facility", facility.id, {});
  sendJson(res, { status: 200, body: { ...persistedFacility, rulesPack, applicableRuleCount: rules.length } });
}

async function getRulesPack(res, rulesPackId) {
  const rulesPack = await repo.getRulesPack(rulesPackId);
  if (!rulesPack) {
    const error = new Error("Rules pack not found");
    error.status = 404;
    throw error;
  }
  sendJson(res, { status: 200, body: rulesPack });
}

async function archiveFacility(res, user, id) {
  const facility = await repo.archiveFacility(user.organizationId, id);
  await audit(user, id, "facility.archived", "facility", id, {});
  sendJson(res, { status: 200, body: facility });
}

async function applicableRules(res, user, id) {
  const facility = await requireFacility(user.organizationId, id);
  const { rulesPack, rules } = getApplicableRules(facility);
  sendJson(res, { status: 200, body: { rulesPack, rules } });
}

async function listEvidence(res, user, facilityId, includeArchived = false) {
  if (!facilityId) throw validationError("facilityId query parameter is required");
  await requireFacility(user.organizationId, facilityId);
  if (includeArchived) requireRole(user, ["admin", "reviewer"]);
  sendJson(res, { status: 200, body: await repo.listEvidence(user.organizationId, facilityId, { includeArchived }) });
}

async function createEvidence(req, res, user, allowsFile) {
  const body = await readJson(req, allowsFile ? UPLOAD_JSON_LIMIT_BYTES : DEFAULT_JSON_LIMIT_BYTES);
  if (["accepted", "rejected"].includes(body.status)) requireRole(user, ["admin", "reviewer"]);
  const facility = await requireFacility(user.organizationId, body.facilityId);
  let fileReference = null;
  const evidenceId = repo.createId();
  let uploadBuffer = null;
  let fileMetadata = { fileName: null, contentType: null, fileSizeBytes: null, fileSha256: null };
  if (allowsFile) {
    if (!body.contentBase64) throw validationError("contentBase64 is required for evidence upload");
    uploadBuffer = decodeBase64(body.contentBase64);
    const fileName = safeOriginalFileName(body.fileName || "evidence.bin");
    let validation;
    try {
      validation = validateUploadedFile({
        buffer: uploadBuffer,
        fileName,
        declaredContentType: body.contentType,
        maxBytes: config.maxUploadMb * 1024 * 1024
      });
    } catch (error) {
      await audit(user, facility.id, "evidence_upload_rejected", "facility", facility.id, {
        reasonCode: error.code || "FILE_VALIDATION_FAILED",
        ...error.fileValidation
      });
      logger.warn("evidence_upload_rejected", {
        requestId: req.context.requestId,
        organizationId: user.organizationId,
        userId: user.id,
        facilityId: facility.id,
        errorCode: error.code || "FILE_VALIDATION_FAILED"
      });
      throw error;
    }
    const saved = await storage.saveBuffer(uploadBuffer, fileName, {
      organizationId: user.organizationId,
      facilityId: facility.id,
      resourceType: "evidence",
      resourceId: evidenceId,
      contentType: validation.detectedContentType
    });
    fileReference = saved.fileReference;
    fileMetadata = {
      fileName,
      contentType: validation.declaredContentType,
      detectedContentType: validation.detectedContentType,
      fileValidationStatus: validation.fileValidationStatus,
      fileValidationError: validation.fileValidationError,
      fileSizeBytes: uploadBuffer.byteLength,
      fileSha256: saved.sha256,
      storageDeletionStatus: "retained"
    };
  }
  let evidence;
  try {
    evidence = await repo.createEvidence({ id: evidenceId, ...parseEvidenceInput({
      ...body,
      fileReference,
      ...fileMetadata,
      scanStatus: allowsFile ? "scan_pending" : "scan_unavailable",
      country: facility.country,
      region: facility.region
    }, user.organizationId, user.id) });
  } catch (error) {
    if (fileReference) await storage.deleteBuffer(fileReference);
    throw error;
  }
  await audit(user, facility.id, allowsFile ? "evidence_uploaded" : "evidence.created", "evidence", evidence.id, { evidenceType: evidence.evidenceType, hasFile: allowsFile, requestId: req.context.requestId, detectedContentType: evidence.detectedContentType });
  let processingJob = null;
  if (allowsFile) {
    let scan;
    try {
      scan = await malwareScanner.scanBuffer({ buffer: uploadBuffer, fileName: evidence.fileName, contentType: evidence.contentType });
    } catch (error) {
      scan = { status: "scan_failed", provider: malwareScanner.kind, error: String(error.message || "File scanning failed").slice(0, 500) };
    }
    evidence = await repo.updateEvidence(user.organizationId, evidence.id, {
      scanStatus: scan.status,
      scanProvider: scan.provider,
      scanError: scan.error,
      scannedAt: new Date().toISOString(),
      status: scan.status === "scan_suspicious" ? "needs_review" : evidence.status
    });
    await audit(user, facility.id, scanEvent(scan.status), "evidence", evidence.id, { scanStatus: scan.status, provider: scan.provider, requestId: req.context.requestId });
    if (canProcessScannedEvidence(evidence, config)) {
      processingJob = await processingQueue.enqueue({ organizationId: user.organizationId, facilityId: facility.id, evidenceId: evidence.id, createdByUserId: user.id });
    } else if (evidence.status === "pending") {
      evidence = await repo.updateEvidence(user.organizationId, evidence.id, { status: "needs_review" });
    }
  }
  sendJson(res, { status: 201, body: { ...evidence, processingJob } });
}

async function getEvidence(res, user, id) {
  const evidence = await requireEvidence(user.organizationId, id);
  sendJson(res, { status: 200, body: evidence });
}

async function updateEvidence(req, res, user, id) {
  const existing = await requireEvidence(user.organizationId, id);
  const body = await readJson(req);
  if (["accepted", "rejected"].includes(body.status) && body.status !== existing.status) requireRole(user, ["admin", "reviewer"]);
  const updates = parseEvidenceInput({
    ...existing,
    ...body,
    fileReference: existing.fileReference,
    fileName: existing.fileName,
    contentType: existing.contentType,
    fileSizeBytes: existing.fileSizeBytes,
    fileSha256: existing.fileSha256,
    facilityId: existing.facilityId,
    country: existing.country,
    region: existing.region
  }, user.organizationId, user.id);
  const evidence = await repo.updateEvidence(user.organizationId, id, updates);
  await audit(user, evidence.facilityId, "evidence.updated", "evidence", evidence.id, { status: evidence.status });
  sendJson(res, { status: 200, body: evidence });
}

async function archiveEvidence(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const existing = await requireEvidence(user.organizationId, id);
  if (existing.legalHoldActive) throw lifecycleConflict("Evidence is under legal hold and cannot be archived or deleted", "LEGAL_HOLD_ACTIVE");
  const deletionReason = deletionReasonFrom(req);
  const storageDeletionStatus = existing.fileReference ? "retained" : "not_applicable";
  const evidence = await repo.archiveEvidence(user.organizationId, id, {
    deletedAt: null,
    deletedByUserId: null,
    deletionReason,
    storageDeletionStatus,
    storageDeletionError: null
  });
  await audit(user, evidence.facilityId, "evidence.archived", "evidence", evidence.id, { requestId: req.context.requestId, storageDeletionStatus, deletionReason });
  sendJson(res, { status: 200, body: evidence });
}

async function setEvidenceLegalHold(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const existing = await requireEvidence(user.organizationId, id);
  const reason = lifecycleReason(await readJson(req), "Legal hold reason is required");
  const held = await repo.setEvidenceLegalHold(user.organizationId, id, {
    legalHoldReason: reason,
    legalHoldByUserId: user.id,
    legalHoldAt: new Date().toISOString()
  });
  await audit(user, existing.facilityId, "evidence_legal_hold_set", "evidence", id, { reason });
  sendJson(res, { status: 200, body: held });
}

async function releaseEvidenceLegalHold(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const existing = await requireEvidence(user.organizationId, id);
  const reason = lifecycleReason(await readJson(req), "Legal hold release reason is required");
  const released = await repo.releaseEvidenceLegalHold(user.organizationId, id, {
    legalHoldReleasedByUserId: user.id,
    legalHoldReleasedAt: new Date().toISOString(),
    legalHoldReleaseReason: reason
  });
  await audit(user, existing.facilityId, "evidence_legal_hold_released", "evidence", id, { reason });
  sendJson(res, { status: 200, body: released });
}

async function restoreEvidence(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const existing = await requireEvidence(user.organizationId, id);
  const reason = lifecycleReason(await readJson(req), "Restore reason is required");
  const restored = await repo.restoreEvidence(user.organizationId, id, {
    restoredByUserId: user.id,
    restoredAt: new Date().toISOString(),
    restoreReason: reason
  });
  await audit(user, existing.facilityId, "evidence.restored", "evidence", id, { reason });
  sendJson(res, { status: 200, body: restored });
}

async function retryEvidenceStorageDeletion(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const existing = await requireEvidence(user.organizationId, id);
  if (existing.legalHoldActive) throw lifecycleConflict("Evidence is under legal hold and cannot be deleted", "LEGAL_HOLD_ACTIVE");
  if (existing.storageDeletionStatus !== "failed" || !existing.fileReference) {
    throw lifecycleConflict("Evidence does not have a failed private-object deletion to retry", "STORAGE_DELETION_NOT_RETRYABLE");
  }
  const reason = lifecycleReason(await readJson(req), "Deletion retry reason is required");
  const retriedAt = new Date().toISOString();
  try {
    await storage.deleteBuffer(existing.fileReference);
    const evidence = await repo.markEvidenceStorageDeletionRetried(user.organizationId, id, {
      actorUserId: user.id,
      retriedAt,
      updates: {
        archived: true,
        removeFileReference: true,
        deletedAt: retriedAt,
        deletedByUserId: user.id,
        deletionReason: reason,
        storageDeletionStatus: "deleted",
        storageDeletionError: null
      }
    });
    await audit(user, existing.facilityId, "evidence_storage_deletion_retry_succeeded", "evidence", id, { reason, requestId: req.context.requestId });
    sendJson(res, { status: 200, body: evidence });
  } catch (error) {
    const evidence = await repo.markEvidenceStorageDeletionRetried(user.organizationId, id, {
      actorUserId: user.id,
      retriedAt,
      updates: { storageDeletionStatus: "failed", storageDeletionError: safeOperationalError(error) }
    });
    await audit(user, existing.facilityId, "evidence_storage_deletion_retry_failed", "evidence", id, { reason, requestId: req.context.requestId, errorCode: error.code || "STORAGE_DELETE_FAILED" });
    sendJson(res, { status: 502, body: evidence });
  }
}

async function downloadEvidence(res, user, id) {
  const evidence = await requireEvidence(user.organizationId, id);
  assertEvidenceDownloadAllowed(evidence, config);
  if (!evidence.fileReference) {
    const error = new Error("Evidence has no file attachment");
    error.status = 404;
    throw error;
  }
  const buffer = await storage.readBuffer(evidence.fileReference);
  await audit(user, evidence.facilityId, "evidence.downloaded", "evidence", evidence.id, {});
  sendBuffer(res, buffer, evidence.contentType || "application/octet-stream", evidence.fileName || `${safeDownloadName(evidence.title)}.bin`);
}

async function createReview(req, res, user) {
  const body = await readJson(req);
  const facility = await requireFacility(user.organizationId, body.facilityId);
  const generated = await generateAndPersistReview(user, facility);
  sendJson(res, { status: 201, body: generated });
}

async function generateAndPersistReview(user, facility) {
  const evidence = await repo.listEvidence(user.organizationId, facility.id);
  const aiAnalyses = await repo.listAiAnalyses(user.organizationId, facility.id);
  const generated = generateReview({ facility, evidence, aiAnalyses });
  await repo.saveApplicableRules(user.organizationId, facility.id, generated.rulesPack.rulesPackId, generated.applicableRules);
  const review = await repo.createReview({
    organizationId: user.organizationId,
    facilityId: facility.id,
    rulesPackId: generated.rulesPack.rulesPackId,
    country: facility.country,
    region: facility.region,
    readinessScore: generated.readinessScore,
    scoreExplanation: generated.scoreExplanation,
    summary: generated.summary,
    generatedByUserId: user.id,
    evidenceMatches: generated.evidenceMatches,
    gapRows: generated.gapRows,
    findings: generated.findings,
    actionPlan: generated.actionPlan
  });
  await audit(user, facility.id, "review.generated", "audit_readiness_review", review.id, { readinessScore: review.readinessScore });
  return { review, gapRows: generated.gapRows, actionPlan: generated.actionPlan, rulesPack: generated.rulesPack };
}

async function processEvidenceAi(res, user, evidenceId) {
  const evidence = await requireEvidence(user.organizationId, evidenceId);
  if (!canProcessScannedEvidence(evidence, config)) throw processingBlockedError(evidence.scanStatus);
  const job = await processingQueue.enqueue({ organizationId: user.organizationId, facilityId: evidence.facilityId, evidenceId, createdByUserId: user.id });
  sendJson(res, { status: 202, body: { job } });
}

async function retryEvidenceProcessing(res, user, evidenceId) {
  requireRole(user, ["admin", "reviewer"]);
  return processEvidenceAi(res, user, evidenceId);
}

async function getEvidenceAiAnalysis(res, user, evidenceId) {
  await requireEvidence(user.organizationId, evidenceId);
  const analysis = await repo.getAiAnalysis(user.organizationId, evidenceId);
  if (!analysis) {
    const error = new Error("AI analysis not found");
    error.status = 404;
    throw error;
  }
  sendJson(res, { status: 200, body: analysis });
}

async function getEvidenceAiHistory(res, user, evidenceId) {
  await requireEvidence(user.organizationId, evidenceId);
  sendJson(res, { status: 200, body: await repo.getAiAnalysisHistory(user.organizationId, evidenceId) });
}

async function listEvidenceAiAnalyses(res, user, facilityId) {
  if (!facilityId) throw validationError("facilityId query parameter is required");
  await requireFacility(user.organizationId, facilityId);
  sendJson(res, { status: 200, body: await repo.listAiAnalyses(user.organizationId, facilityId) });
}

async function listEvidenceProcessingJobs(res, user, facilityId) {
  if (!facilityId) throw validationError("facilityId query parameter is required");
  await requireFacility(user.organizationId, facilityId);
  sendJson(res, { status: 200, body: await repo.listProcessingJobs(user.organizationId, facilityId) });
}

async function listEvidenceReviewQueue(res, user, searchParams) {
  requireRole(user, ["admin", "reviewer"]);
  const items = await reviewQueueService.list({
    organizationId: user.organizationId,
    facilityId: searchParams.get("facilityId") || null,
    status: searchParams.get("status") || null,
    priority: searchParams.get("priority") || null
  });
  sendJson(res, { status: 200, body: items });
}

async function reviewEvidenceAi(req, res, user, evidenceId) {
  requireRole(user, ["admin", "reviewer"]);
  const reviewInput = parseAiReviewInput(await readJson(req));
  const reviewed = await evidenceAiService.reviewEvidence({ organizationId: user.organizationId, evidenceId, reviewer: user, reviewInput });
  if (!reviewed) {
    const error = new Error("AI analysis not found");
    error.status = 404;
    throw error;
  }
  const facility = await requireFacility(user.organizationId, reviewed.evidence.facilityId);
  const generated = await generateAndPersistReview(user, facility);
  sendJson(res, { status: 200, body: { ...reviewed, ...generated } });
}

async function listReviews(res, user, facilityId) {
  if (facilityId) await requireFacility(user.organizationId, facilityId);
  sendJson(res, { status: 200, body: await repo.listReviews(user.organizationId, facilityId) });
}

async function getReview(res, user, id) {
  const review = await requireReview(user.organizationId, id);
  sendJson(res, { status: 200, body: review });
}

async function exportPacket(req, res, user) {
  const body = await readJson(req);
  const review = await requireReview(user.organizationId, body.reviewId);
  const facility = await requireFacility(user.organizationId, review.facilityId);
  const evidence = await repo.listEvidence(user.organizationId, facility.id);
  const gapRows = await repo.getGapRows(user.organizationId, review.id);
  const actionItems = await repo.getActionItems(user.organizationId, review.id);
  const findings = await repo.getFindings(user.organizationId, review.id);
  const aiAnalyses = await repo.listAiAnalyses(user.organizationId, facility.id);
  const rulesPack = await repo.getRulesPack(review.rulesPackId) || RULES_PACKS.find((pack) => pack.rulesPackId === review.rulesPackId);
  const pdf = generateAuditPacketPdf({ facility, review, gapRows, actionItems, evidence, rulesPack, findings, aiAnalyses });
  const title = "Industrial Audit Readiness Packet";
  const packetId = repo.createId();
  const saved = await storage.saveBuffer(pdf, `audit-packet-${facility.name}.pdf`, {
    organizationId: user.organizationId,
    facilityId: facility.id,
    resourceType: "audit-packet",
    resourceId: packetId,
    contentType: "application/pdf"
  });
  let packet;
  try {
    packet = await repo.createAuditPacket({
      id: packetId,
      organizationId: user.organizationId,
      facilityId: facility.id,
      reviewId: review.id,
      title,
      fileReference: saved.fileReference,
      generatedByUserId: user.id,
      country: facility.country,
      region: facility.region,
      rulesPackId: review.rulesPackId,
      status: "generated"
    });
  } catch (error) {
    await storage.deleteBuffer(saved.fileReference);
    throw error;
  }
  await audit(user, facility.id, aiAnalyses.length ? "packet_exported_with_ai_lineage" : "packet.exported", "audit_packet", packet.id, { reviewId: review.id, aiAnalysisCount: aiAnalyses.length, requestId: req.context.requestId });
  sendJson(res, { status: 201, body: { packet, downloadUrl: `/api/audit-packets/${packet.id}/download` } });
}

async function listPackets(res, user, facilityId, includeArchived = false) {
  if (facilityId) await requireFacility(user.organizationId, facilityId);
  if (includeArchived) requireRole(user, ["admin", "reviewer"]);
  sendJson(res, { status: 200, body: await repo.listAuditPackets(user.organizationId, facilityId, { includeArchived }) });
}

async function downloadPacket(res, user, id) {
  const packet = await repo.getAuditPacket(user.organizationId, id);
  if (!packet) {
    const error = new Error("Audit packet not found");
    error.status = 404;
    throw error;
  }
  if (packet.archived || !packet.fileReference) {
    const error = new Error("Audit packet is archived");
    error.status = 410;
    throw error;
  }
  const buffer = await storage.readBuffer(packet.fileReference);
  await audit(user, packet.facilityId, "packet.downloaded", "audit_packet", packet.id, {});
  sendBuffer(res, buffer, "application/pdf", `industrial-audit-readiness-packet-${packet.id}.pdf`);
}

async function archivePacket(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const packet = await repo.getAuditPacket(user.organizationId, id);
  if (!packet) {
    const error = new Error("Audit packet not found");
    error.status = 404;
    throw error;
  }
  if (packet.legalHoldActive) throw lifecycleConflict("Audit packet is under legal hold and cannot be archived or deleted", "LEGAL_HOLD_ACTIVE");
  const deletionReason = deletionReasonFrom(req);
  const storageDeletionStatus = packet.fileReference ? "retained" : "not_applicable";
  const archived = await repo.archiveAuditPacket(user.organizationId, id, {
    deletedAt: null,
    deletedByUserId: null,
    deletionReason,
    storageDeletionStatus,
    storageDeletionError: null
  });
  await audit(user, packet.facilityId, "packet.archived", "audit_packet", id, { requestId: req.context.requestId, storageDeletionStatus, deletionReason });
  sendJson(res, { status: 200, body: archived });
}

async function setPacketLegalHold(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const packet = await requirePacket(user.organizationId, id);
  const reason = lifecycleReason(await readJson(req), "Legal hold reason is required");
  const held = await repo.setAuditPacketLegalHold(user.organizationId, id, {
    legalHoldReason: reason,
    legalHoldByUserId: user.id,
    legalHoldAt: new Date().toISOString()
  });
  await audit(user, packet.facilityId, "packet_legal_hold_set", "audit_packet", id, { reason });
  sendJson(res, { status: 200, body: held });
}

async function releasePacketLegalHold(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const packet = await requirePacket(user.organizationId, id);
  const reason = lifecycleReason(await readJson(req), "Legal hold release reason is required");
  const released = await repo.releaseAuditPacketLegalHold(user.organizationId, id, {
    legalHoldReleasedByUserId: user.id,
    legalHoldReleasedAt: new Date().toISOString(),
    legalHoldReleaseReason: reason
  });
  await audit(user, packet.facilityId, "packet_legal_hold_released", "audit_packet", id, { reason });
  sendJson(res, { status: 200, body: released });
}

async function restorePacket(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const packet = await requirePacket(user.organizationId, id);
  const reason = lifecycleReason(await readJson(req), "Restore reason is required");
  const restored = await repo.restoreAuditPacket(user.organizationId, id, {
    restoredByUserId: user.id,
    restoredAt: new Date().toISOString(),
    restoreReason: reason
  });
  await audit(user, packet.facilityId, "packet.restored", "audit_packet", id, { reason });
  sendJson(res, { status: 200, body: restored });
}

async function retryPacketStorageDeletion(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const packet = await requirePacket(user.organizationId, id);
  if (packet.legalHoldActive) throw lifecycleConflict("Audit packet is under legal hold and cannot be deleted", "LEGAL_HOLD_ACTIVE");
  if (packet.storageDeletionStatus !== "failed" || !packet.fileReference) {
    throw lifecycleConflict("Audit packet does not have a failed private-object deletion to retry", "STORAGE_DELETION_NOT_RETRYABLE");
  }
  const reason = lifecycleReason(await readJson(req), "Deletion retry reason is required");
  const retriedAt = new Date().toISOString();
  try {
    await storage.deleteBuffer(packet.fileReference);
    const retried = await repo.markAuditPacketStorageDeletionRetried(user.organizationId, id, {
      actorUserId: user.id,
      retriedAt,
      updates: {
        archived: true,
        removeFileReference: true,
        deletedAt: retriedAt,
        deletedByUserId: user.id,
        deletionReason: reason,
        storageDeletionStatus: "deleted",
        storageDeletionError: null
      }
    });
    await audit(user, packet.facilityId, "packet_storage_deletion_retry_succeeded", "audit_packet", id, { reason, requestId: req.context.requestId });
    sendJson(res, { status: 200, body: retried });
  } catch (error) {
    const retried = await repo.markAuditPacketStorageDeletionRetried(user.organizationId, id, {
      actorUserId: user.id,
      retriedAt,
      updates: { storageDeletionStatus: "failed", storageDeletionError: safeOperationalError(error) }
    });
    await audit(user, packet.facilityId, "packet_storage_deletion_retry_failed", "audit_packet", id, { reason, requestId: req.context.requestId, errorCode: error.code || "STORAGE_DELETE_FAILED" });
    sendJson(res, { status: 502, body: retried });
  }
}

async function enforceRetention(req, res, user) {
  requireRole(user, ["admin", "reviewer"]);
  const body = await readJson(req);
  const reason = lifecycleReason(body, "Retention enforcement reason is required");
  const dueAt = body.dueAt ? new Date(body.dueAt).toISOString() : new Date().toISOString();
  const candidates = await repo.listRetentionCandidates(user.organizationId, dueAt);
  const summary = {
    considered: candidates.evidence.length + candidates.auditPackets.length + candidates.skippedLegalHold.evidence + candidates.skippedLegalHold.auditPackets,
    skippedDueLegalHold: candidates.skippedLegalHold.evidence + candidates.skippedLegalHold.auditPackets,
    archived: 0,
    deletionSucceeded: 0,
    deletionFailed: 0,
    errors: []
  };
  for (const evidence of candidates.evidence) {
    try {
      if (evidence.fileReference) await storage.deleteBuffer(evidence.fileReference);
      const archived = await repo.archiveEvidence(user.organizationId, evidence.id, {
        fileReference: null,
        deletedAt: dueAt,
        deletedByUserId: user.id,
        deletionReason: reason,
        storageDeletionStatus: evidence.fileReference ? "deleted" : "not_applicable",
        storageDeletionError: null
      });
      summary.archived += 1;
      if (evidence.fileReference) summary.deletionSucceeded += 1;
      await audit(user, archived.facilityId, "evidence_retention_enforced", "evidence", evidence.id, { reason, retentionUntil: evidence.retentionUntil });
    } catch (error) {
      summary.deletionFailed += 1;
      summary.errors.push({ type: "evidence", id: evidence.id, code: error.code || "RETENTION_ENFORCEMENT_FAILED" });
      await repo.updateEvidence(user.organizationId, evidence.id, { storageDeletionStatus: "failed", storageDeletionError: safeOperationalError(error) });
      await audit(user, evidence.facilityId, "evidence_retention_deletion_failed", "evidence", evidence.id, { reason, errorCode: error.code || "STORAGE_DELETE_FAILED" });
    }
  }
  for (const packet of candidates.auditPackets) {
    try {
      if (packet.fileReference) await storage.deleteBuffer(packet.fileReference);
      const archived = await repo.archiveAuditPacket(user.organizationId, packet.id, {
        deletedAt: dueAt,
        deletedByUserId: user.id,
        deletionReason: reason,
        storageDeletionStatus: packet.fileReference ? "deleted" : "not_applicable",
        storageDeletionError: null
      });
      summary.archived += 1;
      if (packet.fileReference) summary.deletionSucceeded += 1;
      await audit(user, archived.facilityId, "packet_retention_enforced", "audit_packet", packet.id, { reason, retentionUntil: packet.retentionUntil });
    } catch (error) {
      summary.deletionFailed += 1;
      summary.errors.push({ type: "audit_packet", id: packet.id, code: error.code || "RETENTION_ENFORCEMENT_FAILED" });
      await repo.archiveAuditPacket(user.organizationId, packet.id, { archived: false, storageDeletionStatus: "failed", storageDeletionError: safeOperationalError(error) });
      await audit(user, packet.facilityId, "packet_retention_deletion_failed", "audit_packet", packet.id, { reason, errorCode: error.code || "STORAGE_DELETE_FAILED" });
    }
  }
  await repo.logAudit({ organizationId: user.organizationId, actorUserId: user.id, action: "retention_enforcement_completed", entityType: "organization", entityId: user.organizationId, metadata: { ...summary, reason, dueAt } });
  sendJson(res, { status: 200, body: summary });
}

async function readiness(res, { service, requireWorker }) {
  const checks = {};
  for (const [name, check] of [
    ["persistence", () => repo.healthCheck()],
    ["storage", () => storage.healthCheck()],
    ["scanner", () => malwareScanner.healthCheck()],
    ["queue", () => processingQueue.healthCheck({ requireWorker })]
  ]) {
    try {
      checks[name] = await withReadinessTimeout(check, name);
    } catch (error) {
      checks[name] = { ok: false, errorCode: error.code || `${name.toUpperCase()}_UNAVAILABLE` };
    }
  }
  const ok = Object.values(checks).every((check) => check.ok);
  sendJson(res, { status: ok ? 200 : 503, body: { ok, service, processRole: config.processRole, deploymentProfile: config.deploymentProfile, config: { loaded: true }, ...checks } });
}

async function withReadinessTimeout(check, name) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(check),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${name} readiness check timed out`);
          error.code = `${name.toUpperCase()}_TIMEOUT`;
          reject(error);
        }, config.readinessTimeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function requestExpertReview(req, res, user) {
  const body = await readJson(req);
  const facility = body.facilityId ? await requireFacility(user.organizationId, body.facilityId) : null;
  const review = body.reviewId ? await requireReview(user.organizationId, body.reviewId) : null;
  if (facility && review && review.facilityId !== facility.id) {
    throw validationError("reviewId must belong to the requested facility");
  }
  const item = await repo.createExpertReview({
    organizationId: user.organizationId,
    facilityId: facility?.id || review?.facilityId || null,
    reviewId: review?.id || null,
    requestedByUserId: user.id,
    status: "requested",
    expertNotes: body.expertNotes || null
  });
  await audit(user, item.facilityId || null, "expert_review.requested", "expert_review", item.id, {});
  sendJson(res, { status: 201, body: item });
}

async function updateExpertReview(req, res, user, id) {
  requireRole(user, ["admin", "reviewer"]);
  const body = await readJson(req);
  const item = await repo.updateExpertReview(user.organizationId, id, { status: body.status || "in_review", expertNotes: body.expertNotes || null });
  await audit(user, item.facilityId || null, "expert_review.updated", "expert_review", item.id, { status: item.status });
  sendJson(res, { status: 200, body: item });
}

async function listAuditLogs(res, user, facilityId) {
  if (facilityId) await requireFacility(user.organizationId, facilityId);
  sendJson(res, { status: 200, body: await repo.listAuditLogs(user.organizationId, facilityId) });
}

async function requireFacility(organizationId, id) {
  const facility = await repo.getFacility(organizationId, id);
  if (!facility) {
    const error = new Error("Facility not found");
    error.status = 404;
    throw error;
  }
  return facility;
}

async function requireEvidence(organizationId, id) {
  const evidence = await repo.getEvidence(organizationId, id);
  if (!evidence) {
    const error = new Error("Evidence not found");
    error.status = 404;
    throw error;
  }
  return evidence;
}

async function requireReview(organizationId, id) {
  const review = await repo.getReview(organizationId, id);
  if (!review) {
    const error = new Error("Review not found");
    error.status = 404;
    throw error;
  }
  return review;
}

async function requirePacket(organizationId, id) {
  const packet = await repo.getAuditPacket(organizationId, id);
  if (!packet) {
    const error = new Error("Audit packet not found");
    error.status = 404;
    throw error;
  }
  return packet;
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) {
    const error = new Error("Role is not authorized for this action");
    error.status = 403;
    throw error;
  }
}

async function audit(user, facilityId, action, entityType, entityId, metadata) {
  await repo.logAudit({ organizationId: user.organizationId, facilityId, actorUserId: user.id, action, entityType, entityId, metadata });
}

async function readJson(req, maxBytes = DEFAULT_JSON_LIMIT_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      const error = new Error("Request body is too large");
      error.status = 413;
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw validationError("Content-Type must be application/json");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw validationError("Invalid JSON request body");
  }
}

function sendJson(res, { status, body }) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendBuffer(res, buffer, contentType, fileName) {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": buffer.byteLength,
    "Content-Disposition": `attachment; filename="${fileName}"`
  });
  res.end(buffer);
}

function applySecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "DENY");
  if (config.isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function setCookie(res, name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
}

function enforceTrustedOrigin(req) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method || "GET")) return;
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) throw forbidden("Origin is not allowed");
}

function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 100);
  }
  return req.socket.remoteAddress;
}

function requestCorrelationId(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && /^[a-zA-Z0-9._:-]{8,128}$/.test(candidate) ? candidate : randomUUID();
}

function deletionReasonFrom(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  return String(url.searchParams.get("reason") || "User-requested archive").trim().slice(0, 500);
}

function lifecycleReason(body, message) {
  const reason = String(body.reason || "").trim();
  if (!reason) throw validationError(message);
  return reason.slice(0, 500);
}

function lifecycleConflict(message, code) {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  return error;
}

function safeOperationalError(error) {
  return String(error?.code || error?.name || "STORAGE_DELETE_FAILED").slice(0, 100);
}

function match(path, pattern) {
  const a = path.split("/").filter(Boolean);
  const b = pattern.split("/").filter(Boolean);
  return a.length === b.length && b.every((part, i) => part.startsWith(":") || part === a[i]);
}

function params(path) {
  const parts = path.split("/").filter(Boolean);
  const id = ["download", "gap-matrix", "score", "action-plan", "applicable-rules", "process-ai", "retry-processing", "retry-storage-deletion", "ai-analysis", "ai-analyses", "ai-review", "legal-hold", "restore"].includes(parts[parts.length - 1])
    ? parts[parts.length - 2]
    : parts[parts.length - 1];
  return { id };
}

function safeDownloadName(name) {
  return String(name || "download").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

function safeOriginalFileName(name) {
  return String(name || "evidence.bin").split(/[\\/]/).pop().replace(/[^a-z0-9._ -]+/gi, "-").slice(0, 180) || "evidence.bin";
}

function scanEvent(status) {
  return {
    scan_clean: "file_scan_clean",
    scan_suspicious: "file_scan_suspicious",
    scan_failed: "file_scan_failed",
    scan_unavailable: "file_scan_unavailable",
    scan_pending: "file_scan_pending"
  }[status] || "file_scan_failed";
}

function processingBlockedError(scanStatus) {
  const error = new Error(scanStatus === "scan_suspicious"
    ? "Suspicious files are blocked from processing"
    : "Evidence processing requires a clean scan, or an explicit development-only scan bypass");
  error.status = 409;
  error.code = "FILE_SCAN_BLOCKED";
  return error;
}

function decodeBase64(value) {
  const encoded = String(value || "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw validationError("contentBase64 must be valid base64");
  }
  return Buffer.from(encoded, "base64");
}

if (process.env.NODE_ENV !== "test") {
  if (config.runsApi) {
    server.listen(config.port, config.apiHost, () => {
      logger.info("api_listening", { host: config.apiHost, port: config.port, processRole: config.processRole, deploymentProfile: config.deploymentProfile });
    });
  }
  if (config.processRole === "worker") {
    workerHealthServer.listen(config.workerHealthPort, config.workerHealthHost, () => {
      logger.info("worker_listening", { host: config.workerHealthHost, port: config.workerHealthPort, processRole: config.processRole, deploymentProfile: config.deploymentProfile });
    });
  }
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all([
      config.runsApi ? closeServer(server) : Promise.resolve(),
      config.processRole === "worker" ? closeServer(workerHealthServer) : Promise.resolve()
    ]);
    const queueShutdown = await processingQueue.stop({ timeoutMs: config.queueShutdownTimeoutMs });
    logger.info("process_shutdown", { processRole: config.processRole, queueDrained: queueShutdown.drained, activeJobs: queueShutdown.activeJobs });
    await repo.close?.();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

server.on("close", () => void processingQueue.stop());
workerHealthServer.on("close", () => {
  if (config.processRole === "worker") void processingQueue.stop();
});

function closeServer(instance) {
  return new Promise((resolve) => {
    if (!instance.listening) return resolve();
    instance.close(resolve);
  });
}

export { server, workerHealthServer, repo, processingQueue, malwareScanner, storage, logger, config };
