export async function createPostgresPool(databaseUrl, overrides = {}) {
  const pg = await import("pg");
  const Pool = pg.default?.Pool || pg.Pool;
  const { sslRequired = false, poolMax = 10, ...poolOverrides } = overrides;
  return new Pool({
    connectionString: databaseUrl,
    ssl: sslRequired ? true : undefined,
    application_name: "ergon",
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    ...poolOverrides
  });
}
