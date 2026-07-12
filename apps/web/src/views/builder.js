import { canReview, currentFacility, state } from "../store.js";
import { DISCLAIMER_SHORT, ICONS, formatDateTime, html, pill, scoreRing } from "../ui.js";

export function builderView() {
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head">
        <div>
          <h1>Audit Pack Workflow</h1>
          <p class="page-sub">Assemble jurisdiction-specific, evidence-backed audit readiness packets for your facilities.</p>
        </div>
      </div>
      <div class="card">
        ${emptyFacilityPrompt()}
      </div>
      <p class="footer-note">${html(DISCLAIMER_SHORT)}</p>
    `;
  }

  const summary = state.latestReview?.summary || null;
  const activeJobs = state.processingJobs.filter((job) => ["queued", "processing"].includes(job.status));
  const failedJobs = state.processingJobs.filter((job) => ["failed", "dead_letter"].includes(job.status));
  const needsReviewCount = state.reviewQueue.length;

  return `
    <div class="page-head">
      <div>
        <h1>Audit Pack Workflow</h1>
        <p class="page-sub">From messy facility files to an evidence-backed readiness packet: upload evidence, let AI classify and suggest matches, review, close gaps, export.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="generate-review">${ICONS.refresh} Refresh gap analysis</button>
        <button class="btn btn-primary" data-action="export-packet" ${state.latestReview ? "" : "disabled"}>${ICONS.packet} Export audit packet</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <span class="stat-label">Facility</span>
        <span class="stat-value small">${html(facility.name)}</span>
        <span class="stat-sub">${html(facility.industry.replaceAll("_", " "))}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Jurisdiction</span>
        <span class="stat-value small">${html(facility.country)} · ${html(facility.stateProvince)}</span>
        <span class="stat-sub">${html(facility.jurisdictionCode || "—")}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Rules pack</span>
        <span class="stat-value small">${state.rulesPack ? html(state.rulesPack.country) + " starter" : "None selected"}</span>
        <span class="stat-sub">${state.rulesPack ? `${state.applicableRules.length} applicable obligations · v${html(state.rulesPack.version)}` : "Select facility jurisdiction"}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Readiness score</span>
        <span class="stat-value ${scoreTone(state.latestReview?.readinessScore)}">${state.latestReview ? `${state.latestReview.readinessScore}` : "—"}</span>
        <span class="stat-sub">${state.latestReview ? `Generated ${formatDateTime(state.latestReview.createdAt)}` : "Run gap analysis to score"}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Critical gaps</span>
        <span class="stat-value ${summary?.criticalGapsCount ? "danger" : "ok"}">${summary ? summary.criticalGapsCount : "—"}</span>
        <span class="stat-sub">${summary ? `${summary.missingEvidenceCount} obligations missing evidence` : "No analysis yet"}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Review</span>
        <span class="stat-value ${needsReviewCount ? "warn" : "ok"}">${canReview() ? needsReviewCount : "—"}</span>
        <span class="stat-sub">${canReview() ? "items awaiting a human decision" : "reviewer role required"}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Processing</span>
        <span class="stat-value ${failedJobs.length ? "danger" : activeJobs.length ? "warn" : "ok"}">${activeJobs.length}</span>
        <span class="stat-sub">${failedJobs.length ? `${failedJobs.length} failed — see review queue` : activeJobs.length ? "evidence jobs in flight" : "queue idle"}</span>
      </div>
    </div>

    <div class="grid-3-1">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Packet workflow</h2>
            <p class="hint">Every step is tenant-scoped and audit-logged. AI suggestions never finalize evidence without deterministic agreement or human review.</p>
          </div>
        </div>
        <div class="card-body">
          <div class="workflow">
            ${workflowStep(1, "Facility profile and jurisdiction", `${html(facility.name)} · ${html(facility.country)}/${html(facility.stateProvince)} — rules pack ${state.rulesPack ? "selected by backend" : "pending"}.`, state.rulesPack ? "done" : "attention", "facilities", "Manage facilities")}
            ${workflowStep(2, "Upload or log evidence", state.evidence.length ? `${state.evidence.length} evidence item${state.evidence.length === 1 ? "" : "s"} on file. Files are validated and malware-screened before processing.` : "No evidence yet. Upload facility files or log manual evidence records.", state.evidence.length ? "done" : "attention", "evidence", "Add evidence")}
            ${workflowStep(3, "AI evidence intelligence", aiStepCopy(activeJobs, failedJobs), aiStepState(activeJobs, failedJobs), "evidence", state.aiStatus.enabled ? "View analyses" : "View evidence")}
            ${workflowStep(4, "Human review", canReview() ? (needsReviewCount ? `${needsReviewCount} item${needsReviewCount === 1 ? "" : "s"} need a reviewer decision before they strengthen the packet.` : "Review queue is clear.") : "A reviewer or admin approves, overrides, or rejects AI-classified evidence.", needsReviewCount ? "attention" : "done", "review", canReview() ? "Open AI review" : null)}
            ${workflowStep(5, "Evidence gap matrix", state.latestReview ? `${summary.totalApplicableObligations} obligations analyzed · ${summary.missingEvidenceCount} missing · ${summary.criticalGapsCount} critical.` : "Generate the deterministic gap analysis for this facility.", state.latestReview ? (summary.criticalGapsCount ? "attention" : "done") : "attention", "matrix", state.latestReview ? "Open gap matrix" : null)}
            ${workflowStep(6, "Export audit packet", state.packets.length ? `${state.packets.length} packet${state.packets.length === 1 ? "" : "s"} generated with evidence lineage, AI confidence, and disclaimers.` : "Export a PDF packet with gap matrix, action plan, lineage, and disclaimers.", state.packets.length ? "done" : "", "packets", "Packet history")}
          </div>
        </div>
      </section>

      <div style="display:grid;gap:18px">
        <section class="card">
          <div class="card-head"><h2>Readiness score</h2></div>
          <div class="card-body">
            ${state.latestReview ? `
              <div class="score-wrap">
                ${scoreRing(state.latestReview.readinessScore)}
                <div class="score-notes">
                  <ul>${state.latestReview.scoreExplanation.map((line) => `<li>${html(line)}</li>`).join("")}</ul>
                </div>
              </div>
            ` : `
              <div class="empty" style="padding:24px 10px">
                <div class="empty-title">No analysis yet</div>
                <div class="empty-copy">Generate the gap analysis to compute a deterministic readiness score for this facility.</div>
                <button class="btn btn-primary btn-sm" data-action="generate-review">Generate gap analysis</button>
              </div>
            `}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>AI evidence intelligence</h2>${pill(state.aiStatus.enabled ? "active" : "inactive", { text: state.aiStatus.enabled ? "Enabled" : "Disabled" })}</div>
          <div class="card-body" style="display:grid;gap:10px">
            <p class="small muted">${state.aiStatus.enabled
              ? `Backend AI classification via <strong>${html(state.aiStatus.provider)}</strong>${state.aiStatus.model ? ` (${html(state.aiStatus.model)})` : ""}. Suggestions carry confidence scores and route to human review below threshold. Deterministic rules remain authoritative.`
              : "AI analysis is disabled. Manual evidence logging, deterministic gap analysis, human review, and packet export remain fully available."}</p>
            <div class="inline-note">${ICONS.info}<span>AI never certifies compliance and never finalizes critical evidence without deterministic agreement or reviewer sign-off.</span></div>
          </div>
        </section>
      </div>
    </div>

    <p class="footer-note">${html(DISCLAIMER_SHORT)} Starter rules packs for US, CA, and MX are demo/unverified content and require expert review before reliance.</p>
  `;
}

function workflowStep(number, title, copy, stateClass, route, actionLabel) {
  return `
    <div class="workflow-step ${stateClass}">
      <div class="step-marker">${stateClass === "done" ? ICONS.check : number}</div>
      <div class="step-body">
        <div class="step-title">${html(title)}</div>
        <div class="step-copy">${copy}</div>
      </div>
      ${actionLabel ? `<div class="step-action"><button class="btn btn-ghost btn-sm" data-nav="${route}">${html(actionLabel)}</button></div>` : ""}
    </div>
  `;
}

function aiStepCopy(activeJobs, failedJobs) {
  if (!state.aiStatus.enabled) return "AI is disabled — deterministic matching and manual review still work end to end.";
  if (failedJobs.length) return `${failedJobs.length} processing job${failedJobs.length === 1 ? "" : "s"} failed and can be retried from the review queue.`;
  if (activeJobs.length) return `${activeJobs.length} evidence file${activeJobs.length === 1 ? "" : "s"} queued or processing. Classification, field extraction, and obligation suggestions update automatically.`;
  const processed = state.aiAnalyses.filter((analysis) => analysis.processingStatus === "processed").length;
  return processed ? `${processed} evidence analysis${processed === 1 ? "" : "es"} completed with confidence scoring and match reasons.` : "Uploaded files are classified automatically after a clean malware scan.";
}

function aiStepState(activeJobs, failedJobs) {
  if (failedJobs.length) return "attention";
  if (activeJobs.length) return "";
  return state.aiAnalyses.length ? "done" : "";
}

function scoreTone(score) {
  if (score === undefined || score === null) return "";
  return score >= 80 ? "ok" : score >= 55 ? "warn" : "danger";
}

export function emptyFacilityPrompt() {
  return `
    <div class="empty">
      <div class="empty-icon">${ICONS.facility}</div>
      <div class="empty-title">Create your first facility</div>
      <div class="empty-copy">A facility defines the jurisdiction, industry, and hazard profile that select the correct rules pack and obligations.</div>
      <button class="btn btn-primary btn-sm" data-nav="facilities">Set up a facility</button>
    </div>
  `;
}
