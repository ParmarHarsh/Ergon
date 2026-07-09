# Phase 0 Project Audit - ComplianceIQ

Audit date: 2026-07-09

Scope: Read-first inspection of the local project at `/Users/harshparmar/Desktop/Projects/ComplainceIQ`. No source code, configuration, database schema, remote, or destructive cleanup was changed.

## A. Project summary

The main project appears to be **ComplianceIQ**, an industrial audit-readiness platform for manufacturers. It helps users manage facilities, evidence, AI-assisted evidence classification, jurisdiction rules, audit gap matrices, corrective actions, review queues, and audit packet exports.

Current maturity appears to be **substantial pilot-stage foundation**, not production-ready by itself. The root app has a custom Node.js API, a static browser SPA, database migrations, tests, deployment notes, security-oriented file intake, optional AI integration, S3-compatible storage support, and ClamAV scanner integration. The project still needs a clean Git/GitHub baseline, dependency installation, full verification, infrastructure validation, and cleanup decisions.

The folder also contains `02-new-rebuild`, which is a separate Next.js/TypeScript website rebuild for Royal Engitech. It does not appear to be part of the ComplianceIQ npm workspaces and should be treated as a separate project or confirmed reference folder before any cleanup.

## B. Tech stack

| Area | What was found |
| --- | --- |
| Main language | JavaScript ES modules |
| Frontend | Zero-dependency static SPA in `apps/web` |
| Backend | Custom Node.js HTTP API in `apps/api` |
| Package manager | npm, with root `package-lock.json` |
| Workspace layout | npm workspaces: `apps/*`, `packages/*` |
| Database/persistence | File repository for local/test; PostgreSQL repository and SQL migrations for staging/production |
| Authentication | Signed HTTP-only cookie sessions, password hashing, role checks |
| Styling/UI | Plain CSS in `apps/web/src/styles.css`; string-template UI rendering |
| Testing | Node built-in test runner; Playwright for e2e |
| Build tools | Custom Node scripts; Vercel static frontend build to `apps/web/dist` |
| Deployment assumptions | Static web on Vercel; API and worker on persistent Node/container hosts; Postgres; private S3-compatible storage; ClamAV-compatible scanner |
| External services | Optional OpenAI Responses API, optional SMTP, S3-compatible object storage, ClamAV-compatible scanner, PostgreSQL |
| Separate subproject | `02-new-rebuild`: Next.js 15, React 19, TypeScript, Tailwind, Framer Motion, Zod, Nodemailer, optional Prisma/Postgres |

## C. Current folder structure

| Path | Purpose observed |
| --- | --- |
| `README.md` | Main ComplianceIQ product, local setup, environment, database, deployment, and limitations documentation |
| `apps/api` | Node HTTP API, auth, uploads, scanning, storage, AI processing queue, review queue, operational logging |
| `apps/web` | Static SPA frontend with views for builder, facilities, evidence, review, matrix, actions, packets, experts, admin, and system |
| `packages/config` | Environment/config validation |
| `packages/ai` | AI provider abstraction, schema validation, OCR-ready mock interface, text extraction |
| `packages/db` | File and Postgres repositories, migrations, seeds, admin provisioning |
| `packages/rules` | Rules packs, scoring, gap matrix/action plan logic |
| `packages/pdf` | Audit packet PDF generation |
| `packages/shared` | Shared validation/domain helpers |
| `scripts` | Local dev launcher, checks, validators, e2e process starters |
| `tests` | Node tests plus Playwright e2e smoke test |
| `deploy/env` | Local, staging, and closed-pilot env examples |
| `.github/workflows` | CI workflows for lint, typecheck, tests, build, browser smoke, Postgres/storage/scanner validation |
| `02-new-rebuild` | Separate Royal Engitech Next.js website rebuild, assets, docs, Prisma-ready schema |

Important structure findings:

- `02-new-rebuild` is a different product/domain from ComplianceIQ and is not listed in the root npm workspaces.
- The root folder name is `ComplainceIQ`, which appears misspelled compared with `ComplianceIQ`.
- `02-new-rebuild` has its own `package.json` but no local lockfile was found for that subproject.
- Existing docs mention Git LFS asset tracking for `02-new-rebuild`, but there is no `.git` repository in this folder.
- No actual `.env`, `.env.local`, private key, SQLite, or database files were found in the inspected project tree.
- No shallow files over 5 MB were found.

## D. Git/GitHub state

Git is **not initialized** in this folder.

Observed command results:

| Command | Result |
| --- | --- |
| `git status --short --branch` | Failed: not a Git repository |
| `git branch --show-current` | Failed: not a Git repository |
| `git remote -v` | Failed: not a Git repository |
| `git log --oneline -5` | Failed: not a Git repository |
| Nested `.git` search | No nested `.git` folder found within four levels |

Because Git is not initialized:

- There is no current branch.
- There are no local commits discoverable from this folder.
- There is no remote to verify.
- Ignored/untracked state cannot be checked with Git.
- A branch named `phase-0-project-audit` could not be created.
- A commit could not be made.
- A pull request could not be opened.

Recommended repository setup path:

1. Confirm this local folder is the intended ComplianceIQ project folder.
2. Confirm whether `02-new-rebuild` should stay in this repository or move to a separate project.
3. Initialize Git only after confirmation.
4. Create a first branch named `phase-0-project-audit`.
5. Commit only `PROJECT_AUDIT.md` first.
6. Add the correct GitHub remote only after confirming the intended repository.
7. Push and open a documentation-only pull request.

## E. Run instructions discovered

Canonical package manager: **npm**, based on `package-lock.json`.

Root ComplianceIQ commands:

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` or `npm ci` |
| Run combined local API, worker, and web UI | `npm run dev` |
| Run API only | `npm run start:api` |
| Run worker only | `npm run start:worker` |
| Run static web only | `npm run dev:web` |
| Run tests | `npm test` |
| Run e2e smoke | `npm run qa:pilot` |
| Run lint | `npm run lint` |
| Run JS consistency check | `npm run typecheck` |
| Build static web | `WEB_API_ORIGIN=http://localhost:4000 npm run build:web` |
| Root build | `npm run build` |
| Database migrations | `npm run db:migrate` |
| Seed demo data | `npm run seed:demo` |
| Seed pilot data | `npm run seed:pilot` |
| Provision first admin | `npm run admin:provision` |
| Validate Postgres | `npm run validate:postgres` |
| Validate storage | `npm run validate:storage` |
| Validate scanner | `npm run validate:scanner` |

Separate `02-new-rebuild` commands:

| Task | Command |
| --- | --- |
| Install dependencies | `cd 02-new-rebuild && npm install` |
| Run development site | `cd 02-new-rebuild && npm run dev` |
| Build site | `cd 02-new-rebuild && npm run build` |
| Lint site | `cd 02-new-rebuild && npm run lint` |
| Typecheck site | `cd 02-new-rebuild && npm run typecheck` |

## F. Verification results

Local runtime:

- `node --version`: `v24.4.0`
- `npm --version`: `11.4.2`
- README/CI expect Node `>=20`, with GitHub Actions pinned to Node 20. Final verification should also be done on Node 20.

Checks run:

| Command | Result | Key output summary | Error category | Likely next fix |
| --- | --- | --- | --- | --- |
| `npm run lint` | Passed | Linted 69 files | None | Keep |
| `npm run typecheck` | Passed | Checked 77 JavaScript files | None | Keep, but note this is a custom JS check rather than TypeScript |
| `npm --workspace @complianceiq/api run build` | Passed | `node --check src/server.js` passed | None | Keep |
| `npm test` | Failed | 28 passed, 8 failed | Missing installed dependencies | Run `npm ci`, then rerun |
| `npm run scan:claims` | Passed | Linted 69 files | None | Keep |
| `npm run scan:random` | Passed | 1 test passed | None | Keep |

The failed `npm test` run was blocked by missing packages because `node_modules` is absent. The reported missing modules were:

- `@aws-sdk/client-s3`
- `pdf-parse`

Checks intentionally skipped:

| Command | Why skipped |
| --- | --- |
| `npm ci` / `npm install` | No Git repository exists yet, network is restricted, and dependency installation would create a large `node_modules` folder during an audit-only phase |
| `npm run build` | Root build would create/recreate `apps/web/dist`; skipped to avoid generated file changes while no Git branch exists |
| `npm run test:e2e` / `npm run qa:pilot` | Dependencies and Playwright browser installation are not present |
| Live Postgres/storage/scanner validators | Required external infrastructure/env vars were not configured |
| `02-new-rebuild` checks | Separate project has no installed dependencies and no lockfile in that folder |

## G. Environment/configuration audit

No real `.env` file was found. Only example/template files were inspected.

Required or important local/root names:

- `NODE_ENV`
- `DEPLOYMENT_PROFILE`
- `PROCESS_ROLE`
- `PORT`
- `API_HOST`
- `WORKER_HEALTH_PORT`
- `WORKER_HEALTH_HOST`
- `APP_URL`
- `ALLOWED_ORIGINS`
- `WEB_API_ORIGIN`
- `WEB_PORT`
- `WEB_HOST`
- `REPOSITORY_BACKEND`
- `DATABASE_URL`
- `SESSION_SECRET`
- `STORAGE_BACKEND`
- `UPLOAD_DIR`
- `MAX_UPLOAD_MB`
- `MALWARE_SCAN_ENABLED`
- `MALWARE_SCANNER_PROVIDER`
- `MALWARE_SCAN_FAIL_POLICY`
- `AI_ENABLED`
- `AI_PROVIDER`
- `ENABLE_DEMO_DATA`

Required for production/staging/closed-pilot:

- `NODE_ENV`
- `DEPLOYMENT_PROFILE`
- `PROCESS_ROLE`
- `PORT`
- `APP_URL`
- `ALLOWED_ORIGINS`
- `WEB_API_ORIGIN`
- `DATABASE_URL`
- `REPOSITORY_BACKEND`
- `SESSION_SECRET`
- `STORAGE_BACKEND`
- `S3_BUCKET`
- `S3_REGION`
- `MAX_UPLOAD_MB`
- `MALWARE_SCAN_ENABLED`
- `MALWARE_SCAN_REQUIRED_IN_PRODUCTION`
- `MALWARE_SCANNER_PROVIDER`
- `MALWARE_SCAN_FAIL_POLICY`
- `CLAMAV_HOST`
- `CLAMAV_PORT`
- `CLAMAV_TIMEOUT_MS`

Optional/conditional root names:

- `LOG_LEVEL`
- `TRUST_PROXY`
- `SESSION_COOKIE_SAME_SITE`
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`
- `LOGIN_RATE_LIMIT_WINDOW_MS`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`
- `SIGNED_URL_EXPIRY_SECONDS`
- `QUEUE_BACKEND`
- `QUEUE_CONCURRENCY`
- `QUEUE_MAX_RETRIES`
- `QUEUE_LEASE_MS`
- `QUEUE_HEARTBEAT_MS`
- `QUEUE_POLL_MS`
- `QUEUE_SHUTDOWN_TIMEOUT_MS`
- `MALWARE_SCAN_TIMEOUT_MS`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PROVISION_ORGANIZATION_NAME`
- `PROVISION_ADMIN_NAME`
- `PROVISION_ADMIN_EMAIL`
- `PROVISION_ADMIN_PASSWORD`
- `TEST_DATABASE_URL`
- `STAGING_DATABASE_URL`
- `TEST_S3_BUCKET`
- `TEST_S3_REGION`
- `TEST_S3_ENDPOINT`
- `TEST_S3_ACCESS_KEY_ID`
- `TEST_S3_SECRET_ACCESS_KEY`
- `TEST_S3_FORCE_PATH_STYLE`
- `VALIDATION_TARGET`
- `ALLOW_PRODUCTION_VALIDATION`
- `SCANNER_VALIDATE_EICAR`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USE_TLS`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

Separate `02-new-rebuild` names:

- `NEXT_PUBLIC_SITE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`
- `DATABASE_URL`
- `SAVE_LEADS_TO_DATABASE`
- `CONTACT_RATE_LIMIT_WINDOW_SECONDS`
- `CONTACT_RATE_LIMIT_MAX`

Recommendation: update `.env.example` in a later phase only after the repository baseline is established. Do not add real secrets to Git.

## H. Code quality and consistency findings

1. Git/GitHub baseline is missing entirely.
   - Evidence: no `.git` folder; all Git commands fail.
   - Impact: no branch, commit, diff, ignored/untracked view, remote check, or PR is possible.

2. Dependencies are not installed.
   - Evidence: `node_modules` absent; `npm test` fails due missing declared packages.
   - Impact: the full test/build/e2e process cannot be trusted until `npm ci` runs.

3. The folder contains two different products.
   - Evidence: root is ComplianceIQ; `02-new-rebuild` is Royal Engitech.
   - Impact: repository scope is unclear and may confuse GitHub, deployment, CI, and future maintenance.

4. `02-new-rebuild` is outside the root workspace.
   - Evidence: root `workspaces` only include `apps/*` and `packages/*`.
   - Impact: root `npm ci`, root CI, and root scripts do not validate that project.

5. Documentation appears partially stale or contradictory.
   - Evidence: docs list login throttling as missing, while code and tests include `createLoginRateLimiter`.
   - Impact: roadmap/status may confuse beginner users and reviewers.

6. The root `typecheck` script is not a TypeScript type check.
   - Evidence: `scripts/check-js.mjs` checks tabs and `console.log`.
   - Impact: the script name may overstate verification strength.

7. No formatter script was found.
   - Evidence: root `package.json` has no `format` script.
   - Impact: style consistency depends on custom checks and review.

8. Production readiness depends on external infrastructure.
   - Evidence: docs and validators require Postgres, S3-compatible storage, and ClamAV.
   - Impact: local checks cannot prove closed-pilot readiness.

9. The static frontend uses string templates and `innerHTML`.
   - Evidence: `apps/web/src/app.js` renders with `root.innerHTML`.
   - Impact: escaping discipline matters; the `html()` helper appears intended for this, but dynamic rendering should be reviewed carefully.

10. Local Node version differs from CI target.
    - Evidence: local Node is v24.4.0; CI uses Node 20.
    - Impact: passing locally on Node 24 is helpful but not equivalent to CI Node 20.

## I. Incomplete or broken functionality

| Item | Evidence | Likely impact | Recommended phase |
| --- | --- | --- | --- |
| Git/GitHub setup missing | No `.git`, no branch, no remote | Cannot review/merge safely | Phase 1 |
| Dependency baseline missing | `node_modules` absent; tests fail from missing packages | Full verification blocked | Phase 2 |
| Root production build not run | Skipped to avoid generated files without Git | Build status unknown after audit | Phase 2 |
| `02-new-rebuild` scope unclear | Separate product and package outside workspaces | Confusing repo/deployment scope | Phase 3 |
| Production infrastructure not configured | Validators require external env/services | Not ready for real pilot data | Phase 7 |
| Production OCR absent | README says OCR interface exists, no production engine bundled | Scanned PDFs/images require review | Phase 6 or 7 |
| Account recovery absent | Docs list it as missing | Operational support gap | Phase 6 |
| Retention, legal holds, deletion retry, restore UI absent | README/PILOT docs list missing | Compliance/data lifecycle gap | Phase 6 or 7 |
| `02-new-rebuild` database persistence not wired | README says Prisma save call must be added | Lead persistence disabled in that subproject | Separate project phase |

## J. Cleanup candidates

Do not delete, move, or rename any item below without user confirmation.

