import { spawn } from "node:child_process";

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.STAGING_DATABASE_URL || "";
if (process.env.ERGON_LIVE_CLOUD_VALIDATION !== "true" || !databaseUrl) {
  process.stdout.write("CLOUD_COMPONENT_CLASSIFICATION=READY_MISSING_CLOUD_CONFIGURATION\nSKIPPED: explicitly opt in and set TEST_DATABASE_URL or STAGING_DATABASE_URL to validate PostgreSQL.\n");
  process.exit(0);
}
if (process.env.VALIDATION_TARGET === "production" && process.env.ALLOW_PRODUCTION_VALIDATION !== "true") {
  throw new Error("Refusing production-targeted PostgreSQL validation without ALLOW_PRODUCTION_VALIDATION=true. An isolated schema is still used.");
}

process.stdout.write("Validating migrations, persistence, queue processing, tenant isolation, and cleanup in an isolated PostgreSQL schema...\n");
const code = await run(process.execPath, ["--test", "tests/postgres-repository.test.js"], {
  ...process.env,
  TEST_DATABASE_URL: databaseUrl
});
if (code !== 0) {
  process.stdout.write("CLOUD_COMPONENT_CLASSIFICATION=FAILED_SUPABASE_POSTGRES\n");
  process.exit(code);
}
process.stdout.write("CLOUD_COMPONENT_CLASSIFICATION=PASSED_SUPABASE_POSTGRES\nPASS: live PostgreSQL validation completed and the isolated schema was removed.\n");

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
