import { canReview, currentFacility, state } from "../store.js";
import { confidencePill, emptyState, html, label, pill, titleCase } from "../ui.js";
import { aiAnalysisPanel, analysisFor, reviewForm } from "./evidence-shared.js";
import { emptyFacilityPrompt } from "./builder.js";

const STATUS_FILTERS = ["", "needs_review", "low_confidence", "medium_confidence", "extraction_failed", "ocr_required", "suspicious_scan", "expired", "rejected", "unmatched", "high_priority_impact", "processing_failed"];
const PRIORITY_FILTERS = ["", "critical", "high", "medium", "low"];

export function reviewView() {
  if (!canReview()) {
    return `
      <div class="page-head"><div><h1>Review queue</h1></div></div>
      <div class="card">${emptyState({ icon: "review", title: "Reviewer role required", copy: "Ask an organization administrator for the reviewer or admin role to make evidence decisions." })}</div>
    `;
  }
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head"><div><h1>Review queue</h1></div></div>
      <div class="card">${emptyFacilityPrompt()}</div>
    `;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Review queue</h1>
        <p class="page-sub">Evidence requiring a human decision: low-confidence AI classifications, extraction failures, suspicious scans, expirations, and unmatched items. Every decision is persisted to the audit trail.</p>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>${state.reviewQueue.length} item${state.reviewQueue.length === 1 ? "" : "s"} awaiting review</h2>
          <p class="hint">${html(facility.name)} · tenant-scoped</p>
        </div>
        <form id="review-queue-filters" class="filters-row" data-form="review-filters">
          <label class="field">
            <span class="field-label">Review state</span>
            <select name="status">${STATUS_FILTERS.map((value) => `<option value="${value}" ${value === state.reviewQueueFilters.status ? "selected" : ""}>${html(value ? titleCase(value) : "All review states")}</option>`).join("")}</select>
          </label>
          <label class="field">
            <span class="field-label">Priority impact</span>
            <select name="priority">${PRIORITY_FILTERS.map((value) => `<option value="${value}" ${value === state.reviewQueueFilters.priority ? "selected" : ""}>${html(value ? titleCase(value) : "All priorities")}</option>`).join("")}</select>
          </label>
        </form>
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
    <article class="evidence-item ${item.scanStatus === "scan_suspicious" ? "blocked-card" : ""}">
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
        <div class="kv"><dt>Likely type</dt><dd>${html(label(item.detectedEvidenceType || "other"))}</dd></div>
        <div class="kv"><dt>Suggested obligation</dt><dd>${html(item.suggestedObligationTitle || "Unmatched")}</dd></div>
      </div>
      ${item.issueSummary?.length ? `<ul class="issue-list">${item.issueSummary.map((issue) => `<li>${html(issue)}</li>`).join("")}</ul>` : ""}
      ${canRetry && item.scanStatus !== "scan_suspicious" ? `<div><button class="btn btn-secondary btn-sm" data-action="retry-processing" data-evidence-id="${html(item.id)}">Retry processing</button></div>` : ""}
      ${analysis ? aiAnalysisPanel(analysis) : ""}
      ${evidence && analysis ? reviewForm(evidence, analysis) : ""}
    </article>
  `;
}
