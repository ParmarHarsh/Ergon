// Central state, API client, and data-loading orchestration.

export const API_BASE = window.localStorage.getItem("ciq_api_base") || window.COMPLIANCEIQ_CONFIG?.apiBase || "http://localhost:4000";

export const state = {
  booted: false,
  loading: false,
  route: "builder",
  user: null,
  organization: null,
  facilities: [],
  selectedFacilityId: null,
  evidence: [],
  evidenceTypes: ["other"],
  aiStatus: { enabled: false, provider: "disabled", model: null },
  aiAnalyses: [],
  processingJobs: [],
  reviewQueue: [],
  reviewQueueFilters: { status: "", priority: "" },
  applicableRules: [],
  rulesPack: null,
  latestReview: null,
  gapRows: [],
  actionItems: [],
  packets: [],
  users: [],
  expertReviews: [],
  auditLogs: [],
  health: null,
  drawerRuleId: null,
  error: "",
  loginError: ""
};

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export function canReview() {
  return ["admin", "reviewer"].includes(state.user?.role);
}

export function isAdmin() {
  return state.user?.role === "admin";
}

export function currentFacility() {
  return state.facilities.find((facility) => facility.id === state.selectedFacilityId) || state.facilities[0] || null;
}

export async function bootstrap() {
  [state.organization, state.facilities, state.aiStatus, state.evidenceTypes] = await Promise.all([
    api("/api/organization"),
    api("/api/facilities"),
    api("/api/ai/status"),
    api("/api/evidence-taxonomy")
  ]);
  if (!state.selectedFacilityId || !state.facilities.some((facility) => facility.id === state.selectedFacilityId)) {
    state.selectedFacilityId = state.facilities[0]?.id || null;
  }
  await refreshFacilityData();
}

export async function refreshFacilityData() {
  const facility = currentFacility();
  if (!facility) {
    Object.assign(state, {
      evidence: [], aiAnalyses: [], processingJobs: [], reviewQueue: [],
      applicableRules: [], rulesPack: null, packets: [], latestReview: null,
      gapRows: [], actionItems: []
    });
    return;
  }
  const facilityId = encodeURIComponent(facility.id);
  const [evidence, packets, reviews, aiAnalyses, applicable, processingJobs] = await Promise.all([
    api(`/api/evidence?facilityId=${facilityId}`),
    api(`/api/audit-packets?facilityId=${facilityId}`),
    api(`/api/audit-readiness/reviews?facilityId=${facilityId}`),
    api(`/api/evidence-ai-analyses?facilityId=${facilityId}`),
    api(`/api/facilities/${facilityId}/applicable-rules`),
    api(`/api/evidence-processing-jobs?facilityId=${facilityId}`)
  ]);
  state.evidence = evidence;
  state.packets = packets;
  state.aiAnalyses = aiAnalyses;
  state.processingJobs = processingJobs;
  state.applicableRules = applicable.rules || [];
  state.rulesPack = applicable.rulesPack || null;
  state.latestReview = reviews[0] || null;
  if (state.latestReview) {
    const reviewId = encodeURIComponent(state.latestReview.id);
    [state.gapRows, state.actionItems] = await Promise.all([
      api(`/api/audit-readiness/reviews/${reviewId}/gap-matrix`),
      api(`/api/audit-readiness/reviews/${reviewId}/action-plan`)
    ]);
  } else {
    state.gapRows = [];
    state.actionItems = [];
  }
  if (canReview()) await refreshReviewQueue();
}

export async function refreshReviewQueue() {
  const facility = currentFacility();
  if (!canReview() || !facility) {
    state.reviewQueue = [];
    return;
  }
  const params = new URLSearchParams({ facilityId: facility.id });
  if (state.reviewQueueFilters.status) params.set("status", state.reviewQueueFilters.status);
  if (state.reviewQueueFilters.priority) params.set("priority", state.reviewQueueFilters.priority);
  state.reviewQueue = await api(`/api/evidence-review-queue?${params}`);
}

export async function refreshAdminData() {
  if (!isAdmin()) return;
  state.users = await api("/api/users");
}

export async function refreshExpertReviews() {
  state.expertReviews = await api("/api/expert-reviews");
}

export async function refreshSystemData() {
  const results = await Promise.allSettled([
    fetch(`${API_BASE}/health/ready`).then((response) => response.json()),
    currentFacility() ? api(`/api/audit-logs?facilityId=${encodeURIComponent(currentFacility().id)}`) : Promise.resolve([])
  ]);
  state.health = results[0].status === "fulfilled" ? results[0].value : { ok: false };
  state.auditLogs = results[1].status === "fulfilled" ? results[1].value.slice(0, 40) : [];
}

export function resetSession() {
  Object.assign(state, {
    user: null, organization: null, facilities: [], selectedFacilityId: null,
    evidence: [], aiAnalyses: [], processingJobs: [], reviewQueue: [],
    applicableRules: [], rulesPack: null, latestReview: null, gapRows: [],
    actionItems: [], packets: [], users: [], expertReviews: [], auditLogs: [],
    health: null, drawerRuleId: null, error: "", loginError: "", route: "builder"
  });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}
