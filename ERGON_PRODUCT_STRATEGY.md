# Ergon Product Strategy

## Executive summary

Ergon is an AI-native manufacturing compliance workspace. Its job is to make compliance work dramatically easier by ingesting the information manufacturers already have, organizing it into useful facility and evidence context, mapping it to potentially relevant obligations, surfacing gaps and risks, drafting next actions and audit outputs, and preserving accountable human review.

The target operating model is approximately 80% automated assistance and 20% accountable human effort. This is a product principle, not a measured promise. Ergon should automate repetitive collection, classification, matching, summarization, prioritization, drafting, and packet assembly while humans remain accountable for legal interpretation, evidence acceptance, risk acceptance, external representations, exceptions, and destructive actions.

## The core problem

Manufacturing compliance evidence is scattered across spreadsheets, PDFs, scans, emails, shared drives, ERP exports, facility binders, maintenance logs, training files, safety data sheets, inspections, permits, and tribal knowledge. Existing systems often require the manufacturer to manually rebuild its compliance universe inside the software before the software becomes useful.

Ergon should invert that burden. The manufacturer should be able to give Ergon what already exists. Ergon should progressively understand the company, facilities, products, processes, equipment, chemicals, controls, evidence, and obligations, then guide humans toward the small portion of work that genuinely needs judgment.

## Who Ergon is for

Ergon is for SMEs, MSMEs, single-site manufacturers, multi-site manufacturers, and large manufacturers that need practical audit readiness and compliance operations support. It should work for companies using Excel, Word, PDFs, scans, email attachments, shared drives, legacy ERP exports, modern ERP/API systems, MES/QMS exports, supplier evidence, and operational data where relevant.

## Who Ergon is not for

Ergon is not a legal advice engine, a regulator, a compliance certification authority, a generic document drive, a replacement for qualified EHS/legal professionals, or a workflow system that forces every manufacturer to model its entire compliance program manually before receiving value.

## The 80/20 AI operating principle

Ergon should target roughly 80% automated assistance and 20% accountable human work, subject to future measurement.

AI should automate heavily:

- document ingestion;
- classification;
- metadata and entity extraction;
- facility-context extraction;
- evidence summarization;
- obligation candidate matching;
- duplicate detection;
- evidence sufficiency suggestions;
- missing-evidence suggestions;
- gap candidate detection;
- risk-prioritization suggestions;
- action-plan drafting;
- policy and procedure drafting;
- audit packet assembly;
- regulatory-change summaries;
- candidate impact analysis;
- follow-up reminders.

Humans retain accountability for:

- final material legal applicability;
- accepting, rejecting, or overriding evidence;
- high-risk compliance decisions;
- regulatory interpretation;
- risk acceptance;
- legal holds;
- destructive deletion;
- final certification;
- external representations to regulators;
- exceptions;
- AI override decisions.

## The ideal customer journey

The long-term workflow is:

```text
INGEST -> UNDERSTAND -> MAP -> DETECT -> PRIORITIZE -> RECOMMEND -> DRAFT -> REVIEW -> ACT -> PROVE -> MONITOR -> RE-EVALUATE
```

Current implementation supports a narrower version: facilities, evidence, verified multi-format uploads and provenance-backed extraction, mock or optional AI analysis foundations, review queue, deterministic gap analysis, action plan, audit packets, lifecycle controls, and system health. Planned and long-term phases expand OCR, regulatory intelligence, integrations, and monitoring.

Phase 24 established `INGEST → UNDERSTAND`; Phase 25 makes the existing OpenAI path ready for controlled real-provider acceptance with strict structured output, server validation, grounding, evaluation, and cost bounds. `INGEST` is an implemented foundation. `UNDERSTAND` is implemented when a real provider is configured, while deterministic fallback remains available. `MAP → DETECT → PRIORITIZE → RECOMMEND` remain partial starter-rule/audit-readiness foundations, `DRAFT` remains developing, and `MONITOR → RE-EVALUATE` remains future source-backed regulatory work.

## The Ergon compliance graph

