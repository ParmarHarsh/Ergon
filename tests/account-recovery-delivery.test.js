import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

async function startRecoveryApi({ label, sendMail }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `ciq-recovery-${label}-`));
  process.env.NODE_ENV = "test";
  process.env.REPOSITORY_BACKEND = "file";
  process.env.FILE_REPOSITORY_PATH = path.join(dir, "db.json");
  process.env.UPLOAD_DIR = path.join(dir, "private-storage");
  process.env.STORAGE_BACKEND = "local";
  process.env.MAX_UPLOAD_MB = "5";
  process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
  process.env.AI_ENABLED = "false";
  process.env.RECOVERY_EXPOSE_TEST_TOKEN = "false";
  process.env.RECOVERY_DELIVERY_PROVIDER = "smtp";
  process.env.APP_URL = "http://localhost:5173";
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_USE_TLS = "true";
  process.env.SMTP_USERNAME = "smtp-test-user";
  process.env.SMTP_PASSWORD = "smtp-test-password";
  process.env.SMTP_FROM_EMAIL = "security@complianceiq.local";
  const sent = [];
  const transportConfigs = [];
  globalThis.__COMPLIANCEIQ_RECOVERY_DELIVERY_DEPS__ = {
    transportFactory: (transportConfig) => {
      transportConfigs.push(transportConfig);
      return {
        async sendMail(message) {
          sent.push(message);
          return sendMail ? sendMail(message) : { messageId: "fake-message-id" };
        }
      };
    }
  };

  const lines = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = function write(chunk, ...args) {
    lines.push(String(chunk));
    return originalWrite.call(this, chunk, ...args);
  };

  const { server, repo } = await import(`../apps/api/src/server.js?${label}-${Date.now()}`);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    server,
    repo,
    sent,
    transportConfigs,
    logs: lines,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      process.stderr.write = originalWrite;
      delete globalThis.__COMPLIANCEIQ_RECOVERY_DELIVERY_DEPS__;
    }
  };
}

test("SMTP recovery request preserves generic responses and sends only to stored account email", async () => {
  const api = await startRecoveryApi({ label: "smtp-success" });
  const { hashPassword, hashResetToken } = await import("../apps/api/src/security.js");
  try {
    const org = await api.repo.createOrganization({ name: "Tenant SMTP" });
    const user = await api.repo.createUser({
      organizationId: org.id,
      email: "Stored.User@Example.com",
      passwordHash: await hashPassword("OriginalPass#2026"),
      name: "Stored User",
      role: "admin",
      isActive: true
    });
    await api.repo.createUser({
      organizationId: org.id,
      email: "disabled@example.com",
      passwordHash: await hashPassword("DisabledPass#2026"),
      name: "Disabled User",
      role: "admin",
      isActive: false
    });

    const requestReset = (email) => fetch(`${api.base}/api/auth/recovery/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const existing = await requestReset("stored.user@example.com");
    const existingBody = await existing.json();
    const missing = await requestReset("missing@example.com");
    const missingBody = await missing.json();
    const disabled = await requestReset("disabled@example.com");
    const disabledBody = await disabled.json();

    assert.equal(existing.status, 202);
    assert.equal(missing.status, 202);
    assert.equal(disabled.status, 202);
    assert.deepEqual(existingBody, missingBody);
    assert.deepEqual(existingBody, disabledBody);
    assert.equal(existingBody.token, undefined);
    assert.equal(api.sent.length, 1);
    assert.equal(api.sent[0].to, user.email);
    assert.equal(api.sent[0].subject, "Reset your ComplianceIQ password");
    assert.match(api.sent[0].text, /can be used only once/);
    assert.match(api.sent[0].html, /Reset your password/);
    assert.equal(api.transportConfigs[0].auth.pass, "smtp-test-password");

    const token = new URL(api.sent[0].text.match(/https?:\/\/\S+/)[0]).hash.match(/token=([^&\s]+)/)[1];
    const decodedToken = decodeURIComponent(token);
    assert.notEqual(await api.repo.findValidPasswordResetToken(hashResetToken(decodedToken)), null);
    assert.notEqual(api.repo.data.passwordResetTokens.find((row) => row.userId === user.id && row.tokenHash === hashResetToken(decodedToken)), undefined);
    const logs = await api.repo.listAuditLogs(org.id, null);
    assert.ok(logs.some((entry) => entry.action === "password_recovery_delivery_sent"));
    assert.equal(JSON.stringify(logs).includes(decodedToken), false);
    assert.equal(JSON.stringify(logs).includes(api.sent[0].text), false);
    assert.equal(api.logs.join("").includes(decodedToken), false);
    assert.equal(api.logs.join("").includes(api.sent[0].text), false);
    assert.equal(api.logs.join("").includes("smtp-test-password"), false);
  } finally {
    await api.close();
  }
});

test("SMTP recovery delivery failure is generic publicly and invalidates the undelivered token", async () => {
  let capturedMessage = null;
  const api = await startRecoveryApi({
    label: "smtp-failure",
    sendMail: (message) => {
      capturedMessage = message;
      throw new Error(`SMTP_PASSWORD=smtp-test-password failed for ${message.text}`);
    }
  });
  const { hashPassword, hashResetToken } = await import("../apps/api/src/security.js");
  try {
    const org = await api.repo.createOrganization({ name: "Tenant SMTP Failure" });
    const user = await api.repo.createUser({
      organizationId: org.id,
      email: "failure@example.com",
      passwordHash: await hashPassword("OriginalPass#2026"),
      name: "Failure User",
      role: "admin",
      isActive: true
    });
    const response = await fetch(`${api.base}/api/auth/recovery/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email })
    });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.deepEqual(Object.keys(body).sort(), ["message", "ok"]);
    assert.equal(api.sent.length, 1);

    const encodedToken = new URL(capturedMessage.text.match(/https?:\/\/\S+/)[0]).hash.match(/token=([^&\s]+)/)[1];
    const token = decodeURIComponent(encodedToken);
    assert.equal(await api.repo.findValidPasswordResetToken(hashResetToken(token)), null);
    const tokenRow = api.repo.data.passwordResetTokens.find((row) => row.userId === user.id && row.tokenHash === hashResetToken(token));
    assert.ok(tokenRow.invalidatedAt);

    const reset = await fetch(`${api.base}/api/auth/recovery/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "UpdatedPass#2026!" })
    });
    assert.equal(reset.status, 400);

    const logs = await api.repo.listAuditLogs(org.id, null);
    assert.ok(logs.some((entry) => entry.action === "password_recovery_delivery_failed"));
    const auditJson = JSON.stringify(logs);
    assert.equal(auditJson.includes(token), false);
    assert.equal(auditJson.includes(capturedMessage.text), false);
    assert.equal(auditJson.includes("smtp-test-password"), false);
    const logText = api.logs.join("");
    assert.equal(logText.includes(token), false);
    assert.equal(logText.includes(capturedMessage.text), false);
    assert.equal(logText.includes("smtp-test-password"), false);
    assert.equal(logText.includes("smtp-test-user"), false);
  } finally {
    await api.close();
  }
});
