import { canReview, currentFacility, state } from "../store.js";
import { DISCLAIMER_SHORT, ICONS, html, pill } from "../ui.js";

export function homeView() {
  const facility = currentFacility();
  const summary = state.latestReview?.summary || null;
  const highPriorityActions = state.actionItems.filter((item) => ["critical", "high"].includes(item.priority));
  const overdueActions = state.actionItems.filter((item) => item.dueDate && new Date(item.dueDate) < new Date());
  const failedJobs = state.processingJobs.filter((job) => ["failed", "dead_letter"].includes(job.status));
  const activeJobs = state.processingJobs.filter((job) => ["queued", "processing"].includes(job.status));
  const nextAction = chooseNextAction({ facility, summary, highPriorityActions, overdueActions, failedJobs });
  return `
    <div class="home-hero">
      <div>
        <p class="eyebrow">ERGON</p>
        <h1>Your manufacturing compliance workspace.</h1>
        <p>Today’s priority work, evidence status, and audit readiness in one place.</p>
      </div>
      <div class="home-status">
        ${pill(state.aiStatus.enabled ? "active" : "inactive", { text: state.aiStatus.enabled ? `AI enabled: ${state.aiStatus.provider}` : "AI disabled in this environment" })}
        ${pill("local", { text: "Human review remains required" })}
      </div>
    </div>

    <div class="priority-panel">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Needs attention today</h2>
            <p class="hint">${facility ? html(facility.name) : "Create or select a facility to begin."}</p>
          </div>
        </div>
        <div class="card-body attention-list">
          ${attentionItem("Evidence needing review", canReview() ? state.reviewQueue.length : "—", canReview() ? "Human decision required." : "Reviewer or admin role required.", "review", canReview(), state.reviewQueue.length ? "warn" : "")}
          ${attentionItem("Critical gaps", summary ? summary.criticalGapsCount : "—", summary ? "Highest-priority missing or weak evidence." : "Generate analysis first.", "matrix", Boolean(facility), summary?.criticalGapsCount ? "critical" : "")}
          ${attentionItem("Overdue actions", overdueActions.length, overdueActions.length ? "Past due corrective work." : "No overdue actions found.", "actions", Boolean(state.latestReview), overdueActions.length ? "critical" : "")}
          ${attentionItem("Processing issues", failedJobs.length, failedJobs.length ? "Retry or inspect failed processing." : activeJobs.length ? `${activeJobs.length} item(s) still processing.` : "No processing failures.", "review", canReview(), failedJobs.length ? "warn" : "")}
        </div>
      </section>

      <aside class="next-action-card">
        <p class="eyebrow">Next action</p>
        <h2>${html(nextAction.title)}</h2>
        <p>${html(nextAction.copy)}</p>
        <button class="btn btn-secondary" data-nav="${html(nextAction.route)}">${nextAction.icon} ${html(nextAction.label)}</button>
      </aside>
    </div>

    <div class="summary-strip" aria-label="Workspace summary">
      <div class="summary-chip"><span>Facilities</span><strong>${state.facilities.length}</strong></div>
      <div class="summary-chip"><span>Active evidence</span><strong>${state.evidence.filter((item) => !item.archived).length}</strong></div>
      <div class="summary-chip"><span>Readiness</span><strong class="${scoreTone(state.latestReview?.readinessScore)}">${state.latestReview ? state.latestReview.readinessScore : "—"}</strong></div>
      <div class="summary-chip"><span>Missing evidence</span><strong class="${summary?.missingEvidenceCount ? "warn" : "ok"}">${summary ? summary.missingEvidenceCount : "—"}</strong></div>
    </div>

    <details class="card card-pad detail-disclosure">
      <summary>How ERGON works</summary>
      <section class="home-flow disclosure-body" aria-label="Ergon workflow">
        ${workflowItem("1", "Add evidence", "Upload supported documents or log manual records.")}
        ${workflowItem("2", "Organize", state.aiStatus.enabled ? "AI can classify supported files and suggest matches." : "AI is off here; deterministic matching remains available.")}
        ${workflowItem("3", "Review", "Humans accept, override, reject, or request better evidence.")}
        ${workflowItem("4", "Close gaps", "Prioritized gaps become accountable actions.")}
        ${workflowItem("5", "Export proof", "Audit packs preserve evidence lineage and reviewer context.")}
      </section>
    </details>

    <p class="footer-note">${html(DISCLAIMER_SHORT)} Starter rules remain demo/unverified pending qualified expert review.</p>
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

function attentionItem(title, count, copy, route, enabled, tone = "") {
  return `
    <div class="attention-item ${tone}">
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

function chooseNextAction({ facility, summary, highPriorityActions, overdueActions, failedJobs }) {
  if (!facility) return { title: "Create your first facility", copy: "Facilities define jurisdiction and obligation scope.", route: "facilities", label: "Create facility", icon: ICONS.facility };
  if (canReview() && state.reviewQueue.length) return { title: "Review evidence decisions", copy: "Clear human decisions first so gaps and packets use trusted evidence.", route: "review", label: "Review evidence", icon: ICONS.review };
  if (summary?.criticalGapsCount) return { title: "Resolve a critical gap", copy: "Start with the highest-risk missing evidence.", route: "matrix", label: "Open gaps", icon: ICONS.matrix };
  if (overdueActions.length || highPriorityActions.length) return { title: "Complete priority actions", copy: "Use the action plan to close accountable work.", route: "actions", label: "Open action plan", icon: ICONS.actions };
  if (failedJobs.length) return { title: "Fix processing issues", copy: "Retry failed processing or inspect blocked evidence.", route: "review", label: "Inspect issues", icon: ICONS.review };
  if (!state.evidence.some((item) => !item.archived)) return { title: "Add your first evidence", copy: "Start building a traceable compliance record.", route: "evidence", label: "Add evidence", icon: ICONS.upload };
  return { title: "Build audit proof", copy: "Export a packet when the latest analysis reflects your evidence position.", route: "packets", label: "Open audit packs", icon: ICONS.packet };
}

function scoreTone(score) {
  if (score === undefined || score === null) return "";
  return score >= 80 ? "ok" : score >= 55 ? "warn" : "danger";
}
