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

## Phase 3 dependency and verification note

- Pulled latest `main` after Phase 2 merge confirmation.
- Created `phase-3-dependency-verification`.
- Installed root dependencies with `npm ci`; the first attempt failed because the user npm cache had permission issues, then the same clean install passed using a temporary cache at `/private/tmp/complianceiq-npm-cache`.
- Node version used: `v24.4.0`.
- npm version used: `11.4.2`.
- Verification commands run:
  - `npm ci` - passed on retry with temporary cache.
  - `npm run lint` - passed.
  - `npm run typecheck` - passed.
  - `npm test` - passed with 46 passing tests and 2 infrastructure-dependent skips.
  - `npm run build` - passed.
  - `WEB_API_ORIGIN=http://localhost:4000 npm run build:web` - passed.
  - `npm run qa:pilot` - skipped because Playwright Chromium was not installed.
  - `npm audit --omit=dev` - passed; found 0 production dependency vulnerabilities.
- Dependency audit observation:
  - Observation only; no vulnerability fixes, dependency updates, or `npm audit fix` actions were applied.
- Ignored/generated folders created locally: `node_modules/` and `apps/web/dist/`.
- No source code cleanup, deletion, move, rename, database schema change, or `02-new-rebuild/` change was performed.
- Recommended next phase: run CI/Node 20 verification and Playwright browser smoke setup, then address any CI-only failures or dependency/security findings in a focused repair phase.

## Phase 4 CI, Node 20, and Playwright note

- Pulled latest `main` after Phase 3 merge confirmation.
- Created `phase-4-ci-node20-playwright`.
- CI workflow summary:
  - `.github/workflows/ci.yml` uses Node 20, runs `npm ci`, lint, typecheck, tests, build, claim/random scans, a Playwright Chromium smoke job, and optional Postgres/storage/scanner validators.
  - The workflow does not validate `02-new-rebuild/`, which remains out of scope for ComplianceIQ.
- Node version used locally: `v24.4.0`.
- Node 20 local verification: skipped because `nvm`, `volta`, `asdf`, `fnm`, and `node20` were not available locally; CI remains the Node 20 source of truth.
- Verification commands run:
  - `npm ci --cache /private/tmp/complianceiq-npm-cache` - passed.
  - `npm run lint` - passed.
  - `npm run typecheck` - passed.
  - `npm test` - passed with 46 passing tests and 2 infrastructure-dependent skips.
  - `npm run build` - passed.
  - `WEB_API_ORIGIN=http://localhost:4000 npm run build:web` - passed.
  - `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/complianceiq-ms-playwright npx playwright install chromium` - passed.
  - `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/complianceiq-ms-playwright npm run qa:pilot` - failed before app assertions because Chromium could not launch in the local macOS sandbox (`MachPortRendezvousServer` permission denied).
  - `npm audit` - passed; found 0 vulnerabilities.
  - `npm audit --omit=dev` - passed; found 0 production dependency vulnerabilities.
- Playwright browser setup:
  - Chromium installed to `/private/tmp/complianceiq-ms-playwright`.
- Browser smoke result:
  - Failed due local Chromium launch permission, not an observed ComplianceIQ test assertion failure.
- Dependency audit observation:
  - Observation only; no vulnerability fixes, dependency updates, or `npm audit fix` actions were applied.
- Dependabot triage:
  - GitHub app access to `ParmarHarsh/ComplianceIQ` returned 404, so alert details were not accessible from this environment. GitHub UI still reports 8 alerts on the default branch; review those in a later focused security phase.
- Files intentionally not committed:
  - `node_modules/`, `apps/web/dist/`, `/tmp/complianceiq-playwright-results`, and `/private/tmp/complianceiq-ms-playwright`.
- No cleanup, deletion, move, rename, database schema change, broad dependency update, or `02-new-rebuild/` change was performed.
- Recommended next phase:
  - Open the Phase 4 PR, let GitHub Actions run Node 20 and Linux Playwright smoke, then address any CI-only failure or Dependabot alert details in a focused follow-up phase.

## Phase 5 CI and Dependabot triage note

