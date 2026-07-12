# Ergon Staging Infrastructure Runbook

## Purpose

This runbook turns the Phase 15 `NO_GO` blockers into a safe setup and validation package for a staging environment. It is written for an infrastructure owner who will create or identify safe staging resources, configure secrets, run validators, prove backup/restore, and capture evidence without exposing credentials.

Use this runbook before any controlled pilot with real customer evidence. Until every required staging gate is proven, the pilot decision remains `NO_GO`.

## What this runbook does not do

- It does not provision infrastructure.
- It does not create databases, buckets, scanner services, DNS records, TLS certificates, monitoring systems, or deployments.
- It does not create real `.env` files.
- It does not include or request real secrets.
- It does not authorize production validation.
- It does not prove backup/restore. It defines the drill that must later be executed.
- It does not change Ergon runtime behavior, source code, dependencies, migrations, CI, tests, or deploy environment templates.

## Required staging topology

Use the repository's existing architecture:

- Static frontend hosted on Vercel, managed static hosting, or equivalent.
- Persistent Node API service.
- Separate persistent Node worker service using the same release as the API.
- Managed PostgreSQL.
- Private S3-compatible bucket.
- Private ClamAV-compatible scanner service reachable from API/worker infrastructure.
- HTTPS ingress or trusted proxy in front of the API.
- Centralized logs and metrics.
- Backup and restore mechanism for PostgreSQL and private objects.
- Secret manager or secure deployment environment variable store.

Vercel is appropriate for the static frontend only unless the API is later adapted and proven for serverless runtime. Do not deploy the current API as Vercel serverless for staging or pilot validation without a separate serverless adaptation and proof.

## Required owners

| Owner role | Required person/team | Responsibilities | Evidence to record |
| ---------- | -------------------- | ---------------- | ------------------ |
| Infrastructure owner | Assigned before setup | Creates staging resources, networking, DNS, TLS, and secure env vars | Name, contact, staging resource inventory without secrets |
| Application release owner | Assigned before deployment | Chooses release SHA, runs migrations, confirms API/worker/web use same release | Release SHA, migration output summary |
| Security owner | Assigned before secrets | Approves secret storage, access, rotation, scanner test policy, and EICAR decision | Approval record, rotation owner |
| Backup/restore owner | Assigned before data load | Enables backup/PITR/object backup and runs restore drill | Backup settings summary, restore drill report |
| Monitoring owner | Assigned before pilot | Configures log collection, metrics, alerts, escalation paths | Alert list, notification channel, escalation contact |
| Pilot support owner | Assigned before pilot | Owns user support, incident intake, and customer communication | Support contact and coverage hours |
| Compliance/EHS reviewer | Assigned before pilot | Reviews pilot outputs and confirms rule limitations are understood | Reviewer name and acknowledgement |

## Required external services

| Service | Minimum staging requirement | Risk if skipped |
| ------- | --------------------------- | --------------- |
| PostgreSQL | Managed or controlled staging database with TLS/network restrictions, backups/PITR, and validator schema create/drop permission | Tenant data, queue behavior, migrations, and restore cannot be proven |
| S3-compatible storage | Private test/staging bucket with public access blocked, encryption/provider equivalent, delete permission, and backup/versioning decision | Evidence and packet durability/private access cannot be proven |
| ClamAV-compatible scanner | Private scanner endpoint reachable from app infrastructure with signature updates and fail-closed validation | File safety controls cannot be proven |
| API host | Persistent Node runtime behind HTTPS ingress | Health, auth, private downloads, and readiness cannot be proven |
| Worker host | Separate persistent Node runtime with internal health/metrics | Queue processing and background work cannot be proven |
| Static frontend host | HTTPS static site with `WEB_API_ORIGIN` pointing at API origin | Browser workflow cannot be proven |
| Monitoring/logging | Centralized logs, metrics, alert routing, owner escalation | Failures may be invisible during pilot |
| Backup/restore | Database backup/PITR and object backup/versioning with restore target | Recovery cannot be proven |

## Secret handling rules

