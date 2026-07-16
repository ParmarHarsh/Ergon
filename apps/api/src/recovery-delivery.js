import nodemailer from "nodemailer";

const RESET_SUBJECT = "Reset your Ergon password";
const SMTP_ACCEPTANCE_SUBJECT = "ERGON SMTP acceptance test";
const SMTP_TIMEOUT_MS = 10_000;

export function createRecoveryDelivery(config, dependencies = {}) {
  const testDeliveriesByEmail = new Map();
  const exposeTestToken = Boolean(config.recoveryExposeTestToken);
  const provider = exposeTestToken ? "local-test-token-store" : config.recoveryDeliveryProvider || "disabled";
  const transport = provider === "smtp" ? createSmtpTransport(config, dependencies) : null;

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
        return { ok: true, provider, status: "stored_for_test", messageAccepted: true };
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
          status: "message_accepted",
          messageAccepted: true,
          messageId: typeof result?.messageId === "string" ? result.messageId.slice(0, 200) : undefined
        };
      } catch (error) {
        return { ok: false, provider, status: "delivery_failed", ...classifySmtpError(error) };
      }
    },

    getTestDelivery(email) {
      if (!exposeTestToken) return null;
      return testDeliveriesByEmail.get(String(email || "").trim().toLowerCase()) || null;
    }
  };
}

export function createSmtpTransport(config, dependencies = {}) {
  const transportFactory = dependencies.transportFactory || ((transportConfig) => nodemailer.createTransport(transportConfig));
  return transportFactory(createSmtpTransportConfig(config));
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

export function buildSmtpAcceptanceMessage({ from, to }) {
  return {
    from,
    to,
    subject: SMTP_ACCEPTANCE_SUBJECT,
    text: "This synthetic message verifies ERGON's configured recovery-email transport.\nIt contains no reset token and requires no action.",
    html: "<p>This synthetic message verifies ERGON's configured recovery-email transport.</p><p>It contains no reset token and requires no action.</p>"
  };
}

export async function runSmtpAcceptance({ config, acceptanceEmail, dependencies = {} }) {
  if (config.recoveryDeliveryProvider !== "smtp" || !config.smtpHost || !config.smtpFromEmail || !acceptanceEmail) {
    return {
      connectionAuth: "READY_MISSING_SMTP_CONFIGURATION",
      messageAccepted: "READY_MISSING_SMTP_CONFIGURATION",
      diagnostic: { errorCode: "SMTP_CONFIG_ERROR", smtpCommand: null, smtpResponseCode: null }
    };
  }
  const transport = createSmtpTransport(config, dependencies);
  try {
    if (typeof transport.verify === "function") await transport.verify();
  } catch (error) {
    const diagnostic = classifySmtpError(error);
    return { connectionAuth: smtpLiveClassification(diagnostic.errorCode), messageAccepted: smtpLiveClassification(diagnostic.errorCode), diagnostic };
  }
  try {
    await transport.sendMail(buildSmtpAcceptanceMessage({ from: config.smtpFromEmail, to: acceptanceEmail }));
    return {
      connectionAuth: "PASSED_SMTP_CONNECTION_AND_AUTH",
      messageAccepted: "PASSED_SMTP_MESSAGE_ACCEPTED",
      diagnostic: { errorCode: null, smtpCommand: null, smtpResponseCode: null }
    };
  } catch (error) {
    const diagnostic = classifySmtpError(error);
    return { connectionAuth: "PASSED_SMTP_CONNECTION_AND_AUTH", messageAccepted: smtpLiveClassification(diagnostic.errorCode), diagnostic };
  }
}

export function classifySmtpError(error) {
  const smtpCommand = safeSmtpCommand(error?.command);
  const smtpResponseCode = Number.isInteger(error?.responseCode) ? error.responseCode : null;
  const code = String(error?.code || "").toUpperCase();
  let errorCode = "SMTP_PROVIDER_ERROR";
  if (code === "SMTP_CONFIG_ERROR") errorCode = "SMTP_CONFIG_ERROR";
  else if (code === "EAUTH" || [530, 534, 535].includes(smtpResponseCode) || smtpCommand === "AUTH") errorCode = "SMTP_AUTH_FAILED";
  else if (code === "ETIMEDOUT" || code === "ETIMEOUT") errorCode = "SMTP_TIMEOUT";
  else if (isTlsErrorCode(code)) errorCode = "SMTP_TLS_FAILED";
  else if (smtpCommand === "MAIL_FROM") errorCode = "SMTP_SENDER_REJECTED";
  else if (smtpCommand === "RCPT_TO") errorCode = "SMTP_RECIPIENT_REJECTED";
  else if (smtpCommand === "DATA") errorCode = "SMTP_MESSAGE_REJECTED";
  else if (["ECONNECTION", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EHOSTUNREACH", "ESOCKET"].includes(code)) errorCode = "SMTP_CONNECTION_FAILED";
  return { errorCode, smtpCommand, smtpResponseCode };
}

function smtpLiveClassification(errorCode) {
  const classifications = {
    SMTP_CONFIG_ERROR: "READY_MISSING_SMTP_CONFIGURATION",
    SMTP_AUTH_FAILED: "FAILED_SMTP_AUTH",
    SMTP_TLS_FAILED: "FAILED_SMTP_TLS",
    SMTP_CONNECTION_FAILED: "FAILED_SMTP_CONNECTION",
    SMTP_TIMEOUT: "FAILED_SMTP_TIMEOUT",
    SMTP_SENDER_REJECTED: "FAILED_SMTP_SENDER",
    SMTP_RECIPIENT_REJECTED: "FAILED_SMTP_RECIPIENT",
    SMTP_MESSAGE_REJECTED: "FAILED_SMTP_PROVIDER",
    SMTP_PROVIDER_ERROR: "FAILED_SMTP_PROVIDER"
  };
  return classifications[errorCode] || "FAILED_SMTP_PROVIDER";
}

function safeSmtpCommand(value) {
  const command = String(value || "").trim().toUpperCase();
  if (command === "AUTH" || command.startsWith("AUTH ")) return "AUTH";
  if (command === "MAIL" || command.startsWith("MAIL FROM")) return "MAIL_FROM";
  if (command === "RCPT" || command.startsWith("RCPT TO")) return "RCPT_TO";
  if (command === "DATA") return "DATA";
  if (["CONN", "CONNECT", "EHLO", "HELO", "STARTTLS"].includes(command)) return command;
  return null;
}

function isTlsErrorCode(code) {
  return [
    "ETLS", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID",
    "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
  ].includes(code);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
