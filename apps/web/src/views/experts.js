import { canReview, currentFacility, state } from "../store.js";
import { emptyState, formatDateTime, html, pill, titleCase } from "../ui.js";

export function expertsView() {
  const facility = currentFacility();
  return `
    <div class="page-head">
      <div>
        <h1>Expert review</h1>
        <p class="page-sub">Starter rules packs are demo/unverified content. Request a qualified EHS or regulatory expert review before relying on any packet for a real audit.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-action="request-expert-review" ${facility ? "" : "disabled"}>Request expert review</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Requests</h2>
          <p class="hint">Track qualified-review requests across your organization.</p>
        </div>
      </div>
      <div class="card-body tight">
        ${state.expertReviews.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Requested</th><th>Status</th><th>Notes</th>${canReview() ? `<th style="text-align:right">Update</th>` : ""}</tr></thead>
              <tbody>
                ${state.expertReviews.map((item) => `
                  <tr>
                    <td class="cell-nowrap muted">${formatDateTime(item.createdAt)}</td>
                    <td>${pill(item.status, { text: titleCase(item.status) })}</td>
                    <td>${html(item.expertNotes || "—")}</td>
                    ${canReview() ? `
                      <td style="text-align:right;white-space:nowrap">
                        ${item.status !== "resolved" ? `
                          <button class="btn btn-secondary btn-sm" data-action="expert-status" data-expert-id="${html(item.id)}" data-status="in_review">Mark in review</button>
                          <button class="btn btn-secondary btn-sm" data-action="expert-status" data-expert-id="${html(item.id)}" data-status="resolved">Mark resolved</button>
                        ` : ""}
                      </td>
                    ` : ""}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState({
          icon: "expert",
          title: "No expert reviews requested",
          copy: "Request an expert review to have jurisdiction-specific rules and evidence conclusions verified by a qualified professional."
        })}
      </div>
    </section>
  `;
}