1. Store secrets only in a secret manager or secure deployment environment variable store.
2. Do not commit real secrets.
3. Do not paste real credentials into issues, PRs, chat, logs, screenshots, or runbook evidence.
4. Do not create real `.env` files in the repository.
5. Use placeholders in documentation.
6. Give validators disposable/staging credentials only.
7. Do not point `TEST_*` validator variables at production customer data.
8. Do not print database URLs, access keys, signed URLs, session secrets, API keys, or SMTP credentials.
9. Remove one-time `PROVISION_*` secrets immediately after successful admin provisioning.
10. Record evidence as pass/fail summaries, redacted screenshots, resource IDs without credentials, and copied command output with secrets removed.

## Environment variable checklist

Variables marked validator-only should be configured only for validator jobs or temporary validation shells. `TEST_*` values must point to disposable/staging resources, not production customer data.

| Variable | Required for | Example safe placeholder | Secret? | Source/owner | Validation command |
| -------- | ------------ | ------------------------ | ------- | ------------ | ------------------ |
| `NODE_ENV` | API, worker | `production` | No | App release owner | Startup and `/health/ready` |
| `DEPLOYMENT_PROFILE` | API, worker | `staging` | No | App release owner | Startup and `/health/ready` |
| `PROCESS_ROLE` | API, worker | `api` or `worker` | No | App release owner | `/health/ready`, worker `/metrics` |
| `PORT` | API | `4000` | No | Infrastructure owner | API `/health/live` |
| `APP_URL` | API CORS/cookies | `https://staging-web.example.com` | No | Infrastructure owner | CORS/browser smoke |
| `ALLOWED_ORIGINS` | API CORS | `https://staging-web.example.com` | No | Infrastructure owner | CORS/browser smoke |
| `WEB_API_ORIGIN` | Static frontend build | `https://staging-api.example.com` | No | Infrastructure owner | `npm run build:web`, browser smoke |
| `DATABASE_URL` | API, worker, migrations | `postgresql://REDACTED@staging-db.example.com:5432/ergon_staging` | Yes | Database owner | `npm run db:migrate`, `/health/ready` |
| `REPOSITORY_BACKEND` | API, worker | `postgres` | No | App release owner | Startup and `/health/ready` |
| `SESSION_SECRET` | API sessions | `replace-from-secret-manager` | Yes | Security owner | Login/logout smoke |
| `RECOVERY_DELIVERY_PROVIDER` | API account recovery | `smtp` | No | Security owner | Startup and recovery smoke |
| `RECOVERY_EXPOSE_TEST_TOKEN` | API account recovery | `false` | No | Security owner | Startup and recovery smoke |
| `SMTP_HOST` | API account recovery | `smtp.example.com` | No | Security owner | Approved SMTP validation |
| `SMTP_PORT` | API account recovery | `587` | No | Security owner | Approved SMTP validation |
| `SMTP_USE_TLS` | API account recovery | `true` | No | Security owner | Approved SMTP validation |
| `SMTP_USERNAME` | API account recovery | `replace-from-secret-manager` or blank with no password | Yes if set | Security owner | Approved SMTP validation |
| `SMTP_PASSWORD` | API account recovery | `replace-from-secret-manager` or blank with no username | Yes if set | Security owner | Approved SMTP validation |
| `SMTP_FROM_EMAIL` | API account recovery | `security@staging.example.com` | No | Security owner | Approved SMTP validation |
| `STORAGE_BACKEND` | API, worker | `s3` | No | Storage owner | `/health/ready`, storage validator |
| `S3_BUCKET` | API, worker | `ergon-staging-private` | No | Storage owner | `/health/ready`, storage validator |
| `S3_REGION` | API, worker | `ca-central-1` | No | Storage owner | `/health/ready`, storage validator |
| `S3_ENDPOINT` | API, worker | `https://s3-compatible.example.com` or blank for AWS-style endpoint | No | Storage owner | Storage validator |
| `S3_ACCESS_KEY_ID` | API, worker | `REDACTED_ACCESS_KEY_ID` | Yes | Storage/security owner | Storage validator |
| `S3_SECRET_ACCESS_KEY` | API, worker | `REDACTED_SECRET_ACCESS_KEY` | Yes | Storage/security owner | Storage validator |
| `S3_FORCE_PATH_STYLE` | API, worker | `false` | No | Storage owner | Storage validator |
| `SIGNED_URL_EXPIRY_SECONDS` | Storage validation helper | `300` | No | Storage owner | Storage validator |
| `MAX_UPLOAD_MB` | API uploads | `25` | No | App release owner | Upload/browser smoke |
| `MALWARE_SCAN_ENABLED` | API, worker, scanner validator | `true` | No | Security owner | Scanner validator |
| `MALWARE_SCAN_REQUIRED_IN_PRODUCTION` | API, worker | `false` for staging, `true` for closed-pilot | No | Security owner | Startup |
| `MALWARE_SCANNER_PROVIDER` | API, worker, scanner validator | `clamav` | No | Security owner | Scanner validator |
| `MALWARE_SCAN_FAIL_POLICY` | API, worker, scanner validator | `closed` | No | Security owner | Scanner validator |
| `CLAMAV_HOST` | API, worker, scanner validator | `scanner.internal` | No, unless provider treats endpoint as sensitive | Scanner owner | Scanner validator |
| `CLAMAV_PORT` | API, worker, scanner validator | `3310` | No | Scanner owner | Scanner validator |
| `CLAMAV_TIMEOUT_MS` | API, worker, scanner validator | `10000` | No | Scanner owner | Scanner validator |
| `QUEUE_BACKEND` | API, worker | `local` | No | App release owner | Worker readiness and processing |
| `QUEUE_CONCURRENCY` | Worker | `1` | No | App release owner | Worker metrics |
| `QUEUE_MAX_RETRIES` | Worker | `3` | No | App release owner | Queue metrics/logs |
| `QUEUE_LEASE_MS` | Worker | `300000` | No | App release owner | Queue metrics/logs |
| `QUEUE_HEARTBEAT_MS` | Worker | `30000` | No | App release owner | Queue metrics/logs |
| `QUEUE_POLL_MS` | Worker | `1000` | No | App release owner | Worker metrics |
| `QUEUE_SHUTDOWN_TIMEOUT_MS` | Worker | `30000` | No | App release owner | Graceful shutdown drill |
| `TRUST_PROXY` | API | `true` only behind trusted header-overwriting proxy | No | Infrastructure/security owner | Header/CORS validation |
| `SESSION_COOKIE_SAME_SITE` | API cookies | `None` or `Lax` based on ingress/browser flow | No | Security owner | Browser smoke |
| `LOG_LEVEL` | API, worker | `info` | No | Monitoring owner | Log collection |
| `VALIDATION_TARGET` | Validator-only safety gate | `staging` | No | Validation owner | All live validators |
| `ALLOW_PRODUCTION_VALIDATION` | Validator-only safety gate | `false` | No | Security owner | All live validators |
| `TEST_DATABASE_URL` | Validator-only Postgres | `postgresql://REDACTED@staging-db.example.com:5432/ergon_validation` | Yes | Database owner | `npm run validate:postgres` |
| `STAGING_DATABASE_URL` | Validator-only Postgres fallback | `postgresql://REDACTED@staging-db.example.com:5432/ergon_validation` | Yes | Database owner | `npm run validate:postgres` |
| `TEST_S3_BUCKET` | Validator-only storage | `ergon-staging-validation` | No | Storage owner | `npm run validate:storage` |
| `TEST_S3_REGION` | Validator-only storage | `ca-central-1` | No | Storage owner | `npm run validate:storage` |
| `TEST_S3_ENDPOINT` | Validator-only storage | `https://s3-compatible.example.com` | No | Storage owner | `npm run validate:storage` |
| `TEST_S3_ACCESS_KEY_ID` | Validator-only storage | `REDACTED_TEST_ACCESS_KEY_ID` | Yes | Storage/security owner | `npm run validate:storage` |
| `TEST_S3_SECRET_ACCESS_KEY` | Validator-only storage | `REDACTED_TEST_SECRET_ACCESS_KEY` | Yes | Storage/security owner | `npm run validate:storage` |
| `TEST_S3_FORCE_PATH_STYLE` | Validator-only storage | `false` | No | Storage owner | `npm run validate:storage` |
| `SCANNER_VALIDATE_EICAR` | Validator-only scanner | `false` unless explicitly approved | No | Security owner | `npm run validate:scanner` |

