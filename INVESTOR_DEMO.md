# ComplianceIQ — Investor Demo Script

A 10-minute guided walkthrough of the end-to-end product: messy facility files in, audit-ready packet out, with AI assistance and human control at every decision point.

All demo data is synthetic. Nothing in this flow uses real customer documents, and the AI runs against the deterministic mock provider unless you configure OpenAI.

## One-time setup

```bash
npm ci
cp .env.example .env    # defaults are fine for a local demo
```

Seed the demo workspace (development only; refuses to run in production):

```bash
NODE_ENV=development \
ENABLE_DEMO_DATA=true \
REPOSITORY_BACKEND=file \
AI_ENABLED=true AI_PROVIDER=mock \
MALWARE_SCAN_ENABLED=true MALWARE_SCANNER_PROVIDER=mock \
ADMIN_PASSWORD='DemoPassword#2026' \
npm run seed:demo
```

Start the app (API + worker + static web in one command):

```bash
AI_ENABLED=true AI_PROVIDER=mock \
MALWARE_SCAN_ENABLED=true MALWARE_SCANNER_PROVIDER=mock \
npm run dev
```

Open http://localhost:5173 and sign in:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@complianceiq.local` | the `ADMIN_PASSWORD` you seeded |
| Reviewer | `reviewer@complianceiq.local` | same |
| Manager | `manager@complianceiq.local` | same |

## The demo story (what the seed already contains)

The **Demo Metal Components Plant** (US / Ohio, metal fabrication, 86 employees) sits at **readiness 45/100**:

- 13 applicable obligations from the US industrial manufacturing starter pack
- 12 accepted evidence items (LOTO, HazCom, PPE, recordkeeping, emergency action)
- **1 critical gap**: the hazardous chemical inventory is AI-matched at 88% confidence but still awaiting reviewer acceptance
- **4 review-queue items**: the AI-matched chemical inventory (critical impact), scanned forklift evaluations at 62% confidence (below the review threshold, so AI refused to finalize), an expired fire-extinguisher record, and a rejected audiometric summary

## Walkthrough (~10 minutes)

1. **Packet Builder (landing screen, 1 min).** Point at the status strip: facility, jurisdiction, backend-selected rules pack, readiness score, critical gaps, review queue. The workflow card shows exactly where this facility stands in the six-step path to an exportable packet.

2. **Upload a messy file (2 min).** Go to *Evidence*, upload any text file containing the words "lockout tagout" (or "forklift", "SDS", …). Narrate what happens automatically: file signature validation → malware scan → queued processing job → AI classification with confidence and a suggested obligation match. Refresh happens live; the AI panel shows extracted fields, the match reason, and the disclaimer that deterministic rules and reviewers stay authoritative.

3. **Review queue (2 min).** Switch to *Review queue* — four items need a human decision. The scanned forklift evaluations sit at 62% confidence — AI flagged its own uncertainty instead of guessing. As the reviewer: override the evidence type to `forklift training records`, select the powered-industrial-truck obligation, add a note, then **Mark evidence accepted**. Then accept the AI-matched hazardous chemical inventory to close the critical gap. Every action persists to the audit trail.

4. **Gap Matrix (2 min).** Open *Gap Matrix*. The forklift and hazard-communication rows just flipped to accepted and the readiness score jumped. Click any row: the drawer shows the plain-English obligation, authority and citation, required vs. matched evidence, the full AI lineage (versions, confidence, reviewer notes), and the recommended action. This is the heart of the product.

5. **Action plan (1 min).** *Action plan* shows the remaining work bucketed 7/30/90 days with owners and due dates — corrective actions close automatically as evidence is accepted and the analysis regenerates.

6. **Export the packet (2 min).** Back on *Packet Builder*, hit **Export audit packet**, then download the PDF from packet history. Flip through: cover page, readiness score with explanation, gap matrix, AI evidence lineage with reviewer sign-offs, action plan, and the disclaimers on every page footer. Emphasize: full source-to-packet lineage, and the packet never claims compliance or certification.

7. **Close (30 sec).** Admin screen (user/role management), System screen (dependency health, AI provider status, audit trail). Mention the production posture: separate API/worker deployment, Postgres, private S3 storage, ClamAV fail-closed scanning, tenant scoping on every query.

## Talking points if asked

- **"What does the AI actually decide?"** Nothing final. It classifies, extracts fields, and suggests matches with confidence. Low/medium confidence routes to humans; critical evidence never finalizes without deterministic agreement or reviewer sign-off.
- **"Is this legal advice?"** No — and the product says so everywhere: UI footers, drawer, PDF. Rules packs ship as demo/unverified until expert-reviewed, and the packet labels them.
- **"How do new jurisdictions land?"** Rules packs are data: country/region scoping, applicability triggers, evidence taxonomy, priorities. The US/CA/MX starter packs demonstrate the shape; new packs slot in without engine changes.
- **"What about security?"** Backend-only AI keys, scrypt passwords, signed tenant-checked sessions, login rate limiting, upload signature validation, malware scanning with a production fail-closed mode, private storage with authenticated downloads only, and an audit log on every material action.

## Reset

Delete the file-repository data (`data/` by default, or your `FILE_REPOSITORY_PATH`/`UPLOAD_DIR`) and re-run the seed.
