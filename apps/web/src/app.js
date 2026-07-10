import { API_BASE, api, bootstrap, canReview, currentFacility, fileToBase64, isAdmin, refreshAdminData, refreshExpertReviews, refreshFacilityData, refreshReviewQueue, refreshSystemData, resetSession, state } from "./store.js";
import { ICONS, html } from "./ui.js";
import { loginView } from "./views/login.js";
import { builderView } from "./views/builder.js";
import { facilitiesView } from "./views/facilities.js";
import { evidenceView } from "./views/evidence.js";
import { reviewView } from "./views/review.js";
import { matrixView } from "./views/matrix.js";
import { actionsView } from "./views/actions.js";
import { packetsView } from "./views/packets.js";
import { expertsView } from "./views/experts.js";
import { adminView } from "./views/admin.js";
import { systemView } from "./views/system.js";

const root = document.querySelector("#app");

const ROUTES = {
  builder: { title: "Audit Packet Builder", view: builderView },
  facilities: { title: "Facilities", view: facilitiesView },
  evidence: { title: "Evidence", view: evidenceView },
  review: { title: "Review queue", view: reviewView },
  matrix: { title: "Evidence Gap Matrix", view: matrixView },
  actions: { title: "Action plan", view: actionsView },
  packets: { title: "Audit packets", view: packetsView },
  experts: { title: "Expert review", view: expertsView },
  admin: { title: "Admin", view: adminView },
  system: { title: "System status", view: systemView }
};

const NAV = [
  ["Workspace", [
    ["builder", "Packet Builder", "builder"],
    ["facilities", "Facilities", "facility"],
    ["evidence", "Evidence", "evidence"]
  ]],
  ["Analysis", [
    ["review", "Review queue", "review"],
    ["matrix", "Gap Matrix", "matrix"],
    ["actions", "Action plan", "actions"],
    ["packets", "Audit packets", "packet"]
  ]],
  ["Organization", [
    ["experts", "Expert review", "expert"],
    ["admin", "Admin", "admin"],
    ["system", "System", "system"]
  ]]
];

/* ---------- Rendering ---------- */

function render() {
  if (!state.booted) {
    root.innerHTML = `<div class="login-form-col" style="min-height:100vh;display:grid;place-items:center"><div class="muted small">Loading ComplianceIQ…</div></div>`;
    return;
  }
  if (!state.user) {
    root.innerHTML = loginView();
    return;
  }
  const route = ROUTES[state.route] ? state.route : "builder";
  root.innerHTML = `
    <div class="app-shell">
      ${sidebar(route)}
      <div class="main-col">
        ${topbar(route)}
        <main class="workspace">
          ${state.error ? `<div class="alert">${html(state.error)} <button class="btn btn-ghost btn-sm" data-action="dismiss-error" style="margin-left:8px">Dismiss</button></div>` : ""}
          ${ROUTES[route].view()}
        </main>
      </div>
    </div>
    <div class="toast-stack" id="toast-stack"></div>
  `;
}