- Pulled latest `main` after Phase 4 merge confirmation.
- Created `phase-5-ci-dependabot-triage`.
- GitHub Actions result:
  - Inaccessible from this environment because GitHub CLI is not installed and the connected GitHub app returns 404 for the private repo.
- Node 20 CI result:
  - Inaccessible; needs manual GitHub Actions review.
- Linux Playwright smoke result:
  - Inaccessible; needs manual GitHub Actions review.
- Optional infrastructure validators:
  - Inaccessible; needs manual GitHub Actions review.
- Dependabot alert access:
  - Inaccessible from this environment; GitHub CLI is not installed and the connected GitHub app cannot access the private repo.
- Dependabot triage summary:
  - Local `npm audit` and `npm audit --omit=dev` both found 0 vulnerabilities, but GitHub Dependabot alerts still require manual review in GitHub Security.
- Local sanity checks run:
  - `npm run lint` - passed.
  - `npm run typecheck` - passed.
  - `npm test` - passed with 46 passing tests and 2 infrastructure-dependent skips.
  - `npm run build` - passed.
  - `npm audit` - passed; found 0 vulnerabilities.
  - `npm audit --omit=dev` - passed; found 0 production dependency vulnerabilities.
- No cleanup, deletion, move, rename, database schema change, broad dependency update, vulnerability fix, or `02-new-rebuild/` change was performed.
- Recommended next phase:
  - Manually collect the latest GitHub Actions job status/log snippets and Dependabot alert details from GitHub, then run a focused CI/security triage phase based on that evidence.

## Phase 6 repository scope and security decision note

- Pulled latest `main` after Phase 5 merge confirmation.
- Created `phase-6-repo-scope-security-decision`.
- Manual GitHub Actions evidence:
  - The user manually confirmed all relevant CI jobs were green.
- Dependabot evidence:
  - Eight open alerts.
  - All eight are reported against `02-new-rebuild/package.json`.
  - All eight involve direct Nodemailer dependency findings.
  - Severity distribution: 2 high, 5 moderate, and 1 low.
- ComplianceIQ root Nodemailer dependency status:
  - Absent from root `package.json`.
  - Absent from root `package-lock.json`.
  - `npm ls nodemailer --all` reported the root ComplianceIQ dependency tree as empty for Nodemailer.
  - Root `npm audit` and `npm audit --omit=dev` both found 0 vulnerabilities.
- Cross-project runtime dependency status:
  - No runtime, build, test, deployment, import, package, or asset dependency was found between root ComplianceIQ and `02-new-rebuild/`.
  - Evidence: root workspaces are only `apps/*` and `packages/*`; root scripts and CI target root workspaces only; root package/lock files do not include `02-new-rebuild`; searches found `02-new-rebuild` references in audit/scope documentation and LFS asset tracking notes, not in root application runtime.
  - `02-new-rebuild/package.json` is named `royal-engitech-rebuild`, and its README describes a standalone Royal Engitech Next.js site with separate deployment and SMTP/contact settings.
- Final expert recommendation:
  - Separate `02-new-rebuild/` into its own repository in a later dedicated phase.
- Confidence:
  - High.
- Safe next action:
  - Open and merge this documentation-only PR first, then run a later explicit extraction phase that preserves the Royal Engitech project before any removal from ComplianceIQ.
