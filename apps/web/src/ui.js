// Shared rendering helpers: escaping, labels, pills, icons, empty states.

export function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function label(value) {
  return String(value || "").replaceAll("_", " ");
}

export function titleCase(value) {
  const text = label(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return html(String(value));
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return html(String(value));
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PILL_TONES = {
  accepted: "good",
  processed: "good",
  scan_clean: "good",
  completed: "good",
  human_reviewed: "good",
  resolved: "good",
  active: "good",
  ok: "good",
  partial: "warn",
  pending: "neutral",
  needs_review: "warn",
  queued: "info",
  processing: "info",
  in_review: "info",
  requested: "info",
  scan_pending: "info",
  ocr_required: "warn",
  scan_unavailable: "neutral",
  low_confidence: "warn",
  medium_confidence: "warn",
  missing: "bad",
  rejected: "bad",
  expired: "bad",
  failed: "bad",
  dead_letter: "bad",
  scan_suspicious: "bad",
  scan_failed: "bad",
  blocked: "bad",
  critical: "bad",
  high: "warn",
  medium: "info",
  low: "neutral",
  not_applicable: "neutral",
  cancelled: "neutral",
  inactive: "neutral"
};

export function pill(value, { text = null, plain = false } = {}) {
  if (value === null || value === undefined || value === "") return "";
  const tone = PILL_TONES[value] || "neutral";
  return `<span class="pill pill-${tone} ${plain ? "plain" : ""}">${html(text ?? titleCase(value))}</span>`;
}

export function priorityPill(priority) {
  return pill(priority, { text: titleCase(priority) });
}

export function confidencePill(confidence) {
  if (confidence === null || confidence === undefined) {
    return `<span class="confidence-meter">No confidence</span>`;
  }
  const percent = Math.round(confidence * 100);
  const tone = confidence >= 0.8 ? "var(--good)" : confidence >= 0.7 ? "var(--warn)" : "var(--bad)";
  return `
    <span class="confidence-meter" title="AI confidence ${percent}%">
      <span class="confidence-track"><span class="confidence-fill" style="width:${percent}%;background:${tone}"></span></span>
      ${percent}%
    </span>
  `;
}

export function matchSourcePill(source) {
  const map = {
    manual: ["Manual", "neutral"],
    deterministic: ["Deterministic", "brand"],
    ai_assisted_deterministic: ["AI-assisted", "info"],
    ai_suggestion: ["AI suggestion", "info"],
    human_reviewed: ["Human-reviewed", "good"]
  };
  const [text, tone] = map[source] || [titleCase(source || "unknown"), "neutral"];
  return `<span class="pill pill-${tone} plain">${html(text)}</span>`;
}

export function reviewStatePill(analysis) {
  if (!analysis) return `<span class="pill pill-neutral plain">No AI analysis</span>`;
  if (analysis.humanReviewed) return `<span class="pill pill-good">Human-reviewed</span>`;
  if (analysis.needsHumanReview) return `<span class="pill pill-warn">Needs review</span>`;
  return `<span class="pill pill-info">AI suggested</span>`;
}

export function emptyState({ icon = "folder", title, copy, action = "" }) {
  return `
    <div class="empty">
      <div class="empty-icon">${ICONS[icon] || ICONS.folder}</div>
      <div class="empty-title">${html(title)}</div>
      <div class="empty-copy">${html(copy)}</div>
      ${action}
    </div>
  `;
}

export function skeletonRows(count = 3) {
  return `<div class="card-body" style="display:grid;gap:12px">${Array.from({ length: count })
    .map(() => `<div class="skeleton" style="width:${60 + Math.floor(30 * ((count % 7) / 7))}%"></div><div class="skeleton" style="width:88%"></div>`)
    .join("")}</div>`;
}

export function scoreRing(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const filled = (value / 100) * circumference;
  const tone = value >= 80 ? "var(--good)" : value >= 55 ? "var(--warn)" : "var(--bad)";
  return `
    <div class="score-ring" role="img" aria-label="Readiness score ${value} out of 100">
      <svg width="116" height="116" viewBox="0 0 116 116">
        <circle cx="58" cy="58" r="${radius}" fill="none" stroke="var(--line-2)" stroke-width="9"></circle>
        ${value > 0 ? `<circle cx="58" cy="58" r="${radius}" fill="none" stroke="${tone}" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${filled.toFixed(1)} ${circumference.toFixed(1)}"></circle>` : ""}
      </svg>
      <div class="score-ring-value">${value}<span>/ 100</span></div>
    </div>
  `;
}

export function kv(term, value) {
  return `<div class="kv"><dt>${html(term)}</dt><dd>${value || "—"}</dd></div>`;
}

export const DISCLAIMER_SHORT = "Audit-preparation support only. Not legal advice and not a compliance certification. AI suggestions require human review; deterministic rules and reviewers remain authoritative.";

export const ICONS = {
  logo: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-5"/><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/></svg>`,
  builder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M14 8h4M14 12h4M14 16h2"/></svg>`,
  facility: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l6 4V8l6 4V4l6 3v14z"/><path d="M3 21h18"/></svg>`,
  evidence: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>`,
  review: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8.5 11l1.8 1.8 3.2-3.6"/></svg>`,
  matrix: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
  actions: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
  packet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`,
  expert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11l2 2 4-4"/></svg>`,
  admin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  system: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  logout: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  spark: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.5 10l-5.6 1.3L12 17l-1.9-5.7L4.5 10l5.6-1.3z"/></svg>`,
  check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8h.01"/></svg>`,
  alert: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  folder: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,
  upload: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2-9.4L23 10"/></svg>`
};