function sidebar(activeRoute) {
  const reviewCount = canReview() ? state.reviewQueue.length : 0;
  const criticalCount = state.latestReview?.summary?.criticalGapsCount || 0;
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">${ICONS.logo}</div>
        <div>
          <div class="brand-name">ComplianceIQ</div>
          <div class="brand-sub">Evidence Intelligence</div>
        </div>
      </div>
      ${NAV.map(([groupLabel, items]) => {
        const visible = items.filter(([route]) => routeVisible(route));
        if (!visible.length) return "";
        return `
          <nav class="nav-group">
            <div class="nav-label">${groupLabel}</div>
            ${visible.map(([route, text, icon]) => `
              <button class="nav-item ${route === activeRoute ? "active" : ""}" data-nav="${route}">
                ${ICONS[icon] || ""}
                <span>${text}</span>
                ${route === "review" && reviewCount ? `<span class="nav-count">${reviewCount}</span>` : ""}
                ${route === "matrix" && criticalCount ? `<span class="nav-count danger">${criticalCount}</span>` : ""}
              </button>
            `).join("")}
          </nav>
        `;
      }).join("")}
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="avatar">${html(initials(state.user.name || state.user.email))}</div>
          <div style="min-width:0">
            <div class="sidebar-user-name">${html(state.user.name || state.user.email)}</div>
            <div class="sidebar-user-role">${html(String(state.user.role || "").replaceAll("_", " "))}</div>
          </div>
          <button class="logout-btn" data-action="logout" title="Log out" aria-label="Log out">${ICONS.logout}</button>
        </div>
      </div>
    </aside>
  `;
}

function topbar(route) {
  return `
    <header class="topbar">
      <span class="topbar-title">${ROUTES[route].title}</span>
      <span class="topbar-spacer"></span>
      ${state.facilities.length ? `
        <label class="facility-switch">
          <span>Facility</span>
          <select data-action-change="switch-facility" id="facility-select">
            ${state.facilities.map((facility) => `<option value="${html(facility.id)}" ${facility.id === state.selectedFacilityId ? "selected" : ""}>${html(facility.name)} (${html(facility.country)}/${html(facility.region)})</option>`).join("")}
          </select>
        </label>
      ` : ""}
    </header>
  `;
}

function routeVisible(route) {
  if (route === "admin") return isAdmin();
  if (route === "review") return canReview();
  return true;
}

function initials(name) {
  return String(name).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

/* ---------- Toasts ---------- */

function toast(message, type = "info") {
  const stack = document.querySelector("#toast-stack");
  if (!stack) return;
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "error" : ""}`;
  node.innerHTML = `${type === "error" ? ICONS.alert : ICONS.check}<span>${html(message)}</span>`;
  stack.appendChild(node);
  window.setTimeout(() => node.remove(), 4600);
}

/* ---------- Actions ---------- */

async function run(work, { successMessage = "", rethrow = false } = {}) {
  state.error = "";
  try {
    await work();
    render();
    if (successMessage) toast(successMessage);
  } catch (error) {
    if (error.status === 401 && state.user) {
      resetSession();
      state.loginError = "Your session expired. Please sign in again.";
      render();
      return;
    }
    state.error = error.message;
    render();
    toast(error.message, "error");
    if (rethrow) throw error;
  }
}

function navigate(route) {
  state.drawerRuleId = null;
  state.route = ROUTES[route] ? route : "builder";
  window.location.hash = `#/${state.route}`;
  render();
  void loadRouteData(state.route);
}

async function loadRouteData(route) {
  try {
    if (route === "admin" && isAdmin() && !state.users.length) {
      await refreshAdminData();
      render();
    } else if (route === "experts") {
      await refreshExpertReviews();
      render();
    } else if (route === "system") {
      await refreshSystemData();
      render();
    }
  } catch (error) {
    if (error.status === 401 && state.user) {
      resetSession();
      render();
      return;
    }
    toast(error.message, "error");
  }
}

