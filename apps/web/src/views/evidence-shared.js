import { canReview, state } from "../store.js";
import { ICONS, confidencePill, html, kv, label, pill, reviewStatePill, titleCase } from "../ui.js";

export function processingBadges(item, job) {
  const lifecycle = processingLabel(item, job);
  return `
    <div class="badge-row">
      ${pill(item.scanStatus || "scan_unavailable", { text: scanText(item.scanStatus) })}
      ${pill(lifecycle.code, { text: lifecycle.text })}
      ${item.status ? pill(item.status, { text: `Evidence ${label(item.status)}` }) : ""}
      ${job && job.processingAttempts > 1 ? `<span class="pill pill-neutral plain">Attempt ${job.processingAttempts}/${job.maxAttempts}</span>` : ""}
    </div>
    ${(job?.lastProcessingError || item.scanError) ? `<div class="alert" style="font-size:0.8rem">${html(job?.lastProcessingError || item.scanError)}</div>` : ""}
  `;
}

export function processingLabel(item, job) {
  const analysis = analysisFor(item.id);
  if (item.scanStatus === "scan_suspicious") return { code: "blocked", text: "Suspicious — blocked" };
  if (item.scanStatus === "scan_pending") return { code: "queued", text: "Scan pending" };
  if (analysis?.textExtractionStatus === "ocr_required") return { code: "ocr_required", text: "OCR / manual review required" };
  if (analysis?.extractionStatus === "failed" || analysis?.textExtractionStatus === "extraction_failed") return { code: "failed", text: "Extraction failed — review or retry" };
  if (analysis?.extractionStatus === "unsupported") return { code: "failed", text: "Unsupported — manual review" };
  if (analysis?.extractionStatus === "partial") return { code: "needs_review", text: "Partial extraction — review" };
  if (job?.status === "queued") return { code: "queued", text: "Processing queued" };
  if (job?.status === "processing") return { code: "processing", text: "AI analyzing" };
  if (["failed", "dead_letter"].includes(job?.status) || analysis?.processingStatus === "failed") {
    return { code: "failed", text: job?.status === "dead_letter" ? "Dead-letter — operator review" : "Processing failed" };
  }
  if (analysis?.processingStatus === "needs_review") return { code: "needs_review", text: "Needs review" };
  if (analysis?.processingStatus === "processed") return { code: "processed", text: "AI processed" };
  return { code: "uploaded", text: item.fileReference || item.fileName ? "Uploaded" : "Manual record" };
}

export function analysisFor(evidenceId) {
  return state.aiAnalyses.find((entry) => entry.evidenceId === evidenceId) || null;
}

export function jobFor(evidenceId) {
  return state.processingJobs.find((entry) => entry.evidenceId === evidenceId) || null;
}

