import { API_BASE, canReview, currentFacility, state } from "../store.js";
import { formatDateTime, html, kv, pill, titleCase } from "../ui.js";

export function systemView() {
  const health = state.health;
  return `
    <div class="page-head">
      <div>
        <h1>System status</h1>
        <p class="page-sub">Runtime configuration and dependency health for this workspace. Secrets are never exposed to the browser.</p>
      </div>
      <div class="page-actions">
        ${canReview() ? `<button class="btn btn-secondary" data-action="enforce-retention">Enforce retention</button>` : ""}
        <button class="btn btn-secondary" data-action="refresh-system">Refresh</button>
      </div>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Platform health</h2>${health ? pill(health.ok ? "ok" : "failed", { text: health.ok ? "Ready" : "Degraded" }) : ""}</div>
        <div class="card-body" style="display:grid;gap:12px">
          ${health ? `
            <div class="kv-grid">
              ${kv("API origin", html(API_BASE))}
              ${kv("Process role", html(health.processRole || "unknown"))}
              ${kv("Deployment profile", html(health.deploymentProfile || "unknown"))}
              ${kv("Persistence", healthPill(health.persistence))}
              ${kv("Storage", healthPill(health.storage))}
              ${kv("Malware scanner", healthPill(health.scanner))}
              ${kv("Processing queue", healthPill(health.queue))}
            </div>
          ` : `<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:50%"></div>`}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>AI configuration</h2>${pill(state.aiStatus.enabled ? "active" : "inactive", { text: state.aiStatus.enabled ? "Enabled" : "Disabled" })}</div>
        <div class="card-body">
          <div class="kv-grid">
            ${kv("Provider", html(state.aiStatus.provider))}
            ${kv("Model", state.aiStatus.model ? html(state.aiStatus.model) : "—")}
            ${kv("Queue backend", html(state.aiStatus.queueBackend || "local"))}
            ${kv("Storage backend", html(state.aiStatus.storageBackend || "local"))}
            ${kv("Scanner", html(state.aiStatus.malwareScanner || "disabled"))}
          </div>
          <p class="field-hint" style="margin-top:12px">AI calls run backend-only. The browser never holds provider keys. When AI is disabled, deterministic analysis and manual review remain fully functional.</p>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Recent activity</h2>
          <p class="hint">${currentFacility() ? `Latest audit-trail entries for ${html(currentFacility().name)}` : "Select a facility to view its audit trail"}</p>
        </div>
      </div>
      <div class="card-body tight">
        ${state.auditLogs.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                ${state.auditLogs.map((entry) => `
                  <tr>
                    <td class="cell-nowrap muted">${formatDateTime(entry.createdAt)}</td>
                    <td><span class="pill pill-neutral plain">${html(titleCase(entry.action.replaceAll(".", " ")))}</span></td>
                    <td class="muted small">${html(entry.entityType)} · <span class="mono">${html(String(entry.entityId || "").slice(0, 18))}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : `<div class="card-pad muted small">No audit activity for this facility yet.</div>`}
      </div>
    </section>
  `;
}

function healthPill(check) {
  if (!check) return pill("inactive", { text: "Unknown" });
  return `${pill(check.ok ? "ok" : "failed", { text: check.ok ? "Healthy" : check.errorCode || "Unavailable" })}${check.backend ? ` <span class="muted small">${html(check.backend)}</span>` : ""}`;
}
