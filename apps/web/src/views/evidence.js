import { canReview, currentFacility, state } from "../store.js";
import { ICONS, emptyState, formatBytes, html, label, pill } from "../ui.js";
import { aiAnalysisPanel, analysisFor, jobFor, processingBadges, reviewForm } from "./evidence-shared.js";
import { emptyFacilityPrompt } from "./builder.js";

export function evidenceView() {
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head"><div><h1>Evidence</h1><p class="page-sub">Upload or log compliance evidence for AI classification and deterministic matching.</p></div></div>
      <div class="card">${emptyFacilityPrompt()}</div>
    `;
  }
  const activeEvidence = state.evidence.filter((item) => !item.archived);
  const archivedEvidence = state.evidence.filter((item) => item.archived);
  const needingAttention = activeEvidence.filter((item) => ["needs_review", "expired", "rejected"].includes(item.status) || ["scan_failed", "scan_suspicious"].includes(item.scanStatus));
  const processing = state.processingJobs.filter((job) => ["queued", "processing"].includes(job.status));
  const accepted = activeEvidence.filter((item) => item.status === "accepted");
  return `
    <div class="page-head">
      <div>
        <h1>Evidence</h1>
        <p class="page-sub">Add, review, and connect facility evidence for <strong>${html(facility.name)}</strong>.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-action="focus-add-evidence">${ICONS.upload} Add evidence</button>
      </div>
    </div>

    <div class="summary-strip">
      <div class="summary-chip"><span>Active</span><strong>${activeEvidence.length}</strong></div>
      <div class="summary-chip"><span>Needs attention</span><strong class="${needingAttention.length ? "warn" : "ok"}">${needingAttention.length}</strong></div>
      <div class="summary-chip"><span>Processing</span><strong>${processing.length}</strong></div>
      <div class="summary-chip"><span>Accepted</span><strong class="ok">${accepted.length}</strong></div>
    </div>

    <div class="grid-3-1">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Evidence records</h2>
            <p class="hint">${activeEvidence.length} active item${activeEvidence.length === 1 ? "" : "s"} · AI ${state.aiStatus.enabled ? "enabled" : "disabled"}</p>
          </div>
        </div>
        <div class="card-body tight">
          ${activeEvidence.length ? activeEvidence.map(evidenceItem).join("") : emptyState({
            icon: "evidence",
            title: "No evidence logged",
            copy: "Add the first document or manual record to start building a traceable compliance file.",
            action: `<button class="btn btn-primary btn-sm" data-action="focus-add-evidence">${ICONS.upload} Add evidence</button>`
          })}
          ${canReview() && archivedEvidence.length ? `
            <div class="section-divider"></div>
            <h3 class="compact-heading">Archived evidence</h3>
            ${archivedEvidence.map(evidenceItem).join("")}
          ` : ""}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2>Add evidence</h2>
            <p class="hint">Attach a private file for secure evidence understanding, or log a manual record.</p>
          </div>
        </div>
        <div class="card-body">
          <form id="evidence-form" class="form-grid" data-form="create-evidence">
            <label class="field">
              <span class="field-label">Title</span>
              <input name="title" placeholder="e.g. Forklift operator training roster Q2" required />
            </label>
            <label class="field">
              <span class="field-label">Evidence type</span>
              <select name="evidenceType" required>
                ${state.evidenceTypes.map((type) => `<option value="${html(type)}" ${type === "other" ? "selected" : ""}>${html(label(type))}</option>`).join("")}
              </select>
              <span class="field-hint">${state.aiStatus.enabled ? "Not sure? Choose “other” — AI can suggest a candidate type for review." : "Not sure? Choose “other” — deterministic extraction and human review remain available."}</span>
            </label>
            <div class="form-grid cols-2">
              <label class="field">
                <span class="field-label">Status</span>
                <select name="status">
                  <option value="pending">Pending</option>
                  <option value="needs_review">Needs review</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">Expiration date</span>
                <input name="expirationDate" type="date" />
              </label>
            </div>
            <label class="field">
              <span class="field-label">Private file <span class="muted">(optional)</span></span>
              <span class="drop-zone">
                <strong>${ICONS.upload} Select a file</strong>
                <span class="field-hint">PDF, TXT, Markdown, CSV, DOCX, XLSX, or supported image. Files are screened before processing.</span>
                <input name="file" type="file" accept=".pdf,.txt,.md,.log,.csv,.docx,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.bmp" />
              </span>
            </label>
            <label class="field">
              <span class="field-label">Notes</span>
              <textarea name="description" placeholder="Context for reviewers"></textarea>
            </label>
            <div class="form-footer">
              <button type="submit" class="btn btn-primary">${ICONS.upload} Upload or log evidence</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;
}

