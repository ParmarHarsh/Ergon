CREATE TABLE IF NOT EXISTS user_mfa_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  pending_secret_ciphertext TEXT,
  pending_secret_iv TEXT,
  pending_secret_tag TEXT,
  pending_enrollment_expires_at TIMESTAMPTZ,
  last_accepted_totp_counter BIGINT,
  enrolled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_mfa_settings_enabled_secret_check CHECK (
    enabled = false OR (secret_ciphertext IS NOT NULL AND secret_iv IS NOT NULL AND secret_tag IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_settings_org_user
  ON user_mfa_settings (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_mfa_settings_pending_expiry
  ON user_mfa_settings (pending_enrollment_expires_at)
  WHERE pending_enrollment_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS mfa_login_challenges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  failed_attempt_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_token_hash
  ON mfa_login_challenges (challenge_token_hash);

CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_user_active
  ON mfa_login_challenges (organization_id, user_id, expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_expires_at
  ON mfa_login_challenges (expires_at);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_hash_active
  ON mfa_recovery_codes (code_hash)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_active
  ON mfa_recovery_codes (organization_id, user_id)
  WHERE used_at IS NULL AND invalidated_at IS NULL;
