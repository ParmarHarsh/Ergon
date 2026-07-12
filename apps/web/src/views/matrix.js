import { currentFacility, state } from "../store.js";
import { DISCLAIMER_SHORT, ICONS, confidencePill, emptyState, formatDate, html, label, matchSourcePill, pill, titleCase } from "../ui.js";
import { emptyFacilityPrompt } from "./builder.js";

export function matrixView() {
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head"><div><h1>Gaps & Actions</h1></div></div>
      <div class="card">${emptyFacilityPrompt()}</div>
    `;
  }
  const summary = state.latestReview?.summary;
  return `
    <div class="page-head">
      <div>
        <h1>Gaps & Actions</h1>
        <p class="page-sub">Every applicable obligation for <strong>${html(facility.name)}</strong> with its evidence position: matched, partial, missing, expired, or rejected. Select a row for the full evidence lineage.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-action="generate-review">${ICONS.refresh} ${state.latestReview ? "Regenerate analysis" : "Generate analysis"}</button>
      </div>
    </div>

    ${state.latestReview ? `
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">Obligations</span><span class="stat-value">${summary.totalApplicableObligations}</span><span class="stat-sub">applicable to this facility</span></div>
        <div class="stat"><span class="stat-label">Missing</span><span class="stat-value ${summary.missingEvidenceCount ? "warn" : "ok"}">${summary.missingEvidenceCount}</span><span class="stat-sub">no accepted evidence</span></div>
        <div class="stat"><span class="stat-label">Critical gaps</span><span class="stat-value ${summary.criticalGapsCount ? "danger" : "ok"}">${summary.criticalGapsCount}</span><span class="stat-sub">critical priority, unresolved</span></div>
        <div class="stat"><span class="stat-label">Accepted evidence</span><span class="stat-value ok">${summary.acceptedEvidenceCount}</span><span class="stat-sub">current and reviewer-accepted</span></div>
        <div class="stat"><span class="stat-label">AI awaiting review</span><span class="stat-value ${summary.aiNeedsReviewCount ? "warn" : "ok"}">${summary.aiNeedsReviewCount ?? 0}</span><span class="stat-sub">analyses pending human decision</span></div>
      </div>
    ` : ""}

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Obligation coverage</h2>
          <p class="hint">${state.rulesPack ? `${html(state.rulesPack.name)} · ${html(state.rulesPack.version)}${state.rulesPack.demoContent ? " · demo/unverified content" : ""}` : "Rules pack pending"}</p>
        </div>
      </div>
      <div class="card-body tight">
        ${state.gapRows.length ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Obligation</th>
                  <th>Authority · Citation</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Evidence</th>
                  <th>Match source</th>
                  <th>AI confidence</th>
                  <th>Review</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                ${state.gapRows.map(matrixRow).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState({
          icon: "matrix",
          title: "No gap analysis yet",
          copy: "Generate the deterministic gap analysis to map this facility's evidence against its applicable obligations."
        })}
      </div>
    </section>
    <p class="footer-note">${html(DISCLAIMER_SHORT)}</p>
    ${state.drawerRuleId ? matrixDrawer() : ""}
  `;
}

function matrixRow(row) {
  const insight = primaryInsight(row);
  const reviewState = rowReviewState(row, insight);
  return `
    <tr data-action="open-gap-row" data-rule-id="${html(row.ruleId)}" data-row-link>
      <td style="min-width:220px">
        <div class="cell-strong">${html(row.obligationTitle)}</div>
        <div class="cell-sub">${html(row.country)} / ${html(row.region)} · ${row.demoContent ? "demo rule" : "reviewed rule"}</div>
      </td>
      <td class="cell-nowrap">
        <div>${html(row.authority)}</div>
        <div class="cell-sub">${html(row.citation)}</div>
      </td>
      <td>${pill(row.status)}</td>
      <td>${pill(row.priority, { text: titleCase(row.priority) })}</td>
      <td style="min-width:180px">
        ${row.matchedEvidence.length
          ? row.matchedEvidence.slice(0, 2).map((item) => `<div class="small">${html(item.title)} ${pill(item.status, { text: titleCase(item.status) })}</div>`).join("")
          : `<span class="muted small">No matched evidence</span>`}
        ${row.matchedEvidence.length > 2 ? `<div class="cell-sub">+${row.matchedEvidence.length - 2} more</div>` : ""}
      </td>
      <td>${row.matchedEvidence.length ? matchSourcePill(bestMatchSource(row)) : "—"}</td>
      <td>${insight ? confidencePill(insight.confidence) : `<span class="muted small">—</span>`}</td>
      <td>${reviewState}</td>
      <td class="cell-nowrap muted">${formatDate(row.dueDate)}</td>
    </tr>
  `;
}

function bestMatchSource(row) {
  const order = ["human_reviewed", "manual", "ai_assisted_deterministic", "deterministic", "ai_suggestion"];
  const sources = row.matchedEvidence.map((item) => item.matchSource);
  return order.find((source) => sources.includes(source)) || sources[0];
}

function primaryInsight(row) {
  if (!row.aiInsights?.length) return null;
  return [...row.aiInsights].sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1))[0];
}

function rowReviewState(row, insight) {
  if (!insight) return `<span class="muted small">No AI input</span>`;
  if (insight.humanReviewed) return pill("human_reviewed", { text: "Human-reviewed" });
  if (insight.needsHumanReview) return pill("needs_review", { text: "Needs review" });
  return pill("processed", { text: "AI matched" });
}

function matrixDrawer() {
  const row = state.gapRows.find((entry) => entry.ruleId === state.drawerRuleId);
  if (!row) return "";
  const rule = state.applicableRules.find((entry) => entry.id === row.ruleId) || null;
  const matchedIds = new Set(row.matchedEvidence.map((item) => item.id));
  const acceptedTypes = new Set(row.matchedEvidence.filter((item) => item.status === "accepted").map((item) => item.evidenceType));
  const missingTypes = row.requiredEvidence.filter((type) => !acceptedTypes.has(type));
  const reviewerNotes = collectReviewerNotes(row);
  return `
    <div class="drawer-overlay" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="Obligation detail">
      <div class="drawer-head">
        <div>
          <div class="drawer-kicker">${html(row.authority)} · ${html(row.citation)} · ${html(row.country)}/${html(row.region)}</div>
          <h2>${html(row.obligationTitle)}</h2>
          <div class="badge-row" style="margin-top:8px">
            ${pill(row.status)} ${pill(row.priority, { text: `${titleCase(row.priority)} priority` })}
            ${row.demoContent ? `<span class="pill pill-warn plain">Demo / unverified rule</span>` : `<span class="pill pill-good plain">Expert-reviewed rule</span>`}
          </div>
        </div>
        <button class="drawer-close" data-action="close-drawer" aria-label="Close">${ICONS.close}</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-section">
          <h3>What this obligation requires</h3>
          <p>${html(rule?.description || "Maintain the required evidence for this obligation.")}</p>
          <div class="kv-grid">
            <div class="kv"><dt>Owner role</dt><dd>${html(row.ownerRole)}</dd></div>
            <div class="kv"><dt>Due date</dt><dd>${formatDate(row.dueDate)}</dd></div>
            <div class="kv"><dt>Rules pack</dt><dd>${html(row.rulesPackName)}</dd></div>
            ${rule?.sourceUrl ? `<div class="kv"><dt>Source</dt><dd><a href="${html(rule.sourceUrl)}" target="_blank" rel="noopener noreferrer">${html(rule.sourceUrl)}</a></dd></div>` : ""}
          </div>
        </div>

        <div class="drawer-section">
          <h3>Required evidence</h3>
          <div class="badge-row">
            ${row.requiredEvidence.map((type) => `<span class="pill ${acceptedTypes.has(type) ? "pill-good" : "pill-bad"} plain">${html(label(type))}</span>`).join("")}
          </div>
          ${missingTypes.length ? `<p class="small muted">Missing accepted evidence for: ${missingTypes.map((type) => html(label(type))).join(", ")}.</p>` : `<p class="small muted">All required evidence types have current accepted evidence.</p>`}
        </div>

        <div class="drawer-section">
          <h3>Matched evidence</h3>
          ${row.matchedEvidence.length ? `
            <div class="drawer-list">
              ${row.matchedEvidence.map((item) => `
                <div class="drawer-list-item">
                  <div class="row">
                    <strong>${html(item.title)}</strong>
                    <span class="badge-row">${pill(item.status, { text: titleCase(item.status) })} ${matchSourcePill(item.matchSource)}</span>
                  </div>
                  <div class="sub">${html(label(item.evidenceType))}</div>
                </div>
              `).join("")}
            </div>
          ` : `<p class="small muted">No evidence is currently matched to this obligation.</p>`}
        </div>

        ${row.aiInsights?.length ? `
          <div class="drawer-section">
            <h3>AI analysis and audit lineage</h3>
            <div class="drawer-list">
              ${row.aiInsights.map((insight) => aiInsightItem(insight, matchedIds)).join("")}
            </div>
          </div>
        ` : ""}

        ${reviewerNotes.length ? `
          <div class="drawer-section">
            <h3>Reviewer notes</h3>
            <div class="drawer-list">
              ${reviewerNotes.map((note) => `<div class="drawer-list-item"><strong>${html(note.title)}</strong><div class="sub">${html(note.notes)}</div></div>`).join("")}
            </div>
          </div>
        ` : ""}

        <div class="drawer-section">
          <h3>Recommended action</h3>
          <p>${html(row.recommendedAction)}</p>
        </div>

        <div class="inline-note">${ICONS.info}<span>${html(DISCLAIMER_SHORT)}</span></div>
      </div>
    </aside>
  `;
}

function aiInsightItem(insight, matchedIds) {
  const evidence = state.evidence.find((item) => item.id === insight.evidenceId);
  const analysis = state.aiAnalyses.find((item) => item.evidenceId === insight.evidenceId);
  return `
    <div class="drawer-list-item">
      <div class="row">
        <strong>${html(evidence?.title || insight.evidenceId)}</strong>
        <span class="badge-row">
          ${confidencePill(insight.confidence)}
          ${insight.humanReviewed ? pill("human_reviewed", { text: "Human-reviewed" }) : insight.needsHumanReview ? pill("needs_review", { text: "Needs review" }) : pill("processed", { text: "AI matched" })}
        </span>
      </div>
      <div class="sub">
        Detected ${html(label(insight.detectedEvidenceType || "other"))} · analysis v${html(insight.analysisVersion || 1)} · text extraction: ${html(label(insight.textExtractionStatus || "not_started"))}
        ${matchedIds.has(insight.evidenceId) ? " · counted toward this obligation" : " · suggestion only"}
      </div>
      ${insight.matchReason ? `<div class="sub">Reason: ${html(insight.matchReason)}</div>` : ""}
      ${insight.extractedDocumentDate || insight.extractedExpirationDate ? `<div class="sub">Dates: document ${html(insight.extractedDocumentDate || "unknown")} · expires ${html(insight.extractedExpirationDate || "unknown")}</div>` : ""}
      ${(insight.issues || []).length ? `<div class="sub">Issues: ${insight.issues.map(html).join("; ")}</div>` : ""}
      ${analysis?.humanReviewNotes ? `<div class="sub">Reviewer: ${html(analysis.humanReviewNotes)}</div>` : ""}
    </div>
  `;
}

function collectReviewerNotes(row) {
  const notes = [];
  for (const item of row.matchedEvidence) {
    const evidence = state.evidence.find((entry) => entry.id === item.id);
    const analysis = state.aiAnalyses.find((entry) => entry.evidenceId === item.id);
    const text = analysis?.humanReviewNotes || evidence?.reviewerNotes;
    if (text) notes.push({ title: item.title, notes: text });
  }
  return notes;
}