## PostgreSQL staging setup checklist

- [ ] Create or identify a managed staging PostgreSQL database.
- [ ] Confirm no production customer data is present.
- [ ] Require TLS or provider-equivalent encrypted transport where supported.
- [ ] Restrict network access to API, worker, migration runner, and approved validator locations.
- [ ] Create a least-privilege application role for API/worker/migrations.
- [ ] Create a validator role or permission set that can create and drop isolated schemas, or confirm the application role may safely do so in staging.
- [ ] Configure `DATABASE_URL` securely for API and worker.
- [ ] Configure `TEST_DATABASE_URL` or `STAGING_DATABASE_URL` securely for validation.
- [ ] Set `VALIDATION_TARGET=staging`.
- [ ] Confirm `ALLOW_PRODUCTION_VALIDATION` is absent or `false`.
- [ ] Enable managed backups/PITR or scheduled encrypted backups.
- [ ] Record backup retention and restore target availability.
- [ ] Run migrations only after the release SHA is selected.

Command examples with placeholders only:

```bash
REPOSITORY_BACKEND=postgres \
DATABASE_URL='postgresql://REDACTED@staging-db.example.com:5432/ergon_staging' \
npm run db:migrate
```

```bash
VALIDATION_TARGET=staging \
TEST_DATABASE_URL='postgresql://REDACTED@staging-db.example.com:5432/ergon_validation' \
npm run validate:postgres
```