const clickActions = {
  "dismiss-error": () => {
    state.error = "";
    render();
  },
  logout: async () => {
    await run(async () => {
      await api("/api/auth/logout", { method: "POST", body: {} });
      resetSession();
    });
  },
  "close-drawer": () => {
    state.drawerRuleId = null;
    render();
  },
  "open-gap-row": (dataset) => {
    state.drawerRuleId = dataset.ruleId;
    render();
  },
  "select-facility": async (dataset) => {
    state.selectedFacilityId = dataset.facilityId;
    await run(() => refreshFacilityData());
  },
  "generate-review": async () => {
    const facility = currentFacility();
    if (!facility) return;
    await run(async () => {
      const result = await api("/api/audit-readiness/reviews", { method: "POST", body: { facilityId: facility.id } });
      state.latestReview = result.review;
      state.gapRows = result.gapRows;
      state.actionItems = result.actionPlan;
    }, { successMessage: "Gap analysis refreshed from the deterministic rules engine." });
  },
  "export-packet": async () => {
    if (!state.latestReview) return;
    await run(async () => {
      const result = await api("/api/audit-packets/export", { method: "POST", body: { reviewId: state.latestReview.id } });
      state.packets.unshift(result.packet);
      navigate("packets");
    }, { successMessage: "Audit packet generated with full evidence lineage." });
  },
  "download-packet": async (dataset) => {
    await run(() => downloadFile(`/api/audit-packets/${encodeURIComponent(dataset.packetId)}/download`, `industrial-audit-readiness-packet-${dataset.packetId}.pdf`));
  },
  "download-evidence": async (dataset) => {
    const item = state.evidence.find((entry) => entry.id === dataset.evidenceId);
    await run(() => downloadFile(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/download`, item?.fileName || "evidence.bin"));
  },
  "archive-packet": async (dataset) => {
    if (!window.confirm("Archive this packet and delete its generated private PDF? Audit history is preserved.")) return;
    await run(async () => {
      await api(`/api/audit-packets/${encodeURIComponent(dataset.packetId)}?reason=${encodeURIComponent("Archived from packet history")}`, { method: "DELETE" });
      await refreshFacilityData();
    }, { successMessage: "Packet archived and private PDF deleted." });
  },
  "hold-packet": async (dataset) => {
    const reason = window.prompt("Reason for legal hold:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/audit-packets/${encodeURIComponent(dataset.packetId)}/legal-hold`, { method: "POST", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Packet legal hold applied." });
  },
  "release-packet-hold": async (dataset) => {
    const reason = window.prompt("Reason for releasing legal hold:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/audit-packets/${encodeURIComponent(dataset.packetId)}/legal-hold`, { method: "DELETE", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Packet legal hold released." });
  },
  "restore-packet": async (dataset) => {
    const reason = window.prompt("Reason for restoring this packet metadata:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/audit-packets/${encodeURIComponent(dataset.packetId)}/restore`, { method: "POST", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Packet restored." });
  },
  "retry-packet-deletion": async (dataset) => {
    const reason = window.prompt("Reason for retrying packet private-object deletion:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/audit-packets/${encodeURIComponent(dataset.packetId)}/retry-storage-deletion`, { method: "POST", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Packet deletion retry completed." });
  },
  "archive-evidence": async (dataset) => {
    if (!window.confirm("Archive this evidence record and delete its private file? Audit history is preserved.")) return;
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}?reason=${encodeURIComponent("Archived from evidence workspace")}`, { method: "DELETE" });
      await refreshFacilityData();
    }, { successMessage: "Evidence archived and private file deleted." });
  },
  "hold-evidence": async (dataset) => {
    const reason = window.prompt("Reason for legal hold:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/legal-hold`, { method: "POST", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Evidence legal hold applied." });
  },
  "release-evidence-hold": async (dataset) => {
    const reason = window.prompt("Reason for releasing legal hold:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/legal-hold`, { method: "DELETE", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Evidence legal hold released." });
  },
  "restore-evidence": async (dataset) => {
    const reason = window.prompt("Reason for restoring this evidence metadata:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/restore`, { method: "POST", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Evidence restored." });
  },
  "retry-evidence-deletion": async (dataset) => {
    const reason = window.prompt("Reason for retrying evidence private-object deletion:", "");
    if (!reason) return;
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/retry-storage-deletion`, { method: "POST", body: { reason } });
      await refreshFacilityData();
    }, { successMessage: "Evidence deletion retry completed." });
  },
  "process-ai": async (dataset) => {
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/process-ai`, { method: "POST", body: {} });
      await refreshFacilityData();
    }, { successMessage: "Evidence queued for AI analysis." });
  },
  "retry-processing": async (dataset) => {
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(dataset.evidenceId)}/retry-processing`, { method: "POST", body: {} });
      await refreshFacilityData();
    }, { successMessage: "Processing retry queued." });
  },
  "toggle-user": async (dataset) => {
    await run(async () => {
      await api(`/api/users/${encodeURIComponent(dataset.userId)}`, { method: "PATCH", body: { isActive: dataset.active === "true" } });
      await refreshAdminData();
    }, { successMessage: dataset.active === "true" ? "User reactivated." : "User deactivated." });
  },
  "expert-status": async (dataset) => {
    await run(async () => {
      await api(`/api/expert-reviews/${encodeURIComponent(dataset.expertId)}`, { method: "PATCH", body: { status: dataset.status } });
      await refreshExpertReviews();
    }, { successMessage: "Expert review updated." });
  },
  "request-expert-review": async () => {
    const facility = currentFacility();
    if (!facility) return;
    const notes = window.prompt("Optional context for the expert reviewer:", "");
    if (notes === null) return;
    await run(async () => {
      await api("/api/expert-reviews", { method: "POST", body: { facilityId: facility.id, reviewId: state.latestReview?.id || undefined, expertNotes: notes || undefined } });
      await refreshExpertReviews();
    }, { successMessage: "Expert review requested." });
  },
  "refresh-system": async () => {
    await run(() => refreshSystemData());
  },
  "enforce-retention": async () => {
    const reason = window.prompt("Reason for retention enforcement:", "Pilot retention enforcement");
    if (!reason) return;
    await run(async () => {
      const result = await api("/api/lifecycle/retention/enforce", { method: "POST", body: { reason } });
      await refreshFacilityData();
      await refreshSystemData();
      toast(`Retention checked ${result.considered}; archived ${result.archived}; skipped holds ${result.skippedDueLegalHold}.`);
    });
  }
};

const formActions = {
  login: async (form) => {
    const data = Object.fromEntries(new FormData(form));
    state.loginError = "";
    state.resetMessage = "";
    try {
      const result = await api("/api/auth/login", { method: "POST", body: data });
      state.user = result.user;
      state.booted = true;
      await bootstrap();
      state.route = "builder";
      window.location.hash = "#/builder";
      render();
    } catch (error) {
      state.loginError = error.message;
      render();
    }
  },
  "password-recovery": async (form) => {
    const data = Object.fromEntries(new FormData(form));
    state.recoveryError = "";
    state.recoveryMessage = "";
    try {
      const result = await api("/api/auth/recovery/request", { method: "POST", body: data });
      state.recoveryMessage = result.message;
      render();
    } catch (error) {
      state.recoveryError = error.message;
      render();
    }
  },
  "password-reset": async (form) => {
    const data = Object.fromEntries(new FormData(form));
    state.resetError = "";
    state.resetMessage = "";
    try {
      if (data.password !== data.confirmPassword) throw new Error("Passwords do not match");
      const result = await api("/api/auth/recovery/reset", { method: "POST", body: data });
      state.resetMessage = result.message;
      state.resetToken = "";
      window.location.hash = "#/login";
      render();
    } catch (error) {
      state.resetError = error.message;
      render();
    }
  },
  "create-facility": async (form) => {
    const data = new FormData(form);
    const country = String(data.get("country") || "");
    const region = String(data.get("region") || "");
    const body = {
      name: data.get("name"),
      country,
      stateProvince: data.get("stateProvince"),
      region,
      jurisdictionCode: String(data.get("jurisdictionCode") || "").trim() || `${country}-${region}`,
      industry: data.get("industry"),
      facilityType: data.get("facilityType"),
      employeeCount: Number(data.get("employeeCount")),
      hazardProfile: Object.fromEntries(["machinery", "hazardousChemicals", "forklifts", "lockoutTagout", "ppe", "respiratoryHazards", "hearingNoise", "hazardousWaste", "oilFuelStorage"].map((key) => [key, data.get(key) === "on"]))
    };
    await run(async () => {
      const facility = await api("/api/facilities", { method: "POST", body });
      state.facilities.unshift(facility);
      state.selectedFacilityId = facility.id;
      await refreshFacilityData();
    }, { successMessage: "Facility created — rules pack selected by the backend." });
  },
  "create-evidence": async (form) => {
    const facility = currentFacility();
    if (!facility) return;
    const data = new FormData(form);
    const file = data.get("file");
    const body = Object.fromEntries([...data.entries()].filter(([key]) => key !== "file"));
    body.facilityId = facility.id;
    await run(async () => {
      if (file instanceof File && file.size > 0) {
        body.fileName = file.name;
        body.contentType = file.type || "application/octet-stream";
        body.contentBase64 = await fileToBase64(file);
        await api("/api/evidence/upload", { method: "POST", body });
      } else {
        await api("/api/evidence", { method: "POST", body });
      }
      form.reset();
      await refreshFacilityData();
    }, { successMessage: file instanceof File && file.size > 0 ? "Evidence uploaded — scan and AI analysis queued." : "Evidence logged." });
  },
  "ai-review": async (form, submitter) => {
    const data = new FormData(form);
    const action = submitter?.value;
    await run(async () => {
      await api(`/api/evidence/${encodeURIComponent(form.dataset.evidenceId)}/ai-review`, {
        method: "PATCH",
        body: { action, evidenceType: data.get("evidenceType"), ruleId: data.get("ruleId"), notes: data.get("notes") }
      });
      await refreshFacilityData();
    }, { successMessage: "Review decision saved and gap analysis updated." });
  },
  "create-user": async (form) => {
    const data = Object.fromEntries(new FormData(form));
    await run(async () => {
      await api("/api/users", { method: "POST", body: data });
      form.reset();
      await refreshAdminData();
    }, { successMessage: "User created." });
  },
  "review-filters": async (form) => {
    const data = new FormData(form);
    state.reviewQueueFilters = { status: String(data.get("status") || ""), priority: String(data.get("priority") || "") };
    await run(() => refreshReviewQueue());
  }
};

/* ---------- Downloads ---------- */

async function downloadFile(path, fileName) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || `Download failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ---------- Event delegation ---------- */

