import { canReview, currentFacility, state } from "../store.js";
import { DISCLAIMER_SHORT, ICONS, emptyState, formatDateTime, html, pill } from "../ui.js";
import { emptyFacilityPrompt } from "./builder.js";

export function packetsView() {
  const facility = currentFacility();
  if (!facility) {
    return `
      <div class="page-head"><div><h1>Audit packets</h1></div></div>
      <div class="card">${emptyFacilityPrompt()}</div>
    `;
  }
  const activePackets = state.packets.filter((packet) => !packet.archived);
  const archivedPackets = state.packets.filter((packet) => packet.archived);
  return `
    <div class="page-head">
      <div>
        <h1>Audit packets</h1>
        <p class="page-sub">Exported readiness packets for <strong>${html(facility.name)}</strong>. Each PDF includes the facility profile, readiness score, gap matrix, action plan, AI evidence lineage, reviewer decisions, and disclaimers.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-action="export-packet" ${state.latestReview ? "" : "disabled"}>${ICONS.packet} Export new packet</button>
      </div>
    </div>

    ${state.latestReview ? "" : `<div class="alert-info">Generate a gap analysis before exporting — the packet is built from the latest backend review.</div>`}

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Packet history</h2>
          <p class="hint">Downloads are authenticated and tenant-scoped; every download is audit-logged.</p>
        </div>
      </div>
      <div class="card-body tight">
        ${activePackets.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Packet</th><th>Generated</th><th>Jurisdiction</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
              <tbody>
                ${activePackets.map((packet) => `
                  <tr>
                    <td>
                      <div class="cell-strong">${html(packet.title)}</div>
                      <div class="cell-sub mono">${html(packet.id)}</div>
                    </td>
                    <td class="cell-nowrap muted">${formatDateTime(packet.generatedAt || packet.createdAt)}</td>
                    <td class="cell-nowrap">${html(packet.country)} / ${html(packet.region)}</td>
                    <td>${pill(packet.status === "generated" ? "completed" : packet.status, { text: "Generated" })}</td>
                    <td style="text-align:right;white-space:nowrap">
                      <button class="btn btn-secondary btn-sm" data-action="download-packet" data-packet-id="${html(packet.id)}">${ICONS.download} Download</button>
                      ${canReview() ? (packet.legalHoldActive
                        ? `<button class="btn btn-secondary btn-sm" data-action="release-packet-hold" data-packet-id="${html(packet.id)}">Release hold</button>`
                        : `<button class="btn btn-secondary btn-sm" data-action="hold-packet" data-packet-id="${html(packet.id)}">Hold</button>`) : ""}
                      ${canReview() && packet.storageDeletionStatus === "failed" && packet.fileReference ? `<button class="btn btn-secondary btn-sm" data-action="retry-packet-deletion" data-packet-id="${html(packet.id)}">Retry deletion</button>` : ""}
                      ${canReview() ? `<button class="btn btn-danger btn-sm" data-action="archive-packet" data-packet-id="${html(packet.id)}" ${packet.legalHoldActive ? "disabled" : ""}>Archive</button>` : ""}
                      ${packet.legalHoldActive ? `<div class="cell-sub">Legal hold active</div>` : ""}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState({
          icon: "packet",
          title: "No packets exported yet",
          copy: "Once the gap analysis reflects your evidence position, export a packet to share with auditors, leadership, or advisors."
        })}
        ${canReview() && archivedPackets.length ? `
          <div class="section-divider"></div>
          <h3 class="compact-heading">Archived packets</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Packet</th><th>Deleted</th><th>Deletion</th><th style="text-align:right">Actions</th></tr></thead>
              <tbody>
                ${archivedPackets.map((packet) => `
                  <tr>
                    <td>
                      <div class="cell-strong">${html(packet.title)}</div>
                      <div class="cell-sub mono">${html(packet.id)}</div>
                    </td>
                    <td class="cell-nowrap muted">${formatDateTime(packet.deletedAt || packet.generatedAt)}</td>
                    <td>${pill(packet.storageDeletionStatus || "retained")}</td>
                    <td style="text-align:right;white-space:nowrap">
                      ${packet.storageDeletionStatus !== "deleted" ? `<button class="btn btn-secondary btn-sm" data-action="restore-packet" data-packet-id="${html(packet.id)}">Restore</button>` : ""}
                      ${packet.storageDeletionStatus === "failed" && packet.fileReference ? `<button class="btn btn-secondary btn-sm" data-action="retry-packet-deletion" data-packet-id="${html(packet.id)}">Retry deletion</button>` : ""}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}
      </div>
    </section>
    <p class="footer-note">${html(DISCLAIMER_SHORT)}</p>
  `;
}