Evidence to capture without credentials:

- migration command pass summary and latest migration version;
- `npm run validate:postgres` pass summary;
- isolated schema cleanup message;
- tenant isolation and queue/job validation summary;
- backup/PITR setting screenshot or provider export with secrets redacted;
- restore drill result after the drill is executed.

Risk if skipped: database migrations, tenant isolation, queue claims, lifecycle fields, backups, and restore remain unproven.

## S3-compatible private storage setup checklist

- [ ] Create or identify a private staging/test bucket.
- [ ] Confirm no production customer evidence is present.
- [ ] Block public access at bucket/account/provider level.
- [ ] Enable encryption or provider-equivalent protection.
- [ ] Decide and document object versioning, replication, lifecycle, retention, and backup behavior.
- [ ] Create a least-privilege identity that can put, get, delete, and validate test objects.
- [ ] Confirm delete permission exists for lifecycle/deletion validation.
- [ ] Configure API/worker `S3_*` values securely.
- [ ] Configure validator-only `TEST_S3_*` values securely.
- [ ] Set signed URL expiry expectation, such as `SIGNED_URL_EXPIRY_SECONDS=300`.
- [ ] Set `VALIDATION_TARGET=staging`.
- [ ] Confirm `ALLOW_PRODUCTION_VALIDATION` is absent or `false`.

Command example with placeholders only:

```bash
VALIDATION_TARGET=staging \
TEST_S3_BUCKET='ergon-staging-validation' \
TEST_S3_REGION='ca-central-1' \
TEST_S3_ENDPOINT='https://s3-compatible.example.com' \
TEST_S3_ACCESS_KEY_ID='REDACTED_TEST_ACCESS_KEY_ID' \
TEST_S3_SECRET_ACCESS_KEY='REDACTED_TEST_SECRET_ACCESS_KEY' \
TEST_S3_FORCE_PATH_STYLE='false' \
npm run validate:storage
```

Evidence to capture without credentials:

- bucket public access blocked;
- encryption or provider-equivalent setting;
- versioning/backup/lifecycle decision;
- validator pass summary;
- upload/retrieve/delete/post-delete validation summary;
- anonymous/public read denied result;
- no signed URLs or credentials in evidence.

Risk if skipped: private evidence storage, packet storage, public denial, deletion, and storage recovery remain unproven.

## ClamAV-compatible scanner setup checklist

- [ ] Create or identify a private ClamAV-compatible scanner service.
- [ ] Confirm scanner endpoint is reachable from API and worker network paths.
- [ ] Restrict scanner network access to application infrastructure.
- [ ] Configure signature update mechanism and record freshness evidence.
- [ ] Define expected capacity and timeout settings.
- [ ] Use fail-closed policy: `MALWARE_SCAN_FAIL_POLICY=closed`.
- [ ] Configure API/worker scanner variables securely.
- [ ] Configure validator scanner variables securely.
- [ ] Keep `SCANNER_VALIDATE_EICAR=false` unless the security owner explicitly approves live EICAR in the staging scanner.
- [ ] Document unavailable/timeout expected behavior and alert path.

