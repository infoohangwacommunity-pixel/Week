-- =============================================================================
-- Migration: 008_privacy_consent_infrastructure.sql
-- =============================================================================
-- Stages 47-56: Privacy, Consent, and Data Isolation Infrastructure
-- 
-- LAW: NDPA 2023 (Nigeria Data Protection Act 2023)
-- NOT NDPR 2019 - NDPR was repealed June 12, 2023
-- REGULATOR: NDPC (Nigeria Data Protection Commission)
--
-- CRITICAL NOTES:
-- - Minors (students) require parental/guardian consent under NDPA Section 31
-- - Current WhatsApp-only consent flow is a known compliance gap
-- - Infrastructure is designed to be upgradeable to parental consent later
-- =============================================================================

-- ============================================================
-- AUDIT LOG TABLE
-- Append-only, permanent record of security-relevant events
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  wax_id UUID REFERENCES students(id) ON DELETE SET NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_wax_id ON audit_log(wax_id, created_at DESC) WHERE wax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS 'Append-only audit log for security and compliance events (NDPA 2023)';

-- ============================================================
-- CONSENTS TABLE
-- NDPA 2023 compliant consent tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL CHECK (status IN ('granted', 'withdrawn', 'pending')),
  consent_text_version TEXT NOT NULL,
  ai_determination_context JSONB,
  ip_context TEXT,
  platform TEXT,
  user_agent TEXT,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consents_wax_id ON consents(wax_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consents_wax_active ON consents(wax_id, created_at DESC) WHERE status = 'granted';
CREATE INDEX IF NOT EXISTS idx_consents_type_status ON consents(consent_type, status);

ALTER TABLE consents ADD CONSTRAINT chk_consent_timestamps
  CHECK (
    (status = 'granted' AND granted_at IS NOT NULL AND withdrawn_at IS NULL) OR
    (status = 'withdrawn' AND granted_at IS NOT NULL AND withdrawn_at IS NOT NULL) OR
    (status = 'pending' AND granted_at IS NULL AND withdrawn_at IS NULL)
  );

COMMENT ON TABLE consents IS 'NDPA 2023 compliant consent tracking (minors: parental consent required, known gap)';

-- ============================================================
-- AUDIT LOG IMMUTABILITY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only and cannot be modified';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ============================================================
-- CONSENTS UPDATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_consents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consents_updated_at_trigger
  BEFORE UPDATE ON consents
  FOR EACH ROW EXECUTE FUNCTION update_consents_updated_at();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_active_consent_status(p_wax_id UUID, p_consent_type TEXT DEFAULT 'general')
RETURNS TABLE (status TEXT, consent_text_version TEXT, granted_at TIMESTAMPTZ, consent_record_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT c.status, c.consent_text_version, c.granted_at, c.id
  FROM consents c
  WHERE c.wax_id = p_wax_id AND c.consent_type = p_consent_type AND c.status = 'granted'
  ORDER BY c.granted_at DESC LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_consent_event(
  p_wax_id UUID, p_consent_type TEXT DEFAULT 'general', p_status TEXT DEFAULT 'granted',
  p_consent_text_version TEXT DEFAULT '1.0', p_ai_context JSONB DEFAULT NULL, p_platform TEXT DEFAULT 'whatsapp'
) RETURNS UUID AS $$
DECLARE v_consent_id UUID;
BEGIN
  INSERT INTO consents (wax_id, consent_type, status, consent_text_version, ai_determination_context, platform, granted_at, withdrawn_at)
  VALUES (p_wax_id, p_consent_type, p_status, p_consent_text_version, p_ai_context, p_platform,
          CASE WHEN p_status = 'granted' THEN NOW() ELSE NULL END,
          CASE WHEN p_status = 'withdrawn' THEN NOW() ELSE NULL END)
  RETURNING id INTO v_consent_id;
  
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES (
    CASE WHEN p_status = 'granted' THEN 'consent_granted' ELSE 'consent_withdrawn' END,
    p_wax_id,
    jsonb_build_object('consent_type', p_consent_type, 'consent_text_version', p_consent_text_version, 'platform', p_platform)
  );
  
  RETURN v_consent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO schema_migrations (version) VALUES (8) ON CONFLICT (version) DO NOTHING;
