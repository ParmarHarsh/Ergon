import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const port = Number.parseInt(process.env.WEB_PORT || "5173", 10);
const host = process.env.WEB_HOST || "127.0.0.1";
const root = path.resolve("apps/web");
const apiOrigin = process.env.WEB_API_ORIGIN || "http://localhost:4000";
const recoveryAvailable = process.env.RECOVERY_EXPOSE_TEST_TOKEN === "true" || process.env.RECOVERY_DELIVERY_PROVIDER === "smtp";
const mfaAvailable = process.env.MFA_ENABLED === "true";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  const { pathname } = new URL(req.url || "/", `http://${host}:${port}`);
  const requested = pathname === "/" ? "/index.html" : pathname;
  if (requested === "/config.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(`window.ERGON_CONFIG = ${JSON.stringify({ apiBase: apiOrigin, recoveryAvailable, mfaAvailable })};\n`);
    return;
  }
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, host, () => {
  process.stderr.write(`Ergon web listening on http://${host}:${port}\n`);
});

function applySecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${apiOrigin}; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "DENY");
}