- Final expert repository-scope decision:
  - Recommended decision: Separate into its own repository.
  - Confidence: High.
  - Decision: `02-new-rebuild/` should not remain permanently inside the ComplianceIQ repository. It should be preserved, extracted into a dedicated Royal Engitech repository, verified there, and only then removed from ComplianceIQ in a separate cleanup PR.
  - Evidence:
    1. ComplianceIQ root workspaces include only `apps/*` and `packages/*`.
    2. Root CI, scripts, tests, package files, and deployments do not execute or depend on `02-new-rebuild/`.
    3. `02-new-rebuild/` has its own `package.json`, Next.js app, Royal Engitech README, assets, routes, Prisma-ready schema, and SMTP/contact environment model.
    4. Nodemailer is direct in `02-new-rebuild/package.json` and absent from the root ComplianceIQ dependency graph.
    5. The manually reviewed Dependabot alerts are all scoped to `02-new-rebuild/package.json`, not root ComplianceIQ.
  - Security impact: The eight Nodemailer alerts should be treated as Royal Engitech rebuild findings, not ComplianceIQ root findings. They should be fixed in the Royal Engitech project after separation, or in `02-new-rebuild/` only during an explicitly approved Royal Engitech security phase.
  - ComplianceIQ impact: ComplianceIQ root currently validates cleanly with passing lint, typecheck, tests, build, and zero root audit findings. Keeping `02-new-rebuild/` in the same repo can still confuse alerts, ownership, CI scope, and deployment expectations.
  - Royal Engitech impact: The rebuild appears to contain real Royal Engitech source, assets, redirects, docs, and optional lead-persistence planning. It should be preserved and given its own lockfile, CI, dependency security work, and deployment flow in its own repository.
  - Risk of keeping both products together: Future maintainers may confuse two unrelated products, root CI can pass while Royal Engitech remains untested, Dependabot/security triage can look like a ComplianceIQ issue, and deployment boundaries stay unclear.
  - Risk of separating them: A careless separation could lose files, break Git LFS asset handling, drop useful docs/assets, or remove the folder from ComplianceIQ before the Royal Engitech repo is proven recoverable.
  - Final recommended action: Do not move or delete anything yet. First merge this documentation-only decision, then perform a later explicit extraction phase for Royal Engitech with verification and recovery checks before any ComplianceIQ cleanup.
- Safe future separation plan:
  1. Reconfirm there is still no runtime, build, test, deployment, import, package, or asset dependency between ComplianceIQ and `02-new-rebuild/`.
  2. Create a dedicated Royal Engitech repository.
  3. Copy the entire `02-new-rebuild/` folder into that repository without omitting source, docs, Prisma schema, downloads, images, redirects, or environment examples.
  4. Review `.gitattributes` and `LFS_ASSET_AUDIT.md`, then preserve Git LFS pointer files and binary assets safely in the new repository.
  5. Create a Royal Engitech lockfile only in the Royal Engitech repository if that repo's package manager strategy requires one.
  6. Install, lint, typecheck, build, and test the Royal Engitech project in its own repository.
  7. Fix or upgrade Nodemailer only in the Royal Engitech repository, not in ComplianceIQ root.
  8. Push the new Royal Engitech repository and confirm the complete project is recoverable from GitHub.
  9. Only after the separate repository is verified, open a ComplianceIQ cleanup PR removing `02-new-rebuild/`.
  10. In that cleanup PR, update or remove `.gitattributes` and `LFS_ASSET_AUDIT.md` only if they are obsolete after extraction.
  11. Never delete Royal Engitech source before the separate repository has been pushed, verified, and approved.
- Root health checks run:
  - `npm run lint` - passed; linted 69 files.
  - `npm run typecheck` - passed; checked 77 JavaScript files.
  - `npm test` - passed with 46 passing tests and 2 infrastructure-dependent skips.
  - `npm run build` - passed.
  - `npm audit` - passed; found 0 vulnerabilities.
  - `npm audit --omit=dev` - passed; found 0 production dependency vulnerabilities.
- Files intentionally not committed:
  - `node_modules/`
  - `apps/web/dist/`
- No source code, dependency version, cleanup, deletion, move, rename, database schema, or `02-new-rebuild/` content change was performed.

## Phase 7 Royal Engitech preservation baseline note

- Pulled latest `main` after Phase 6 merge confirmation.
- Created `phase-7-royal-preservation-baseline`.
- Reconfirmed no runtime, build, test, deployment, import, package, or asset dependency between ComplianceIQ and `02-new-rebuild/`.
- Original Royal Engitech source:
  - `/Users/harshparmar/Desktop/Projects/ComplainceIQ/02-new-rebuild`
- Independent preserved copy:
  - `/Users/harshparmar/Desktop/Projects/RoyalEngitech-Rebuild`
- Copy verification:
  - Passed before independent Git initialization; recursive diff, relative file list comparison, file count comparison, directory count comparison, symlink comparison, and checksum dry run showed no differences.
- Regular file count:
  - 75 in the original source at copy time.
  - 76 tracked files in the independent Royal Engitech baseline because a minimal `.gitignore` was added only to the copied project.
- Directory count:
  - 20 in the original source at copy time.
- Symlink status:
  - 0 symlinks found.
