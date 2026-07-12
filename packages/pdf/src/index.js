const DISCLAIMER = "This packet is intended for audit-preparation and evidence organization support only. It is not legal advice, does not guarantee compliance, and does not represent certification or approval by OSHA, EPA, Canadian federal/provincial regulators, Mexican STPS/SEMARNAT, or any other regulator. Demo or unverified rules are clearly labeled.";
const AI_DISCLAIMER = "AI-assisted evidence analysis is provided for audit-preparation support only. It may classify documents, extract fields, and suggest evidence matches, but it does not provide legal advice, guarantee compliance, or certify that evidence satisfies any regulatory requirement. Human or expert review is recommended before relying on this packet.";

/* ---------- Layout constants (A4) ---------- */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_TOP = 786;
const CONTENT_BOTTOM = 76;

const INK = "0.09 0.13 0.18";
const MUTED = "0.42 0.48 0.56";
const ACCENT = "0.05 0.34 0.39";
const RULE = "0.85 0.88 0.91";

const STYLES = {
  section: { font: "F2", size: 12.5, lineHeight: 20, color: ACCENT, spaceBefore: 18, rule: true },
  h2: { font: "F2", size: 10, lineHeight: 15, color: INK, spaceBefore: 8 },
  body: { font: "F1", size: 9, lineHeight: 13, color: INK },
  bodyBold: { font: "F2", size: 9, lineHeight: 13, color: INK },
  small: { font: "F1", size: 8, lineHeight: 11.5, color: MUTED },
  note: { font: "F1", size: 8.5, lineHeight: 12, color: MUTED }
};

/* ---------- Document content ---------- */

