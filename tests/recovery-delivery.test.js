import test from "node:test";
import assert from "node:assert/strict";
import { buildPasswordResetMessage, createRecoveryDelivery, createSmtpTransportConfig } from "../apps/api/src/recovery-delivery.js";

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
  assert.equal(result.status, "sent");
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
    errorCode: "delivery_failed"
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
    secure: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000
  });
});
