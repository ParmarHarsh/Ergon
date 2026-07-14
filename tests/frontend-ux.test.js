import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

globalThis.window = {
  location: { hash: "" },
  localStorage: { getItem: () => null, setItem: () => null },
  setTimeout,
  clearTimeout,
  ERGON_CONFIG: { apiBase: "http://localhost:4000", recoveryAvailable: false, mfaAvailable: false }
};

const { state } = await import("../apps/web/src/store.js");
const { loginView } = await import("../apps/web/src/views/login.js");
const { homeView } = await import("../apps/web/src/views/home.js");
const { evidenceView } = await import("../apps/web/src/views/evidence.js");
const { reviewView } = await import("../apps/web/src/views/review.js");
const { matrixView } = await import("../apps/web/src/views/matrix.js");
const { packetsView } = await import("../apps/web/src/views/packets.js");

test("login view uses ERGON branding and always exposes recovery entry", () => {
  window.location.hash = "#/login";
  state.authFeatures.recoveryAvailable = false;
  state.mfaChallengeToken = "";
  const html = loginView();
  assert.match(html, /ERGON/);
  assert.match(html, /AI-native compliance intelligence for manufacturing/);
  assert.match(html, /Forgot password/);
  assert.doesNotMatch(html, new RegExp("Compliance" + "IQ"));
});

test("disabled recovery route resolves to an actionable unavailable state", () => {
  window.location.hash = "#/forgot-password";
  state.authFeatures.recoveryAvailable = false;
  const html = loginView();
  assert.match(html, /Password recovery is unavailable here/);
  assert.match(html, /Back to sign in/);
  assert.doesNotMatch(html, /Loading Ergon/);
});

test("home view explains Ergon without fake AI-enabled claims", () => {
  Object.assign(state, {
    user: { role: "admin", email: "pilot-admin@ergon.local", name: "Synthetic Pilot Administrator" },
    facilities: [{ id: "facility-1", name: "Synthetic Plant", country: "US", region: "OH" }],
    selectedFacilityId: "facility-1",
    evidence: [],
    aiStatus: { enabled: false, provider: "disabled", model: null },
    reviewQueue: [],
    processingJobs: [],
    actionItems: [],
    latestReview: null
  });
  const html = homeView();
  assert.match(html, /Needs attention today/);
  assert.match(html, /Next action/);
  assert.match(html, /AI disabled in this environment/);
  assert.doesNotMatch(html, /Live regulatory monitoring/);
  assert.doesNotMatch(html, /Always up-to-date/);
  assert.equal((html.match(/Not legal advice/gi) || []).length, 1);
});

test("primary workflows expose clear purpose and primary actions", () => {
  Object.assign(state, {
    user: { role: "admin", email: "pilot-admin@ergon.local", name: "Synthetic Pilot Administrator" },
    facilities: [{ id: "facility-1", name: "Synthetic Plant", country: "US", region: "OH" }],
    selectedFacilityId: "facility-1",
    evidence: [],
    aiStatus: { enabled: false, provider: "disabled", model: null },
    reviewQueue: [],
    processingJobs: [],
    actionItems: [],
    latestReview: null,
    gapRows: [],
    packets: [],
    applicableRules: [],
    rulesPack: null
  });
  assert.match(evidenceView(), /Add evidence/);
  assert.match(evidenceView(), /Needs attention/);
  assert.match(evidenceView(), /\.docx,\.xlsx/);

  state.reviewQueue = [{
    id: "evidence-1",
    evidenceTitle: "Training roster",
    facilityName: "Synthetic Plant",
    fileName: "training.pdf",
    priorityImpact: "high",
    confidence: 0.62,
    processingStatus: "needs_review",
    scanStatus: "scan_clean",
    categories: ["low_confidence"],
    detectedEvidenceType: "training_record",
    suggestedObligationTitle: "Training records"
  }];
  assert.match(reviewView(), /What ERGON found/);
  assert.match(reviewView(), /Human decision/);

  state.latestReview = { id: "review-1", readinessScore: 42, summary: { totalApplicableObligations: 1, missingEvidenceCount: 1, criticalGapsCount: 1, acceptedEvidenceCount: 0, aiNeedsReviewCount: 1 } };
  state.gapRows = [{
    ruleId: "rule-1",
    obligationTitle: "Maintain training records",
    country: "US",
    region: "OH",
    authority: "Demo",
    citation: "1",
    status: "missing",
    priority: "critical",
    matchedEvidence: [],
    requiredEvidence: ["training_record"],
    dueDate: "2026-07-31",
    recommendedAction: "Upload current training records.",
    demoContent: true
  }];
  assert.match(matrixView(), /Priority gaps/);
  assert.match(matrixView(), /Missing accepted evidence/);
  assert.match(packetsView(), /Missing evidence/);
  assert.match(packetsView(), /Generate a gap analysis before exporting|Export a traceable packet/);
});

