import { canReview, currentFacility, state } from "../store.js";
import { confidencePill, emptyState, html, label, pill, titleCase } from "../ui.js";
import { aiAnalysisPanel, analysisFor, reviewForm } from "./evidence-shared.js";
import { emptyFacilityPrompt } from "./builder.js";

const STATUS_FILTERS = ["", "needs_review", "low_confidence", "medium_confidence", "extraction_failed", "ocr_required", "suspicious_scan", "expired", "rejected", "unmatched", "high_priority_impact", "processing_failed"];
const PRIORITY_FILTERS = ["", "critical", "high", "medium", "low"];

export function reviewView() {
  if (!canReview()) {
    return `
      <div class="page-head"><div><h1>AI Review</h1></div></div>
      <div class="card">${emptyState({ icon: "review", title: "Reviewer role required", copy: "Ask an organization administrator for the reviewer or admin role to make evidence decisions." })}</div>
    `;
  }
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head"><div><h1>AI Review</h1></div></div>
      <div class="card">${emptyFacilityPrompt()}</div>
    `;
  }
  const critical = state.reviewQueue.filter((item) => item.priorityImpact === "critical").length;
  const high = state.reviewQueue.filter((item) => item.priorityImpact === "high").length;
  const lowConfidence = state.reviewQueue.filter((item) => item.confidence !== null && item.confidence < 0.8).length;
  return `
    <div class="page-head">
      <div>
        <h1>AI Review</h1>
        <p class="page-sub">Decide whether ERGON’s evidence suggestions are acceptable, need override, or require better evidence.</p>
      </div>
    </div>

    <div class="summary-strip">
      <div class="summary-chip"><span>Awaiting review</span><strong>${state.reviewQueue.length}</strong></div>
      <div class="summary-chip"><span>Critical impact</span><strong class="${critical ? "danger" : "ok"}">${critical}</strong></div>
      <div class="summary-chip"><span>High impact</span><strong class="${high ? "warn" : "ok"}">${high}</strong></div>
      <div class="summary-chip"><span>Low confidence</span><strong>${lowConfidence}</strong></div>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>${state.reviewQueue.length} item${state.reviewQueue.length === 1 ? "" : "s"} awaiting review</h2>
          <p class="hint">${html(facility.name)} · tenant-scoped</p>
        </div>
        <details class="detail-disclosure">
          <summary>Filters</summary>
          <form id="review-queue-filters" class="filters-row disclosure-body" data-form="review-filters">
            <label class="field">
              <span class="field-label">Review state</span>
              <select name="status">${STATUS_FILTERS.map((value) => `<option value="${value}" ${value === state.reviewQueueFilters.status ? "selected" : ""}>${html(value ? titleCase(value) : "All review states")}</option>`).join("")}</select>
            </label>
            <label class="field">
              <span class="field-label">Priority impact</span>
              <select name="priority">${PRIORITY_FILTERS.map((value) => `<option value="${value}" ${value === state.reviewQueueFilters.priority ? "selected" : ""}>${html(value ? titleCase(value) : "All priorities")}</option>`).join("")}</select>
            </label>
          </form>
        </details>
      </div>
      <div class="card-body tight review-queue-list">
        ${state.reviewQueue.length ? state.reviewQueue.map(queueItem).join("") : emptyState({
          icon: "check",
          title: "Queue is clear",
          copy: "No evidence matches the selected filters. New uploads that need a decision will appear here automatically."
        })}
      </div>
    </section>
  `;
}

function queueItem(item) {
  const evidence = state.evidence.find((entry) => entry.id === item.id);
  const analysis = analysisFor(item.id);
  const canRetry = item.processingStatus === "failed" || item.categories.some((category) => ["processing_failed", "extraction_failed", "ocr_required"].includes(category));
  return `
    <article class="evidence-item priority-card ${html(item.priorityImpact)} ${item.scanStatus === "scan_suspicious" ? "blocked-card" : ""}">
      <div class="evidence-top">
        <div>
          <div class="evidence-title">${html(item.evidenceTitle)}</div>
          <div class="evidence-meta">
            <span>${html(item.facilityName)}</span>
            <span>·</span>
            <span>${html(item.fileName || "Manual evidence")}</span>
          </div>
        </div>
        <div class="badge-row">
          ${pill(item.priorityImpact, { text: `${titleCase(item.priorityImpact)} impact` })}
          ${confidencePill(item.confidence)}
          ${pill(item.processingStatus)}
        </div>
      </div>
      <div class="badge-row">
        ${item.categories.map((category) => `<span class="pill pill-neutral plain">${html(titleCase(category))}</span>`).join("")}
      </div>
      <div class="kv-grid">
        <div class="kv"><dt>What ERGON found</dt><dd>${html(label(item.detectedEvidenceType || "other"))}</dd></div>
        <div class="kv"><dt>Why it matters</dt><dd>${html(item.suggestedObligationTitle || "No obligation match yet")}</dd></div>
        <div class="kv"><dt>Human decision</dt><dd>Accept, override, reject, or request better evidence.</dd></div>
      </div>
      ${item.issueSummary?.length ? `<ul class="issue-list">${item.issueSummary.map((issue) => `<li>${html(issue)}</li>`).join("")}</ul>` : ""}
      ${canRetry && item.scanStatus !== "scan_suspicious" ? `<div><button class="btn btn-secondary btn-sm" data-action="retry-processing" data-evidence-id="${html(item.id)}">Retry processing</button></div>` : ""}
      ${analysis ? aiAnalysisPanel(analysis) : ""}
      ${evidence && analysis ? reviewForm(evidence, analysis) : ""}
    </article>
  `;
}
