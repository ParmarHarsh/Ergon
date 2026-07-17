import { spawn } from "node:child_process";

if (process.env.ERGON_LIVE_CLOUD_VALIDATION !== "true" || !process.env.DATABASE_MIGRATION_URL || !process.env.POSTGRES_BACKUP_OUTPUT) {
  process.stdout.write("BACKUP_READINESS=READY_FOR_MANUAL_BACKUP_RESTORE_DRILL\nNo backup was created. Configure the direct migration URL and output path privately, then opt in explicitly.\n");
  process.exit(0);
}

const output = process.env.POSTGRES_BACKUP_OUTPUT;
if (!output.endsWith(".dump")) throw new Error("POSTGRES_BACKUP_OUTPUT must end with .dump");
const connection = new URL(process.env.DATABASE_MIGRATION_URL);
if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("DATABASE_MIGRATION_URL must be a PostgreSQL URL");
const code = await run("pg_dump", [
  "--format=custom", "--no-owner", "--no-acl", "--file", output,
  "--host", connection.hostname, "--port", connection.port || "5432",
  "--username", decodeURIComponent(connection.username), "--dbname", connection.pathname.replace(/^\//, "")
], { ...process.env, PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: "verify-full" });
if (code !== 0) process.exit(code);
process.stdout.write(`BACKUP_CREATED=${output}\nRestore only into a separate empty validation database using pg_restore; never overwrite staging during a drill.\n`);

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