Command example with placeholders only:

```bash
VALIDATION_TARGET=staging \
MALWARE_SCAN_ENABLED=true \
MALWARE_SCANNER_PROVIDER=clamav \
MALWARE_SCAN_FAIL_POLICY=closed \
CLAMAV_HOST='scanner.internal' \
CLAMAV_PORT='3310' \
CLAMAV_TIMEOUT_MS='10000' \
SCANNER_VALIDATE_EICAR=false \
npm run validate:scanner
```

Evidence to capture without credentials:

- scanner validator pass summary;
- clean sample result;
- suspicious-path result, simulated by default;
- live EICAR approval and result only if explicitly approved;
- timeout/fail-closed behavior;
- signature freshness;
- scanner alert path and owner.

Risk if skipped: malware scanning and fail-closed file safety are not proven for staging or pilot.

## API service setup checklist

- [ ] Deploy the selected release SHA to a persistent Node runtime.
- [ ] Set `PROCESS_ROLE=api`.
- [ ] Do not use `PROCESS_ROLE=api-and-worker` in staging or closed pilot.
- [ ] Use `NODE_ENV=production` and `DEPLOYMENT_PROFILE=staging`.
- [ ] Configure the same staging `DATABASE_URL` used by the worker.
- [ ] Configure private S3-compatible storage and scanner variables.
- [ ] Configure `APP_URL`, `ALLOWED_ORIGINS`, `SESSION_SECRET`, `TRUST_PROXY`, and cookie settings.
- [ ] Expose API through HTTPS ingress.
- [ ] Verify `/health/live`.
- [ ] Verify `/health/ready`.
- [ ] Verify `/api/health`.
- [ ] Confirm logs reach centralized collection.

Evidence to capture:

- release SHA;
- redacted environment variable presence checklist;
- `/health/live` and `/health/ready` JSON summary with secrets absent;
- startup log summary without secrets;
- CORS/header validation results.

## Worker service setup checklist

- [ ] Deploy the same release SHA as the API to a separate persistent Node runtime.
- [ ] Set `PROCESS_ROLE=worker`.
- [ ] Do not expose worker health/metrics publicly.
- [ ] Use the same staging `DATABASE_URL`, storage, scanner, AI, queue, and log settings as the API where applicable.
- [ ] Configure `WORKER_HEALTH_PORT` and `WORKER_HEALTH_HOST` for internal access.
- [ ] Verify worker `/health/live` internally.
- [ ] Verify worker `/health/ready` internally.
- [ ] Verify worker `/metrics` internally or through protected monitoring.
- [ ] Confirm worker can claim and complete jobs in a synthetic workflow.
- [ ] Confirm graceful shutdown behavior during a controlled restart.

Evidence to capture:

- release SHA matches API;
- internal health/readiness/metrics summaries;
- queue processing summary;
- graceful shutdown or restart validation summary.

## Frontend deployment checklist

- [ ] Deploy the static frontend only.
- [ ] Set `WEB_API_ORIGIN` to the HTTPS API origin.
- [ ] Confirm the frontend build rejects localhost/non-HTTPS production API origins.
- [ ] Confirm the web origin is present in API `ALLOWED_ORIGINS`.
- [ ] Verify login, facility creation, evidence upload, AI-disabled or controlled AI flow, review, packet export/download, archive behavior, and health checks through staging browser smoke.

Command example with placeholder only:

```bash
WEB_API_ORIGIN='https://staging-api.example.com' npm run build:web
```

Evidence to capture:

- frontend URL;
- API origin;
- browser smoke result;
- no frontend-exposed secrets.

## Ingress/proxy/TLS/CORS checklist

