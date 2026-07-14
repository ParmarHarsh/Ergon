import { canReview, state } from "../store.js";
import { ICONS, confidencePill, html, kv, label, pill, titleCase } from "../ui.js";

export function processingBadges(item, job) {
  const lifecycle = processingLabel(item, job);
  const showLifecycle = ["blocked", "failed", "ocr_required", "processing", "queued"].includes(lifecycle.code);
  return `
    <div class="badge-row evidence-trust-row" data-ui-role="supporting-trust-state">
      ${pill(item.scanStatus || "scan_unavailable", { text: scanText(item.scanStatus) })}
      ${showLifecycle ? pill(lifecycle.code, { text: lifecycle.text }) : ""}
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
  const processingWarnings = [...new Set(analysis.processingWarnings || [])];
  const findings = [...new Set(analysis.issues || [])];
  const warnings = [...new Set([...processingWarnings, ...findings])];
  const processingProblem = ["failed", "ocr_required", "unsupported"].includes(analysis.extractionStatus) ? warnings[0] : null;
  const visibleFindings = findings.filter((finding) => finding !== processingProblem).slice(0, 3);
  const hiddenFindings = findings.filter((finding) => finding !== processingProblem).slice(3);
  const obligationMatch = analysis.aiProfile?.obligationMatch || null;
  const humanRule = state.applicableRules.find((rule) => rule.id === analysis.humanOverrideRuleId) || null;
  const weakCandidate = obligationMatch?.classification === "WEAK_CANDIDATE" ? obligationMatch : null;
  const extractionSupportsMatching = !["empty", "failed", "ocr_required", "unsupported"].includes(analysis.extractionStatus)
    && !["empty", "extraction_failed", "ocr_required", "unsupported_for_text_extraction"].includes(analysis.textExtractionStatus);
  const supportedSuggestion = extractionSupportsMatching && analysis.suggestedObligationTitle;
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
        </span>
      </div>
      <p>${html(processingProblem || analysis.summary || (aiDisabled ? "AI analysis is not enabled. Deterministic extraction is available below." : analysis.error || "Deterministic extraction is ready for review."))}</p>
      ${analysis.humanReviewed ? `<div class="alert-info small"><strong>Human-confirmed decision preserved.</strong> New processing output remains a separate candidate until a reviewer explicitly replaces it.</div>` : ""}
      ${visibleFindings.length ? `<div class="evidence-findings"><strong class="small">What needs attention</strong><ul class="issue-list">${visibleFindings.map((issue) => `<li>${html(issue)}</li>`).join("")}</ul></div>` : ""}
      ${hiddenFindings.length ? `<details class="detail-disclosure" data-ui-role="additional-findings"><summary>Show all findings (${findings.length})</summary><ul class="issue-list disclosure-body">${hiddenFindings.map((issue) => `<li>${html(issue)}</li>`).join("")}</ul></details>` : ""}
      ${humanRule ? `<div class="obligation-match supported"><strong>Human-confirmed obligation</strong><span>${html(humanRule.title)}</span></div>` : supportedSuggestion ? `
        <div class="obligation-match supported" data-match-classification="SUPPORTED_MATCH">
          <strong>Supported obligation suggestion</strong>
          <span>${html(analysis.suggestedObligationTitle)}</span>
        </div>
      ` : `<p class="small muted obligation-no-match">No sufficiently supported obligation match — human review required.</p>`}
      ${weakCandidate ? `
        <details class="detail-disclosure weak-obligation-candidate" data-match-classification="WEAK_CANDIDATE">
          <summary>Review weak obligation candidate</summary>
          <div class="kv-grid disclosure-body">
            ${kv("Candidate", html(weakCandidate.candidateTitle || "Unknown obligation"))}
            ${kv("Why it was withheld", html(weakCandidate.reason))}
          </div>
        </details>
      ` : ""}
      <details class="detail-disclosure">
        <summary>View processing details</summary>
        <div class="kv-grid disclosure-body">${extracted.map(([term, value]) => kv(term, value)).join("")}</div>
        ${processingWarnings.length ? `<ul class="issue-list">${processingWarnings.map((issue) => `<li>${html(issue)}</li>`).join("")}</ul>` : ""}
      </details>
      ${anchors.length ? `
        <details class="detail-disclosure">
          <summary>Source references (${anchors.length})</summary>
          <ul class="issue-list source-reference-list">${anchors.map((anchor) => `<li><strong>${html(anchor.label || anchor.id)}</strong>${anchor.excerpt ? `<span class="small muted">${html(anchor.excerpt)}</span>` : ""}</li>`).join("")}</ul>
        </details>
      ` : ""}
      ${analysis.humanReviewNotes ? `<p class="small"><strong>Reviewer notes:</strong> ${html(analysis.humanReviewNotes)}</p>` : ""}
      <p class="field-hint">Extracted facts and AI suggestions are review candidates — not legal advice, legal applicability, or compliance certification. Human-confirmed decisions remain authoritative.</p>
    </div>
  `;
}

export function reviewForm(item, analysis) {
  if (!canReview() || !analysis) return "";
  const extractionSupportsMatching = !["empty", "failed", "ocr_required", "unsupported"].includes(analysis.extractionStatus)
    && !["empty", "extraction_failed", "ocr_required", "unsupported_for_text_extraction"].includes(analysis.textExtractionStatus);
  const selectedRuleId = analysis.humanOverrideRuleId || item.relatedObligationId || (extractionSupportsMatching ? analysis.suggestedRuleId : null);
  return `
    <details class="detail-disclosure review-disclosure">
      <summary>Review evidence</summary>
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
            <option value="">${analysis.humanOverrideRuleId || item.relatedObligationId ? "Keep current human-confirmed obligation" : "No obligation match"}</option>
            ${state.applicableRules.map((rule) => `<option value="${html(rule.id)}" ${rule.id === selectedRuleId ? "selected" : ""}>${html(rule.title)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="field">
        <span class="field-label">Reviewer notes</span>
        <textarea name="notes" placeholder="Why this decision was made — preserved in the audit lineage">${html(analysis.humanReviewNotes || "")}</textarea>
      </label>
      <div class="review-form-actions">
        <button type="submit" class="btn btn-primary btn-sm" name="action" value="accept_ai">Confirm AI classification</button>
        <button type="submit" class="btn btn-secondary btn-sm" name="action" value="override">Apply override</button>
      </div>
      <details class="detail-disclosure review-secondary-actions" data-ui-role="secondary-review-actions">
        <summary>More review actions</summary>
        <div class="secondary-action-row disclosure-body">
          <button type="submit" class="btn btn-secondary btn-sm" name="action" value="mark_accepted">Mark evidence accepted</button>
          <button type="submit" class="btn btn-ghost btn-sm" name="action" value="mark_needs_review">Keep in review</button>
          <button type="submit" class="btn btn-ghost btn-sm" name="action" value="request_more_evidence">Request more evidence</button>
          <button type="submit" class="btn btn-danger btn-sm" name="action" value="mark_rejected">Reject evidence</button>
        </div>
      </details>
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
