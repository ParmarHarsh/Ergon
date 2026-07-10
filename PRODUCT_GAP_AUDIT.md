# ComplianceIQ Product-Gap Audit

## Audit scope

Phase 13 audited ComplianceIQ after the Phase 12 merge to compare normalized documentation claims with actual API, web UI, persistence, migrations, security controls, tests, CI, deployment validators, and pilot-readiness requirements.

Phase 14 implementation update: the lifecycle rows in the original Phase 13 baseline have now been acted on in source. ComplianceIQ includes additive legal-hold, explicit retention enforcement, failed private-object deletion retry, and safe metadata restore workflows for evidence and audit packets. Storage-provider WORM/object-lock policy, autonomous external lifecycle scheduling, target backup/restore execution, and production OCR remain outside this implementation.

The Phase 13 audit was audit-only. Phase 14 changed runtime behavior, added an additive migration, and added tests/docs without changing dependencies or provisioning external infrastructure.

Evidence reviewed included `README.md`, `DEPLOYMENT_READINESS.md`, `PILOT_READINESS.md`, `PILOT_DATA_POLICY.md`, `PROJECT_AUDIT.md`, `package.json`, `.github/workflows/ci.yml`, `apps/api/src/*`, `apps/web/src/*`, `packages/config/src/index.js`, `packages/ai/src/*`, `packages/db/src/*`, `packages/db/migrations/*.sql`, `packages/rules/src/index.js`, `packages/pdf/src/index.js`, `scripts/validate-*.mjs`, `deploy/env/*.env.example`, and `tests/**`.

## Current verified baseline

- `origin` is `git@github.com:ParmarHarsh/ComplianceIQ.git`.
- `PROJECT_AUDIT.md` contains `## Phase 12 documentation and configuration normalization note`.
- Normalized Phase 12 files are present: `README.md`, `DEPLOYMENT_READINESS.md`, `PILOT_READINESS.md`, `deploy/env/local.env.example`, `deploy/env/staging.env.example`, and `deploy/env/closed-pilot.env.example`.
- CI is defined in `.github/workflows/ci.yml` for Node 20 validation, browser smoke QA, and conditional Postgres/S3/scanner validation jobs.
- Runtime source was not changed by this audit.

## Capability inventory