| Path | Reason | Recommended action | Risk | User confirmation required |
| --- | --- | --- | --- | --- |
| `02-new-rebuild/` | Separate Royal Engitech website project inside ComplianceIQ folder | Confirm whether to keep, move to separate repo, or exclude from ComplianceIQ | High | Yes |
| `02-new-rebuild/package.json` | Separate package not covered by root workspace/lockfile | If kept, decide whether it needs its own repo/lockfile/CI | Medium | Yes |
| `02-new-rebuild/prisma/` | Optional lead persistence foundation not wired | Keep only if Royal Engitech site remains in scope | Medium | Yes |
| `LFS_ASSET_AUDIT.md` | Only relates to `02-new-rebuild` assets | Keep/update only if that subproject remains | Medium | Yes |
| `.gitattributes` | Tracks `02-new-rebuild` binary assets for Git LFS, but no Git repo exists | Review after repo scope decision | Medium | Yes |
| Root folder name `ComplainceIQ` | Appears misspelled | Rename only after tooling and paths are reviewed | High | Yes |
| `DEPLOYMENT_READINESS.md` and `PILOT_READINESS.md` | Useful but some status lines may be stale | Update, do not delete | Low | Yes |
| `README.md` | Very detailed but may mix current and future status | Update for beginner setup after baseline | Low | Yes |
| `apps/web/dist/` | Generated build output; absent now and ignored | Keep ignored; do not commit if generated later | Low | Yes before deletion if present |
| `node_modules/` | Not present; would be generated by install | Keep ignored; do not commit | Low | No deletion needed |

## K. Recommended completion roadmap

### Phase 1 - Repository setup and safe baseline documentation

- Goal: Establish a safe Git/GitHub baseline without deleting anything.
- Main files likely touched: `.gitignore`, `PROJECT_AUDIT.md`, possibly README only if needed.
- Risks: Initializing the wrong folder or connecting the wrong remote.
- Verification: `git status`, branch name, first commit, remote URL host/name, PR diff.
- User confirmation needed: Yes, confirm intended folder and GitHub repository.

### Phase 2 - Dependency install and baseline verification

- Goal: Install dependencies and rerun root checks.
- Main files likely touched: ideally none; possibly `package-lock.json` only if npm version changes it.
- Risks: npm version or Node version changing lockfile unexpectedly.
- Verification: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- User confirmation needed: Yes if lockfile changes.

### Phase 3 - Repository scope cleanup decision

- Goal: Decide what to do with `02-new-rebuild`.
- Main files likely touched: docs and possibly repo structure later.
- Risks: Accidentally removing useful Royal Engitech work.
- Verification: clear decision recorded before moving/deleting.
- User confirmation needed: Yes.

### Phase 4 - Documentation and configuration normalization

- Goal: Make README/env examples beginner-safe and consistent with actual code.
- Main files likely touched: `README.md`, `.env.example`, `deploy/env/*`, readiness docs.
- Risks: Misclassifying required production settings.
- Verification: config tests and local startup.
- User confirmation needed: Usually no, unless secrets or deployment choices are involved.

### Phase 5 - Build, test, and CI stabilization

- Goal: Make the whole root project pass the same checks locally and in CI.
- Main files likely touched: scripts, tests, package metadata, CI workflow if needed.
- Risks: Test changes could mask real failures if done carelessly.
- Verification: full root CI command set plus Playwright smoke.
- User confirmation needed: No for fixes, yes for dependency changes.

### Phase 6 - Core feature completion

- Goal: Address known missing product/operations features.
- Main files likely touched: API, packages, web views, tests.
- Risks: Database/schema and workflow changes.
- Verification: focused tests plus e2e smoke.
- User confirmation needed: Yes for schema changes or feature scope decisions.

### Phase 7 - Deployment readiness

- Goal: Validate staging/closed-pilot infrastructure.
- Main files likely touched: deployment docs/config only; hosting settings external.
- Risks: Real infrastructure, secrets, cost, and data handling.
- Verification: Postgres/storage/scanner validators, health endpoints, backup/restore exercise.
- User confirmation needed: Yes.

### Phase 8 - Final cleanup, README, and merge

- Goal: Make the project GitHub-ready for normal work.
- Main files likely touched: README, docs, final cleanup files.
- Risks: Removing old files without agreement.
- Verification: clean Git status, CI passing, PR reviewed.
- User confirmation needed: Yes for deletion/moves.

## L. Beginner-safe next recommendation

