import { currentFacility, state } from "../store.js";
import { ICONS, emptyState, formatDate, html, titleCase } from "../ui.js";
import { emptyFacilityPrompt } from "./builder.js";

const BUCKETS = [
  ["urgent_7_days", "Now", "Critical obligations without accepted evidence"],
  ["30_days", "Next", "High-priority evidence gaps"],
  ["90_days", "Later", "Medium and low priority items"]
];

export function actionsView() {
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head"><div><h1>Action Plan</h1></div></div>
      <div class="card">${emptyFacilityPrompt()}</div>
    `;
  }
  if (!state.latestReview) {
    return `
      <div class="page-head">
        <div>
          <h1>Action Plan</h1>
          <p class="page-sub">Prioritized corrective actions derived from the latest gap analysis for ${html(facility.name)}.</p>
        </div>
      </div>
      <div class="card">${emptyState({
        icon: "actions",
        title: "No action plan yet",
        copy: "Generate the gap analysis first — open items become time-bucketed corrective actions with owners and due dates.",
        action: `<button class="btn btn-primary btn-sm" data-action="generate-review">Generate gap analysis</button>`
      })}</div>
    `;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Action Plan</h1>
          <p class="page-sub">${state.actionItems.length} open action${state.actionItems.length === 1 ? "" : "s"} for <strong>${html(facility.name)}</strong>, grouped by urgency.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="generate-review">${ICONS.refresh} Refresh</button>
      </div>
    </div>

    <div class="bucket-grid">
      ${BUCKETS.map(([bucket, title, sub]) => bucketColumn(bucket, title, sub)).join("")}
    </div>
  `;
}

function bucketColumn(bucket, title, sub) {
  const items = state.actionItems.filter((item) => item.bucket === bucket);
  return `
    <div class="bucket-col">
      <div class="bucket-head">
        <span>${html(title)}</span>
        <span class="pill ${items.length ? (bucket === "urgent_7_days" ? "pill-bad" : "pill-warn") : "pill-good"} plain">${items.length}</span>
      </div>
      ${items.length ? items.map(actionCard).join("") : `<div class="card card-pad small muted" style="text-align:center">${bucket === "urgent_7_days" ? "No urgent actions — critical obligations are covered." : "Nothing due in this window."}</div>`}
    </div>
  `;
}

function actionCard(item) {
  return `
    <article class="action-card ${html(item.priority)}">
      <strong>${html(item.title)}</strong>
      <div class="sub"><strong>Next:</strong> ${html(item.recommendedNextStep)}</div>
      <div class="meta">
        <span>${html(titleCase(item.priority))}</span>
        <span>·</span>
        <span>${html(item.ownerRole)}</span>
        <span>·</span>
        <span>due ${formatDate(item.dueDate)}</span>
      </div>
      <details class="detail-disclosure">
        <summary>Why</summary>
        <div class="sub disclosure-body">${html(item.authority)} ${html(item.citation)}</div>
      </details>
    </article>
  `;
}