test("Evidence review uses progressive disclosure and withholds weak obligation candidates", () => {
  Object.assign(state, {
    user: { role: "admin", email: "pilot-admin@ergon.local", name: "Synthetic Pilot Administrator" },
    facilities: [{ id: "facility-1", name: "Synthetic Plant", country: "US", region: "OH" }],
    selectedFacilityId: "facility-1",
    evidenceTypes: ["other", "osha_300_log"],
    applicableRules: [{ id: "us-injury-recordkeeping", title: "Injury and illness recordkeeping" }],
    evidence: [{
      id: "evidence-1", facilityId: "facility-1", title: "Safety training matrix", evidenceType: "other",
      fileName: "training.csv", fileSizeBytes: 120, fileReference: "private/file", scanStatus: "scan_clean",
      status: "needs_review", archived: false, legalHoldActive: false, storageDeletionStatus: "retained"
    }],
    processingJobs: [],
    aiAnalyses: [{
      id: "analysis-1", evidenceId: "evidence-1", processingStatus: "needs_review", textExtractionStatus: "extracted",
      extractionStatus: "extracted", extractionMethod: "csv_parser", detectedFormat: "csv", detectedEvidenceType: "osha_300_log",
      confidence: 0.91, needsHumanReview: true, summary: "A safety training matrix with completion dates.",
      issues: ["Finding one", "Finding two", "Finding three", "Finding four"], processingWarnings: [],
      provenanceAnchors: [{ id: "csv-row-1", label: "CSV row 1", excerpt: "employee, course" }],
      deterministicProfile: { wordCount: 8 }, aiProfile: { obligationMatch: {
        classification: "WEAK_CANDIDATE", candidateRuleId: "us-injury-recordkeeping",
        candidateTitle: "Injury and illness recordkeeping", reason: "The source lacks obligation-specific terminology."
      } },
      humanReviewed: false, humanOverrideRuleId: null, humanReviewNotes: null
    }],
    aiStatus: { enabled: true, provider: "azure_openai", model: "deployment" }
  });

  const markup = evidenceView();
  assert.equal((markup.match(/data-ui-role="primary-workflow-state"/g) || []).length, 1);
  assert.equal((markup.match(/Ready for review/g) || []).length, 1);
  assert.match(markup, /Scan clean/);
  assert.doesNotMatch(markup, /Evidence needs review/);
  assert.match(markup, /A safety training matrix with completion dates/);
  assert.match(markup, /Finding one[\s\S]*Finding two[\s\S]*Finding three/);
  assert.match(markup, /data-ui-role="additional-findings"[\s\S]*Show all findings \(4\)/);
  assert.match(markup, /Source references \(1\)/);
  assert.match(markup, /View processing details/);
  assert.match(markup, /No sufficiently supported obligation match/);
  assert.match(markup, /data-match-classification="WEAK_CANDIDATE"[\s\S]*Review weak obligation candidate/);
  assert.doesNotMatch(markup, /data-match-classification="SUPPORTED_MATCH"/);
  assert.match(markup, /Review evidence/);
  assert.match(markup, /data-ui-role="secondary-review-actions"[\s\S]*More review actions/);
  assert.match(markup, /data-ui-role="secondary-lifecycle-actions"[\s\S]*File and lifecycle actions/);

  state.aiAnalyses[0] = {
    ...state.aiAnalyses[0], extractionStatus: "empty", textExtractionStatus: "empty",
    suggestedRuleId: "us-injury-recordkeeping", suggestedObligationTitle: "Injury and illness recordkeeping",
    aiProfile: {}
  };
  const failedMarkup = evidenceView();
  assert.doesNotMatch(failedMarkup, /data-match-classification="SUPPORTED_MATCH"/);
  assert.match(failedMarkup, /No sufficiently supported obligation match/);
  assert.doesNotMatch(failedMarkup, /<option value="us-injury-recordkeeping" selected>/);
});