- [ ] Issue and attach valid HTTPS certificates for web and API origins.
- [ ] Redirect HTTP to HTTPS.
- [ ] Verify HSTS on production-profile API responses.
- [ ] Confirm API origin, for example `https://staging-api.example.com`.
- [ ] Confirm web origin, for example `https://staging-web.example.com`.
- [ ] Set `APP_URL` to the staging web origin.
- [ ] Set `ALLOWED_ORIGINS` to the exact trusted web origin list, never `*`.
- [ ] Set `WEB_API_ORIGIN` to the staging API origin.
- [ ] Confirm session cookies are `Secure`, `HttpOnly`, and have the chosen SameSite value.
- [ ] Use `SESSION_COOKIE_SAME_SITE=None` only when the browser flow requires cross-site cookies over HTTPS.
- [ ] Set `TRUST_PROXY=true` only if the ingress overwrites forwarding headers.
- [ ] Confirm mutating requests from an untrusted `Origin` are rejected.
- [ ] Confirm allowed-origin requests receive expected CORS headers.
- [ ] Confirm CSP, nosniff, referrer, permissions, frame, and HSTS headers.
- [ ] Run browser smoke in staging or against staging-equivalent isolated config.

Evidence to capture:

- redacted TLS/certificate status;
- header summaries;
- CORS allowed and denied test results;
- browser smoke result;
- proxy forwarding assumption and owner signoff.

## Backup setup checklist

- [ ] Enable PostgreSQL managed backup/PITR or scheduled encrypted backup.
- [ ] Record database backup retention and recovery-point objective.
- [ ] Record database recovery-time expectation.
- [ ] Enable object-storage versioning, replication, lifecycle backup, provider backup, or an approved equivalent.
- [ ] Record object backup retention and recovery expectations.
- [ ] Confirm operational/audit log retention requirements.
- [ ] Assign a backup owner and restore-drill owner.
- [ ] Confirm restore target availability before running the drill.
- [ ] Confirm backup evidence does not include credentials or customer data.

Evidence to capture:

- redacted backup settings;
- backup schedule/retention;
- PITR or restore-point availability;
- object backup/versioning setting;
- owner and escalation path.

## Restore drill plan

Do not execute this drill until safe staging resources and backups are ready.

1. Create or select an isolated staging organization using synthetic data only.
2. Create a synthetic user and record the user ID/email domain without using real customer identity.
3. Create a synthetic facility.
4. Upload a synthetic evidence file that contains no customer information.
5. Keep AI disabled or use a controlled approved provider/mock according to the staging plan.
6. Generate a review and audit packet.
7. Record baseline inventory:
   - organization ID;
   - user ID;
   - facility ID;
   - evidence ID and metadata;
   - private object key reference, without signed URL or credentials;
   - review ID;
   - gap row count;
   - action item count;
   - packet ID and private object key reference;
   - audit log count and key lifecycle actions.
8. Trigger or wait for a backup/snapshot according to provider tooling.
9. Simulate loss only in an isolated target, never against production/customer data.
10. Restore into an isolated environment or restore target.
11. Verify:
   - organization row restored;
   - user row restored where policy allows;
   - facility row restored;
   - evidence metadata restored;
   - private evidence object reference matches restored DB row;
   - private evidence object can be retrieved through authenticated backend route;
   - review, gap rows, findings, and action items restored;
   - packet metadata restored;
   - private packet object can be retrieved through authenticated backend route;
   - audit logs and AI lineage restored;
   - queue state is understood and safe after restore.
12. Record restore duration and recovery point.
13. Clean up isolated restored data when safe.
14. File a restore drill report.

Evidence to capture:

- baseline inventory with no secrets;
- backup/snapshot identifier with no credentials;
- restore target identifier;
- verification checklist;
- object reference consistency result;
- authenticated download success summary;
- cleanup confirmation;
- owner signoff.

## Monitoring and alerting checklist