document.addEventListener("click", (event) => {
  const navTarget = event.target.closest("[data-nav]");
  if (navTarget) {
    navigate(navTarget.dataset.nav);
    return;
  }
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const handler = clickActions[actionTarget.dataset.action];
  if (handler) void handler(actionTarget.dataset);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const handler = formActions[form.dataset.form];
  if (handler) void handler(form, event.submitter);
});

document.addEventListener("change", (event) => {
  const changeTarget = event.target.closest("[data-action-change]");
  if (changeTarget) {
    if (changeTarget.dataset.actionChange === "switch-facility") {
      state.selectedFacilityId = changeTarget.value;
      void run(() => refreshFacilityData());
    }
    if (changeTarget.dataset.actionChange === "set-user-role") {
      void run(async () => {
        await api(`/api/users/${encodeURIComponent(changeTarget.dataset.userId)}`, { method: "PATCH", body: { role: changeTarget.value } });
        await refreshAdminData();
      }, { successMessage: "Role updated." });
    }
    return;
  }
  const filtersForm = event.target.closest('[data-form="review-filters"]');
  if (filtersForm) {
    void formActions["review-filters"](filtersForm);
    return;
  }
  const roleSelect = event.target.closest('#user-form select[name="role"]');
  if (roleSelect) {
    const hints = {
      admin: "Full access: user management, review decisions, archival.",
      compliance_manager: "Creates facilities and evidence; views analyses and packets.",
      reviewer: "Makes evidence review decisions and manages archival.",
      auditor: "Read-focused access for audit preparation.",
      executive: "Read-focused access to readiness summaries."
    };
    const hint = document.querySelector("[data-role-hint]");
    if (hint) hint.textContent = hints[roleSelect.value] || "";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.drawerRuleId) {
    state.drawerRuleId = null;
    render();
  }
});

