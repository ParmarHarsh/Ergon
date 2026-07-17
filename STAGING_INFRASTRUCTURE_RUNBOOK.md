# Ergon Phase 27 Staging Infrastructure Runbook

This runbook describes the Phase 27 cloud-staging foundation for Ergon. It prepares the application for Supabase PostgreSQL, Supabase Storage through the existing S3-compatible adapter, Render API/worker hosting, and Vercel static web hosting.

Phase 27 does not create accounts, provision resources, deploy public infrastructure, buy services, add Supabase Auth, add signup, change migrations, or run live cloud validation without explicit private configuration.

Pilot status remains `NO_GO` until staging resources, live validators, manual workflow acceptance, and backup/restore drills pass.

## Target topology

```text
Vercel static SPA
  -> Render API service
      -> Supabase PostgreSQL
      -> Supabase Storage private bucket via S3-compatible API
      -> SMTP provider when configured
  -> Render worker service
      -> same PostgreSQL, storage, scanner, AI, queue, and SMTP config as applicable
```

The frontend never talks directly to PostgreSQL, Supabase Storage, Azure/OpenAI, SMTP, or Supabase service credentials. All evidence operations remain server-mediated through ERGON authorization.

## Provider decisions

| Area | Phase 27 decision | Notes |
|---|---|---|
| Database | Supabase managed PostgreSQL | Use ERGON migrations `0001` through `0009`; no Supabase Auth. |
| Runtime DB connection | Supabase session pooler URL in `DATABASE_URL` | Keep pool small with `DATABASE_POOL_MAX`. |
| Migration DB connection | Supabase direct PostgreSQL URL in `DATABASE_MIGRATION_URL` | Use for `npm run db:migrate`, `pg_dump`, and restore drills. |
| Object storage | Supabase Storage S3-compatible endpoint | Private bucket only; use `S3_FORCE_PATH_STYLE=true`. |
| API host | Render web service | Runs `npm run start:api`; exposes `/health/live` and `/health/ready`. |
| Worker host | Render background worker | Runs `npm run start:worker`; no public incoming traffic required. |
| Web host | Vercel static SPA | Uses `WEB_API_ORIGIN`; no secrets. |
| Auth | Existing ERGON auth | Supabase Auth intentionally deferred. |

## Canonical environment groups

Use `.env.example` as the complete contract. Copy it locally only when needed:

```bash
cp .env.example .env
```

Never commit `.env`. Platform secrets should be configured in Render/Vercel dashboards, not pasted into docs or chat.