function evidenceItem(item) {
  const analysis = analysisFor(item.id);
  const job = jobFor(item.id);
  const active = ["queued", "processing"].includes(job?.status);
  const blocked = ["scan_suspicious", "scan_pending"].includes(item.scanStatus);
  const canRestore = item.archived && item.storageDeletionStatus !== "deleted";
  const canRetryDeletion = item.storageDeletionStatus === "failed" && item.fileReference;
  const status = evidenceStatus(item, job, analysis);
  return `
    <article class="evidence-item">
      <div class="evidence-top">
        <div>
          <div class="evidence-title">${html(item.title)}</div>
          <div class="evidence-meta">
            <span>${html(label(item.evidenceType))}</span>
            ${item.fileName ? `<span>·</span><span>${html(item.fileName)} (${formatBytes(item.fileSizeBytes)})</span>` : "<span>·</span><span>manual record</span>"}
            ${item.expirationDate ? `<span>·</span><span>expires ${html(item.expirationDate)}</span>` : ""}
            ${item.archived ? `<span>·</span><span>archived</span>` : ""}
          </div>
        </div>
        <div class="evidence-actions">
          ${pill(status.code, { text: status.text })}
          ${item.fileReference && item.scanStatus !== "scan_suspicious" && !item.archived ? `<button class="btn btn-ghost btn-sm" data-action="download-evidence" data-evidence-id="${html(item.id)}">${ICONS.download} File</button>` : ""}
          <button class="btn btn-secondary btn-sm" data-action="process-ai" data-evidence-id="${html(item.id)}" ${!active && !blocked && item.fileReference && !item.archived ? "" : "disabled"}>${ICONS.spark} ${active ? "Processing…" : analysis ? "Reprocess" : "Process"}</button>
          ${canReview() && !item.archived ? (item.legalHoldActive
            ? `<button class="btn btn-secondary btn-sm" data-action="release-evidence-hold" data-evidence-id="${html(item.id)}">Release hold</button>`
            : `<button class="btn btn-secondary btn-sm" data-action="hold-evidence" data-evidence-id="${html(item.id)}">Hold</button>`) : ""}
          ${canReview() && canRetryDeletion ? `<button class="btn btn-secondary btn-sm" data-action="retry-evidence-deletion" data-evidence-id="${html(item.id)}">Retry deletion</button>` : ""}
          ${canReview() && canRestore ? `<button class="btn btn-secondary btn-sm" data-action="restore-evidence" data-evidence-id="${html(item.id)}">Restore</button>` : ""}
          ${canReview() && !item.archived ? `<button class="btn btn-danger btn-sm" data-action="archive-evidence" data-evidence-id="${html(item.id)}" ${item.legalHoldActive ? "disabled" : ""}>Archive</button>` : ""}
        </div>
      </div>
      ${item.legalHoldActive ? `<div class="alert-info small">Legal hold active${item.legalHoldReason ? `: ${html(item.legalHoldReason)}` : ""}</div>` : ""}
      ${item.storageDeletionStatus === "failed" ? `<div class="alert small">Private-object deletion failed${item.storageDeletionError ? `: ${html(item.storageDeletionError)}` : ""}</div>` : ""}
      ${processingBadges(item, job)}
      ${analysis ? aiAnalysisPanel(analysis) : `<p class="small muted">${item.fileReference ? "Waiting for a clean scan before evidence processing." : "Manual record — no file to process."}</p>`}
      ${item.archived ? "" : reviewForm(item, analysis)}
    </article>
  `;
}

function evidenceStatus(item, job, analysis) {
  if (item.archived) return { code: "inactive", text: "Archived" };
  if (item.legalHoldActive) return { code: "blocked", text: "On hold" };
  if (item.scanStatus === "scan_suspicious" || ["failed", "dead_letter"].includes(job?.status)) return { code: "failed", text: "Failed" };
  if (["queued", "processing"].includes(job?.status) || item.scanStatus === "scan_pending") return { code: "processing", text: "Processing" };
  if (item.status === "accepted") return { code: "accepted", text: "Accepted" };
  if (item.status === "needs_review" || analysis?.needsHumanReview) return { code: "needs_review", text: "Ready for review" };
  if (["expired", "rejected"].includes(item.status)) return { code: "warn", text: "Needs attention" };
  return { code: "processed", text: "Logged" };
}