Long term, Ergon should build a traceable manufacturing compliance graph with these conceptual nodes:

- Organization
- Facility
- Jurisdiction
- Industry
- Product
- Process
- Equipment
- Chemical/material
- Permit/license
- Regulation
- Regulatory version
- Requirement
- Obligation
- Applicability rationale
- Control
- Evidence
- Evidence version
- Gap
- Risk
- Action
- Owner
- Deadline
- Audit
- Packet
- Supplier
- Regulatory change
- Impact assessment
- Human decision
- AI suggestion

This is not fully implemented today. Defensibility should come from traceable applicability, provenance, historical regulatory versions, facility-specific context, evidence lineage, human decisions, outcome history, cross-document relationships, and continuous improvement.

## Supported input philosophy

Ergon should accept messy real-world inputs and become more connected over time.

IMPLEMENTED_NOW:

- PDF uploads;
- plain text, Markdown/log-style text;
- CSV;
- Word DOCX documents;
- Excel XLSX workbooks;
- supported images with signature verification;
- manual evidence records;
- synthetic local pilot data.

PLANNED:

- scanned PDFs and OCR;
- email attachments;
- SharePoint, Google Drive, and OneDrive ingestion;
- ERP, MES, and QMS exports;
- supplier evidence packages.

LONG_TERM:

- ERP APIs;
- continuous supplier evidence exchange;
- sensor or operational data where relevant;
- cross-facility evidence reuse and quality scoring;
- source-specific confidence and provenance models.

## Facility intelligence

Ergon should understand each facility's jurisdiction, industry, processes, equipment, chemicals/materials, workforce, permits, hazards, controls, supplier dependencies, and evidence maturity. Current support includes facility setup, jurisdictional starter rules-pack selection, hazard profiles, and deterministic review generation. Future support should infer facility context from documents and exports, with human confirmation.

## Evidence intelligence

Evidence intelligence should classify documents, extract metadata, identify entities, summarize content, detect stale or weak evidence, map evidence to candidate obligations, preserve versions, and route uncertain items to humans. Current support includes verified upload intake; local/private storage; scan-gated processing; bounded TXT, Markdown, CSV, text-layer PDF, DOCX, and XLSX extraction; deterministic profiles; page/line/row/paragraph/sheet-cell provenance; optional mock/OpenAI-backed candidate analysis; review queues; immutable analysis versions; and human overrides that remain authoritative across reprocessing. Images and textless PDFs are honestly marked `OCR_REQUIRED`; production OCR is not yet implemented.

## Obligation and applicability intelligence

Ergon should map facility context to candidate obligations and explain why something may apply. Current rules packs are starter/demo/unverified content and must not be treated as legal truth. Future obligation logic should be source-backed, versioned, jurisdiction-aware, industry/process/product-aware, and qualified by confidence plus human/expert review where material.

## Regulatory-change intelligence

Future regulatory intelligence must use a source-first architecture:

1. Official source registry
2. Source retrieval
3. Immutable/versioned source snapshot
4. Content normalization
5. Structural and semantic diff
6. AI-assisted change explanation
7. Jurisdiction tagging
8. Industry/process/product tagging
9. Candidate obligation mapping
10. Candidate affected-customer mapping
11. Confidence scoring
12. Human/expert verification for material legal interpretations
13. Approved obligation version
14. Customer impact notification
15. Evidence/control re-evaluation
16. Recommended action generation
17. Full provenance and audit trail

Source priority:

- Tier 1: official government API/feed/register
- Tier 2: official government webpage/publication
- Tier 3: licensed authoritative standards/content
- Tier 4: controlled webpage monitoring
- Tier 5: secondary intelligence for discovery only

Blind web scraping is not the source of legal truth. An LLM is not the source of legal truth. Every material obligation must retain provenance.

## Human-review boundaries

Ergon should never hide uncertainty. It should surface confidence, provenance, source references, AI suggestions, deterministic matches, human decisions, and audit trails. Humans approve material legal applicability, evidence acceptance, exceptions, risk acceptance, legal holds, destructive deletion, and regulator-facing representations.

## AI safety and provenance

