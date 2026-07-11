import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";

test("TOTP MFA enrollment, login challenge, replay protection, recovery codes, and reset interaction", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-mfa-api-"));
  process.env.NODE_ENV = "test";
  process.env.REPOSITORY_BACKEND = "file";
  process.env.FILE_REPOSITORY_PATH = path.join(dir, "db.json");
  process.env.UPLOAD_DIR = path.join(dir, "private-storage");
  process.env.STORAGE_BACKEND = "local";
  process.env.MAX_UPLOAD_MB = "5";
  process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
  process.env.AI_ENABLED = "false";
  process.env.MFA_ENABLED = "true";
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.MFA_TOTP_ISSUER = "ComplianceIQ Test";
  process.env.RECOVERY_EXPOSE_TEST_TOKEN = "true";

  const { server, repo } = await import("../apps/api/src/server.js");
  const { hashPassword } = await import("../apps/api/src/security.js");
  const { generateTotpCode } = await import("../apps/api/src/mfa.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, cookie = "") => fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });

  try {
    const org = await repo.createOrganization({ name: "Tenant MFA API" });
    const user = await repo.createUser({
      organizationId: org.id,
      email: "mfa-login@example.com",
      passwordHash: await hashPassword("OriginalPass#2026"),
      name: "MFA User",
      role: "admin",
      isActive: true
    });

    const firstLogin = await post("/api/auth/login", { email: user.email, password: "OriginalPass#2026" });
    assert.equal(firstLogin.status, 200);
    const cookie = firstLogin.headers.get("set-cookie").split(";")[0];

    const start = await post("/api/auth/mfa/enrollment/start", { currentPassword: "OriginalPass#2026" }, cookie);
    assert.equal(start.status, 200);
    const enrollment = await start.json();
    assert.ok(enrollment.manualSecret);
    assert.match(enrollment.otpauthUri, /^otpauth:\/\/totp\//);
    assert.equal(JSON.stringify(repo.data).includes(enrollment.manualSecret), false);
    assert.equal(JSON.stringify(repo.data).includes(enrollment.otpauthUri), false);

    const confirmCode = await generateTotpCode(enrollment.manualSecret);
    const confirm = await post("/api/auth/mfa/enrollment/confirm", { code: confirmCode }, cookie);
    assert.equal(confirm.status, 200);
    const confirmBody = await confirm.json();
    assert.equal(confirmBody.recoveryCodes.length, 10);
    assert.equal(JSON.stringify(repo.data).includes(confirmBody.recoveryCodes[0]), false);

    const mfaLogin = await post("/api/auth/login", { email: user.email, password: "OriginalPass#2026" });
    assert.equal(mfaLogin.status, 200);
    assert.equal(mfaLogin.headers.get("set-cookie"), null);
    const challenge = await mfaLogin.json();
    assert.equal(challenge.mfaRequired, true);
    assert.ok(challenge.challengeToken);
    assert.equal(JSON.stringify(repo.data).includes(challenge.challengeToken), false);
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);

    const nextCode = await generateTotpCode(enrollment.manualSecret, Math.floor(Date.now() / 1000) + 30);
    const verified = await post("/api/auth/mfa/login/verify", { challengeToken: challenge.challengeToken, code: nextCode });
    assert.equal(verified.status, 200);
    const mfaCookie = verified.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: mfaCookie } })).status, 200);
    assert.equal((await post("/api/auth/mfa/login/verify", { challengeToken: challenge.challengeToken, code: nextCode })).status, 401);

    const replayLogin = await post("/api/auth/login", { email: user.email, password: "OriginalPass#2026" });
    const replayChallenge = await replayLogin.json();
    assert.equal((await post("/api/auth/mfa/login/verify", { challengeToken: replayChallenge.challengeToken, code: nextCode })).status, 401);

    const bruteLogin = await post("/api/auth/login", { email: user.email, password: "OriginalPass#2026" });
    const bruteChallenge = await bruteLogin.json();
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await post("/api/auth/mfa/login/verify", { challengeToken: bruteChallenge.challengeToken, code: "000000" })).status, 401);
    }
    assert.equal((await post("/api/auth/mfa/login/verify", { challengeToken: bruteChallenge.challengeToken, code: confirmBody.recoveryCodes[0] })).status, 401);

    const recoveryLogin = await post("/api/auth/login", { email: user.email, password: "OriginalPass#2026" });
    const recoveryChallenge = await recoveryLogin.json();
    assert.equal((await post("/api/auth/mfa/login/verify", { challengeToken: recoveryChallenge.challengeToken, code: confirmBody.recoveryCodes[0] })).status, 200);
    const recoveryReuseLogin = await post("/api/auth/login", { email: user.email, password: "OriginalPass#2026" });
    const recoveryReuseChallenge = await recoveryReuseLogin.json();
    assert.equal((await post("/api/auth/mfa/login/verify", { challengeToken: recoveryReuseChallenge.challengeToken, code: confirmBody.recoveryCodes[0] })).status, 401);

    await post("/api/auth/recovery/request", { email: user.email });
    const tokenResponse = await fetch(`${base}/api/auth/recovery/test-token?email=${encodeURIComponent(user.email)}`);
    const { token } = await tokenResponse.json();
    assert.equal((await post("/api/auth/recovery/reset", { token, password: "UpdatedPass#2026!" })).status, 200);
    const resetLogin = await post("/api/auth/login", { email: user.email, password: "UpdatedPass#2026!" });
    const resetLoginBody = await resetLogin.json();
    assert.equal(resetLoginBody.mfaRequired, true);
    assert.equal((await repo.getUserMfaSettings(org.id, user.id)).enabled, true);

    const logs = await repo.listAuditLogs(org.id, null);
    assert.ok(logs.some((entry) => entry.action === "mfa_enabled"));
    assert.ok(logs.some((entry) => entry.action === "mfa_login_succeeded"));
    assert.ok(logs.some((entry) => entry.action === "mfa_recovery_code_used"));
    const auditJson = JSON.stringify(logs);
    assert.equal(auditJson.includes(enrollment.manualSecret), false);
    assert.equal(auditJson.includes(challenge.challengeToken), false);
    assert.equal(auditJson.includes(confirmBody.recoveryCodes[0]), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