| Area | Capability | Status | Evidence |
| --- | --- | --- | --- |
| Identity/access | Login, logout, signed persistent sessions, password hashing | `IMPLEMENTED_AND_TESTED` | `apps/api/src/server.js`, `apps/api/src/security.js`, `tests/api.test.js`, `tests/repository.test.js`. |
| Identity/access | Login throttling | `IMPLEMENTED_AND_TESTED` | `apps/api/src/rate-limit.js`, `tests/admin-users.test.js`. |
| Identity/access | User creation/update/deactivation and role enforcement | `IMPLEMENTED_AND_TESTED` | Admin API/UI and `tests/admin-users.test.js`. |
| Identity/access | Account recovery/password reset | `IMPLEMENTED_AND_TESTED_WITH_FAKE_TRANSPORT` | Secure reset-token lifecycle, reset routes, SMTP delivery adapter, failed-delivery invalidation, repository support, UI, tests, and docs exist; live external SMTP validation is still pending. |
| Identity/access | MFA | `NOT_IMPLEMENTED` | No MFA enrollment, challenge, recovery code, TOTP, or WebAuthn implementation found. |
| Tenant isolation | Organization scoping, API authorization, repository isolation, cross-org behavior | `IMPLEMENTED_AND_TESTED` | Scoped repositories and 401/403 tests in `tests/api.test.js`, `tests/repository.test.js`, `tests/postgres-repository.test.js`. |
| Tenant isolation | Audit logging | `IMPLEMENTED_AND_TESTED` | `repo.logAudit` calls and assertions in API, provisioning, seed, and Postgres tests. |
| Facilities/rules | Facility CRUD, rules-pack selection, applicable rules | `IMPLEMENTED_AND_TESTED` | `apps/api/src/server.js`, `packages/rules/src/index.js`, `tests/rules.test.js`, repository tests. |
| Facilities/rules | Jurisdiction coverage | `PARTIAL_FOUNDATION` | US/CA/MX packs exist, but all are starter demo packs. |
| Facilities/rules | Rule depth and validation | `EXPERT_CONTENT_REVIEW_REQUIRED` | 3 packs, 28 rules, 0 expert-reviewed packs/rules in `packages/rules/src/index.js`. |
| Evidence intake | Metadata evidence, upload, file type validation, MIME/signature validation, archive rejection | `IMPLEMENTED_AND_TESTED` | `apps/api/src/file-validation.js`, `tests/file-validation.test.js`, `tests/api.test.js`. |
| Evidence intake | Upload size protection | `IMPLEMENTED_PARTIALLY_TESTED` | Config and validation exist; direct oversized-path coverage is limited. |
| Evidence intake | Private storage and protected downloads | `IMPLEMENTED_AND_TESTED` | `apps/api/src/storage.js`, authenticated download routes, `tests/storage.test.js`, `tests/api.test.js`. |
| Malware scanning | Mock scanner, ClamAV adapter, suspicious-file blocking, fail-open/fail-closed policy | `IMPLEMENTED_AND_TESTED` | `apps/api/src/malware-scanner.js`, `packages/config/src/index.js`, `tests/processing.test.js`, `tests/config.test.js`. |
| Malware scanning | Target scanner validation | `EXTERNAL_INFRASTRUCTURE_REQUIRED` | `scripts/validate-scanner.mjs` exists but requires deployed ClamAV-compatible infrastructure. |
| AI evidence intelligence | Text extraction, PDF extraction, mock/OpenAI provider boundary, schema validation, versioning, human review, overrides | `IMPLEMENTED_AND_TESTED` | `packages/ai/src/*`, `apps/api/src/evidence-ai-service.js`, `tests/ai.test.js`, `tests/processing.test.js`, `tests/api.test.js`. |
| AI evidence intelligence | OpenAI live validation | `NEEDS_MORE_EVIDENCE` | Provider exists, but no live OpenAI integration is run in the self-contained suite. |
| AI evidence intelligence | Image/scanned-PDF handling and OCR interface | `PARTIAL_FOUNDATION` | `ocr_required` state and unavailable/mock OCR provider exist. |
| AI evidence intelligence | Production OCR engine | `NOT_IMPLEMENTED` | Docs and code confirm no production OCR engine is bundled. |
| Queue/worker | Persistent jobs, claiming, leases, heartbeats, retry, dead-letter, stale recovery | `IMPLEMENTED_AND_TESTED` | `apps/api/src/processing-queue.js`, `packages/db/src/postgres-repository.js`, `tests/processing.test.js`. |
| Queue/worker | Separate API/worker deployment | `IMPLEMENTED_AND_TESTED` | `PROCESS_ROLE` validation and `tests/process-role.test.js`. |
| Queue/worker | External queue/scheduler | `NOT_IMPLEMENTED` | `QUEUE_BACKEND` currently supports `local` only. |
| Audit workflow | Evidence review, gap matrix, score, action plan, packet PDF, audit logs | `IMPLEMENTED_AND_TESTED` | `apps/web/src/views/*`, `packages/rules`, `packages/pdf`, API/e2e tests. |
| Audit workflow | Expert review workflow | `IMPLEMENTED_PARTIALLY_TESTED` | API/UI exists; coverage is lighter than evidence and packet paths. |
| Retention/deletion | Archive metadata and object deletion | `IMPLEMENTED_AND_TESTED` | Evidence/packet archive routes and API tests. |
| Retention/deletion | Deletion failure state and retry | `IMPLEMENTED_AND_TESTED` | Failed deletion state, retry routes, repository guards, and API/repository tests were added in Phase 14. |
| Retention/deletion | Retention date and explicit enforcement | `IMPLEMENTED_AND_TESTED` | `retention_until` plus admin/reviewer retention enforcement that skips legal holds. Autonomous external scheduling remains future work. |
| Retention/deletion | Legal holds and safe metadata restore workflow | `IMPLEMENTED_AND_TESTED` | Additive schema/API/UI/repository support exists for evidence and audit packets; restore is blocked after private-object deletion. |
| Retention/deletion | WORM/immutability | `EXTERNAL_INFRASTRUCTURE_REQUIRED` | Requires storage-provider policy; no app-level WORM guarantee. |
| Operational readiness | Health/readiness endpoints, worker metrics, structured logging | `IMPLEMENTED_AND_TESTED` | `apps/api/src/server.js`, `apps/api/src/operational-logger.js`, process-role/logger tests. |
| Operational readiness | Production monitoring/alerting | `EXTERNAL_INFRASTRUCTURE_REQUIRED` | Logs/metrics exist; no collector or alert rules are configured in repo. |
| Operational readiness | Backup orchestration, restore exercise, incident response, secret rotation | `OPERATIONAL_PROCEDURE_REQUIRED` | Checklists exist; target execution/runbooks are still required. |
| Infrastructure validation | Postgres validator | `EXTERNAL_INFRASTRUCTURE_REQUIRED` | `scripts/validate-postgres.mjs`; skipped without target DB env vars. |
| Infrastructure validation | S3 validator | `EXTERNAL_INFRASTRUCTURE_REQUIRED` | `scripts/validate-storage.mjs`; skipped without `TEST_S3_*`. |
| Infrastructure validation | Scanner validator | `EXTERNAL_INFRASTRUCTURE_REQUIRED` | `scripts/validate-scanner.mjs`; skipped without ClamAV env. |
| Infrastructure validation | Playwright pilot QA and Node 20 CI | `IMPLEMENTED_AND_TESTED` | `tests/e2e/pilot-smoke.spec.js`, `.github/workflows/ci.yml`. |

