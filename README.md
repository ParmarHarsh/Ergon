# Ergon

Ergon is an AI-native manufacturing compliance workspace. It helps manufacturers organize the evidence they already have, map that evidence to jurisdiction-specific obligations, surface missing or weak proof, prioritize gaps, guide human review, and assemble audit-ready packets.

The product thesis is simple: manufacturers should not need to manually rebuild their entire compliance system inside software before receiving value. Ergon should ingest messy real-world inputs, understand facility context, recommend what needs attention, draft useful outputs, and preserve accountable human review.

## Who Ergon serves

Ergon is intended for SMEs, MSMEs, single-facility manufacturers, multi-site manufacturers, and larger manufacturing organizations. It should eventually work for companies using spreadsheets, PDFs, scans, shared drives, email attachments, legacy ERP exports, modern ERP/API systems, and supplier evidence.

## 80/20 AI principle

Ergon targets an approximately 80% automated assistance / 20% accountable human effort model. This is a product direction, not a guaranteed measured metric.

Ergon should automate repetitive work such as ingestion, classification, metadata extraction, evidence summarization, obligation candidate matching, gap detection, risk prioritization, action-plan drafting, and audit packet assembly. Humans remain accountable for material legal applicability, evidence acceptance, high-risk decisions, risk acceptance, legal holds, destructive deletion, final certification, regulator-facing representations, exceptions, and AI overrides.

## Implemented now

- password authentication, signed sessions, login throttling, tenant isolation, RBAC, account recovery, SMTP recovery adapter, TOTP MFA, and recovery codes;
- facility setup and jurisdiction-aware starter rules-pack selection;
- evidence records and verified upload intake for TXT, Markdown, CSV, text-layer PDF, DOCX, XLSX, and supported image formats;
- bounded normalized extraction with format-specific structure, source anchors, deterministic document profiles, SHA-256 lineage, and truthful partial/failure states;
- local/private storage and S3-capable storage adapter;
- malware-scanning adapter with local mock and ClamAV-capable provider;
- optional backend AI evidence analysis with mock, standard OpenAI, or Azure OpenAI providers, strict Responses API structured output, server validation, source grounding, safe usage metadata, and bounded cost controls;
- human review queue and evidence override decisions;
- deterministic gap analysis and action-plan generation;
- audit packet PDF generation and authenticated downloads;
- legal holds, archive/restore, retention enforcement, and failed-deletion retry foundations;
- health/readiness endpoints, local API-and-worker runtime, and system-status UI.

Starter rules are demo/unverified unless expert-reviewed. Ergon is audit-preparation support only. It is not legal advice, does not certify compliance, and does not represent regulator approval.

### Evidence format capability

| Format | Status | Extraction and provenance |
|---|---|---|
| TXT | IMPLEMENTED_NOW | UTF-8 text with line-range anchors |
| Markdown | IMPLEMENTED_NOW | Safe plain textual content with line-range anchors; embedded markup is not rendered |
| CSV | IMPLEMENTED_NOW | Quoted-field parsing, headers/row preview, and row anchors |
| Text-layer PDF | IMPLEMENTED_NOW | Bounded page text with page anchors |
| Image-only PDF | OCR_REQUIRED | No fake extraction; waits for real OCR or manual review |
| DOCX | IMPLEMENTED_NOW | Bounded OOXML paragraph/table structure with paragraph anchors |
| XLSX | IMPLEMENTED_NOW | Bounded sheets/cached cell values with sheet/row/cell-range anchors; formulas are never evaluated |
| PNG/JPEG and other accepted images | OCR_REQUIRED | Signature-verified intake only until real OCR is configured |

This is the first concrete implementation of `INGEST → UNDERSTAND`. Candidate obligation mapping, regulatory source intelligence, autonomous applicability decisions, production OCR, and external document connectors remain planned or future work.

## Planned or long-term

