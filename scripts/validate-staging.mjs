const classification = (value) => process.stdout.write(`CLOUD_VALIDATION_CLASSIFICATION=${value}\n`);

if (process.env.ERGON_LIVE_CLOUD_VALIDATION !== "true") {
  classification("READY_MISSING_CLOUD_CONFIGURATION");
  process.stdout.write("No network request was made. Set ERGON_LIVE_CLOUD_VALIDATION=true and STAGING_API_ORIGIN privately to run live validation.\n");
  process.exit(0);
}

try {
  const origin = validateOrigin(process.env.STAGING_API_ORIGIN, "STAGING_API_ORIGIN");
  const live = await getJson(new URL("/health/live", origin));
  const ready = await getJson(new URL("/health/ready", origin));
  if (!live.ok || !ready.ok) throw new Error("Staging health response reported not ready");
  for (const component of ["persistence", "storage", "scanner", "queue"]) {
    if (!ready[component]?.ok) throw new Error(`Staging ${component} readiness failed`);
  }
  assertSafeHealthResponse(ready);
  classification("PASSED_RENDER_READINESS");
} catch (error) {
  classification("FAILED_RENDER_READINESS");
  process.stderr.write(`Safe staging readiness failure: ${String(error.code || error.name || "STAGING_UNAVAILABLE").slice(0, 80)}\n`);
  process.exitCode = 1;
}

function validateOrigin(value, name) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be a valid HTTPS origin`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error(`${name} must be an HTTPS origin without credentials, path, query, or fragment`);
  }
  return parsed;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Object.assign(new Error("Staging health request failed"), { code: `HTTP_${response.status}` });
  return response.json();
}

function assertSafeHealthResponse(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["password", "secret", "api-key", "authorization", "database_url", "access_key"]) {
    if (serialized.includes(forbidden)) throw new Error("Staging health response contains forbidden configuration detail");
  }
}
