import { readConfig } from "../packages/config/src/index.js";
import { runSmtpAcceptance } from "../apps/api/src/recovery-delivery.js";

if (process.env.ERGON_LIVE_SMTP_ACCEPTANCE !== "true") {
  fail("Refusing a live SMTP connection. Set ERGON_LIVE_SMTP_ACCEPTANCE=true to authorize one private verification and one synthetic test message.");
}

const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM_EMAIL", "SMTP_ACCEPTANCE_EMAIL"];
if (process.env.SMTP_USERNAME || process.env.SMTP_PASSWORD) required.push("SMTP_USERNAME", "SMTP_PASSWORD");
const missing = [...new Set(required)].filter((name) => !process.env[name]);
if (process.env.RECOVERY_DELIVERY_PROVIDER !== "smtp" || missing.length > 0) {
  printAndExit({
    connectionAuth: "READY_MISSING_SMTP_CONFIGURATION",
    messageAccepted: "READY_MISSING_SMTP_CONFIGURATION",
    missing: process.env.RECOVERY_DELIVERY_PROVIDER === "smtp" ? missing : ["RECOVERY_DELIVERY_PROVIDER=smtp", ...missing]
  });
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SMTP_ACCEPTANCE_EMAIL)) {
  printAndExit({
    connectionAuth: "READY_MISSING_SMTP_CONFIGURATION",
    messageAccepted: "READY_MISSING_SMTP_CONFIGURATION",
    missing: ["valid SMTP_ACCEPTANCE_EMAIL"]
  });
}

let config;
try {
  config = readConfig({ ...process.env, APP_URL: process.env.APP_URL || "http://localhost:5173" });
} catch {
  printAndExit({
    connectionAuth: "READY_MISSING_SMTP_CONFIGURATION",
    messageAccepted: "READY_MISSING_SMTP_CONFIGURATION",
    diagnostic: { errorCode: "SMTP_CONFIG_ERROR", smtpCommand: null, smtpResponseCode: null }
  });
}

const result = await runSmtpAcceptance({ config, acceptanceEmail: process.env.SMTP_ACCEPTANCE_EMAIL });
process.stdout.write(`${JSON.stringify({
  syntheticOnly: true,
  connectionAuth: result.connectionAuth,
  messageAccepted: result.messageAccepted,
  inboxDelivery: "USER_CONFIRMATION_REQUIRED",
  diagnostic: result.diagnostic
}, null, 2)}\n`);
if (!result.connectionAuth.startsWith("PASSED_") || result.messageAccepted !== "PASSED_SMTP_MESSAGE_ACCEPTED") process.exitCode = 1;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printAndExit(result) {
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exit(1);
}