test("app shell source includes mobile navigation and visible sign out controls", async () => {
  const source = await readFile(path.resolve("apps/web/src/app.js"), "utf8");
  assert.match(source, /mobile-menu-btn/);
  assert.match(source, /open-mobile-nav/);
  assert.match(source, /close-mobile-nav/);
  assert.equal(source.match(/data-action="logout"/g)?.length, 2);
  assert.match(source, /class="logout-btn" data-action="logout"/);
  assert.match(source, /class="btn btn-secondary btn-sm topbar-logout" data-action="logout"/);
});

test("browser title and design CSS use the Phase 21 ERGON convention", async () => {
  const index = await readFile(path.resolve("apps/web/index.html"), "utf8");
  const css = await readFile(path.resolve("apps/web/src/styles.css"), "utf8");
  assert.match(index, /<title>ERGON<\/title>/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /mobile-nav-scrim/);
  assert.match(css, /\.workspace\.route-enter\s*\{\s*animation:\s*route-enter 140ms/);
  assert.match(css, /@keyframes route-enter\s*\{[\s\S]*from\s*\{\s*opacity:\s*0\.72;\s*\}[\s\S]*to\s*\{\s*opacity:\s*1;\s*\}/);
  assert.doesNotMatch(css, /@keyframes route-enter\s*\{[^}]*translateY/);
});

test("responsive layout CSS protects mobile hierarchy and wide workflow content", async () => {
  const css = await readFile(path.resolve("apps/web/src/styles.css"), "utf8");
  assert.match(css, /\.mobile-nav-close\.drawer-close\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.mobile-nav-close\.drawer-close\s*\{\s*display:\s*grid;\s*\}/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*\.home-hero\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.home-hero\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.match(css, /\.card\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow-x:\s*auto;[^}]*max-width:\s*100%;/);
  assert.match(css, /\.table-wrap\s*>\s*table\s*\{\s*min-width:\s*680px;\s*\}/);
  assert.match(css, /\.facilities-table\s*\{\s*min-width:\s*760px;\s*\}/);
  assert.match(css, /\.facilities-table th:first-child,\s*\.facilities-table td:first-child\s*\{\s*min-width:\s*190px;\s*\}/);
  assert.match(css, /\.kv-grid\s*\{[^}]*minmax\(min\(200px,\s*100%\),\s*1fr\)/);
  assert.match(css, /\.sidebar-footer\s*\{[^}]*display:\s*none;[^}]*min-width:\s*0;/);
  assert.match(css, /\.logout-btn\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*center;/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.sidebar-footer\s*\{\s*display:\s*grid;\s*\}/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.topbar-user\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.page-sub\s*\{[^}]*max-width:\s*84ch;[^}]*text-wrap:\s*pretty;/);
  assert.match(css, /\.facilities-layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*3fr\)\s*minmax\(380px,\s*2fr\);\s*\}/);
  assert.match(css, /\.field\s*\{[^}]*min-width:\s*0;/);
  assert.match(css, /input, select, textarea\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
  assert.match(css, /@media \(max-width: 1500px\)\s*\{\s*\.facilities-layout\s*\{\s*grid-template-columns:\s*1fr;\s*\}/);
});

test("active web UI files no longer contain current former-brand text", async () => {
  const files = await listFiles(path.resolve("apps/web/src"));
  files.push(path.resolve("apps/web/index.html"));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, new RegExp("Compliance" + "IQ|" + "COMPLIANCE" + "IQ"), file);
  }
});

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(resolved));
    if (entry.isFile() && resolved.endsWith(".js")) files.push(resolved);
  }
  return files;
}
