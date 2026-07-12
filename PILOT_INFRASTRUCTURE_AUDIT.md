# Ergon Pilot Infrastructure Audit

## Scope

Phase 15 validates the current Ergon pilot-infrastructure readiness after Phase 14 data-lifecycle hardening. This audit inspected existing source, documentation, validator design, local environment readiness, CI evidence, and local verification results.

No cloud infrastructure was provisioned. No databases, buckets, scanner services, deployments, billing settings, real `.env` files, secrets, or production customer data were created or used.

## Current source baseline

| Item | Evidence |
| ---- | -------- |
| Repository path | `/Users/harshparmar/Desktop/Projects/ComplainceIQ` |
| Remote | `git@github.com:ParmarHarsh/ComplianceIQ.git` at the time of this historical audit; Phase 20 defers repository rename to a manual post-merge action. |
| Starting branch | `main` after `git pull --ff-only origin main` |
| Phase 15 branch | `phase-15-pilot-infrastructure-validation` |
| Phase 14 merge commit on `main` | `d27adc0ccbe7b883eba0039a7d37f9f85cb8ec74` |
| Phase 14 implementation commit | `5261e7586d2985bd9acd072f80a66991c3ad2be1` |
| Phase 14C browser-smoke correction commit | `1399132125e365a02e6d6aec235e490235fc9498` |
| Phase 14 migration | `packages/db/migrations/0006_data_lifecycle_hardening.sql` present |
| Phase 14C smoke behavior | `tests/e2e/pilot-smoke.spec.js` distinguishes active evidence from archived evidence |
| Phase 14 CI evidence | GitHub Actions run `29097164567` for commit `1399132125e365a02e6d6aec235e490235fc9498` completed successfully |

Phase 14 source evidence includes legal holds, retention enforcement, failed private-object deletion retry, safe metadata restore/unarchive behavior, lifecycle audit fields, and reviewer/admin `includeArchived` visibility.

## Validator safety review

| Validator | Required variables | Safety gates | Isolation and cleanup | Secret-output review | Safety finding |
| --------- | ------------------ | ------------ | --------------------- | -------------------- | -------------- |
| Postgres | `TEST_DATABASE_URL` or `STAGING_DATABASE_URL` | Refuses `VALIDATION_TARGET=production` unless `ALLOW_PRODUCTION_VALIDATION=true` | Creates a random isolated schema, applies migrations, verifies persistence/tenant isolation/queue/lifecycle data, then drops the schema | Does not print the database URL | Safe to run only against disposable/staging Postgres where schema create/drop is authorized |
| Private storage | `TEST_S3_BUCKET`, `TEST_S3_REGION`, `TEST_S3_ACCESS_KEY_ID`, `TEST_S3_SECRET_ACCESS_KEY`; optional endpoint/path-style | Refuses `VALIDATION_TARGET=production` unless `ALLOW_PRODUCTION_VALIDATION=true` | Uploads an opaque private test object, verifies adapter reads, signed expiry, public denial, route scoping, delete, and post-delete absence | Does not print access key or secret; object key is opaque | Safe to run only against a test/staging bucket with no customer evidence |
| Malware scanner | `MALWARE_SCAN_ENABLED=true`, `MALWARE_SCANNER_PROVIDER=clamav`, `CLAMAV_HOST`; optional port/timeout/EICAR | Requires explicit ClamAV config; live EICAR suspicious-path validation is opt-in with `SCANNER_VALIDATE_EICAR=true` | Uses a clean live sample; suspicious path is simulated unless EICAR is explicitly approved; checks timeout and fail-closed behavior | Does not print scanner secrets or connection strings | Safe to run only from an approved scanner test/deployment network |

No validator source defect was found. No validator code was changed.

## Environment readiness summary

Safe presence checks found all live validation variables absent in the local shell:

| Validator | Required variables present? | Safe target confirmed? | Runnable now? | Classification |
| --------- | --------------------------- | ---------------------- | ------------- | -------------- |
| Postgres | No | Unknown | No | `BLOCKED_BY_MISSING_SAFE_CONFIGURATION` |
| Storage | No | Unknown | No | `BLOCKED_BY_MISSING_SAFE_CONFIGURATION` |
| Scanner | No | Unknown | No | `BLOCKED_BY_MISSING_SAFE_CONFIGURATION` |

`VALIDATION_TARGET` and `ALLOW_PRODUCTION_VALIDATION` were also absent. No production target was detected or used.

## PostgreSQL validation

Status: `BLOCKED_BY_MISSING_SAFE_CONFIGURATION`

Result:

- Local command: `npm run validate:postgres`
- Output classification: skipped by validator design because `TEST_DATABASE_URL` or `STAGING_DATABASE_URL` was not configured.
- GitHub Phase 14C CI job: `postgres-validation` succeeded overall, with live PostgreSQL validation skipped because `TEST_DATABASE_URL` was not configured.

What is already validator-covered when safe configuration exists:

- tracked migration application;
- repository restart persistence;
- organization, user, facility, evidence, AI lineage, review, gap, action, packet, and audit-log persistence;
- tenant-isolation checks;
- queue claim/completion path;
- isolated schema cleanup.

What remains unproven:

- managed/staging PostgreSQL connectivity, permissions, TLS/network policy, backup configuration, PITR, and restore behavior.

## Private storage validation

Status: `BLOCKED_BY_MISSING_SAFE_CONFIGURATION`

Result:

- Local command: `npm run validate:storage`
- Output classification: skipped by validator design because required `TEST_S3_*` variables were not configured.
- GitHub Phase 14C CI job: `storage-validation` succeeded overall, with live storage validation skipped because required `TEST_S3_*` secrets were not configured.

What is already validator-covered when safe configuration exists:

- opaque private object upload;
- adapter retrieval;
- bounded signed URL behavior;
- direct public-read denial;
- tenant route scoping through API tests;
- delete and post-delete absence.

What remains unproven:

- real private S3-compatible bucket policy, encryption/KMS posture, public-access block, object versioning/backup, lifecycle policy, and restore behavior.

## Malware scanner validation

Status: `BLOCKED_BY_MISSING_SAFE_CONFIGURATION`

Result:

- Local command: `npm run validate:scanner`
- Output classification: skipped by validator design because ClamAV provider variables and `CLAMAV_HOST` were not configured.
- GitHub Phase 14C CI job: `scanner-validation` succeeded overall, with live scanner validation skipped because `CLAMAV_HOST` was not configured.

What is already validator-covered when safe configuration exists:

- clean sample classification by a live ClamAV-compatible service;
- suspicious blocking path by simulation unless EICAR is explicitly approved;
- timeout handling;
- fail-closed download/processing behavior.

What remains unproven:

- deployed scanner reachability, signature freshness, capacity, network restrictions, alerting, unavailable behavior from the deployment network, and optional live EICAR behavior.

## Browser smoke result

Local result: blocked by missing local Playwright Chromium after localhost server permission was allowed.

Details:

- First local run: blocked by macOS/sandbox localhost bind error, `listen EPERM: operation not permitted 127.0.0.1:4100`.
- Escalated local run: API and web servers started, then Playwright failed because Chromium executable was missing at `/Users/harshparmar/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
- No product code was changed.

GitHub Actions result:

- Phase 14C workflow run `29097164567` completed successfully.
- `browser-smoke` job succeeded, including `npx playwright install --with-deps chromium` and `npm run qa:pilot`.

Phase 14C behavior:

- Validated in CI on commit `1399132125e365a02e6d6aec235e490235fc9498`.
- Confirmed by source inspection: the smoke test asserts absence from active evidence and presence in the `Archived evidence` section.

## API and worker readiness

Status: implemented and locally tested for process-role semantics.

Evidence:

- `PROCESS_ROLE=api` starts API behavior without a worker scheduler.
- `PROCESS_ROLE=worker` starts worker health/readiness/metrics on the worker health port.
- `PROCESS_ROLE=api-and-worker` is limited to local development by config validation.
- Secure deployment profiles reject `api-and-worker` and require separate explicit process roles.
- `tests/process-role.test.js` passed inside `npm test`.

Closed-pilot requirement:

- Deploy separate API and worker process groups using the same release and migrated PostgreSQL database.

## Health/readiness semantics

Status: code-implemented and locally tested; target deployment health is not proven.

Implemented endpoints:

- API `/health/live`;
- API `/health/ready`;
- API `/health`;
- API `/api/health`;
- worker `/health/live`;
- worker `/health/ready`;
- worker `/metrics`.

Readiness covers:

- repository/persistence health;
- private storage health;
- malware scanner health;
- queue health and worker-running expectations;
- loaded config status.

Local tests cover readiness success/failure and role-specific queue expectations. Deployment load balancer, network, TLS, ingress forwarding, and external dependency health have not been checked against a real target.

## Ingress/proxy/CORS/TLS readiness

| Gate | Status | Evidence | Remaining target validation |
| ---- | ------ | -------- | --------------------------- |
| HTTPS origins | `IMPLEMENTED_AND_TESTED_IN_APP` | Secure profiles require HTTPS `APP_URL` and HTTPS `ALLOWED_ORIGINS` | Verify real web/API origins and certificates |
| CORS allowlist | `IMPLEMENTED_AND_TESTED_IN_APP` | Wildcard origins rejected in secure profiles; unsafe origins rejected for mutating requests | Verify deployed frontend origin is the only allowed production origin |
| Secure cookies | `IMPLEMENTED_AND_TESTED_IN_APP` | Production cookies are `Secure`, `HttpOnly`, and SameSite-configurable | Verify browser behavior behind final ingress |
| HSTS | `IMPLEMENTED_AND_TESTED_IN_APP` | API sets HSTS in production | Verify TLS termination and response headers through ingress |
| CSP and security headers | `IMPLEMENTED_AND_TESTED_IN_APP` | CSP, nosniff, referrer, permissions, and frame protections are set | Verify final frontend/API header behavior |
| Trusted proxy | `REQUIRES_TARGET_DEPLOYMENT_VALIDATION` | `TRUST_PROXY` is explicit and documented | Verify ingress overwrites forwarding headers before enabling |
| TLS termination | `BLOCKED_BY_NO_DEPLOYMENT` | No deployed target inspected in this phase | Validate certificates, redirects, HSTS, and proxy behavior in staging |

## Backup and restore readiness

Status: `RESTORE_NOT_PROVEN`

Data requiring backup:

- PostgreSQL customer-owned rows;
- users, sessions where policy requires recovery, facilities, evidence metadata, reviews, gap rows, findings, action items, packets, expert reviews, audit logs;
- AI analysis lineage and processing jobs;
- private evidence objects;
- generated packet PDFs;
- operational logs where required by incident/audit policy.

Current evidence:

- Documentation requires managed PostgreSQL backups/PITR or scheduled encrypted backups.
- Documentation requires object-storage versioning/replication or equivalent backup behavior.
- Documentation states Ergon does not automate backup orchestration.
- No provider backup evidence, PITR evidence, object-versioning evidence, or completed restore-drill record exists in the repository or local environment.

## Recovery exercise result

Status: `RESTORE_NOT_PROVEN`

No recovery exercise was performed because the required prerequisites were missing:

- no disposable/staging PostgreSQL target was configured;
- no disposable/staging object-storage target was configured;
- no backup/export/snapshot tooling or provider backup evidence was available to exercise;
- no safe restore target was available;
- no credentials were present.

This is not an application failure, but it is a pilot blocker. Backup/restore cannot be called proven until a real isolated restore exercise validates restored database rows and matching private object references.

## Monitoring and alerting readiness

Statuses: `SIGNALS_IMPLEMENTED`, `COLLECTION_NOT_PROVEN`, `ALERTING_NOT_PROVEN`, `ESCALATION_NOT_ASSIGNED`

Available signals:

- structured newline-delimited operational logs with request IDs, routes, status codes, correlation IDs, safe facility/evidence/job identifiers, queue events, and redaction of secrets/raw document fields;
- health/readiness endpoints for API and worker;
- worker `/metrics`;
- login rate-limiting events;
- queue retries and dead-letter states;
- scanner failure/unavailable states;
- storage deletion failure fields;
- readiness failure responses.

Not proven:

- centralized log collection;
- retention policy for operational logs;
- alert rules;
- notification channels;
- named escalation owner/support contact;
- monitoring of scanner signatures/capacity, dead-letter growth, readiness failures, repeated throttling, and storage deletion failures.

## Secret rotation readiness

Statuses: `NOT_DOCUMENTED`, `NOT_EXERCISED`

Secrets that need rotation procedures:

- `SESSION_SECRET`;
- database credentials;
- S3-compatible storage credentials or workload identity;
- OpenAI API key when AI is enabled;
- SMTP credentials when email is enabled;
- scanner credentials if the chosen scanner deployment uses authentication;
- initial provisioning secrets such as `PROVISION_*`, which are documented as one-time and should be removed after use.

Current evidence:

- Docs say secrets should be held in deployment environment or a secret manager.
- Docs mention secret rotation as still required.
- No step-by-step rotation procedure or exercise evidence was found.

## Pilot decision matrix

| Gate | Status | Evidence | Blocker? | Required next action |
| ---- | ------ | -------- | -------- | -------------------- |
| Phase 14 merged | `PASSED` | `main` includes merge commit `d27adc0`, migration `0006`, and lifecycle source | No | None |
| General CI | `PASSED` | GitHub Actions run `29097164567` `validate` job succeeded for Phase 14C commit | No | Re-run on Phase 15 PR after push |
| Browser smoke | `PASSED_IN_GITHUB_ACTIONS`; local blocked | CI `browser-smoke` succeeded; local missing Chromium | No for source; yes for this workstation | Use GitHub Actions as source of truth or install Playwright Chromium locally |
| Postgres validation | `BLOCKED_BY_MISSING_SAFE_CONFIGURATION` | Local validator skipped; CI live job skipped because secret absent | Yes | Provide disposable/staging Postgres and run validator |
| Storage validation | `BLOCKED_BY_MISSING_SAFE_CONFIGURATION` | Local validator skipped; CI live job skipped because secrets absent | Yes | Provide private test/staging bucket and run validator |
| Scanner validation | `BLOCKED_BY_MISSING_SAFE_CONFIGURATION` | Local validator skipped; CI live job skipped because `CLAMAV_HOST` absent | Yes | Provide approved ClamAV-compatible service and run validator |
| API/worker process split | `PASSED_LOCAL_CODE_TEST` | Config rejects `api-and-worker` outside local; process-role test passed | No | Validate deployed API and worker groups in staging |
| Health/readiness | `PASSED_LOCAL_CODE_TEST` | Endpoints implemented and tested; readiness checks dependencies | Yes for pilot | Validate through target ingress/internal worker network |
| Ingress/proxy | `REQUIRES_TARGET_DEPLOYMENT_VALIDATION` | App-level CORS/TLS/header gates exist | Yes | Validate real HTTPS ingress, trusted proxy, cookies, and origins |
| Backup capability | `BLOCKED_BY_MISSING_BACKUP_EVIDENCE` | Docs require backups/PITR/object backup; no provider evidence | Yes | Configure and document provider backup/PITR/object backup |
| Restore exercise | `RESTORE_NOT_PROVEN` | No safe targets/tooling/evidence available | Yes | Restore into isolated environment and verify DB/object consistency |
| Monitoring/alerting | `SIGNALS_IMPLEMENTED`, `COLLECTION_NOT_PROVEN`, `ALERTING_NOT_PROVEN`, `ESCALATION_NOT_ASSIGNED` | Logs, metrics, health, dead-letter/status signals exist | Yes | Configure collection, alerts, and named owners |
| Secret rotation | `NOT_DOCUMENTED`, `NOT_EXERCISED` | Docs say rotation is required; no procedure or drill found | Yes | Document and exercise rotation for all pilot secrets |
| Pilot owner/support escalation | `ESCALATION_NOT_ASSIGNED` | Checklist requires support contact; no named owner found | Yes | Assign pilot owner, support contact, and incident path |
| Regulatory rule disclaimer/human review | `IMPLEMENTED_WITH_LIMITATIONS` | README and readiness docs disclaim legal advice; AI suggestions require human review; rules remain demo/unverified | No for closed test; yes for commercial reliance | Keep scope narrow and complete expert rule review before reliance |

## Hard blockers

- Real disposable/staging PostgreSQL validation has not run.
- Real private S3-compatible storage validation has not run.
- Real ClamAV-compatible scanner validation has not run.
- Backup/PITR/object-backup evidence is missing.
- Restore has not been exercised in an isolated environment.
- Deployed ingress/proxy/TLS/CORS behavior has not been validated.
- Monitoring collection, alerting, and escalation ownership are not proven.
- Secret rotation is not documented or exercised.

## Non-blocking limitations

- Local browser smoke is blocked by missing Playwright Chromium, while GitHub Actions browser smoke passed for Phase 14C.
- OCR, account recovery, MFA, external queueing, autonomous retention scheduling, object-lock/WORM, and broader regulatory expert review remain future work.
- Starter rules remain demo/unverified unless separately expert-reviewed.
- Node local verification used `v24.4.0`; CI uses Node 20.

## Expert pilot go/no-go decision

Decision:
`NO_GO`

Confidence:
`High`

Why:

1. The application source baseline is strong: Phase 14 is merged, CI passed on the Phase 14C release commit, local lint/typecheck/tests/build/audits/scans pass, and role/readiness code is implemented.
2. The core external pilot dependencies are not validated: Postgres, private storage, scanner, ingress, backup/restore, monitoring, escalation, and secret rotation remain unproven.
3. A controlled pilot with real evidence must not proceed until the missing external evidence exists; local file-backed tests and skipped validators cannot prove deployment readiness.

Hard blockers:

- Live Postgres, storage, and scanner validators are blocked by missing safe configuration.
- Backup and restore are not proven.
- Ingress/proxy/TLS/CORS target behavior is not validated.
- Monitoring/alerting/escalation are not proven.
- Secret rotation is not documented or exercised.

Non-blocking limitations:

- Local browser smoke cannot launch without the Playwright Chromium asset, but GitHub Actions browser smoke passed on the Phase 14C commit.
- Future product gaps remain outside this infrastructure-validation phase.

Minimum actions before pilot:

1. Provision or identify safe disposable/staging Postgres, private S3-compatible storage, and ClamAV-compatible scanner configuration, then run the existing validators without exposing secrets.
2. Complete a real backup and restore drill into an isolated environment, including database rows and matching private objects.
3. Validate deployed API/worker health, ingress/proxy/TLS/CORS behavior, monitoring/alerting, escalation ownership, and secret rotation.

Recommended next phase:
`Phase 16 - Safe Staging Infrastructure Provisioning, External Validator Execution, and Restore Drill`

## Recommended next phase

`Phase 16 - Safe Staging Infrastructure Provisioning, External Validator Execution, and Restore Drill`

## Phase 16 staging infrastructure runbook follow-up

- Created `STAGING_INFRASTRUCTURE_RUNBOOK.md`.
- No infrastructure was provisioned.
- No secrets were added or exposed.
- The Phase 15 `NO_GO` decision remains in effect until:
  - safe staging Postgres is configured and validated,
  - safe private storage is configured and validated,
  - safe ClamAV scanner is configured and validated,
  - ingress/proxy/TLS/CORS are validated,
  - backup/restore drill is completed,
  - monitoring/alerting/escalation are assigned and tested,
  - secret rotation procedure is exercised.