Recommended next phase: **Phase 1 - Repository setup and safe baseline documentation**.

The next step should not be feature work. First confirm that `/Users/harshparmar/Desktop/Projects/ComplainceIQ` is the exact folder that should become the GitHub repository, and confirm whether `02-new-rebuild` belongs in it. After that, initialize or reconnect Git safely, create the `phase-0-project-audit` branch, commit this audit document only, and open a documentation-only pull request.

## Phase 1 repository baseline note

Phase 1 confirmed that `/Users/harshparmar/Desktop/Projects/ComplainceIQ` is the ComplianceIQ project root. Before Git initialization, the folder contained the root ComplianceIQ `package.json`, `package-lock.json`, `README.md`, `.github/`, `apps/`, `packages/`, `scripts/`, `tests/`, `deploy/`, and this audit document.

Secret/generated file safety check:

- No `.env`, `.env.local`, `.env.production`, private key, certificate bundle, SQLite, or database files were found by filename search.
- No `node_modules/`, build output, coverage, Playwright report, or test-results folders were present at the checked depths.
- No files larger than 10 MB were found during the Phase 1 large-file check.
- `.gitignore` was minimally updated to keep broad environment files, Playwright artifacts, and web build output out of Git while preserving `.env.example` templates.
- `.gitattributes` contains Git LFS rules for `02-new-rebuild` binary assets, but `git lfs` was not installed in this environment. The detected rebuild assets are small; this should be revisited before any asset-heavy future work.

## Expert recommendation for `02-new-rebuild/`

Recommended decision: Keep temporarily pending cleanup

Confidence: High

Reasoning:

- `02-new-rebuild/package.json` is named `royal-engitech-rebuild` and uses Next.js, React, TypeScript, Tailwind, Framer Motion, Nodemailer, Zod, and optional Prisma. The root ComplianceIQ app is a JavaScript npm workspace with `apps/*` and `packages/*`.
- `02-new-rebuild/README.md` describes a Royal Engitech website rebuild with separate SMTP/contact-form environment variables and separate deployment instructions. The root README describes ComplianceIQ only.
- The root npm workspace includes only `apps/*` and `packages/*`, so root `npm run build`, root CI, and root tests do not validate `02-new-rebuild`.
- The rebuild routes, metadata, content, downloads, and assets reference Royal Engitech, while the root app, packages, and tests reference ComplianceIQ.
- There is no evidence that `02-new-rebuild` shares runtime code with the ComplianceIQ API, SPA, rules engine, database package, or deployment profile.

Risk if kept:

- The repository may confuse future maintainers because it contains two unrelated products with different frameworks, dependencies, env vars, deployment models, and quality gates.
- Root CI can pass while the Next.js rebuild remains untested.
- Dependency and deployment work may become harder to reason about because the root `package-lock.json` does not cover the rebuild.

Risk if removed too early:

- The Royal Engitech rebuild appears to contain real source, assets, redirects, docs, and migration notes that may be valuable or client-relevant.
- Removing it before GitHub baseline and review would make recovery harder for a beginner user.
- `.gitattributes` and `LFS_ASSET_AUDIT.md` were created around that folder, so removing it requires a coordinated cleanup phase.

Safe next action:

- Include `02-new-rebuild/` in the initial baseline commit to preserve the current state.
- Mark it as out of scope for ComplianceIQ implementation until a later cleanup phase.
- In a later phase, create a dedicated decision PR that either moves `02-new-rebuild/` to its own repository or removes it from the ComplianceIQ repository after explicit user approval.

## Phase 2 GitHub baseline note

- Confirmed GitHub remote: `git@github.com:ParmarHarsh/ComplianceIQ.git`
- Initial baseline was pushed to `main` because the GitHub repository was empty and had no base branch for a pull request.
- Created `phase-2-github-baseline` for a documentation-only pull request to confirm the PR workflow.
- No source code, dependency, cleanup, deletion, move, rename, build, or database changes were made.
- `02-new-rebuild/` remains preserved and out of scope for ComplianceIQ implementation until a later dedicated cleanup/scope phase.
