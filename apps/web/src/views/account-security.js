import { state } from "../store.js";
import { html, pill } from "../ui.js";

export function accountSecurityView() {
  const status = state.mfaStatus;
  return `
    <div class="page-head">
      <div>
        <h1>Security</h1>
        <p class="page-sub">Manage account protection. Sessions, roles, tenancy, and audit logging remain enforced.</p>
      </div>
    </div>

    ${state.mfaError ? `<div class="alert">${html(state.mfaError)}</div>` : ""}
    ${state.mfaMessage ? `<div class="alert alert-info">${html(state.mfaMessage)}</div>` : ""}

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Multi-factor authentication</h2>
          <p class="hint">${status?.available ? "Authenticator app MFA is available." : "Authenticator app MFA is not enabled for this deployment."}</p>
        </div>
        ${pill(status?.enabled ? "ok" : "inactive", { text: status?.enabled ? "Enabled" : "Disabled" })}
      </div>
      <div class="card-body form-grid">
        ${!status ? `<div class="skeleton" style="width:55%"></div>` : status.available ? securityControls(status) : `<p class="muted small">MFA enrollment is unavailable until the server is configured with MFA_ENABLED=true and a valid encryption key.</p>`}
      </div>
    </section>
  `;
}

function securityControls(status) {
  if (!status.enabled) {
    return `
      ${state.mfaEnrollment ? enrollmentConfirmPanel() : `
        <form class="form-grid" data-form="mfa-enrollment-start">
          <label class="field">
            <span class="field-label">Current password</span>
            <input name="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <button class="btn btn-primary" type="submit">Enable MFA</button>
        </form>
      `}
      ${recoveryCodePanel()}
    `;
  }
  return `
    ${recoveryCodePanel()}
    <div class="grid-2">
      <form class="form-grid" data-form="mfa-recovery-regenerate">
        <h3>Regenerate recovery codes</h3>
        <label class="field">
          <span class="field-label">Current password</span>
          <input name="currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <label class="field">
          <span class="field-label">Authenticator code</span>
          <input name="code" inputmode="numeric" autocomplete="one-time-code" required />
        </label>
        <button class="btn btn-secondary" type="submit">Regenerate codes</button>
      </form>
      <form class="form-grid" data-form="mfa-disable">
        <h3>Disable MFA</h3>
        <label class="field">
          <span class="field-label">Current password</span>
          <input name="currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <label class="field">
          <span class="field-label">Authenticator or recovery code</span>
          <input name="code" autocomplete="one-time-code" required />
        </label>
        <button class="btn btn-secondary" type="submit">Disable MFA</button>
      </form>
    </div>
  `;
}

function enrollmentConfirmPanel() {
  return `
    <div class="form-grid">
      <div class="kv-grid">
        <div><span class="kv-label">Manual key</span><strong class="mono">${html(state.mfaEnrollment.manualSecret)}</strong></div>
        <div><span class="kv-label">otpauth URI</span><strong class="mono wrap-text">${html(state.mfaEnrollment.otpauthUri)}</strong></div>
      </div>
      <form class="form-grid" data-form="mfa-enrollment-confirm">
        <label class="field">
          <span class="field-label">Authenticator code</span>
          <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required />
        </label>
        <button class="btn btn-primary" type="submit">Confirm MFA</button>
      </form>
    </div>
  `;
}

function recoveryCodePanel() {
  if (!state.mfaRecoveryCodes.length) return "";
  return `
    <div class="alert alert-info">
      <strong>Save these recovery codes now.</strong>
      <div class="recovery-code-grid">
        ${state.mfaRecoveryCodes.map((code) => `<span class="mono">${html(code)}</span>`).join("")}
      </div>
      <p class="field-hint">These codes are shown once. Each code can be used one time if your authenticator is unavailable.</p>
    </div>
  `;
}
