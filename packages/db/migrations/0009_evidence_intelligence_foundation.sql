ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS detected_format TEXT;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS extraction_status TEXT;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS extraction_method TEXT;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS normalized_text TEXT;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS structured_content JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS provenance_anchors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS deterministic_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS ai_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE evidence_ai_analyses ADD COLUMN IF NOT EXISTS processing_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_analyses_foundation_extraction_status_check') THEN
    ALTER TABLE evidence_ai_analyses ADD CONSTRAINT ai_analyses_foundation_extraction_status_check
      CHECK (extraction_status IS NULL OR extraction_status IN ('manual_metadata_only', 'extracted', 'partial', 'empty', 'ocr_required', 'unsupported', 'failed')) NOT VALID;
  END IF;
END $$;

ALTER TABLE evidence_ai_analyses VALIDATE CONSTRAINT ai_analyses_foundation_extraction_status_check;

CREATE INDEX IF NOT EXISTS idx_ai_analyses_org_extraction_status
  ON evidence_ai_analyses(organization_id, extraction_status, updated_at DESC)
  WHERE is_current = true;
