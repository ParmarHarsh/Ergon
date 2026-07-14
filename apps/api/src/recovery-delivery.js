import nodemailer from "nodemailer";

const RESET_SUBJECT = "Reset your Ergon password";
const SMTP_TIMEOUT_MS = 10_000;

export function createRecoveryDelivery(config, dependencies = {}) {
  const testDeliveriesByEmail = new Map();
  const exposeTestToken = Boolean(config.recoveryExposeTestToken);
  const provider = exposeTestToken ? "local-test-token-store" : config.recoveryDeliveryProvider || "disabled";
  const transportFactory = dependencies.transportFactory || ((transportConfig) => nodemailer.createTransport(transportConfig));
  const transport = provider === "smtp" ? transportFactory(createSmtpTransportConfig(config)) : null;

  return {
    kind: provider,

    async sendPasswordReset({ user, token, resetUrl, expiresAt }) {
      if (exposeTestToken) {
        testDeliveriesByEmail.set(user.email.toLowerCase(), {
          email: user.email.toLowerCase(),
          token,
          resetUrl,
          expiresAt,
          capturedAt: new Date().toISOString()
        });
        return { ok: true, provider, status: "stored_for_test", delivered: true };
      }
      if (provider === "disabled") {
        return { ok: false, provider, status: "delivery_disabled", errorCode: "delivery_disabled" };
      }
      try {
        const message = buildPasswordResetMessage({ user, resetUrl, expiresAt, from: config.smtpFromEmail });
        const result = await transport.sendMail(message);
        return {
          ok: true,
          provider,
          status: "sent",
          delivered: true,
          messageId: typeof result?.messageId === "string" ? result.messageId.slice(0, 200) : undefined
        };
      } catch {
        return { ok: false, provider, status: "delivery_failed", errorCode: "delivery_failed" };
      }
    },

    getTestDelivery(email) {
      if (!exposeTestToken) return null;
      return testDeliveriesByEmail.get(String(email || "").trim().toLowerCase()) || null;
    }
  };
}

export function createSmtpTransportConfig(config) {
  const implicitTls = Boolean(config.smtpUseTls && config.smtpPort === 465);
  const transport = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: implicitTls,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS
  };
  if (config.smtpUseTls && !implicitTls) transport.requireTLS = true;
  if (config.smtpUsername && config.smtpPassword) {
    transport.auth = {
      user: config.smtpUsername,
      pass: config.smtpPassword
    };
  }
  return transport;
}

export function buildPasswordResetMessage({ user, resetUrl, expiresAt, from }) {
  const escapedUrl = escapeHtml(resetUrl);
  const expiryText = new Date(expiresAt).toISOString();
  return {
    from,
    to: user.email,
    subject: RESET_SUBJECT,
    text: [
      "A password reset was requested for your Ergon account.",
      "",
      `Reset your password using this link: ${resetUrl}`,
      "",
      `This link expires at ${expiryText} and can be used only once.`,
      "After a successful reset, existing sessions for your account will be revoked.",
      "",
      "If you did not request this reset, ignore this message.",
      "Ergon support will never ask for your password or raw reset token."
    ].join("\n"),
    html: [
      "<p>A password reset was requested for your Ergon account.</p>",
      `<p><a href="${escapedUrl}">Reset your password</a></p>`,
      `<p>This link expires at ${escapeHtml(expiryText)} and can be used only once.</p>`,
      "<p>After a successful reset, existing sessions for your account will be revoked.</p>",
      "<p>If you did not request this reset, ignore this message.</p>",
      "<p>Ergon support will never ask for your password or raw reset token.</p>"
    ].join("")
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
