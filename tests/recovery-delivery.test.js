import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildPasswordResetMessage, buildSmtpAcceptanceMessage, classifySmtpError, createRecoveryDelivery, createSmtpTransportConfig, runSmtpAcceptance } from "../apps/api/src/recovery-delivery.js";

const smtpConfig = {
  recoveryDeliveryProvider: "smtp",
  recoveryExposeTestToken: false,
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpUseTls: true,
  smtpUsername: "smtp-user",
  smtpPassword: "smtp-secret",
  smtpFromEmail: "security@ergon.example"
};

test("SMTP recovery delivery sends safe password reset message through injected transport", async () => {
  const sent = [];
  const transports = [];
  const delivery = createRecoveryDelivery(smtpConfig, {
    transportFactory: (transportConfig) => {
      transports.push(transportConfig);
      return {
        async sendMail(message) {
          sent.push(message);
          return { messageId: "provider-message-id" };
        }
      };
    }
  });

  const token = "token with symbols +/?";
  const resetUrl = `https://app.example.com/#/reset-password?token=${encodeURIComponent(token)}`;
  const result = await delivery.sendPasswordReset({
    user: { email: "Stored.User@Example.com" },
    token,
    resetUrl,
    expiresAt: "2026-07-10T19:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, "smtp");
  assert.equal(result.status, "message_accepted");
  assert.equal(result.messageAccepted, true);
  assert.equal(result.messageId, "provider-message-id");
  assert.equal(sent.length, 1);
  assert.deepEqual(transports[0], {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: { user: "smtp-user", pass: "smtp-secret" }
  });
  assert.equal(sent[0].to, "Stored.User@Example.com");
  assert.equal(sent[0].from, "security@ergon.example");
  assert.equal(sent[0].subject, "Reset your Ergon password");
  assert.match(sent[0].text, /A password reset was requested/);
  assert.match(sent[0].html, /Reset your password/);
  assert.match(sent[0].text, /token%20with%20symbols/);
  assert.match(sent[0].html, /token%20with%20symbols/);
  assert.equal(sent[0].subject.includes(token), false);
});

test("SMTP recovery delivery returns safe structured failure", async () => {
  const secret = "smtp-secret";
  const delivery = createRecoveryDelivery(smtpConfig, {
    transportFactory: () => ({
      async sendMail() {
        throw new Error(`authentication failed with ${secret}`);
      }
    })
  });

  const result = await delivery.sendPasswordReset({
    user: { email: "stored@example.com" },
    token: "raw-reset-token",
    resetUrl: "https://app.example.com/#/reset-password?token=raw-reset-token",
    expiresAt: "2026-07-10T19:00:00.000Z"
  });

  assert.deepEqual(result, {
    ok: false,
    provider: "smtp",
    status: "delivery_failed",
    errorCode: "SMTP_PROVIDER_ERROR",
    smtpCommand: null,
    smtpResponseCode: null
  });
});

test("disabled recovery delivery is safe and sends nothing", async () => {
  const delivery = createRecoveryDelivery({ recoveryDeliveryProvider: "disabled", recoveryExposeTestToken: false });
  const result = await delivery.sendPasswordReset({
    user: { email: "stored@example.com" },
    token: "raw-reset-token",
    resetUrl: "https://app.example.com/#/reset-password?token=raw-reset-token",
    expiresAt: "2026-07-10T19:00:00.000Z"
  });
  assert.equal(result.ok, false);
  assert.equal(result.provider, "disabled");
  assert.equal(result.errorCode, "delivery_disabled");
});

test("SMTP reset message escapes HTML dynamic values", () => {
  const message = buildPasswordResetMessage({
    user: { email: "stored@example.com" },
    resetUrl: "https://app.example.com/#/reset-password?token=<script>",
    expiresAt: "2026-07-10T19:00:00.000Z",
    from: "security@ergon.example"
  });
  assert.match(message.html, /&lt;script&gt;/);
  assert.equal(message.html.includes("<script>"), false);
});

test("SMTP transport config omits auth when credentials are absent", () => {
  assert.deepEqual(createSmtpTransportConfig({
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpUseTls: true,
    smtpUsername: "",
    smtpPassword: ""
  }), {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000
  });
});

test("private SMTP acceptance verifies before sending one harmless synthetic message", async () => {
  const events = [];
  const messages = [];
  const result = await runSmtpAcceptance({
    config: smtpConfig,
    acceptanceEmail: "acceptance@example.com",
    dependencies: {
      transportFactory: () => ({
        async verify() { events.push("verify"); },
        async sendMail(message) { events.push("send"); messages.push(message); return { accepted: [message.to] }; }
      })
    }
  });
  assert.deepEqual(events, ["verify", "send"]);
  assert.equal(result.connectionAuth, "PASSED_SMTP_CONNECTION_AND_AUTH");
  assert.equal(result.messageAccepted, "PASSED_SMTP_MESSAGE_ACCEPTED");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, "ERGON SMTP acceptance test");
  assert.match(messages[0].text, /contains no reset token/);
  assert.doesNotMatch(JSON.stringify(messages[0]), /password reset|reset-password|token=/i);
});

test("private SMTP acceptance safely classifies verify and send failures", async () => {
  for (const [error, expectedCode, expectedLive] of [
    [Object.assign(new Error("secret authentication detail"), { code: "EAUTH", command: "AUTH PLAIN", responseCode: 535 }), "SMTP_AUTH_FAILED", "FAILED_SMTP_AUTH"],
    [Object.assign(new Error("certificate detail"), { code: "CERT_HAS_EXPIRED", command: "STARTTLS" }), "SMTP_TLS_FAILED", "FAILED_SMTP_TLS"],
    [Object.assign(new Error("timeout detail"), { code: "ETIMEDOUT", command: "CONN" }), "SMTP_TIMEOUT", "FAILED_SMTP_TIMEOUT"],
    [Object.assign(new Error("host detail"), { code: "ECONNREFUSED", command: "CONN" }), "SMTP_CONNECTION_FAILED", "FAILED_SMTP_CONNECTION"]
  ]) {
    const result = await runSmtpAcceptance({
      config: smtpConfig,
      acceptanceEmail: "acceptance@example.com",
      dependencies: { transportFactory: () => ({ async verify() { throw error; }, async sendMail() { assert.fail("sendMail must not run after failed verify"); } }) }
    });
    assert.equal(result.connectionAuth, expectedLive);
    assert.equal(result.messageAccepted, expectedLive);
    assert.equal(result.diagnostic.errorCode, expectedCode);
    assert.equal(JSON.stringify(result).includes("secret authentication detail"), false);
    assert.equal(JSON.stringify(result).includes("smtp-secret"), false);
  }

  for (const [command, expectedCode, expectedLive] of [
    ["MAIL FROM", "SMTP_SENDER_REJECTED", "FAILED_SMTP_SENDER"],
    ["RCPT TO", "SMTP_RECIPIENT_REJECTED", "FAILED_SMTP_RECIPIENT"],
    ["DATA", "SMTP_MESSAGE_REJECTED", "FAILED_SMTP_PROVIDER"],
    ["UNKNOWN", "SMTP_PROVIDER_ERROR", "FAILED_SMTP_PROVIDER"]
  ]) {
    const result = await runSmtpAcceptance({
      config: smtpConfig,
      acceptanceEmail: "acceptance@example.com",
      dependencies: { transportFactory: () => ({ async verify() {}, async sendMail() { throw Object.assign(new Error("private response"), { code: "EENVELOPE", command, responseCode: 550 }); } }) }
    });
    assert.equal(result.connectionAuth, "PASSED_SMTP_CONNECTION_AND_AUTH");
    assert.equal(result.messageAccepted, expectedLive);
    assert.equal(result.diagnostic.errorCode, expectedCode);
    assert.equal(JSON.stringify(result).includes("private response"), false);
  }
});

test("SMTP diagnostics retain only safe code, command bucket, and numeric response", () => {
  const diagnosticResult = classifySmtpError(Object.assign(new Error("SMTP_PASSWORD=smtp-secret recipient@example.com"), {
    code: "EAUTH",
    command: "AUTH PLAIN",
    responseCode: 535,
    response: "private provider response"
  }));
  assert.deepEqual(diagnosticResult, { errorCode: "SMTP_AUTH_FAILED", smtpCommand: "AUTH", smtpResponseCode: 535 });
  assert.equal(JSON.stringify(diagnosticResult).includes("smtp-secret"), false);
  assert.equal(JSON.stringify(diagnosticResult).includes("recipient@example.com"), false);
  assert.deepEqual(buildSmtpAcceptanceMessage({ from: "security@example.com", to: "acceptance@example.com" }).subject, "ERGON SMTP acceptance test");
});

test("private SMTP command refuses missing configuration without connecting", () => {
  const run = spawnSync(process.execPath, ["scripts/qa-smtp-live.mjs"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ERGON_LIVE_SMTP_ACCEPTANCE: "true",
      RECOVERY_DELIVERY_PROVIDER: "smtp"
    }
  });
  assert.equal(run.status, 1);
  const result = JSON.parse(run.stderr.trim());
  assert.equal(result.connectionAuth, "READY_MISSING_SMTP_CONFIGURATION");
  assert.equal(result.messageAccepted, "READY_MISSING_SMTP_CONFIGURATION");
});