Capability inventory counts:

- implemented and tested: 45
- implemented but partially tested: 5
- implemented untested: 0
- partial foundations: 5
- not implemented: 7
- external infrastructure required: 8
- operational procedure required: 4
- expert content review required: 1
- needs more evidence: 1

## Documented-gap verification

| Gap | Verification | Product gap? | Infrastructure gap? | Procedure/content? | Required for controlled pilot? | Required before public production? | Schema change? | Dependency change? | External infrastructure? | Approval needed? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Production OCR engine | Confirmed; only unavailable/mock OCR exists in `packages/ai/src/ocr.js`. | Yes | Possibly | No | No, if OCR-required files go to manual review or are excluded. | Yes | No/Possibly | Yes likely | Possibly | Yes |
| Account recovery/password reset | Secure token lifecycle, reset routes, SMTP delivery adapter, repository support, UI, and tests exist; live external SMTP validation is pending. | Mostly resolved in source | SMTP/email validation | No | Important but manageable with named admin support. | Yes | Added in 0007 | Nodemailer added in Phase 18 | SMTP/email | Yes |
| Scheduled retention enforcement | Confirmed; `retention_until` exists but no scheduler. | Yes | No | Policy input needed | Yes if date-based retention is promised. | Yes | Possibly | No | No | Yes |
| Legal holds | Confirmed; no schema/API/UI/enforcement. | Yes | No | Policy input needed | Important; pilot policy should exclude held data until implemented. | Yes | Yes, additive expected | No | No | Yes |
| Automated deletion retry worker | Confirmed; failure state exists but no retry worker. | Yes | No | No | Important because failed deletion is manual today. | Yes | Possibly | No | No | Yes |
| Restore UI/workflow | Confirmed; archive metadata exists but no restore route/UI. | Yes | Possibly | Policy input needed | Not a blocker if deletion is restricted/operator-mediated. | Yes | Possibly | No | Possibly backups/object versioning | Yes |
| Real PostgreSQL validation | Code exists; target run is pending. | No | Yes | No | Yes | Yes | No | No | Yes | Yes |
| Real S3 validation | Code exists; target run is pending. | No | Yes | No | Yes | Yes | No | No | Yes | Yes |
| Real ClamAV validation | Code exists; target run is pending. | No | Yes | No | Yes | Yes | No | No | Yes | Yes |
| Backup/restore exercise | Confirmed procedural/infrastructure gap. | No | Yes | Yes | Yes | Yes | No | No | Yes | Yes |
| Production monitoring and alerting | Confirmed external/procedural gap. | No | Yes | Yes | Yes | Yes | No expected | Possibly | Yes | Yes |
| Repeated login-throttling alerting | Confirmed; throttling exists, alerting does not. | No | Yes | Yes | Yes, as monitoring baseline. | Yes | No | No | Yes | Yes |
| Secret rotation procedure | Confirmed; no rotation procedure/exercise found. | No | Yes | Yes | Yes | Yes | No | No | Secret manager | Yes |
| Ingress/proxy verification | Confirmed target-deployment gap. | No | Yes | Yes | Yes | Yes | No | No | Yes | Yes |
| External queue/scheduler | Confirmed future architecture gap; durable local scheduler exists. | Future | Yes | No | No for small monitored pilot. | Preferable before scale. | Possibly | Yes likely | Yes | Yes |
| AI budget controls | Confirmed; no usage/cost caps found. | Yes | Possibly | Budget policy needed | Manageable if AI disabled or manually governed. | Yes if AI enabled broadly. | Possibly | Possibly | AI billing | Yes |
| Rule-pack expert/legal/EHS review | Confirmed; all rules are demo/unverified. | No | No | Expert content | Only with clear disclaimers/human review. | Yes | No expected | No | External reviewer | Yes |
| DOCX/Office support | Confirmed intentional limitation; Office ZIP containers are rejected. | Future | No | No | No | Useful later | No expected | Yes likely | No | Yes |
| Multi-factor authentication | Confirmed newly documented identity gap. | Yes | Possibly | No | Recommended but not necessarily a small-pilot blocker. | Yes | Yes, additive expected | Possibly | Optional | Yes |