- OCR for scanned PDFs/images;
- email, SharePoint, Google Drive, and OneDrive ingestion;
- ERP/MES/QMS exports and APIs;
- supplier evidence workflows;
- source-backed regulatory intelligence with versioned official-source snapshots;
- standards-based Google/Microsoft organizational sign-in;
- stronger expert-reviewed rules content and provenance workflows;
- production monitoring, backup/restore, and operational runbooks.

Ergon does not currently provide live regulatory monitoring, production OCR, ERP connectors, external SSO, or autonomous legal applicability determinations.

### Evidence extraction boundaries

Evidence processing reuses the scan-gated private-storage queue and versioned human-review path. It does not create public object URLs or bypass malware state. Office containers are checked for extension/MIME/signature agreement, macro parts, traversal paths, XML entity declarations, entry counts, and expansion size before their bounded contents are used. Generic archives remain rejected.

The current deterministic limits are 10,000 text lines, 10,000 CSV rows / 100,000 cells, 200 PDF pages, 10,000 DOCX blocks, and 100 XLSX sheets / 10,000 rows per sheet / 100,000 cells. OOXML expansion is capped at 50 MB with a 20 MB single-part cap. Downstream analysis text remains capped by `AI_MAX_FILE_TEXT_CHARS`. Limit hits are marked partial with a review warning; corrupt, encrypted, unsupported, and empty inputs fail safely into review.

Images and PDFs without a text layer are explicitly `OCR_REQUIRED` unless a real configured OCR provider returns text. Ergon does not simulate OCR. AI is optional: when disabled, normalized extraction, deterministic profiles, provenance, and human review still run. AI outputs are source-supported candidates where possible, never autonomous legal applicability or accepted compliance conclusions.

## Repository structure

- `apps/api` - Node HTTP API, authentication/security foundations, file intake, storage/scanning adapters, worker queue, review APIs, lifecycle controls, and protected downloads.
- `apps/web` - zero-dependency routed SPA with Home, Evidence, AI Review, Gaps & Actions, Action Plan, Audit Packs, Facilities, Team & Roles, Security, and System views.
- `packages/config` - environment validation.
- `packages/ai` - bounded multi-format extraction, OOXML safety, provenance, deterministic profiles, and one provider-portable mock/OpenAI/Azure OpenAI analysis contract.
- `packages/db` - Postgres migrations plus production Postgres and development file repositories.
- `packages/rules` - starter rules packs, applicability, scoring, gap matrix, and action plan logic.
- `packages/pdf` - audit packet PDF generation.
- `packages/shared` - validation and shared domain helpers.
- `tests` - self-contained Node tests plus Playwright pilot smoke coverage.

## Local setup

Use Node 20 or newer.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Quick local Ergon walkthrough

Use file-backed local data, local storage, mock scanner, AI disabled, recovery delivery disabled, and MFA disabled for the first walkthrough.

Seed synthetic local-only data:

```bash
env NODE_ENV=development DEPLOYMENT_PROFILE=local PROCESS_ROLE=api-and-worker REPOSITORY_BACKEND=file DATABASE_URL= FILE_REPOSITORY_PATH=/private/tmp/ergon-phase24-dev-db.json STORAGE_BACKEND=local UPLOAD_DIR=/private/tmp/ergon-phase24-private-storage SESSION_SECRET=development-secret-change-me ENABLE_DEMO_DATA=true ADMIN_PASSWORD='SyntheticPassword#2026' AI_ENABLED=false RECOVERY_DELIVERY_PROVIDER=disabled RECOVERY_EXPOSE_TEST_TOKEN=false MFA_ENABLED=false MALWARE_SCAN_ENABLED=true MALWARE_SCANNER_PROVIDER=mock npm run seed:pilot
```

Start the app:

```bash
env NODE_ENV=development DEPLOYMENT_PROFILE=local PROCESS_ROLE=api-and-worker PORT=4500 WEB_PORT=5500 APP_URL=http://localhost:5500 ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:4500,http://127.0.0.1:4500 WEB_API_ORIGIN=http://localhost:4500 REPOSITORY_BACKEND=file DATABASE_URL= FILE_REPOSITORY_PATH=/private/tmp/ergon-phase24-dev-db.json STORAGE_BACKEND=local UPLOAD_DIR=/private/tmp/ergon-phase24-private-storage SESSION_SECRET=development-secret-change-me ENABLE_DEMO_DATA=false AI_ENABLED=false RECOVERY_DELIVERY_PROVIDER=disabled RECOVERY_EXPOSE_TEST_TOKEN=false MFA_ENABLED=false MALWARE_SCAN_ENABLED=true MALWARE_SCANNER_PROVIDER=mock npm run dev
```

Open:

```text
http://localhost:5500
```

Synthetic local credentials after the seed:

```text
Email: pilot-admin@ergon.local
Password: SyntheticPassword#2026
```

These credentials are intentionally synthetic and local-only.

## Environment

Copy `.env.example` only when you need a local editable environment. Do not commit real `.env` files.

Production or closed-pilot deployments require deliberate external infrastructure: Postgres, private S3-compatible storage, secure session secret, HTTPS origins, and production-appropriate malware scanning. Closed pilot additionally requires enabled, required, fail-closed ClamAV scanning.

Optional integrations include provider-backed evidence analysis and SMTP password recovery. Keep both disabled unless deliberately configured.

### Controlled real-provider acceptance

Real-provider acceptance is local and deliberate; it is not a public production deployment. Keep all values below in the current shell or another untracked secret store. Never commit a populated `.env`, paste secrets into chat, or put provider values in browser code.

Choose exactly one provider with `AI_PROVIDER=mock`, `AI_PROVIDER=openai`, or `AI_PROVIDER=azure_openai`. All three reuse the same ERGON prompt, strict schema, validation, grounding, provenance, evaluation, persistence, audit, and human-review boundary. Each request is bounded by `AI_MAX_FILE_TEXT_CHARS` (default 12,000), `AI_MAX_OUTPUT_TOKENS` (default 2,000), and `AI_TIMEOUT_MS` (default 30,000). The worker defaults to one concurrent job and at most three queue attempts, with exactly one provider call per attempt.

For standard OpenAI, `OPENAI_MODEL` is never hardcoded. For the current acceptance starting point, `gpt-5.6-terra` balances extraction capability and cost and supports the Responses API and Structured Outputs; change it without a code edit if provider availability or evaluation evidence favors another supported model.

Set the AI values privately:

```bash
export AI_ENABLED=true
export AI_PROVIDER=openai
export OPENAI_MODEL=gpt-5.6-terra
export AI_MAX_FILE_TEXT_CHARS=12000
export AI_MAX_OUTPUT_TOKENS=2000
export AI_TIMEOUT_MS=30000
read -r -s 'OPENAI_API_KEY?OpenAI API key: '
export OPENAI_API_KEY
printf '\n'
```

Azure OpenAI is a separate first-class provider. Its key is never reused as `OPENAI_API_KEY`. Supply the resource endpoint without credentials, plus the deployment name that exists in that Azure resource and region. ERGON normalizes `https://YOUR-RESOURCE-NAME.openai.azure.com` or the same endpoint ending in `/openai/v1` to `/openai/v1/responses`, requires HTTPS, sends the private key only in the `api-key` header, and passes `AZURE_OPENAI_DEPLOYMENT` as the Responses API `model` value.

Structured-output support depends on the actual Azure deployment. Live acceptance must prove that the deployment accepts the shared `text.format` strict JSON Schema request; ERGON fails safely and never downgrades to free-form prose parsing.

Set Azure OpenAI values privately:

```bash
export AI_ENABLED=true
export AI_PROVIDER=azure_openai
export AI_MAX_FILE_TEXT_CHARS=12000
export AI_MAX_OUTPUT_TOKENS=2000
export AI_TIMEOUT_MS=30000

read -r 'AZURE_OPENAI_ENDPOINT?Azure OpenAI endpoint: '
export AZURE_OPENAI_ENDPOINT

read -r 'AZURE_OPENAI_DEPLOYMENT?Azure OpenAI deployment name: '
export AZURE_OPENAI_DEPLOYMENT

read -r -s 'AZURE_OPENAI_API_KEY?Azure OpenAI API key: '
export AZURE_OPENAI_API_KEY
printf '\n'
```

