import { state } from "../store.js";
import { html, ICONS } from "../ui.js";

export function loginView() {
  const mode = authMode();
  if (state.mfaChallengeToken) return mfaChallengePanel();
  return `
    <div class="login-shell">
      <aside class="login-brand">
        <div class="brand">
          <div class="brand-mark">${ICONS.logo}</div>
          <div>
            <div class="brand-name">ERGON</div>
            <div class="brand-sub">Manufacturing Compliance</div>
          </div>
        </div>
        <div class="login-hero">
          <h1>AI-native compliance intelligence for manufacturing.</h1>
          <p>Ergon turns facility evidence into review queues, priority gaps, action plans, and audit-ready packets while humans keep accountability for decisions.</p>
          <ul class="login-points">
            <li>${ICONS.check} Evidence intake, classification, and reviewer sign-off</li>
            <li>${ICONS.check} Deterministic gap analysis for supported manufacturing rules packs</li>
            <li>${ICONS.check} Action planning and source-to-packet lineage</li>
          </ul>
        </div>
        <p class="login-legal">Audit-preparation support only. Not legal advice and not a compliance certification. Starter rules packs are demo/unverified content unless expert-reviewed. Current rules coverage: United States, Canada, and Mexico.</p>
      </aside>
      <main class="login-form-col">
        ${mode === "forgot" ? forgotPasswordPanel() : mode === "reset" ? resetPasswordPanel() : loginPanel()}
      </main>
    </div>
  `;
}

function mfaChallengePanel() {
  return `
    <div class="login-shell">
      <aside class="login-brand">
        <div class="brand">
          <div class="brand-mark">${ICONS.logo}</div>
          <div>
            <div class="brand-name">ERGON</div>
            <div class="brand-sub">Manufacturing Compliance</div>
          </div>
        </div>
      </aside>
      <main class="login-form-col">
        <div class="login-panel">
          <div>
            <h2>Enter your MFA code</h2>
            <p class="hint">Use your authenticator app or a saved recovery code.</p>
          </div>
          ${state.loginError ? `<div class="alert">${html(state.loginError)}</div>` : ""}
          <form class="form-grid" data-form="mfa-login">
            <label class="field">
              <span class="field-label">Authenticator or recovery code</span>
              <input name="code" autocomplete="one-time-code" required autofocus />
            </label>
            <button type="submit" class="btn btn-primary btn-lg">Verify</button>
          </form>
          <div class="auth-links">
            <a href="#/login" data-action="cancel-mfa-login">Back to sign in</a>
          </div>
        </div>
      </main>
    </div>
  `;
}

function loginPanel() {
  return `
    <div class="login-panel">
      <div>
        <h2>Sign in to your workspace</h2>
        <p class="hint">Use the credentials provisioned by your organization administrator.</p>
      </div>
      ${state.loginError ? `<div class="alert">${html(state.loginError)}</div>` : ""}
      ${state.resetMessage ? `<div class="alert alert-info">${html(state.resetMessage)}</div>` : ""}
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
      <div class="auth-links"><a href="#/forgot-password">Forgot password?</a></div>
      <p class="field-hint">Sessions expire after 8 hours. Login attempts are rate-limited.</p>
    </div>
  `;
}

function forgotPasswordPanel() {
  if (!state.authFeatures.recoveryAvailable) return recoveryUnavailablePanel();
  return `
    <div class="login-panel">
      <div>
        <h2>Reset your password</h2>
        <p class="hint">Enter your workspace email address.</p>
      </div>
      ${state.recoveryError ? `<div class="alert">${html(state.recoveryError)}</div>` : ""}
      ${state.recoveryMessage ? `<div class="alert alert-info">${html(state.recoveryMessage)}</div>` : ""}
      <form class="form-grid" data-form="password-recovery">
        <label class="field">
          <span class="field-label">Email</span>
          <input name="email" type="email" autocomplete="email" placeholder="you@company.com" required />
        </label>
        <button type="submit" class="btn btn-primary btn-lg">Send reset link</button>
      </form>
      <div class="auth-links">
        <a href="#/login">Back to sign in</a>
      </div>
    </div>
  `;
}

function resetPasswordPanel() {
  if (!state.authFeatures.recoveryAvailable) return recoveryUnavailablePanel();
  return `
    <div class="login-panel">
      <div>
        <h2>Set a new password</h2>
        <p class="hint">Choose a password with at least 12 characters.</p>
      </div>
      ${state.resetError ? `<div class="alert">${html(state.resetError)}</div>` : ""}
      <form class="form-grid" data-form="password-reset">
        <input type="hidden" name="token" value="${html(state.resetToken)}" />
        <label class="field">
          <span class="field-label">New password</span>
          <input name="password" type="password" autocomplete="new-password" minlength="12" required />
        </label>
        <label class="field">
          <span class="field-label">Confirm new password</span>
          <input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required />
        </label>
        <button type="submit" class="btn btn-primary btn-lg">Save password</button>
      </form>
      <div class="auth-links">
        <a href="#/login">Back to sign in</a>
      </div>
    </div>
  `;
}

function recoveryUnavailablePanel() {
  return `
    <div class="login-panel">
      <div>
        <h2>Password recovery is unavailable here</h2>
        <p class="hint">This local Ergon environment has password recovery delivery turned off. No email will be sent, and account existence is not exposed.</p>
      </div>
      <div class="alert alert-info">Use the synthetic local credentials provided for this walkthrough, or ask an administrator to reset the account in a configured environment.</div>
      <div class="auth-links">
        <a href="#/login">Back to sign in</a>
      </div>
    </div>
  `;
}

function authMode() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#/forgot-password")) return "forgot";
  if (hash.startsWith("#/reset-password")) {
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    state.resetToken = new URLSearchParams(query).get("token") || state.resetToken;
    return "reset";
  }
  return "login";
}