Items rejected as stale or false source gaps:

- Real Postgres, S3, and ClamAV support are not missing source code. Adapters/validators exist; target infrastructure and approved validation runs are missing.
- Queue durability is not missing. Jobs, leases, heartbeats, stale recovery, retries, dead-letter state, and split API/worker mode are implemented and tested.
- S3-compatible private storage is not missing. Bucket policy, KMS, lifecycle, and validation are deployment responsibilities.
- ClamAV-compatible scanning transport is not missing. Daemon provisioning, signatures, capacity, network policy, and alerting are deployment responsibilities.

## Newly discovered gaps

- MFA is absent.
- Expert-review workflow tests are lighter than evidence, AI, and packet workflow tests.
- Worker `/metrics` exists, but no deployed scrape/alert integration is represented in the repo.
- Phase 14 reconciled `dead_letter` in shared processing status validation.

## UI-to-API completeness

| View | UI present | API present | Persistence present | Test evidence | Pilot result |
| --- | --- | --- | --- | --- | --- |
| Packet Builder | Yes | Yes | Yes | Playwright pilot smoke | Complete enough. |
| Facilities | Yes | Yes | Yes | API/repository/e2e tests | Complete enough. |
| Evidence | Yes | Yes | Yes | API/file/storage/e2e tests | Complete for supported file types. |
| Review Queue | Yes | Yes | Yes | Processing/e2e tests | Complete enough for reviewer/admin users. |
| Gap Matrix | Yes | Yes | Yes | Rules/repository/API/e2e tests | Complete enough. |
| Action Plan | Yes | Yes | Yes | Rules/repository/e2e tests | Complete enough. |
| Audit Packets | Yes | Yes | Yes | PDF/API/e2e tests | Complete enough. |
| Expert Review | Yes | Yes | Yes | Lighter coverage | Usable, should gain deeper tests. |
| Admin | Yes | Yes | Yes | Admin tests | Complete except MFA and approved recovery delivery. |
| System status | Yes | Yes | Partly operational | Process-role/API tests | Good local visibility; external monitoring required. |

## Security-sensitive surface review

Implemented controls include authenticated routes, signed cookie sessions, session persistence, login throttling, CORS/origin checks for unsafe browser methods, tenant-scoped repositories, role gates, upload signature checks, archive/active-content rejection, private downloads, suspicious-file blocks, backend-only AI processing, schema validation, audit logs, and operational log redaction.

Confirmed security/identity gaps are MFA, live external SMTP validation for account recovery, repeated login-throttling alerting, and secret rotation procedure. This audit does not claim a vulnerability; it identifies missing controls or operational gaps supported by repository evidence.

## Database and migration implications

Existing migrations already cover organizations, users, sessions, facilities, rule packs, evidence, matches, reviews, findings, action items, packets, expert reviews, audit logs, AI analyses, processing jobs, scan metadata, immutable analysis lineage, deletion/retention fields, worker ownership, leases, heartbeats, and dead-letter state.

Top-gap schema implications:

- Legal holds: additive migration expected.
- Automated deletion retry: possibly additive fields or a deletion job table.
- Scheduled retention: existing `retention_until` may be enough for a first pass; policy-level controls may need additive schema.
- Restore workflow: possibly no schema for a minimal unarchive, but safer audit fields are likely.
- Account recovery: additive reset-token schema added in `0007_account_recovery`; SMTP adapter added in Phase 18; live external SMTP validation remains pending.
- MFA: additive MFA secret/device/recovery-code schema expected.
- AI budget controls: possible usage/accounting tables.
- Production OCR: likely no schema for a basic provider integration.

No destructive migration is required for the recommended next phase as scoped, but lifecycle behavior affects deletion/custody and therefore requires explicit approval.

## Regulatory-content gap separation

`packages/rules/src/index.js` contains 3 starter packs and 28 rules across US, Canada, and Mexico. All packs/rules are marked `demoContent: true`; 0 packs and 0 rules are marked expert-reviewed.

The software mechanics for selection, scoring, matrix generation, action plans, and packet generation are implemented and tested. The gap is regulatory content depth and qualified legal/EHS review. ComplianceIQ should not represent starter rules as legally authoritative. Controlled pilot use can proceed only with demo/unverified disclaimers and named human review; commercial reliance requires expert content review.

## Confirmed gap categories

- `PRODUCT_FEATURE`: production OCR, restore workflow, DOCX/Office support, external queue/scheduler, AI budget controls.
- `SECURITY_IDENTITY`: account recovery/password reset, MFA.
- `COMPLIANCE_DATA_LIFECYCLE`: legal holds, scheduled retention enforcement, automated deletion retry, restore workflow, WORM/immutability policy.
- `OPERATIONAL_OBSERVABILITY`: backup/restore exercise, monitoring/alerting, login-throttling alerts, secret rotation procedure, incident-response owner/process completion.
- `DEPLOYMENT_INFRASTRUCTURE`: target Postgres/S3/ClamAV validation, ingress/proxy verification, managed DB/storage/scanner provisioning.
- `REGULATORY_CONTENT`: demo/unverified rule packs require expert legal/EHS review and deeper jurisdiction coverage.
- `QUALITY_TESTING`: deletion failure-path coverage and deeper expert-review workflow tests.

## Ranked gap table

