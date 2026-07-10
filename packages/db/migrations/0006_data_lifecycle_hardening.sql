ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_reason TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_at TIMESTAMPTZ;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_released_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_released_at TIMESTAMPTZ;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS legal_hold_release_reason TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS restored_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS restore_reason TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS storage_deletion_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS storage_deletion_last_retried_at TIMESTAMPTZ;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS storage_deletion_last_retried_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_reason TEXT;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_at TIMESTAMPTZ;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_released_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_released_at TIMESTAMPTZ;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS legal_hold_release_reason TEXT;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS restored_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS restore_reason TEXT;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS storage_deletion_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS storage_deletion_last_retried_at TIMESTAMPTZ;
ALTER TABLE audit_packets ADD COLUMN IF NOT EXISTS storage_deletion_last_retried_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_org_legal_hold
  ON evidence(organization_id, legal_hold_active)
  WHERE legal_hold_active = true;
CREATE INDEX IF NOT EXISTS idx_packets_org_legal_hold
  ON audit_packets(organization_id, legal_hold_active)
  WHERE legal_hold_active = true;
CREATE INDEX IF NOT EXISTS idx_evidence_retention_due
  ON evidence(organization_id, retention_until)
  WHERE archived = false AND legal_hold_active = false AND retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packets_retention_due
  ON audit_packets(organization_id, retention_until)
  WHERE archived = false AND legal_hold_active = false AND retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_storage_deletion_failed
  ON evidence(organization_id, storage_deletion_status)
  WHERE storage_deletion_status = 'failed';
CREATE INDEX IF NOT EXISTS idx_packets_storage_deletion_failed
  ON audit_packets(organization_id, storage_deletion_status)
  WHERE storage_deletion_status = 'failed';