- Secret-file safety result:
  - No real `.env`, private key, database, credentials, or secrets files were found by filename scan.
  - `.env.example` is present and was treated as an allowed template file.
- Large-file result:
  - No files over 10 MB were found in the current checkout.
- Git LFS pointer result:
  - 39 Git LFS pointer files were found under `02-new-rebuild/public/`.
  - The current checkout contains small pointer metadata files for those assets, not confirmed real binary asset contents.
  - No local `.git/lfs` object files were visible in this checkout.
  - Full asset recovery remains a blocker before claiming the Royal Engitech project is asset-complete on GitHub.
- Independent Royal Engitech Git repository:
  - Initialized at `/Users/harshparmar/Desktop/Projects/RoyalEngitech-Rebuild`.
  - Branch: `main`.
  - Working tree clean after baseline commit.
- Independent baseline commit:
  - `3c8ebb2 chore: establish Royal Engitech project baseline`
- Independent GitHub remote:
  - None configured.
- Original `02-new-rebuild/` status:
  - Preserved unchanged inside ComplianceIQ.
- No original Royal Engitech file was modified, moved, renamed, deleted, ignored, or untracked.
- No dependency version, lockfile, database schema, ComplianceIQ source, or Nodemailer change was performed.
- Recommended next phase:
  - Create/connect the dedicated Royal Engitech GitHub repository, push the preserved baseline, verify recoverability, recover or intentionally resolve LFS assets, then establish its dependency/lockfile/CI/security baseline.

## Phase 10 ComplianceIQ cleanup readiness note

- Pulled latest ComplianceIQ `main` after Phase 7 preservation merge confirmation.
- Created `phase-10-complianceiq-cleanup-readiness`.
- Primary project focus:
  - ComplianceIQ.
- Royal Engitech project priority:
  - External and out of scope for ComplianceIQ implementation work.
- Dedicated Royal Engitech repository:
  - `git@github.com:ParmarHarsh/RoyalEngitech-Rebuild.git`
- Independent Royal baseline preservation:
  - Confirmed. Remote `main` was visible at `6131dd1743bbc0704458a31b1e53eee46ab711a6`, and preserved baseline commit `3c8ebb2998972023b684cf47a4d6baadf3867994` was verified as an ancestor of that remote `main`.
- Cross-project dependency check:
  - Passed. No runtime, build, test, deployment, import, package, or asset dependency was found from ComplianceIQ to `02-new-rebuild/`.
  - Root workspaces remain only `apps/*` and `packages/*`.
  - Root scripts do not execute `02-new-rebuild/`.
  - CI installs root dependencies and runs root lint, typecheck, tests, build, claim scan, random scan, browser smoke, and optional infrastructure validation without referencing `02-new-rebuild/`.
  - Scoped searches for `02-new-rebuild`, `royal-engitech`, and `Royal Engitech` in root package files, README, CI, apps, packages, scripts, tests, and deploy configuration returned no dependency matches.
- `02-new-rebuild/` cleanup recommendation:
  - REMOVE.
  - Evidence: it remains tracked and unchanged with 75 tracked files; its contents are a separate Royal Engitech Next.js rebuild and no ComplianceIQ-specific source references were found inside it.
  - Confidence: High.
- `LFS_ASSET_AUDIT.md` recommendation:
  - REMOVE.
  - Evidence: the document is exclusively about `02-new-rebuild/` Royal Engitech binary assets and LFS tracking. ComplianceIQ does not rely on it after the Royal folder is removed.
- `.gitattributes` recommendation:
  - DELETE_FILE.
  - Evidence: every existing rule is scoped to `02-new-rebuild/**`; no rule applies to ComplianceIQ application, package, script, test, or deploy files.
- Unresolved Royal LFS assets:
  - 39 external Royal Engitech assets remain unresolved.
  - They do not block ComplianceIQ cleanup because they belong to the external Royal Engitech project, are not imported or required by ComplianceIQ, and the Royal Git-tracked baseline has already been independently preserved in its dedicated repository.
  - Royal Engitech should not be claimed asset-complete until those assets are resolved in the Royal repository or intentionally dispositioned there.