AI outputs must be bounded, schema-validated, source-linked where possible, tenant-scoped, auditable, and reviewable. Raw model claims should not become accepted obligations or accepted evidence without deterministic agreement or human review. Future regulatory AI must explain changes and candidates, not invent legal truth.

## User experience principles

Ergon should answer quickly:

1. What is Ergon?
2. What should I give Ergon?
3. What will Ergon do automatically?
4. What needs my attention now?
5. What are my biggest compliance risks?
6. What evidence is missing?
7. What should I do next?
8. Am I becoming more audit-ready?

## Near-term product focus

Near-term focus should be manufacturer validation of multi-format evidence understanding, review ergonomics, gap/action clarity, audit packet quality, manual UX confidence, and truthful AI-disabled states. Current work intentionally does not implement new SSO, regulatory scraping, simulated OCR, ERP connectors, cloud infrastructure, monitoring vendors, or backup infrastructure.

## Two-year vision

Within two years, Ergon should support richer document ingestion, OCR, Word/Excel workflows, configurable facility context, stronger provenance, expert-reviewed rules content, standards-based external identity, and more practical manufacturer-facing workflows.

## Five-year vision

Within five years, Ergon should operate as a manufacturing compliance operating system: multi-source ingestion, source-backed obligation intelligence, cross-facility insight, supplier evidence management, integrations with common manufacturing systems, and continuous evidence quality improvement.

## Ten-year vision

Within ten years, Ergon should help manufacturers maintain a living compliance graph that connects facility reality, changing regulations, evidence lineage, human decisions, and audit readiness across jurisdictions and operational systems.

## Defensibility and moat

Defensibility should come from accumulated provenance, source snapshots, historical regulatory versions, facility-specific context, evidence lineage, human decisions, outcome history, cross-document relationships, expert review loops, and continuous improvement. The moat is not a generic chat interface; it is the trusted compliance graph and workflow evidence around manufacturing operations.

## Data strategy

Ergon should treat customer data as sensitive compliance evidence. Data strategy should prioritize tenant isolation, private storage, audit logging, source provenance, evidence versioning, retention/legal-hold controls, and minimal exposure of secrets or raw model internals.

## Integration strategy

Integrations should be progressive. Start with uploads and simple exports. Add email/drive ingestion, office-document parsing, and ERP/MES/QMS exports. Later add approved APIs, event-based updates, supplier evidence exchange, and bidirectional workflow integrations where manufacturers already work.

## Regulatory source strategy

Regulatory sources must be managed through a registry with source type, jurisdiction, authority, retrieval method, licensing/permission status, snapshot history, and review status. Licensed standards and expert content should be handled as authoritative inputs when rights permit.

## What Ergon should not become

Ergon should not become a generic file drive, a fake legal oracle, a one-size-fits-all ERP, a dashboard that hides source evidence, a compliance certification vendor, or an auth/security project at the expense of the core manufacturing compliance mission.

## Success metrics

- time from first upload to first useful gap/action insight;
- percentage of evidence auto-classified with acceptable confidence;
- percentage of AI suggestions accepted, overridden, or rejected;
- reviewer time per evidence decision;
- gap closure rate;
- packet export completion rate;
- evidence freshness and quality trends;
- number of obligations with full provenance;
- number of customer-impacting regulatory changes reviewed;
- user-reported clarity and trust.

## Product prioritization rules

Prioritize work that reduces manual compliance burden, increases provenance, improves reviewer judgment, makes uncertainty visible, expands safe ingestion, or improves audit-ready outputs. Deprioritize work that creates unsupported legal claims, expands custom auth, adds brittle integrations before ingestion foundations, or increases UI complexity without clearer decisions.

## Proposed next phases

1. Manual UX acceptance and evidence-driven refinements.
2. Evidence ingestion expansion for Word/Excel/scanned PDFs.
3. Source-backed rules and provenance model hardening.
4. Standards-based identity planning and implementation.
5. Regulatory source registry and snapshot pipeline prototype.
6. Production OCR and richer document understanding.
7. ERP/export connector discovery and pilot.