| Rank | Gap | Category | Evidence | Current status | Pilot impact | Security/data risk | Workflow impact | Complexity | External dependency | Priority score | Schema change? | Dependency change? | Explicit approval needed? |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | Backup/restore exercise not completed | `OPERATIONAL_OBSERVABILITY` | `PILOT_READINESS.md` requires restore proof; no target restore evidence in repo. | Procedural/infrastructure pending | 5 | 5 | 2 | 3 | 3 | 16 | No app schema | No | Yes |
| 2 | Legal holds absent | `COMPLIANCE_DATA_LIFECYCLE` | Phase 13 finding; Phase 14 added legal-hold schema/API/UI/enforcement. | Resolved in source; external operating policy still required | 4 | 5 | 3 | 4 | 1 | 16 | Added in 0006 | No | Yes |
| 3 | Target Postgres/S3/ClamAV/API/worker validation not run | `DEPLOYMENT_INFRASTRUCTURE` | Validators exist but require target services. | External validation pending | 5 | 4 | 3 | 3 | 3 | 15 | No | No | Yes |
| 4 | Ingress/proxy verification pending | `DEPLOYMENT_INFRASTRUCTURE` | Config supports proxy/CORS/HSTS; target ingress not proven. | External validation pending | 5 | 4 | 2 | 2 | 3 | 15 | No | No | Yes |
| 5 | Automated deletion retry workflow absent | `COMPLIANCE_DATA_LIFECYCLE` | Phase 13 finding; Phase 14 added explicit retry workflow. | Resolved for reviewer/admin workflow; autonomous worker remains future work | 4 | 5 | 3 | 3 | 1 | 15 | Added in 0006 | No | Yes |
| 6 | Secret rotation procedure absent | `OPERATIONAL_OBSERVABILITY` | Config validates secrets; no rotation runbook/exercise. | Procedure pending | 4 | 4 | 1 | 2 | 2 | 13 | No | No | Yes |
| 7 | Monitoring/alerting including login-throttle alerts not configured | `OPERATIONAL_OBSERVABILITY` | Logs/metrics exist; no collector/alert rules. | External/procedural pending | 4 | 4 | 2 | 3 | 3 | 12 | No expected | Possibly | Yes |
| 8 | Live external SMTP validation pending | `SECURITY_IDENTITY` | Reset-token lifecycle, API, UI, repository support, and SMTP adapter exist; approved staging SMTP has not been live-validated. | Source implementation complete with fake transport tests; external validation pending | 3 | 3 | 4 | 3 | 1 | 12 | Added in 0007 | Nodemailer added in Phase 18 | Yes |
| 9 | Scheduled retention enforcement absent | `COMPLIANCE_DATA_LIFECYCLE` | Phase 14 added explicit due-retention enforcement; external autonomous scheduling remains absent. | Partially resolved in source | 3 | 4 | 2 | 3 | 1 | 12 | Added in 0006 | No expected | Yes |
| 10 | MFA absent | `SECURITY_IDENTITY` | No MFA implementation found. | Not implemented | 3 | 4 | 2 | 4 | 1 | 11 | Yes, additive | Possibly | Yes |
| 11 | Restore UI/workflow absent | `COMPLIANCE_DATA_LIFECYCLE` | Phase 14 added safe metadata restore API/UI and blocks restore after private-object deletion. | Resolved in source for eligible records | 3 | 4 | 3 | 4 | 2 | 11 | Added in 0006 | No expected | Yes |
| 12 | Deletion failure and expert-review tests are thinner than core tests | `QUALITY_TESTING` | Coverage is lighter for those paths. | Coverage gap | 2 | 3 | 1 | 2 | 0 | 9 | No | No | No |
| 13 | Production OCR engine absent | `PRODUCT_FEATURE` | OCR interface/mock only. | Partial foundation | 3 | 2 | 4 | 4 | 2 | 8 | No/Possibly | Yes likely | Yes |
| 14 | Rule packs unverified/demo depth | `REGULATORY_CONTENT` | 3 packs/28 rules, all demo, 0 expert-reviewed. | Expert review required | 3 | 2 | 4 | 3 | 3 | 8 | No expected | No | Yes |
| 15 | AI budget controls absent | `PRODUCT_FEATURE` | No usage/cost caps found. | Not implemented | 2 | 2 | 2 | 2 | 1 | 7 | Possibly | Possibly | Yes |
| 16 | DOCX/Office ingestion unsupported | `PRODUCT_FEATURE` | Office ZIP containers intentionally rejected. | Not implemented by design | 2 | 1 | 3 | 4 | 1 | 4 | No expected | Yes likely | Yes |
| 17 | External queue/scheduler absent | `DEPLOYMENT_INFRASTRUCTURE` | `QUEUE_BACKEND` supports `local` only. | Future enhancement | 2 | 2 | 1 | 4 | 2 | 3 | Possibly | Yes likely | Yes |

## Hard blockers before controlled pilot

Hard blockers before handling minimized real pilot customer evidence:

1. Target-environment validation has not passed for PostgreSQL, private S3-compatible storage, ClamAV-compatible scanner, split API/worker, and full pilot smoke.
2. Backup/restore has not been exercised in an isolated environment that proves database rows and private objects can be reconstructed together.
3. Operational monitoring and escalation are not configured for readiness failure, scanner failure, dead-letter growth, repeated login throttling, and storage deletion failure.
4. Ingress/proxy behavior has not been verified through the target HTTPS deployment.

Not hard blockers for a tightly controlled pilot if acknowledged and mitigated: production OCR, live SMTP validation, external queue service, DOCX support, and broader rule-pack depth.

## Non-blocking future enhancements

- Production OCR engine.
- Live external SMTP validation for account-recovery delivery.
- DOCX/Office parsing with bounded, path-safe archive handling.
- External queue/scheduler.
- Richer frontend framework.
- AI budget and usage controls.
- Deeper expert-review workflow tests.
- Broader Canadian province, Mexican state, and deeper US jurisdiction content after qualified review.
- WORM/immutability controls through storage-provider policy.

## Expert next-phase decision

Recommended next implementation phase:
`Phase 14 - Compliance Data Lifecycle Hardening`

Confidence:
`High`

Why this comes first:

1. It addresses the highest-risk product gap that source code can reduce: safe custody, deletion, retention, legal holds, and failed deletion recovery.
2. Existing migrations already provide archive, deletion, storage deletion status, and retention foundations.
3. It reduces irreversible data-loss or improper-deletion risk before adding broader ingestion such as OCR or DOCX.
4. It aligns with pilot blockers around backup/restore, object lifecycle, and deletion escalation.

Why the other top gaps come later:

- `Target infrastructure validation` - mandatory before real pilot evidence, but it is deployment execution rather than source implementation.
- `Backup/restore exercise` - a hard blocker, but primarily operational/infrastructure work.
- `Approved account-recovery delivery/MFA` - important, but a small admin-supported pilot can mitigate identity support risk more easily than data custody risk.
- `Production OCR` - useful, but it expands sensitive processing before lifecycle controls are mature.
- `Rule-pack expert review` - essential for commercial reliance, but it is expert content work.

Expected scope:

- Add legal-hold model/API/UI and enforce it across evidence and packet deletion/retention.
- Add scheduled retention enforcement that respects legal holds and approved policies.
- Add deletion retry worker behavior for failed private-object deletion.
- Add restore/unarchive workflow only where file/object availability and audit rules make it safe.
- Add focused tests for destructive and failure-path behavior.

Likely files/packages affected:

- `apps/api/src/server.js`
- `apps/web/src/views/evidence.js`
- `apps/web/src/views/packets.js`
- `apps/web/src/views/system.js`
- `packages/db/src/file-repository.js`
- `packages/db/src/postgres-repository.js`
- `packages/db/migrations/*`
- `packages/shared/src/index.js`
- `tests/api.test.js`
- `tests/repository.test.js`
- `tests/postgres-repository.test.js`
- `tests/e2e/pilot-smoke.spec.js`

Database schema change expected:
`Yes`

Dependency change expected:
`No`

External infrastructure required:
`No` for source implementation; `Yes` for final staging validation against real storage/backups.

Explicit user approval required before execution:
`Yes`

Reason for approval requirement:

- The phase will add schema and behavior around destructive deletion, retention timing, legal holds, and restoration. Even additive migrations and fail-safe behavior should be explicitly approved because mistakes can affect customer evidence custody.

## Phased implementation roadmap

## Phase 17 account recovery follow-up

- Account recovery/password reset:
  - `PARTIAL_FOUNDATION`: secure token lifecycle, reset API, repository support, UI, audit logging, rate limiting, and session revocation are implemented in source; production self-service delivery still requires an approved sender integration.
- Reset tokens:
  - cryptographically generated with 32 random bytes;
  - raw token not stored;
  - hashed token persisted;
  - 30-minute expiry;
  - single-use with superseded-token invalidation.
- Account enumeration:
  - recovery request returns the same generic `202` response shape for existing, nonexistent, and disabled accounts.
- Session revocation:
  - successful reset revokes all existing sessions for the user.
- Production delivery:
  - `DELIVERY_ABSTRACTION_ONLY`; local/test inspection is gated by `RECOVERY_EXPOSE_TEST_TOKEN=true` and blocked for secure deployment profiles.
- MFA:
  - still not implemented.
- Pilot infrastructure decision:
  - `NO_GO` remains until external staging gates are proven.

## Phase 18 approved account recovery delivery follow-up

- Recovery token lifecycle:
  - Implemented and tested in Phase 17.
- SMTP delivery adapter:
  - `IMPLEMENTED_AND_TESTED_WITH_FAKE_TRANSPORT`.
- Production configuration:
  - `RECOVERY_DELIVERY_PROVIDER=smtp` uses existing `SMTP_*` variables and requires safe SMTP configuration.
- Safe external SMTP validation:
  - `NOT_RUN`; blocked until approved staging SMTP credentials exist.
- Public enumeration resistance:
  - Generic `202` response preserved for existing, nonexistent, disabled, SMTP-disabled, and SMTP-failed requests.
- Failed-delivery token invalidation:
  - Implemented; undelivered tokens are invalidated.
- Raw-token exposure:
  - No raw token persistence, production response exposure, or operational logging.
- MFA:
  - Not implemented.
- Pilot decision:
  - `NO_GO` remains until external staging gates are proven.