| Alert | Signal source | Suggested severity | Owner | Notification channel | Escalation expectation | Evidence to capture |
| ----- | ------------- | ------------------ | ----- | -------------------- | ---------------------- | ------------------- |
| API readiness failure | API `/health/ready` | High | Monitoring owner | Approved on-call channel | Page during pilot hours | Alert test result |
| Worker readiness failure | Worker `/health/ready` | High | Monitoring owner | Approved on-call channel | Page during pilot hours | Alert test result |
| Postgres connectivity failure | Readiness/logs | Critical | Database owner | Approved on-call channel | Immediate escalation | Readiness failure sample |
| Storage failure | Readiness/logs | High | Storage owner | Approved on-call channel | Same-day or immediate if uploads blocked | Failure alert sample |
| Scanner unavailable/failing | Readiness/logs/scanner validator | High | Security owner | Approved on-call channel | Immediate if fail-closed blocks uploads | Alert sample |
| Queue retries | Worker logs/metrics | Medium | App support owner | Support channel | Investigate repeated retries | Dashboard or query |
| Dead-letter jobs | Worker metrics/repository state | High | App support owner | On-call channel | Triage before pilot continues | Alert test |
| Storage deletion failures | Lifecycle fields/logs | High | Storage/app owner | On-call channel | Triage data lifecycle risk | Alert test |
| Retention enforcement errors | Audit logs/API logs | High | Compliance owner | Support/security channel | Review legal/data impact | Alert sample |
| Repeated login throttling | API logs | Medium | Security owner | Security channel | Investigate abuse/lockout | Alert test |
| 5xx rate | API logs/metrics | High | App support owner | On-call channel | Page if threshold exceeded | Dashboard screenshot |
| High latency | API/ingress metrics | Medium | App/infrastructure owner | Support channel | Investigate before pilot session | Dashboard screenshot |
| Disk/memory/cpu | Host/container metrics | Medium | Infrastructure owner | Infrastructure channel | Scale or restart per runbook | Dashboard screenshot |
| Backup failure | Provider backup events | Critical | Backup owner | On-call channel | Immediate remediation | Alert test |
| Restore drill overdue | Calendar/ticket/checklist | Medium | Backup owner | Project channel | Escalate before pilot approval | Reminder/ticket |

Do not add a monitoring vendor as part of this runbook. Use whichever approved provider or platform the infrastructure owner already uses.

## Secret rotation procedure

Apply this procedure separately for each secret class. Do not rotate secrets during Phase 16.

| Secret | Rotation trigger | Safe rotation window | Apply new secret | Restart/redeploy sequence | Validation | Rollback | Audit record | Owner |
| ------ | ---------------- | -------------------- | ---------------- | ------------------------- | ---------- | -------- | ------------ | ----- |
| `SESSION_SECRET` | Scheduled rotation, suspected exposure, employee offboarding | Maintenance window; expect active sessions to become invalid unless dual-secret support is later added | Update secret manager/env var | Restart API services; workers do not need session secret unless shared config requires it | Login, logout, authenticated route smoke | Restore previous secret only if not compromised | Record time, owner, validation | Security owner |
| `DATABASE_URL` / DB credentials | Scheduled rotation, role change, suspected exposure | Window with migration freeze | Create new credential, update API/worker/migration env | Restart API then worker after DB accepts new credential | `/health/ready`, migration status, queue processing | Restore previous credential if safe and still valid | Record credential ID, not value | Database owner |
| S3 credentials/workload identity | Scheduled rotation, key age, suspected exposure | Low upload/export period | Add new identity/key, update env | Restart API and worker | Storage health, upload/download/delete validation | Re-enable previous credential only if safe | Record key ID redacted | Storage/security owner |
| `OPENAI_API_KEY` when enabled | Scheduled rotation, provider key event, suspected exposure | AI-low-use period | Update backend secret only | Restart API and worker if AI enabled | AI status, controlled AI processing | Revert to previous key only if safe | Record provider key ID redacted | AI/security owner |
| SMTP credentials when enabled | Scheduled rotation, mail-provider event | Low email period | Update SMTP secret | Restart API if SMTP is used | Send approved test email without sensitive data | Revert only if safe | Record mail credential ID redacted | Infrastructure/security owner |
| Scanner credentials if used | Scheduled rotation, scanner auth change | Low upload period | Update scanner/app secret | Restart scanner client services if required | Scanner validator | Revert only if safe | Record scanner credential ID redacted | Scanner/security owner |
| `PROVISION_*` one-time secrets | Immediately after admin provisioning | Immediately after command succeeds | Remove from deployment environment | Restart if required by platform | Confirm login with provisioned admin; confirm `PROVISION_*` absent | Recreate only if provisioning must be repeated safely | Record removal confirmation | App release owner |

Backup plan before rotation:

- Confirm latest database backup/PITR restore point.
- Confirm object backup/versioning status.
- Confirm previous deployment configuration can be restored without exposing secret values.
- Confirm owner availability during the window.