window.addEventListener("hashchange", () => {
  const route = window.location.hash.replace(/^#\//, "");
  if (!state.user) {
    render();
    return;
  }
  if (state.user && ROUTES[route] && route !== state.route) {
    state.route = route;
    state.drawerRuleId = null;
    render();
    void loadRouteData(route);
  }
});

/* ---------- Boot + polling ---------- */

async function initialize() {
  render();
  try {
    state.user = await api("/api/auth/me");
    await bootstrap();
    const route = window.location.hash.replace(/^#\//, "");
    state.route = ROUTES[route] ? route : "builder";
  } catch (error) {
    state.user = null;
    if (error.status !== 401) state.loginError = error.message;
  }
  if (!state.user && window.location.hash.startsWith("#/reset-password")) {
    const query = window.location.hash.includes("?") ? window.location.hash.slice(window.location.hash.indexOf("?") + 1) : "";
    state.resetToken = new URLSearchParams(query).get("token") || "";
  }
  state.booted = true;
  render();
  if (state.user) void loadRouteData(state.route);
}

void initialize();

let polling = false;
window.setInterval(async () => {
  if (!state.user || polling || !state.processingJobs.some((job) => ["queued", "processing"].includes(job.status))) return;
  polling = true;
  try {
    await refreshFacilityData();
    const active = document.activeElement;
    const editing = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
    if (!editing) render();
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  } finally {
    polling = false;
  }
}, 2_500);
