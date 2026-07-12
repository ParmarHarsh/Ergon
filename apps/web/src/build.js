import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const apiBase = process.env.WEB_API_ORIGIN || "http://localhost:4000";
const recoveryAvailable = process.env.RECOVERY_EXPOSE_TEST_TOKEN === "true" || process.env.RECOVERY_DELIVERY_PROVIDER === "smtp";
const mfaAvailable = process.env.MFA_ENABLED === "true";
const isProductionBuild = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

if (isProductionBuild) {
  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    throw new Error("WEB_API_ORIGIN must be an absolute HTTPS URL for production frontend builds.");
  }
  if (parsed.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("WEB_API_ORIGIN must be a deployed HTTPS API origin for production frontend builds; localhost is only for local development.");
  }
}

const SERVER_ONLY = new Set(["build.js", "static-server.js"]);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, "index.html"), path.join(out, "index.html"));
await cp(path.join(root, "src"), path.join(out, "src"), {
  recursive: true,
  filter: (source) => !SERVER_ONLY.has(path.basename(source))
});
await writeFile(path.join(out, "config.js"), `window.ERGON_CONFIG = ${JSON.stringify({ apiBase, recoveryAvailable, mfaAvailable })};\n`);
process.stderr.write(`Built static web app to apps/web/dist with API ${apiBase}\n`);