export function aiAnalysisPanel(analysis) {
  if (!analysis) return "";
  const profile = analysis.deterministicProfile || {};
  const anchors = analysis.provenanceAnchors || [];
  const aiDisabled = analysis.aiProfile?.status === "disabled";
  const warnings = [...new Set([...(analysis.processingWarnings || []), ...(analysis.issues || [])])];
  const processingProblem = ["failed", "ocr_required", "unsupported"].includes(analysis.extractionStatus) ? warnings[0] : null;
  const additionalWarnings = warnings.filter((warning) => warning !== processingProblem);
  const extracted = [
    ["Detected format", titleCase(analysis.detectedFormat || "unknown")],
    ["Extraction", titleCase(analysis.extractionStatus || analysis.textExtractionStatus || "not started")],
    ["Method", titleCase(analysis.extractionMethod || "not available")],
    ["Source references", String(anchors.length)],
    ["Words", profile.wordCount === undefined ? "Unknown" : String(profile.wordCount)],
    ["Likely evidence type", titleCase(analysis.detectedEvidenceType || "other")],
    ["Document date", analysis.extractedDocumentDate ? html(analysis.extractedDocumentDate) : "Unknown"],
    ["Expiration date", analysis.extractedExpirationDate ? html(analysis.extractedExpirationDate) : "Unknown"],
    ["Signature", analysis.extractedSignaturePresent === null || analysis.extractedSignaturePresent === undefined ? "Unknown" : analysis.extractedSignaturePresent ? "Detected" : "Not detected"],
    ["Employees", (analysis.extractedEmployeeNames || []).map(html).join(", ") || "None extracted"],
    ["Equipment", (analysis.extractedEquipmentNames || []).map(html).join(", ") || "None extracted"],
    ["Chemicals", (analysis.extractedChemicalNames || []).map(html).join(", ") || "None extracted"],
    ["Analysis", `v${html(analysis.analysisVersion || 1)} · ${html(label(analysis.textExtractionStatus || "not_started"))}`]
  ];
  return `
    <div class="ai-panel">
      <div class="ai-panel-head">
        <span class="ai-panel-title">${ICONS.spark} Evidence understanding</span>
        <span class="badge-row">
          ${analysis.confidence === null || analysis.confidence === undefined ? "" : confidencePill(analysis.confidence)}
          ${reviewStatePill(analysis)}
        </span>
      </div>
      <p>${html(processingProblem || analysis.summary || (aiDisabled ? "AI analysis is not enabled. Deterministic extraction is available below." : analysis.error || "Deterministic extraction is ready for review."))}</p>
      ${analysis.humanReviewed ? `<div class="alert-info small"><strong>Human-confirmed decision preserved.</strong> New processing output remains a separate candidate until a reviewer explicitly replaces it.</div>` : ""}
      <details class="detail-disclosure">
        <summary>View processing details</summary>
        <div class="kv-grid">${extracted.map(([term, value]) => kv(term, value)).join("")}</div>
      </details>
      ${anchors.length ? `
        <details class="detail-disclosure">
          <summary>Source references (${anchors.length})</summary>
          <ul class="issue-list source-reference-list">${anchors.map((anchor) => `<li><strong>${html(anchor.label || anchor.id)}</strong>${anchor.excerpt ? `<span class="small muted">${html(anchor.excerpt)}</span>` : ""}</li>`).join("")}</ul>
        </details>
      ` : ""}
      ${analysis.suggestedObligationTitle ? `
        <div class="kv-grid">
          ${kv("Suggested obligation", html(analysis.suggestedObligationTitle))}
          ${kv("Match reason", html(analysis.matchReason || "No AI match reason"))}
        </div>
      ` : `<p class="small muted">No obligation suggestion — deterministic matching and human review still apply.</p>`}
      ${additionalWarnings.length ? `<ul class="issue-list">${additionalWarnings.map((issue) => `<li>${html(issue)}</li>`).join("")}</ul>` : ""}
      ${analysis.humanReviewNotes ? `<p class="small"><strong>Reviewer notes:</strong> ${html(analysis.humanReviewNotes)}</p>` : ""}
      <p class="field-hint">Extracted facts and AI suggestions are review candidates — not legal advice, legal applicability, or compliance certification. Human-confirmed decisions remain authoritative.</p>
    </div>
  `;
}

export function reviewForm(item, analysis) {
  if (!canReview() || !analysis) return "";
  return `
    <details class="detail-disclosure review-disclosure">
      <summary>Review evidence decision</summary>
      <form class="review-form" data-form="ai-review" data-evidence-id="${html(item.id)}">
      <div class="review-form-controls">
        <label class="field">
          <span class="field-label">Evidence type decision</span>
          <select name="evidenceType">
            <option value="">Keep current (${html(label(item.evidenceType))})</option>
            ${state.evidenceTypes.map((type) => `<option value="${html(type)}" ${type === (analysis.humanOverrideEvidenceType || analysis.detectedEvidenceType) ? "selected" : ""}>${html(label(type))}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Obligation match decision</span>
          <select name="ruleId">
            <option value="">Keep current match</option>
            ${state.applicableRules.map((rule) => `<option value="${html(rule.id)}" ${rule.id === (analysis.humanOverrideRuleId || analysis.suggestedRuleId) ? "selected" : ""}>${html(rule.title)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="field">
        <span class="field-label">Reviewer notes</span>
        <textarea name="notes" placeholder="Why this decision was made — preserved in the audit lineage">${html(analysis.humanReviewNotes || "")}</textarea>
      </label>
      <div class="review-form-actions">
        <button type="submit" class="btn btn-primary btn-sm" name="action" value="accept_ai">Accept classification</button>
        <button type="submit" class="btn btn-secondary btn-sm" name="action" value="override">Apply override</button>
        <button type="submit" class="btn btn-secondary btn-sm" name="action" value="mark_accepted">Mark evidence accepted</button>
        <button type="submit" class="btn btn-danger btn-sm" name="action" value="mark_rejected">Reject evidence</button>
        <button type="submit" class="btn btn-ghost btn-sm" name="action" value="mark_needs_review">Keep in review</button>
        <button type="submit" class="btn btn-ghost btn-sm" name="action" value="request_more_evidence">Request more evidence</button>
      </div>
      </form>
    </details>
  `;
}

function scanText(status) {
  const map = {
    scan_clean: "Scan clean",
    scan_pending: "Scan pending",
    scan_failed: "Scan failed",
    scan_suspicious: "Scan suspicious",
    scan_unavailable: "No file scan"
  };
  return map[status] || "No file scan";
}