| Group | Variables |
|---|---|
| Core runtime | `NODE_ENV`, `DEPLOYMENT_PROFILE`, `PROCESS_ROLE`, `LOG_LEVEL`, `PORT`, `API_HOST`, `WORKER_HEALTH_PORT`, `WORKER_HEALTH_HOST`, `APP_URL`, `ALLOWED_ORIGINS`, `TRUST_PROXY`, `SESSION_COOKIE_SAME_SITE`, `READINESS_TIMEOUT_MS` |
| Static web | `WEB_API_ORIGIN`, `WEB_PORT`, `WEB_HOST` |
| Auth/security | `SESSION_SECRET`, `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_MS`, `MFA_ENABLED`, `MFA_ENCRYPTION_KEY`, `MFA_TOTP_ISSUER` |
| Persistence | `REPOSITORY_BACKEND`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `DATABASE_SSL_REQUIRED`, `DATABASE_POOL_MAX`, `FILE_REPOSITORY_PATH` |
| Storage | `STORAGE_BACKEND`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `SIGNED_URL_EXPIRY_SECONDS` |
| Queue | `QUEUE_BACKEND`, `QUEUE_CONCURRENCY`, `QUEUE_MAX_RETRIES`, `QUEUE_LEASE_MS`, `QUEUE_HEARTBEAT_MS`, `QUEUE_POLL_MS`, `QUEUE_SHUTDOWN_TIMEOUT_MS` |
| Malware scanning | `MALWARE_SCAN_ENABLED`, `MALWARE_SCAN_REQUIRED_IN_PRODUCTION`, `MALWARE_SCANNER_PROVIDER`, `MALWARE_SCAN_TIMEOUT_MS`, `MALWARE_SCAN_FAIL_POLICY`, `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS` |
| AI | `AI_ENABLED`, `AI_PROVIDER`, `AI_MAX_FILE_TEXT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`, `AI_CONFIDENCE_THRESHOLD`, `AI_REVIEW_REQUIRED_THRESHOLD`, `OPENAI_MODEL`, `OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_KEY` |
| Recovery email | `RECOVERY_DELIVERY_PROVIDER`, `RECOVERY_EXPOSE_TEST_TOKEN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_TLS` |
| Provisioning | `ENABLE_DEMO_DATA`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PROVISION_ORGANIZATION_NAME`, `PROVISION_ADMIN_NAME`, `PROVISION_ADMIN_EMAIL`, `PROVISION_ADMIN_PASSWORD` |
| Live validation | `ERGON_LIVE_CLOUD_VALIDATION`, `VALIDATION_TARGET`, `ALLOW_PRODUCTION_VALIDATION`, `STAGING_API_ORIGIN`, `TEST_DATABASE_URL`, `STAGING_DATABASE_URL`, `TEST_S3_BUCKET`, `TEST_S3_REGION`, `TEST_S3_ENDPOINT`, `TEST_S3_ACCESS_KEY_ID`, `TEST_S3_SECRET_ACCESS_KEY`, `TEST_S3_FORCE_PATH_STYLE`, `SCANNER_VALIDATE_EICAR` |
| Backup/inventory | `POSTGRES_BACKUP_OUTPUT`, `STORAGE_INVENTORY_OUTPUT` |
| Provider acceptance | `ERGON_LIVE_AI_ACCEPTANCE`, `ERGON_LIVE_AI_FORMAT`, `ERGON_LIVE_SMTP_ACCEPTANCE`, `SMTP_ACCEPTANCE_EMAIL` |
| Test/browser | `API_TEST_USE_S3`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` |

## Supabase PostgreSQL setup

1. Create a Supabase project for staging only.
2. Choose a region close to the Render region where possible.
3. Store the database password in a password manager.
4. Use a session-pooler PostgreSQL connection for `DATABASE_URL`.
5. Use the direct PostgreSQL connection for `DATABASE_MIGRATION_URL`, `TEST_DATABASE_URL`/`STAGING_DATABASE_URL`, `pg_dump`, and restore drills.
6. Set `REPOSITORY_BACKEND=postgres`.
7. Set `DATABASE_SSL_REQUIRED=true`.
8. Start with `DATABASE_POOL_MAX=10` for API and `DATABASE_POOL_MAX=5` for worker.
9. Do not use Supabase Auth for Phase 27.
10. Run migrations once after configuration:

```bash
npm run db:migrate
```

Expected schema baseline:

| Migration | Purpose | Expected result |
|---|---|---|
| `0001_initial.sql` | Base repository schema | Applied |
| `0002_persistence_hardening.sql` | Persistence hardening | Applied |
| `0003_ai_evidence_intelligence.sql` | AI/evidence tables | Applied |
| `0004_production_file_intelligence.sql` | File intelligence | Applied |
| `0005_pilot_readiness_hardening.sql` | Pilot hardening | Applied |
| `0006_data_lifecycle_hardening.sql` | Lifecycle controls | Applied |
| `0007_account_recovery.sql` | Recovery tables | Applied |
| `0008_multi_factor_authentication.sql` | MFA tables | Applied |
| `0009_evidence_intelligence_foundation.sql` | Multi-format evidence foundation | Applied |

`/health/ready` verifies the repository can connect and that the latest migration is exactly `0009_evidence_intelligence_foundation.sql`. If the schema is older, readiness fails safely with a schema error.

## Supabase Storage setup

1. Create a private Supabase Storage bucket for staging evidence.
2. Do not make the bucket public.
3. Create S3-compatible access credentials for server-side use only.
4. Configure:

```text
STORAGE_BACKEND=s3
S3_ENDPOINT=https://PROJECT_REF.supabase.co/storage/v1/s3
S3_BUCKET=<private bucket name>
S3_REGION=<Supabase region or configured S3 region>
S3_FORCE_PATH_STYLE=true
```

5. Store `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` only in Render secrets or local `.env`.
6. Do not put storage credentials in Vercel or browser code.
7. Do not rely on the S3 `x-amz-server-side-encryption` request header for Supabase Storage.