export function buildAuditPacketBlocks({ facility, review, gapRows, actionItems, evidence, rulesPack, findings, aiAnalyses = [] }) {
  const criticalMissing = gapRows.filter((row) => row.priority === "critical" && row.status !== "accepted");
  const acceptedEvidence = evidence.filter((item) => item.status === "accepted" && item.scanStatus !== "scan_suspicious");
  const expiredRejected = evidence.filter((item) => ["expired", "rejected"].includes(item.status));
  const suspiciousEvidence = evidence.filter((item) => item.scanStatus === "scan_suspicious");
  const unresolvedAnalyses = aiAnalyses.filter((item) => item.needsHumanReview || ["failed", "needs_review"].includes(item.processingStatus) || ["ocr_required", "extraction_failed"].includes(item.textExtractionStatus));
  const blocks = [];
  const push = (style, text) => blocks.push({ style, text: String(text ?? "") });
  const section = (title) => push("section", title);
  const gap = (height = 6) => blocks.push({ style: "gap", height });

  section("Facility Profile");
  push("body", `Facility: ${facility.name}`);
  push("body", `Jurisdiction: ${facility.country} / ${facility.region}`);
  push("body", `Industry: ${facility.industry}  |  Facility type: ${facility.facilityType}  |  Employees: ${facility.employeeCount}`);
  push("body", `Hazard profile: ${Object.entries(facility.hazardProfile || {}).filter(([, value]) => value).map(([key]) => key).join(", ") || "No hazards selected"}`);

  section("Jurisdiction and Rules Pack");
  push("body", `Rules pack: ${rulesPack.name} (${rulesPack.rulesPackId})`);
  if (rulesPack.version) push("body", `Version: ${rulesPack.version}  |  Authority scope: ${rulesPack.authorityScope || "See pack description"}`);
  push("small", rulesPack.demoContent === false ? "This rules pack has been expert-reviewed." : "Starter rules are demo/unverified content and require qualified expert review before reliance.");

  section("Readiness Score");
  push("bodyBold", `${review.readinessScore} / 100`);
  for (const line of review.scoreExplanation || []) push("body", line);
  push("small", "The readiness score is a deterministic evidence-position indicator, not a compliance rating.");

  section("Executive Summary");
  push("body", `${review.summary.totalApplicableObligations} applicable obligations for this facility profile`);
  push("body", `${review.summary.missingEvidenceCount} obligations missing accepted evidence`);
  push("body", `${review.summary.criticalGapsCount} critical-priority gaps outstanding`);
  push("body", `${review.summary.demoRulesCount} demo or unverified rules included in this analysis`);

  section("Processing and Review Summary");
  push("body", `${aiAnalyses.filter((item) => item.processingStatus === "processed").length} evidence analyses processed`);
  push("body", `${unresolvedAnalyses.length} unresolved review items`);
  push("body", `${suspiciousEvidence.length} suspicious or blocked evidence files`);
  for (const item of unresolvedAnalyses) {
    push("small", `${evidence.find((entry) => entry.id === item.evidenceId)?.title || item.evidenceId}: ${item.textExtractionStatus} / ${item.processingStatus}`);
  }

  section("Evidence Gap Matrix");
  for (const row of gapRows) {
    push("bodyBold", `${row.priority.toUpperCase()}  |  ${String(row.status).replaceAll("_", " ")}  |  ${row.authority} ${row.citation}`);
    push("body", row.obligationTitle);
    push("small", `Required evidence: ${row.requiredEvidence.map((type) => type.replaceAll("_", " ")).join(", ")}`);
    gap(4);
  }
  if (!gapRows.length) push("body", "No applicable obligations were analyzed for this facility.");

  section("Critical Missing Evidence");
  if (criticalMissing.length) {
    for (const row of criticalMissing) push("body", `${row.authority} ${row.citation}: ${row.requiredEvidence.map((type) => type.replaceAll("_", " ")).join(", ")}`);
  } else {
    push("body", "None");
  }

  section("Accepted Evidence");
  if (acceptedEvidence.length) {
    for (const item of acceptedEvidence) push("body", `${item.title} (${item.evidenceType})`);
  } else {
    push("body", "None");
  }

  section("Expired / Rejected Evidence");
  if (expiredRejected.length) {
    for (const item of expiredRejected) push("body", `${item.title} (${item.status})`);
  } else {
    push("body", "None");
  }

  section("Evidence Index");
  if (evidence.length) {
    for (const item of evidence) push("small", `${item.id}: ${item.title}  |  ${item.evidenceType}  |  ${item.status}`);
  } else {
    push("body", "No evidence logged");
  }

  section("AI Evidence Intelligence and Audit Lineage");
  push("note", AI_DISCLAIMER);
  gap(4);
  if (aiAnalyses.length) {
    for (const analysis of aiAnalyses) {
      const evidenceItem = evidence.find((item) => item.id === analysis.evidenceId);
      const finalRows = gapRows.filter((row) => row.matchedEvidence?.some((item) => item.id === analysis.evidenceId));
      const finalMatches = finalRows.map((row) => {
        const matched = row.matchedEvidence.find((item) => item.id === analysis.evidenceId);
        return `${row.authority} ${row.citation} - ${row.obligationTitle} (${matched.matchSource})`;
      });
      push("h2", `Evidence: ${evidenceItem?.title || analysis.evidenceId}`);
      push("body", `Evidence status: ${evidenceItem?.status || "unknown"}  |  Scan: ${evidenceItem?.scanStatus || "scan_unavailable"}`);
      push("body", `Analysis version: ${analysis.analysisVersion || 1}  |  Job: ${analysis.processingJobId || "manual/legacy"}  |  Extraction: ${analysis.textExtractionStatus}`);
      push("body", `Detected type: ${analysis.detectedEvidenceType || "Not classified"}  |  Confidence: ${analysis.confidence ?? "N/A"}  |  Processing: ${analysis.processingStatus}`);
      push("body", `Extracted dates: document ${analysis.extractedDocumentDate || "unknown"}; expiration ${analysis.extractedExpirationDate || "unknown"}`);
      push("body", `Extracted fields: employees ${(analysis.extractedEmployeeNames || []).join(", ") || "none"}; equipment ${(analysis.extractedEquipmentNames || []).join(", ") || "none"}; chemicals ${(analysis.extractedChemicalNames || []).join(", ") || "none"}; signature ${analysis.extractedSignaturePresent === null || analysis.extractedSignaturePresent === undefined ? "unknown" : analysis.extractedSignaturePresent ? "present" : "not detected"}`);
      push("body", `Suggested obligation: ${analysis.suggestedObligationTitle || "None"}  |  Reason: ${analysis.matchReason || "No AI match reason"}`);
      push("body", `Final matched obligation: ${finalMatches.join("; ") || "No final match"}`);
      push("body", `Human review: ${analysis.humanReviewed ? "Human reviewed" : analysis.needsHumanReview ? "Needs human review" : "Not yet human reviewed"}`);
      push("body", `Reviewer notes: ${analysis.humanReviewNotes || evidenceItem?.reviewerNotes || "None"}`);
      push("body", `Issues: ${(analysis.issues || []).join("; ") || "None reported"}`);
      push("small", `Remaining action: ${finalRows.filter((row) => row.status !== "accepted").map((row) => row.recommendedAction).filter(Boolean).join("; ") || "No lineage-specific action recorded"}`);
      gap(6);
    }
  } else {
    push("body", "AI analysis was disabled or no AI analysis was available for this review.");
  }

  section("7-Day / 30-Day / 90-Day Action Plan");
  if (actionItems.length) {
    for (const item of actionItems) {
      push("body", `${String(item.bucket).replaceAll("_", " ")}: ${item.title}`);
      push("small", `Owner: ${item.ownerRole}  |  Due: ${item.dueDate}`);
      gap(3);
    }
  } else {
    push("body", "No open actions — applicable obligations have current accepted evidence.");
  }

  section("Findings");
  if (findings.length) {
    for (const finding of findings) push("body", `${finding.severity}: ${finding.title}`);
  } else {
    push("body", "None");
  }

  section("Expert Review Status");
  push("body", "Expert review recommended. Starter rules are demo/unverified unless separately reviewed.");
  push("small", "Rules with demoContent=true or expertReviewed=false are preparation aids only and require qualified review.");

  section("Disclaimers");
  push("note", DISCLAIMER);
  push("note", AI_DISCLAIMER);

  return blocks;
}

