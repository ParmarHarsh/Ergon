import { canReview, currentFacility, state } from "../store.js";
import { DISCLAIMER_SHORT, ICONS, html, pill } from "../ui.js";

export function homeView() {
  const facility = currentFacility();
  const summary = state.latestReview?.summary || null;
  const highPriorityActions = state.actionItems.filter((item) => ["critical", "high"].includes(item.priority));
  const failedJobs = state.processingJobs.filter((job) => ["failed", "dead_letter"].includes(job.status));
  const activeJobs = state.processingJobs.filter((job) => ["queued", "processing"].includes(job.status));
  return `
    <div class="home-hero">
      <div>
        <p class="eyebrow">Ergon</p>
        <h1>Your AI compliance workspace for manufacturing.</h1>
        <p>Bring the evidence and operational context you already have. Ergon helps organize it, map it to obligations, surface gaps, prioritize work, and assemble audit-ready proof while humans keep accountability for review and decisions.</p>
      </div>
      <div class="home-status">
        ${pill(state.aiStatus.enabled ? "active" : "inactive", { text: state.aiStatus.enabled ? `AI enabled: ${state.aiStatus.provider}` : "AI disabled in this environment" })}
        ${pill("local", { text: "Human review remains required" })}
      </div>
    </div>

    <section class="home-flow" aria-label="Ergon workflow">
      ${workflowItem("1", "Bring your evidence", "Upload PDFs, text, CSV, or supported images. Future phases expand toward messy office files, email, drives, and system exports.")}
      ${workflowItem("2", "Ergon organizes it", state.aiStatus.enabled ? "Enabled AI can classify supported files and suggest matches." : "AI is off here, so deterministic matching and manual review remain available.")}
      ${workflowItem("3", "Review what matters", "Reviewer decisions accept, override, reject, or request better evidence with an audit trail.")}
      ${workflowItem("4", "Close gaps", "Prioritized gaps and actions show what needs attention next.")}
      ${workflowItem("5", "Prove readiness", "Export audit packets with evidence lineage, disclaimers, and reviewer context.")}
    </section>

    <div class="grid-3-1">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Needs attention now</h2>
            <p class="hint">${facility ? html(facility.name) : "Create or select a facility to begin."}</p>
          </div>
        </div>
        <div class="card-body attention-list">
          ${attentionItem("Evidence needing review", canReview() ? state.reviewQueue.length : "—", canReview() ? "Items waiting for a human decision." : "Reviewer or admin role required.", "review", canReview())}
          ${attentionItem("High-priority gaps", summary ? summary.criticalGapsCount + highPriorityActions.length : "—", summary ? "Critical gaps plus high-priority actions." : "Generate a gap analysis first.", "matrix", Boolean(facility))}
          ${attentionItem("Processing failures", failedJobs.length, failedJobs.length ? "Open the review queue to retry or inspect." : activeJobs.length ? `${activeJobs.length} job(s) still processing.` : "No current processing failures.", "review", canReview())}
        </div>
      </section>

      <aside class="card">
        <div class="card-head"><h2>Start here</h2></div>
        <div class="card-body quick-actions">
          <button class="btn btn-primary" data-nav="evidence">${ICONS.upload} Add evidence</button>
          ${canReview() ? `<button class="btn btn-secondary" data-nav="review">${ICONS.review} Review priority items</button>` : ""}
          <button class="btn btn-secondary" data-nav="matrix">${ICONS.matrix} View gaps</button>
          <button class="btn btn-secondary" data-nav="actions">${ICONS.actions} Open action plan</button>
          <button class="btn btn-secondary" data-nav="packets">${ICONS.packet} Build audit proof</button>
        </div>
      </aside>
    </div>

    <div class="stat-grid">
      <div class="stat"><span class="stat-label">Facilities</span><span class="stat-value">${state.facilities.length}</span><span class="stat-sub">manufacturing sites in this workspace</span></div>
      <div class="stat"><span class="stat-label">Evidence</span><span class="stat-value">${state.evidence.filter((item) => !item.archived).length}</span><span class="stat-sub">active records for selected facility</span></div>
      <div class="stat"><span class="stat-label">Readiness score</span><span class="stat-value ${scoreTone(state.latestReview?.readinessScore)}">${state.latestReview ? state.latestReview.readinessScore : "—"}</span><span class="stat-sub">${state.latestReview ? "latest deterministic review" : "generate analysis to score"}</span></div>
      <div class="stat"><span class="stat-label">Missing evidence</span><span class="stat-value ${summary?.missingEvidenceCount ? "warn" : "ok"}">${summary ? summary.missingEvidenceCount : "—"}</span><span class="stat-sub">obligations without accepted evidence</span></div>
    </div>

    <p class="footer-note">${html(DISCLAIMER_SHORT)} Ergon does not provide legal advice or certify compliance. Starter rules are demo/unverified unless qualified experts review them.</p>
  `;
}

function workflowItem(number, title, copy) {
  return `
    <article class="flow-item">
      <span class="flow-number">${number}</span>
      <strong>${html(title)}</strong>
      <p>${html(copy)}</p>
    </article>
  `;
}

function attentionItem(title, count, copy, route, enabled) {
  return `
    <div class="attention-item">
      <div>
        <strong>${html(title)}</strong>
        <p>${html(copy)}</p>
      </div>
      <div class="attention-action">
        <span class="attention-count">${html(count)}</span>
        <button class="btn btn-ghost btn-sm" data-nav="${html(route)}" ${enabled ? "" : "disabled"}>Open</button>
      </div>
    </div>
  `;
}

function scoreTone(score) {
  if (score === undefined || score === null) return "";
  return score >= 80 ? "ok" : score >= 55 ? "warn" : "danger";
}
