import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readConfig } from "../packages/config/src/index.js";

test("recovery test token exposure is rejected for secure deployments", () => {
  const local = readConfig({ NODE_ENV: "development", REPOSITORY_BACKEND: "file", RECOVERY_EXPOSE_TEST_TOKEN: "true" });
  assert.equal(local.recoveryExposeTestToken, true);
  assert.throws(() => readConfig({
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
    MAX_UPLOAD_MB: "25",
    RECOVERY_EXPOSE_TEST_TOKEN: "true"
  }), /RECOVERY_EXPOSE_TEST_TOKEN/);
});

test("password recovery is non-enumerating, single-use, and revokes active sessions", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-recovery-"));
  process.env.NODE_ENV = "test";
  process.env.REPOSITORY_BACKEND = "file";
  process.env.FILE_REPOSITORY_PATH = path.join(dir, "db.json");
  process.env.UPLOAD_DIR = path.join(dir, "private-storage");
  process.env.STORAGE_BACKEND = "local";
  process.env.MAX_UPLOAD_MB = "5";
  process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
  process.env.AI_ENABLED = "false";
  process.env.RECOVERY_EXPOSE_TEST_TOKEN = "true";

  const { server, repo } = await import("../apps/api/src/server.js");
  const { hashPassword, hashResetToken } = await import("../apps/api/src/security.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const org = await repo.createOrganization({ name: "Tenant Recovery" });
    const user = await repo.createUser({
      organizationId: org.id,
      email: "recover@example.com",
      passwordHash: await hashPassword("OriginalPass#2026"),
      name: "Recover User",
      role: "admin",
      isActive: true
    });
    await repo.createUser({
      organizationId: org.id,
      email: "disabled@example.com",
      passwordHash: await hashPassword("DisabledPass#2026"),
      name: "Disabled User",
      role: "admin",
      isActive: false
    });

    const requestReset = (email) => fetch(`${base}/api/auth/recovery/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const readTestToken = async () => {
      const response = await fetch(`${base}/api/auth/recovery/test-token?email=${encodeURIComponent(user.email)}`);
      assert.equal(response.status, 200);
      return response.json();
    };

    const existing = await requestReset("RECOVER@example.com");
    const existingBody = await existing.json();
    const missing = await requestReset("missing@example.com");
    const missingBody = await missing.json();
    const disabled = await requestReset("disabled@example.com");
    const disabledBody = await disabled.json();
    assert.equal(existing.status, 202);
    assert.equal(missing.status, 202);
    assert.equal(disabled.status, 202);
    assert.deepEqual(Object.keys(existingBody).sort(), Object.keys(missingBody).sort());
    assert.deepEqual(Object.keys(existingBody).sort(), Object.keys(disabledBody).sort());
    assert.equal(existingBody.message, missingBody.message);
    assert.equal(existingBody.message, disabledBody.message);
    assert.equal(existingBody.token, undefined);

    const firstDelivery = await readTestToken();
    assert.ok(firstDelivery.token.length >= 40);
    assert.match(firstDelivery.resetUrl, /#\/reset-password\?token=/);

    await requestReset(user.email);
    const secondDelivery = await readTestToken();
    assert.notEqual(secondDelivery.token, firstDelivery.token);

    const tokenRows = repo.data.passwordResetTokens.filter((row) => row.userId === user.id);
    assert.equal(tokenRows.length, 2);
    assert.equal(tokenRows.some((row) => row.invalidatedAt), true);
    assert.equal(tokenRows.some((row) => row.tokenHash === firstDelivery.token), false);
    assert.equal(tokenRows.some((row) => row.tokenHash === hashResetToken(secondDelivery.token)), true);
    const persisted = await readFile(process.env.FILE_REPOSITORY_PATH, "utf8");
    assert.equal(persisted.includes(firstDelivery.token), false);
    assert.equal(persisted.includes(secondDelivery.token), false);
    assert.equal(persisted.includes(hashResetToken(secondDelivery.token)), true);

    const invalidReset = await fetch(`${base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token", password: "UpdatedPass#2026!" })
    });
    assert.equal(invalidReset.status, 400);

    repo.data.passwordResetTokens.push({
      id: "expired-reset-token",
      organizationId: org.id,
      userId: user.id,
      tokenHash: hashResetToken("expired-token"),
      requestedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      usedAt: null,
      invalidatedAt: null,
      createdAt: new Date(Date.now() - 120_000).toISOString()
    });
    const expiredReset = await fetch(`${base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "expired-token", password: "UpdatedPass#2026!" })
    });
    assert.equal(expiredReset.status, 400);

    const staleReset = await fetch(`${base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: firstDelivery.token, password: "UpdatedPass#2026!" })
    });
    assert.equal(staleReset.status, 400);

    const weakReset = await fetch(`${base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secondDelivery.token, password: "too-short" })
    });
    assert.equal(weakReset.status, 400);

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "OriginalPass#2026" })
    });
    assert.equal(login.status, 200);
    const oldCookie = login.headers.get("set-cookie").split(";")[0];

    const reset = await fetch(`${base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secondDelivery.token, password: "UpdatedPass#2026!" })
    });
    assert.equal(reset.status, 200);
    assert.equal((await reset.json()).ok, true);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: oldCookie } })).status, 401);

    const reused = await fetch(`${base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secondDelivery.token, password: "AnotherPass#2026!" })
    });
    assert.equal(reused.status, 400);

    assert.equal((await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "OriginalPass#2026" })
    })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "UpdatedPass#2026!" })
    })).status, 200);

    const logs = await repo.listAuditLogs(org.id, null);
    assert.ok(logs.some((entry) => entry.action === "password_reset.requested"));
    assert.ok(logs.some((entry) => entry.action === "password_reset.completed"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