export function generateAuditPacketPdf(data) {
  const blocks = buildAuditPacketBlocks(data);
  const cover = buildCoverPage(data);
  const pages = layoutPages(blocks);
  return assemblePdf(cover, pages);
}

/* ---------- Cover page ---------- */

function buildCoverPage({ facility, review, rulesPack, aiAnalyses = [] }) {
  const ops = [];
  // Brand mark
  ops.push(`${ACCENT} rg`, `${MARGIN_LEFT} 742 30 30 re f`);
  ops.push("BT", "1 1 1 rg", "/F2 13 Tf", `1 0 0 1 ${MARGIN_LEFT + 5.5} 751.5 Tm`, `(CQ) Tj`, "ET");
  ops.push("BT", `${INK} rg`, "/F2 15 Tf", `1 0 0 1 ${MARGIN_LEFT + 40} 757 Tm`, `(${esc("Ergon")}) Tj`, "ET");
  ops.push("BT", `${MUTED} rg`, "/F1 8.5 Tf", `1 0 0 1 ${MARGIN_LEFT + 40} 745 Tm`, `(${esc("INDUSTRIAL EVIDENCE INTELLIGENCE")}) Tj`, "ET");
  ops.push(`${RULE} RG`, "0.8 w", `${MARGIN_LEFT} 728 m ${PAGE_WIDTH - MARGIN_RIGHT} 728 l S`);

  // Title
  ops.push("BT", `${INK} rg`, "/F2 30 Tf", `1 0 0 1 ${MARGIN_LEFT} 600 Tm`, `(${esc("Industrial Audit")}) Tj`, "ET");
  ops.push("BT", `${INK} rg`, "/F2 30 Tf", `1 0 0 1 ${MARGIN_LEFT} 564 Tm`, `(${esc("Readiness Packet")}) Tj`, "ET");
  ops.push("BT", `${MUTED} rg`, "/F1 11 Tf", `1 0 0 1 ${MARGIN_LEFT} 534 Tm`, `(${esc("Evidence position, gap analysis, and audit lineage")}) Tj`, "ET");

  // Meta block
  const meta = [
    ["Facility", facility.name],
    ["Jurisdiction", `${facility.country} / ${facility.region}`],
    ["Rules pack", `${rulesPack.name}`],
    ["Readiness score", `${review.readinessScore} / 100`],
    ["AI evidence analyses", aiAnalyses.length ? `${aiAnalyses.length} included with lineage` : "None (AI disabled or not run)"],
    ["Generated", new Date().toISOString()]
  ];
  let metaY = 470;
  for (const [term, value] of meta) {
    ops.push("BT", `${MUTED} rg`, "/F2 8 Tf", `1 0 0 1 ${MARGIN_LEFT} ${metaY} Tm`, `(${esc(term.toUpperCase())}) Tj`, "ET");
    ops.push("BT", `${INK} rg`, "/F1 11 Tf", `1 0 0 1 ${MARGIN_LEFT} ${metaY - 14} Tm`, `(${esc(ascii(String(value)).slice(0, 78))}) Tj`, "ET");
    metaY -= 40;
  }

  // Disclaimer box
  const boxTop = 196;
  const boxHeight = 104;
  ops.push(`${RULE} RG`, "0.8 w", `${MARGIN_LEFT} ${boxTop - boxHeight} ${CONTENT_WIDTH} ${boxHeight} re S`);
  ops.push("BT", `${INK} rg`, "/F2 9 Tf", `1 0 0 1 ${MARGIN_LEFT + 14} ${boxTop - 20} Tm`, `(${esc("Important notice")}) Tj`, "ET");
  let noteY = boxTop - 34;
  for (const line of wrap(ascii(DISCLAIMER), 100).slice(0, 6)) {
    ops.push("BT", `${MUTED} rg`, "/F1 8 Tf", `1 0 0 1 ${MARGIN_LEFT + 14} ${noteY} Tm`, `(${esc(line)}) Tj`, "ET");
    noteY -= 11;
  }

  return ops.join("\n");
}

