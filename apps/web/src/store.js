// Central state, API client, and data-loading orchestration.

const runtimeConfig = window.ERGON_CONFIG || {};
export const API_BASE = window.localStorage.getItem("ergon_api_base") || window.localStorage.getItem("ciq_api_base") || runtimeConfig.apiBase || "http://localhost:4000";
const DEFAULT_TIMEOUT_MS = 10_000;

export const state = {
  booted: false,
  loading: false,
  route: "home",
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
  mfaStatus: null,
  mfaEnrollment: null,
  mfaRecoveryCodes: [],
  mfaMessage: "",
  mfaError: "",
  mfaChallengeToken: "",
  mfaChallengeExpiresAt: "",
  health: null,
  drawerRuleId: null,
  mobileNavOpen: false,
  error: "",
  loginError: "",
  recoveryMessage: "",
  recoveryError: "",
  resetToken: "",
  resetMessage: "",
  resetError: "",
  authFeatures: {
    recoveryAvailable: Boolean(runtimeConfig.recoveryAvailable),
    mfaAvailable: Boolean(runtimeConfig.mfaAvailable)
  }
};

export async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: controller.signal
  }).catch((error) => {
    if (error.name === "AbortError") throw new Error(`Ergon API did not respond within ${options.timeoutMs || DEFAULT_TIMEOUT_MS}ms.`);
    throw error;
  }).finally(() => window.clearTimeout(timeout));
  try {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
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
  const archivedQuery = canReview() ? "&includeArchived=true" : "";
  const [evidence, packets, reviews, aiAnalyses, applicable, processingJobs] = await Promise.all([
    api(`/api/evidence?facilityId=${facilityId}${archivedQuery}`),
    api(`/api/audit-packets?facilityId=${facilityId}${archivedQuery}`),
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

export async function refreshMfaStatus() {
  state.mfaStatus = await api("/api/auth/mfa/status");
}

export function resetSession() {
  Object.assign(state, {
    user: null, organization: null, facilities: [], selectedFacilityId: null,
    evidence: [], aiAnalyses: [], processingJobs: [], reviewQueue: [],
    applicableRules: [], rulesPack: null, latestReview: null, gapRows: [],
    actionItems: [], packets: [], users: [], expertReviews: [], auditLogs: [],
    health: null, mfaStatus: null, mfaEnrollment: null, mfaRecoveryCodes: [],
    mfaMessage: "", mfaError: "", mfaChallengeToken: "", mfaChallengeExpiresAt: "",
    drawerRuleId: null, mobileNavOpen: false, error: "", loginError: "", recoveryMessage: "",
    recoveryError: "", resetToken: "", resetMessage: "", resetError: "", route: "home"
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
