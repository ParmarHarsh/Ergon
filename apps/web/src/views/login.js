import { state } from "../store.js";
import { html, ICONS } from "../ui.js";

export function loginView() {
  return `
    <div class="login-shell">
      <aside class="login-brand">
        <div class="brand">
          <div class="brand-mark">${ICONS.logo}</div>
          <div>
            <div class="brand-name">ComplianceIQ</div>
            <div class="brand-sub">Industrial Evidence Intelligence</div>
          </div>
        </div>
        <div class="login-hero">
          <h1>Turn scattered facility files into audit-ready evidence.</h1>
          <p>ComplianceIQ classifies uploaded compliance evidence, maps it to jurisdiction-specific obligations, flags gaps, and assembles export-ready audit packets — with human review at every decision point.</p>
          <ul class="login-points">
            <li>${ICONS.check} AI-assisted document classification with confidence scoring and reviewer sign-off</li>
            <li>${ICONS.check} Deterministic rules packs for US, Canada, and Mexico industrial manufacturing</li>
            <li>${ICONS.check} Evidence Gap Matrix, prioritized action plan, and full source-to-packet lineage</li>
            <li>${ICONS.check} Tenant-scoped access, malware-screened uploads, and private evidence storage</li>
          </ul>
        </div>
        <p class="login-legal">Audit-preparation support only. Not legal advice and not a compliance certification. Starter rules packs are demo/unverified content unless expert-reviewed. Current rules coverage: United States, Canada, and Mexico.</p>
      </aside>
      <main class="login-form-col">
        <div class="login-panel">
          <div>
            <h2>Sign in to your workspace</h2>
            <p class="hint">Use the credentials provisioned by your organization administrator.</p>
          </div>
          ${state.loginError ? `<div class="alert">${html(state.loginError)}</div>` : ""}
          <form id="login-form" class="form-grid" data-form="login">
            <label class="field">
              <span class="field-label">Email</span>
              <input name="email" type="email" autocomplete="email" placeholder="you@company.com" required />
            </label>
            <label class="field">
              <span class="field-label">Password</span>
              <input name="password" type="password" autocomplete="current-password" placeholder="Your password" required />
            </label>
            <button type="submit" class="btn btn-primary btn-lg">Log in</button>
          </form>
          <p class="field-hint">Sessions expire after 8 hours. Login attempts are rate-limited.</p>
        </div>
      </main>
    </div>
  `;
}