Ergon writes tenant-scoped private keys like:

```text
private/<organizationId>/<facilityId>/<resourceType>/<resourceId>/<uuid>.<ext>
```

If scope is unavailable for a validator object, the key is:

```text
private/unscoped/<uuid>.<ext>
```

Downloads remain authenticated API operations. Signed URLs are bounded and server-generated.

## Storage limitations and recovery

Supabase Storage S3 compatibility does not provide S3 object versioning recovery. A database backup does not contain object bytes. A complete staging recovery plan therefore needs:

1. PostgreSQL backup or `pg_dump`.
2. Storage inventory export.
3. Object-byte export or provider backup equivalent.
4. Restore into an isolated target.
5. Reconciliation between restored database file references and restored objects.

Use the helper to produce a metadata inventory:

```bash
ERGON_LIVE_CLOUD_VALIDATION=true npm run inventory:storage
```

Set `STORAGE_INVENTORY_OUTPUT` to an ignored local path. The inventory contains object keys, sizes, content type, etag, and parsed ERGON scope. It does not include access keys, secret keys, prompts, raw documents, or customer content.

## Render API service

Use `render.yaml` or configure the service manually:

| Setting | Value |
|---|---|
| Type | Web service |
| Build command | `npm ci && npm run typecheck && npm run lint && npm --workspace @ergon/api run build` |
| Start command | `npm run start:api` |
| Process role | `PROCESS_ROLE=api` |
| Host binding | `API_HOST=0.0.0.0`; Render supplies `PORT` |
| Health path | `/health/ready` |
| Secrets | `sync: false` in blueprint or dashboard secret fields |

Set `APP_URL` and `ALLOWED_ORIGINS` to the Vercel staging origin. Keep AI, SMTP, database, storage, scanner, and MFA secrets server-side only.

## Render worker service

Use a separate Render background worker:

| Setting | Value |
|---|---|
| Type | Background worker |
| Build command | `npm ci && npm run typecheck && npm run lint && npm --workspace @ergon/api run build` |
| Start command | `npm run start:worker` |
| Process role | `PROCESS_ROLE=worker` |
| Public traffic | None required |
| Health | Local worker health endpoint for process supervision |
| Secrets | Same database/storage/scanner/AI/SMTP config as API where applicable |

The worker claims jobs from the PostgreSQL-backed repository/queue path and processes uploads, malware scanning, deterministic extraction, optional AI analysis, and queued work. API and worker failures should be isolated: the API can remain reachable even if worker readiness reports missing worker capacity.

## Vercel web setup

Use the static web app only:

| Setting | Value |
|---|---|
| Build command | `npm run build:web` |
| Output directory | `apps/web/dist` |
| SPA routing | `vercel.json` rewrites to `/index.html` |
| Public API origin | `WEB_API_ORIGIN=https://<render-api-host>` |
| Secrets | None |

Do not configure database URLs, S3 keys, SMTP secrets, AI provider keys, or Supabase service credentials in Vercel.

## Health and readiness

| Component | Liveness/readiness behavior | Safe failure result |
|---|---|---|
| API process | `/health/live` confirms process is alive | Non-200 if process unavailable |
| Database | `/health/ready` checks repository connection | 503 with safe database error code |
| Schema | Postgres health checks latest migration is `0009_evidence_intelligence_foundation.sql` | 503 with schema error code |
| Storage | `/health/ready` performs private bucket health check | 503 with safe storage error code |
| Scanner | `/health/ready` reports scanner configuration/provider health | 503 when required scanner is unavailable |
| Queue/worker | `/health/ready` checks queue and worker requirement | 503 when worker is required but unavailable |

Readiness checks are bounded by `READINESS_TIMEOUT_MS` and do not print credentials, prompts, raw documents, provider responses, reset tokens, or SMTP secrets.

## Validation order

Run these only after safe staging resources exist and secrets are configured privately:

```bash
ERGON_LIVE_CLOUD_VALIDATION=true npm run validate:postgres
ERGON_LIVE_CLOUD_VALIDATION=true npm run validate:storage
ERGON_LIVE_CLOUD_VALIDATION=true npm run validate:scanner
ERGON_LIVE_CLOUD_VALIDATION=true npm run validate:staging
```

Expected missing-config classification before provisioning:

```text
READY_MISSING_CLOUD_CONFIGURATION
```

Do not set `ALLOW_PRODUCTION_VALIDATION=true` for normal staging work.

## Backup and restore drill

Database backup helper:

```bash
export DATABASE_MIGRATION_URL='<direct Supabase PostgreSQL URL>'
export POSTGRES_BACKUP_OUTPUT='/private/tmp/ergon-staging-backup.dump'
ERGON_LIVE_CLOUD_VALIDATION=true npm run backup:postgres
```

Storage inventory helper:

```bash
export STORAGE_INVENTORY_OUTPUT='/private/tmp/ergon-storage-inventory.json'
ERGON_LIVE_CLOUD_VALIDATION=true npm run inventory:storage
```

Manual drill:

1. Create a synthetic staging organization and facility.
2. Upload synthetic evidence across TXT, CSV, PDF, DOCX, and XLSX.
3. Confirm private downloads work through ERGON API authorization.
4. Run a database backup.
5. Run storage inventory and object export/provider backup.
6. Restore the database into an isolated target.
7. Restore objects into an isolated private bucket or equivalent recovery target.
8. Point an isolated ERGON instance at the restored database and bucket.
9. Confirm users, facilities, evidence metadata, file references, AI lineage, review state, audit packets, audit logs, legal holds, archive state, and queue state are understandable.
10. Confirm restored file references resolve to restored private objects.
11. Record restore time, recovery point, missing objects, mismatched sizes, and cleanup steps.

Backup readiness remains `READY_FOR_MANUAL_BACKUP_RESTORE_DRILL` until this drill is actually completed.

## Manual staging acceptance walkthrough

1. Open the Vercel staging URL.
2. Sign in with an ERGON staging account created by private provisioning.
3. Confirm organization and facility context.
4. Upload synthetic TXT evidence.
5. Upload synthetic CSV evidence.
6. Upload synthetic text-layer PDF evidence.
7. Upload synthetic DOCX evidence.
8. Upload synthetic XLSX evidence.
9. Confirm server-mediated downloads and no public object URLs.
10. Confirm worker processing and scan/extraction state.
11. If configured, run Azure AI analysis and verify schema-backed provenance.
12. Confirm unsupported candidates remain separated.
13. Confirm human-review indicators and overrides.
14. Confirm cross-tenant access denial using a second staging tenant if available.
15. Log out and log back in.
16. Run forgot-password with a real staging inbox if SMTP is configured.
17. Confirm API `/health/live`.
18. Confirm API `/health/ready`.
19. Redeploy API and confirm database persistence.
20. Redeploy worker and confirm processing resumes.
21. Confirm object persistence across redeploy.
22. Run database backup.
23. Run storage inventory/export.
24. Complete restore/reconciliation drill.
25. Inspect browser source/network enough to confirm no database, storage, SMTP, or provider secret exposure.

## Feedback template

1. Supabase database connected? Yes/No
2. Migrations 0001-0009 applied? Yes/No
3. Data persisted across API restart/redeploy? Yes/No
4. Supabase private storage upload worked? Yes/No
5. Download required ERGON authorization? Yes/No
6. Cross-tenant access denied? Yes/No
7. Evidence survived API redeploy? Yes/No
8. Worker processed jobs? Yes/No
9. Azure analysis worked? Yes/No
10. Recovery email worked? Yes/No
11. API readiness clear? Yes/No
12. Worker status clear? Yes/No
13. Web/API CORS worked? Yes/No
14. Any browser secrets visible? Yes/No
15. Database backup completed? Yes/No
16. Database restore was tested? Yes/No
17. Storage inventory/export completed? Yes/No
18. Storage restore/reconciliation tested? Yes/No
19. Deployment clarity, 1-10:
20. Staging stability, 1-10:
21. What failed?
22. What was confusing?
23. What felt missing?
24. Would I proceed to verified signup implementation? Yes/No
25. Would I show this staging environment privately? Yes/No/Maybe
26. Additional thoughts:

## Remaining blockers

- Real Supabase project not provisioned by code.
- Real private bucket not provisioned by code.
- Render and Vercel services not deployed by code.
- Live cloud validators not run without private configuration.
- Backup/restore drill not completed.
- Public signup remains deferred to Phase 28.
- Pilot remains `NO_GO`.