- ComplianceIQ health verification:
  - `node --version` - passed locally with `v24.4.0`; CI is configured for Node 20.
  - `npm --version` - passed with `10.8.3`.
  - `npm run lint` - passed; linted 69 files.
  - `npm run typecheck` - passed; checked 77 JavaScript files.
  - `npm test` - passed with 46 passing tests and 2 infrastructure-dependent skips.
  - `npm run build` - passed.
  - `npm audit` - passed; found 0 vulnerabilities.
  - `npm audit --omit=dev` - passed; found 0 production dependency vulnerabilities.
  - `npm run scan:claims` - passed; linted 69 files.
  - `npm run scan:random` - passed; 1 deterministic-safety test passed.
- Exact proposed cleanup set:

| Path | Proposed action | Reason | ComplianceIQ dependency found? | Risk | Approval needed |
|---|---|---|---|---|---|
| `02-new-rebuild/` | REMOVE | Separate Royal Engitech project already preserved independently | No | Low after preservation verification | Yes |
| `LFS_ASSET_AUDIT.md` | REMOVE | Documents only the unrelated Royal Engitech asset/LFS migration | No | Low; obsolete after Royal folder removal | Yes |
| `.gitattributes` | REMOVE | All rules are scoped only to `02-new-rebuild/**` and become obsolete after removal | No | Low; no ComplianceIQ rules are present | Yes |

- Destructive cleanup executed:
  - No.
- Source and destructive-change safety:
  - No source code, dependency file, database schema, cleanup deletion, move, rename, `.gitattributes` change, `LFS_ASSET_AUDIT.md` change, or `02-new-rebuild/` content change was performed.
- Recommended next phase:
  - Execute only the approved ComplianceIQ cleanup set in one focused PR: remove `02-new-rebuild/`, remove `LFS_ASSET_AUDIT.md`, remove `.gitattributes`, rerun the full ComplianceIQ verification suite, and confirm CI stays green.

## Phase 11 ComplianceIQ focused cleanup execution note

- Pulled latest `main` after Phase 10 cleanup-readiness merge confirmation.
- Used `phase-11-remove-unrelated-royal-project`; the branch already existed locally and matched updated `main` exactly before cleanup.
- Explicitly approved cleanup set executed:
  - Removed `02-new-rebuild/`.
  - Removed `LFS_ASSET_AUDIT.md`.
  - Removed `.gitattributes`.
- Cleanup scope:
  - No other path was deleted.
  - No file or folder was moved or renamed.
- Royal Engitech preservation status:
  - Independent local repository remains separate from ComplianceIQ.
  - Dedicated GitHub repository remains `git@github.com:ParmarHarsh/RoyalEngitech-Rebuild.git`.
  - Remote `main` was visible at `6131dd1743bbc0704458a31b1e53eee46ab711a6`.
  - Removal from ComplianceIQ does not remove the independent Royal repository or its Git history.
- Cross-project dependency status:
  - No runtime, build, test, deployment, import, package, or asset dependency from ComplianceIQ to the removed Royal project was found.
- Active ComplianceIQ Royal-reference scan:
  - No matches in active ComplianceIQ scopes.
- Post-cleanup verification:
  - `npm run lint` - passed; linted 69 files.
  - `npm run typecheck` - passed; checked 77 JavaScript files.
  - `npm test` - passed after approved localhost-capable rerun; 46 passed, 2 skipped, 0 failed.
  - `npm run build` - passed.
  - `npm audit` - passed after approved registry-capable rerun; found 0 vulnerabilities.
  - `npm audit --omit=dev` - passed; found 0 production dependency vulnerabilities.
  - `npm run scan:claims` - passed; linted 69 files.
  - `npm run scan:random` - passed; 1 deterministic-safety test passed.
- Root package metadata:
  - Unchanged.
- Application source:
  - Unchanged.
- Database schema:
  - Unchanged.
- CI workflow files:
  - Unchanged.
- Final cleanup result:
  - ComplianceIQ repository is now focused on the ComplianceIQ project without the unrelated Royal Engitech source tree or its Royal-only LFS metadata.
- Recommended next phase:
  - Audit and normalize ComplianceIQ documentation, environment templates, readiness documents, and local-start instructions against the actual implementation before beginning missing-feature work.
