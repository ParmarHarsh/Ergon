import { canReview, currentFacility, state } from "../store.js";
import { ICONS, emptyState, formatBytes, html, label } from "../ui.js";
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
  return `
    <div class="page-head">
      <div>
        <h1>Evidence</h1>
        <p class="page-sub">Evidence for <strong>${html(facility.name)}</strong>. Uploaded files are validated, malware-screened, stored privately, and — when AI is enabled — classified with confidence scoring.</p>
      </div>
    </div>

    <div class="grid-3-1">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Evidence records</h2>
            <p class="hint">${state.evidence.length} item${state.evidence.length === 1 ? "" : "s"} · AI ${state.aiStatus.enabled ? "enabled" : "disabled"}</p>
          </div>
        </div>
        <div class="card-body tight">
          ${state.evidence.length ? state.evidence.map(evidenceItem).join("") : emptyState({
            icon: "evidence",
            title: "No evidence logged",
            copy: "Upload facility files — training records, inspection logs, permits — or log manual evidence records to start closing gaps."
          })}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2>Add evidence</h2>
            <p class="hint">Attach a private file for AI analysis, or log a manual record.</p>
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
              <span class="field-hint">Not sure? Choose “other” — AI classification will suggest a type for review.</span>
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
              <input name="file" type="file" />
              <span class="field-hint">PDF, text, or image evidence. Active content and executables are rejected; files are malware-screened before processing.</span>
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
  return `
    <article class="evidence-item">
      <div class="evidence-top">
        <div>
          <div class="evidence-title">${html(item.title)}</div>
          <div class="evidence-meta">
            <span>${html(label(item.evidenceType))}</span>
            ${item.fileName ? `<span>·</span><span>${html(item.fileName)} (${formatBytes(item.fileSizeBytes)})</span>` : "<span>·</span><span>manual record</span>"}
            ${item.expirationDate ? `<span>·</span><span>expires ${html(item.expirationDate)}</span>` : ""}
          </div>
        </div>
        <div class="evidence-actions">
          ${item.fileReference && item.scanStatus !== "scan_suspicious" ? `<button class="btn btn-ghost btn-sm" data-action="download-evidence" data-evidence-id="${html(item.id)}">${ICONS.download} File</button>` : ""}
          <button class="btn btn-secondary btn-sm" data-action="process-ai" data-evidence-id="${html(item.id)}" ${state.aiStatus.enabled && !active && !blocked && item.fileReference ? "" : "disabled"}>${ICONS.spark} ${active ? "Processing…" : analysis ? "Reprocess" : "Analyze"}</button>
          ${canReview() ? `<button class="btn btn-danger btn-sm" data-action="archive-evidence" data-evidence-id="${html(item.id)}">Archive</button>` : ""}
        </div>
      </div>
      ${processingBadges(item, job)}
      ${analysis ? aiAnalysisPanel(analysis) : `<p class="small muted">${state.aiStatus.enabled ? (item.fileReference ? "No AI analysis yet — processing starts after a clean file scan." : "Manual record — no file to analyze.") : "AI is disabled; deterministic matching and manual review still apply."}</p>`}
      ${reviewForm(item, analysis)}
    </article>
  `;
}