## Validator execution order

Run validators only after staging resources exist and secrets are securely configured.

1. Confirm release SHA and docs-only runbook merged.
2. Confirm no production/customer target is used.
3. Set `VALIDATION_TARGET=staging`.
4. Confirm `ALLOW_PRODUCTION_VALIDATION` is absent or `false`.
5. Run `npm run lint`.
6. Run `npm run typecheck`.
7. Run `npm test`.
8. Run `npm run build`.
9. Run `npm run validate:postgres`.
10. Run `npm run validate:storage`.
11. Run `npm run validate:scanner`.
12. Run `npm run qa:pilot` locally with browser installed or in GitHub Actions/staging-equivalent environment.
13. Validate API and worker `/health/ready`.
14. Validate ingress/CORS/TLS headers.
15. Complete backup/restore drill.
16. Confirm monitoring/alerting/escalation.
17. Confirm secret rotation procedure has been exercised.

Stop immediately if a validator appears to point at production without explicit safety approval. Do not continue if any command may damage customer data.

## Evidence to capture without exposing secrets

- Release SHA and branch name.
- Redacted environment variable presence table.
- Postgres migration pass summary and migration version.
- Postgres validator pass summary.
- Storage validator pass summary.
- Scanner validator pass summary.
- Browser smoke result.
- API `/health/ready` summary with secrets absent.
- Worker `/health/ready` and `/metrics` summary with secrets absent.
- Ingress/TLS/CORS/header validation summary.
- Backup setting summary.
- Restore drill report.
- Monitoring alert tests.
- Secret rotation exercise report.
- Owner/support/escalation assignments.

Never include:

- database URLs with credentials;
- access key IDs when the organization treats them as sensitive;
- secret access keys;
- session secrets;
- API keys;
- SMTP credentials;
- signed URLs;
- raw customer documents;
- raw extracted text or model prompts.

## Staging go/no-go checklist

Run real validators and the restore drill only when every item below is true:

- [ ] Phase 16 runbook is merged.
- [ ] Staging owner is assigned.
- [ ] Security owner is assigned.
- [ ] Backup/restore owner is assigned.
- [ ] Monitoring/support owner is assigned.
- [ ] Safe staging PostgreSQL exists.
- [ ] Safe private staging bucket exists.
- [ ] Safe ClamAV-compatible scanner exists.
- [ ] Staging API and worker runtime targets are ready.
- [ ] Static frontend target is ready.
- [ ] Secrets are stored securely and are not in repo files.
- [ ] `TEST_*` validator variables point only at disposable/staging resources.
- [ ] `VALIDATION_TARGET=staging`.
- [ ] `ALLOW_PRODUCTION_VALIDATION` is absent or `false`.
- [ ] No production customer data is involved.
- [ ] Backup/PITR/object backup settings are enabled or explicitly documented.
- [ ] Restore target is available.
- [ ] Monitoring and alert destinations are configured.
- [ ] Pilot owner and escalation path are named.

If any item is unchecked, staging validation should remain blocked or limited to the missing setup action.

## Troubleshooting and rollback notes

- If a validator skips, check missing environment variables first. A skip because safe config is absent is not an application failure.
- If a validator refuses production, stop and confirm target safety. Do not set `ALLOW_PRODUCTION_VALIDATION=true` for normal staging work.
- If Postgres validation fails before cleanup, identify whether the isolated schema remains and have the database owner remove only the validator schema after confirming it contains no customer data.
- If storage validation fails after upload, use the opaque test object reference from validator output only if needed and avoid publishing signed URLs.
- If scanner validation fails, keep fail-closed behavior enabled and resolve scanner reachability/signature/capacity before pilot.
- If API readiness fails, inspect dependency checks in the readiness JSON and centralized logs with secrets redacted.
- If worker readiness fails, check process role, database connectivity, queue settings, scanner/storage health, and internal health port routing.
- If browser smoke fails, distinguish app failure from missing Chromium or local sandbox restrictions.
- If restore drill fails, do not approve pilot. Preserve evidence, identify whether failure is database, object storage, lineage, or routing related, and repeat only after remediation.
- Roll back staging deployments by redeploying the previous known-good release and restoring the previous secure environment configuration from the deployment platform, not from local untracked files.
