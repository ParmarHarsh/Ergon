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

test("login view uses Ergon branding and hides recovery when disabled", () => {
  window.location.hash = "#/login";
  state.authFeatures.recoveryAvailable = false;
  state.mfaChallengeToken = "";
  const html = loginView();
  assert.match(html, /Ergon/);
  assert.doesNotMatch(html, new RegExp("Compliance" + "IQ"));
  assert.doesNotMatch(html, /Forgot password/);
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
  assert.match(html, /Your AI compliance workspace for manufacturing/);
  assert.match(html, /AI disabled in this environment/);
  assert.doesNotMatch(html, /Live regulatory monitoring/);
  assert.doesNotMatch(html, /Always up-to-date/);
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