/* ---------- Content layout ---------- */

function layoutPages(blocks) {
  const pages = [];
  let rows = [];
  let y = CONTENT_TOP;
  const newPage = () => {
    if (rows.length) pages.push(rows);
    rows = [];
    y = CONTENT_TOP;
  };
  const ensure = (height) => {
    if (y - height < CONTENT_BOTTOM) newPage();
  };

  for (const block of blocks) {
    if (block.style === "gap") {
      y -= block.height;
      continue;
    }
    const style = STYLES[block.style] || STYLES.body;
    const charWidth = style.size * 0.5;
    const maxChars = Math.max(20, Math.floor(CONTENT_WIDTH / charWidth));
    const lines = wrap(ascii(block.text), maxChars);
    if (style.spaceBefore && y !== CONTENT_TOP) y -= style.spaceBefore;
    for (const [index, line] of lines.entries()) {
      ensure(style.lineHeight + (block.style === "section" ? 8 : 0));
      rows.push({ text: line, font: style.font, size: style.size, color: style.color, y: y - style.size });
      y -= style.lineHeight;
      if (block.style === "section" && index === lines.length - 1) {
        rows.push({ rule: true, y: y + 4 });
        y -= 6;
      }
    }
  }
  if (rows.length) pages.push(rows);
  if (!pages.length) pages.push([]);
  return pages;
}

function contentPageOps(rows, pageIndex, totalPages) {
  const ops = [];
  // Running header
  ops.push("BT", `${MUTED} rg`, "/F2 7.5 Tf", `1 0 0 1 ${MARGIN_LEFT} 810 Tm`, `(${esc("Ergon - Industrial Audit Readiness Packet")}) Tj`, "ET");
  ops.push(`${RULE} RG`, "0.6 w", `${MARGIN_LEFT} 802 m ${PAGE_WIDTH - MARGIN_RIGHT} 802 l S`);
  for (const row of rows) {
    if (row.rule) {
      ops.push(`${RULE} RG`, "0.6 w", `${MARGIN_LEFT} ${row.y} m ${PAGE_WIDTH - MARGIN_RIGHT} ${row.y} l S`);
    } else {
      ops.push("BT", `${row.color} rg`, `/${row.font} ${row.size} Tf`, `1 0 0 1 ${MARGIN_LEFT} ${row.y} Tm`, `(${esc(row.text)}) Tj`, "ET");
    }
  }
  // Footer
  ops.push(`${RULE} RG`, "0.6 w", `${MARGIN_LEFT} 58 m ${PAGE_WIDTH - MARGIN_RIGHT} 58 l S`);
  ops.push("BT", `${MUTED} rg`, "/F1 7.5 Tf", `1 0 0 1 ${MARGIN_LEFT} 46 Tm`, `(${esc("Audit-preparation support only. Not legal advice and not a compliance certification.")}) Tj`, "ET");
  ops.push("BT", `${MUTED} rg`, "/F1 7.5 Tf", `1 0 0 1 ${PAGE_WIDTH - MARGIN_RIGHT - 60} 46 Tm`, `(${esc(`Page ${pageIndex + 2} of ${totalPages}`)}) Tj`, "ET");
  return ops.join("\n");
}

/* ---------- PDF assembly ---------- */

function assemblePdf(coverOps, contentPages) {
  const totalPages = contentPages.length + 1;
  const streams = [coverOps, ...contentPages.map((rows, index) => contentPageOps(rows, index, totalPages))];

  const objects = [];
  const pageIds = streams.map((_, index) => 5 + index * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  for (const [index, stream] of streams.entries()) {
    const contentId = pageIds[index] + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(parts.join(""));
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  for (let i = 1; i < offsets.length; i += 1) {
    parts.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(parts.join(""), "utf8");
}

/* ---------- Text helpers ---------- */

function esc(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text, width) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width) {
      if (line) lines.push(line);
      if (word.length > width) {
        for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width));
        line = "";
      } else {
        line = word;
      }
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ascii(text) {
  return text.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
}

export { DISCLAIMER as AUDIT_PACKET_DISCLAIMER, AI_DISCLAIMER as AI_EVIDENCE_DISCLAIMER };