API-key authentication is supported for this controlled private acceptance. For a future Azure-hosted production deployment, Microsoft Entra ID with Managed Identity is the preferred direction where appropriate because it avoids a stored provider key. Phase 25B does not implement Entra ID, add `@azure/identity`, or provision Azure infrastructure.

The optional live AI command uses `AI_PROVIDER` and makes five paid requests using repository-generated synthetic TXT, CSV, PDF, DOCX, and XLSX evidence. It refuses to run without explicit opt-in and provider-appropriate private configuration, and prints only safe classifications, metrics, latency, and token counts:

```bash
npm run qa:ai-eval
ERGON_LIVE_AI_ACCEPTANCE=true npm run qa:ai-live
```

Provision a local acceptance administrator with a real email and a password chosen privately. This reuses the one-time audited provisioning command; it does not create public self-signup:

```bash
export PROVISION_ORGANIZATION_NAME='ERGON Acceptance Workspace'
export PROVISION_ADMIN_NAME='Acceptance Administrator'
read -r 'PROVISION_ADMIN_EMAIL?Acceptance email: '
export PROVISION_ADMIN_EMAIL
read -r -s 'PROVISION_ADMIN_PASSWORD?Private acceptance password: '
export PROVISION_ADMIN_PASSWORD
printf '\n'
npm run admin:provision
```

Configure SMTP in the same private shell. With `SMTP_USE_TLS=true`, port 465 uses implicit TLS and other ports such as 587 require STARTTLS. Confirm the port with the mail provider. Certificate and hostname verification stay enabled.

```bash
export RECOVERY_DELIVERY_PROVIDER=smtp
export RECOVERY_EXPOSE_TEST_TOKEN=false
export APP_URL=http://localhost:5173
read -r 'SMTP_HOST?SMTP host: '
read -r 'SMTP_PORT?SMTP port: '
read -r 'SMTP_USERNAME?SMTP username: '
read -r -s 'SMTP_PASSWORD?SMTP password: '
printf '\n'
read -r 'SMTP_FROM_EMAIL?SMTP from email: '
export SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD SMTP_FROM_EMAIL
export SMTP_USE_TLS=true
```

Start the API and web app from that shell with the same untracked file repository used for provisioning. Then request recovery from the sign-in screen. A successful SMTP handoff is not proof of inbox arrival: only the recipient can classify a real inbox test as passed. Reset links may use localhost only for this controlled same-machine acceptance.

Normal `npm test` and CI never call standard OpenAI, Azure OpenAI, or real email. Deterministic extraction, provenance, and human review remain available with `AI_ENABLED=false` or if the provider fails. Real provider results remain candidates, never legal truth or automatic evidence acceptance.

## Verification

Self-contained checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
npm audit --omit=dev
npm run scan:claims
npm run scan:random
```

Infrastructure-dependent validators skip unless disposable external test infrastructure is provided:

```bash
npm run validate:postgres
npm run validate:storage
npm run validate:scanner
```

Browser smoke:

```bash
npm run qa:pilot
```

If local Chromium is unavailable or blocked by the host sandbox, classify that as a local browser-runtime blocker rather than an Ergon product failure.

## Pilot status

`NO_GO`

The codebase has strong local and CI foundations, but external staging readiness, production infrastructure, operational monitoring, backup/restore, live scanner deployment, and other closed-pilot gates remain unresolved.

## Strategy documents

- `ERGON_PRODUCT_STRATEGY.md`
- `ERGON_UX_PRINCIPLES.md`
- `ERGON_IDENTITY_STRATEGY.md`
- `ERGON_CLEANUP_AUDIT.md`
