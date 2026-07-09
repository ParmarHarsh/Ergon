import { isAdmin, state } from "../store.js";
import { ICONS, emptyState, formatDate, html, pill, titleCase } from "../ui.js";

const ROLES = ["admin", "compliance_manager", "reviewer", "auditor", "executive"];

const ROLE_DESCRIPTIONS = {
  admin: "Full access: user management, review decisions, archival.",
  compliance_manager: "Creates facilities and evidence; views analyses and packets.",
  reviewer: "Makes evidence review decisions and manages archival.",
  auditor: "Read-focused access for audit preparation.",
  executive: "Read-focused access to readiness summaries."
};

export function adminView() {
  if (!isAdmin()) {
    return `
      <div class="page-head"><div><h1>Admin</h1></div></div>
      <div class="card">${emptyState({ icon: "admin", title: "Administrator role required", copy: "Only organization administrators can manage users and roles." })}</div>
    `;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Admin — users and roles</h1>
        <p class="page-sub">Members of <strong>${html(state.organization?.name || "your organization")}</strong>. All management actions are audit-logged.</p>
      </div>
    </div>

    <div class="grid-3-1">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Members</h2>
            <p class="hint">${state.users.length} user${state.users.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div class="card-body tight">
          ${state.users.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th style="text-align:right">Manage</th></tr></thead>
                <tbody>
                  ${state.users.map((user) => adminUserRow(user)).join("")}
                </tbody>
              </table>
            </div>
          ` : `<div class="card-pad muted small">Loading members…</div>`}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2>Invite a member</h2>
            <p class="hint">Creates the account immediately with the password you set. Share credentials over a secure channel.</p>
          </div>
        </div>
        <div class="card-body">
          <form id="user-form" class="form-grid" data-form="create-user">
            <label class="field">
              <span class="field-label">Full name</span>
              <input name="name" placeholder="e.g. Dana Alvarez" required />
            </label>
            <label class="field">
              <span class="field-label">Email</span>
              <input name="email" type="email" placeholder="dana@company.com" required />
            </label>
            <label class="field">
              <span class="field-label">Role</span>
              <select name="role">
                ${ROLES.map((role) => `<option value="${role}" ${role === "reviewer" ? "selected" : ""}>${titleCase(role)}</option>`).join("")}
              </select>
              <span class="field-hint" data-role-hint>${ROLE_DESCRIPTIONS.reviewer}</span>
            </label>
            <label class="field">
              <span class="field-label">Temporary password</span>
              <input name="password" type="password" minlength="12" placeholder="At least 12 characters" required />
            </label>
            <div class="form-footer">
              <button type="submit" class="btn btn-primary">${ICONS.plus} Create user</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;
}

function adminUserRow(user) {
  const self = user.id === state.user.id;
  return `
    <tr>
      <td>
        <div class="cell-strong">${html(user.name)} ${self ? `<span class="pill pill-brand plain">You</span>` : ""}</div>
        <div class="cell-sub">${html(user.email)}</div>
      </td>
      <td>
        <select data-action-change="set-user-role" data-user-id="${html(user.id)}" ${self ? "disabled" : ""} style="max-width:190px">
          ${ROLES.map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${titleCase(role)}</option>`).join("")}
        </select>
      </td>
      <td>${pill(user.isActive ? "active" : "inactive", { text: user.isActive ? "Active" : "Deactivated" })}</td>
      <td class="cell-nowrap muted">${formatDate(user.createdAt)}</td>
      <td style="text-align:right;white-space:nowrap">
        ${self ? `<span class="muted small">—</span>` : user.isActive
          ? `<button class="btn btn-danger btn-sm" data-action="toggle-user" data-user-id="${html(user.id)}" data-active="false">Deactivate</button>`
          : `<button class="btn btn-secondary btn-sm" data-action="toggle-user" data-user-id="${html(user.id)}" data-active="true">Reactivate</button>`}
      </td>
    </tr>
  `;
}