| Phase | Goal | Ordering reason | Affected areas | Schema impact | Dependency impact | External infrastructure | Approval requirement | Verification strategy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 14 - Compliance Data Lifecycle Hardening | Implement legal holds, retention enforcement, deletion retry, and safe restore rules. | Highest source-level data risk. | API, web, DB repositories, migrations, shared validation, tests. | Yes, additive expected. | No expected. | Not for coding; yes for staging validation. | Yes. | Unit/API/repository/Postgres/e2e tests plus storage failure simulations. |
| Phase 15 - Pilot Infrastructure Validation and Recovery Exercise | Run validators and backup/restore exercise against target staging. | Hard blocker before real pilot evidence. | Deployment env, validators, runbooks/docs. | No app schema. | No. | Yes: Postgres, S3, scanner, ingress, backups. | Yes. | `validate:postgres`, `validate:storage`, `validate:scanner`, `qa:pilot`, restore proof. |
| Phase 17 - Secure Account Recovery Hardening | Add secure account recovery/password reset without MFA. | Reduces lockout risk while preserving non-enumerating behavior and hash-only token storage. | API, web login, DB repositories, config, docs, tests. | Yes, additive `0007_account_recovery`. | No. | Delivery adapter completed in Phase 18; live SMTP validation pending. | Yes. | Auth/API/repository tests, reset-token expiry/reuse tests, migration tests. |
| Phase 18 - Approved Account Recovery Delivery | Add an approved sender integration for production recovery delivery. | Completes self-service recovery after secure token lifecycle is in place. | API delivery adapter, config, docs, tests. | No. | Yes: Nodemailer. | SMTP/email validation pending. | Yes. | Delivery contract tests, redaction tests, secure-profile config tests. |
| Phase 19 - Multi-Factor Authentication | Add MFA enrollment/challenge/recovery-code support. | Remaining source-controlled identity gap after account recovery delivery. | API, web auth/admin, DB repositories, tests, docs. | Yes, additive expected. | Possibly. | Optional authenticator app; no SMS. | Yes. | MFA enrollment/challenge/recovery tests and lockout/recovery-code tests. |
| Phase 20 - Operational Monitoring and Secret Rotation | Add or document alert hooks/runbooks for critical signals and rotation. | Needed before larger pilot operations. | Docs, deployment config examples, optional metrics/logging adapters. | No expected. | Possibly. | Monitoring/secret manager. | Yes. | Alert dry-runs, log redaction tests, readiness/metrics checks. |
| Phase 21 - Production OCR Integration | Add approved OCR provider for image/scanned PDF evidence. | Expands evidence coverage after custody controls. | AI package, API processing, config, tests. | Possibly no. | Yes likely. | OCR provider/service. | Yes. | OCR mocks, provider contract tests, manual-review fallbacks, cost/privacy review. |
| Phase 22 - Regulatory Content Review Pack | Expert-review and deepen starter rule packs. | Required before regulatory-content reliance. | `packages/rules`, docs, fixtures/tests. | No expected. | No. | External legal/EHS reviewer. | Yes. | Expert signoff, deterministic scoring tests, content diff review. |
| Phase 23 - AI Usage Budget Controls | Add usage/cost guardrails before broader AI use. | Needed if AI is enabled more broadly. | AI service, config, DB, admin/system UI. | Possibly yes. | Possibly. | AI billing/provider data. | Yes. | Quota tests, over-budget blocking, audit logs. |
| Phase 24 - Scale Queue and Document Format Expansion | Add external queue backend and safe DOCX/Office ingestion if still needed. | Scale and convenience after pilot safety risks are lower. | Queue adapter, config, worker, file validation/extraction. | Possibly. | Yes. | Queue service; parser security review. | Yes. | Concurrency/idempotency tests, archive-safety tests, load/back-pressure tests. |

## Assumptions and evidence limitations

- This audit used repository evidence and local code inspection. It did not run live cloud services, provision infrastructure, inspect actual bucket policies, inspect a real ingress, or perform a penetration test.
- Conditional integration tests for Postgres and S3 skip unless target test infrastructure is configured. Those skips are expected and do not prove product bugs.
- Rule-pack review in this audit is not legal advice. It only verifies repository metadata showing demo/unverified rule content.
- The audit intentionally did not implement features or change runtime behavior.
