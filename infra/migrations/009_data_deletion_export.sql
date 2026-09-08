-- =============================================================================
-- Migration: 009_data_deletion_export.sql
-- =============================================================================
-- Stages 47-56: Data Deletion and Export Functions
-- 
-- NDPA 2023 COMPLIANCE:
-- - Right to erasure (Section 26): ACTUAL deletion, not soft deletion
-- - Right to data portability (Section 27): Machine-readable export
-- =============================================================================

-- ============================================================
-- FUNCTION: delete_student_data
-- ============================================================

CREATE OR REPLACE FUNCTION delete_student_data(p_wax_id UUID, p_operator_id TEXT DEFAULT 'system')
RETURNS TABLE (
  messages_deleted BIGINT, observations_deleted BIGINT, facts_deleted BIGINT,
  episodes_deleted BIGINT, misconceptions_deleted BIGINT, knowledge_states_reset BIGINT,
  sessions_archived BIGINT, audit_log_id UUID
) AS $$
BEGIN
  RETURN QUERY
  WITH deleted_messages AS MATERIALIZED (DELETE FROM messages WHERE wax_id = p_wax_id RETURNING id),
  deleted_observations AS MATERIALIZED (DELETE FROM learning_observations WHERE wax_id = p_wax_id RETURNING id),
  deleted_facts AS MATERIALIZED (DELETE FROM student_facts WHERE wax_id = p_wax_id RETURNING id),
  deleted_episodes AS MATERIALIZED (DELETE FROM student_episodes WHERE wax_id = p_wax_id RETURNING id),
  deleted_misconceptions AS MATERIALIZED (DELETE FROM misconceptions WHERE wax_id = p_wax_id RETURNING id),
  reset_knowledge_states AS MATERIALIZED (DELETE FROM knowledge_states WHERE wax_id = p_wax_id RETURNING id),
  archived_sessions AS MATERIALIZED (UPDATE sessions SET deleted_at = NOW(), deleted_by = p_operator_id, deletion_reason = 'NDPA 2023 right to erasure request' WHERE wax_id = p_wax_id RETURNING id),
  audit_entry AS MATERIALIZED (INSERT INTO audit_log (event_type, wax_id, event_data) VALUES ('data_deletion_completed', p_wax_id, jsonb_build_object('operator', p_operator_id, 'deletion_method', 'actual_deletion', 'timestamp', NOW())) RETURNING id)
  SELECT (SELECT COUNT(*) FROM deleted_messages), (SELECT COUNT(*) FROM deleted_observations), (SELECT COUNT(*) FROM deleted_facts), (SELECT COUNT(*) FROM deleted_episodes), (SELECT COUNT(*) FROM deleted_misconceptions), (SELECT COUNT(*) FROM reset_knowledge_states), (SELECT COUNT(*) FROM archived_sessions), (SELECT id FROM audit_entry);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: queue_data_deletion
-- ============================================================

CREATE OR REPLACE FUNCTION queue_data_deletion(p_wax_id UUID, p_requester_id TEXT DEFAULT 'student')
RETURNS UUID AS $$
DECLARE v_audit_id UUID;
BEGIN
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES ('data_deletion_requested', p_wax_id, jsonb_build_object('requester', p_requester_id, 'requested_at', NOW(), 'status', 'pending')) RETURNING id INTO v_audit_id;
  PERFORM delete_student_data(p_wax_id, p_requester_id);
  UPDATE audit_log SET event_data = event_data || jsonb_build_object('status', 'completed') WHERE id = v_audit_id;
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: export_student_data
-- ============================================================

CREATE OR REPLACE FUNCTION export_student_data(p_wax_id UUID, p_format TEXT DEFAULT 'json')
RETURNS TABLE (export_id UUID, data_size_bytes BIGINT, export_url TEXT, export_data JSONB) AS $$
DECLARE v_export_id UUID; v_export_data JSONB; v_data_size BIGINT;
BEGIN
  v_export_id := gen_random_uuid();
  SELECT jsonb_build_object(
    'export_metadata', jsonb_build_object('export_id', v_export_id, 'export_date', NOW(), 'format', p_format, 'student_wax_id', p_wax_id),
    'student_info', (SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '{}'::jsonb) FROM students s WHERE s.id = p_wax_id AND s.deleted_at IS NULL),
    'conversation_history', (SELECT COALESCE(jsonb_agg(to_jsonb(m.*)), '{}'::jsonb) FROM (SELECT id, direction, content, message_type, created_at FROM messages WHERE wax_id = p_wax_id AND deleted_at IS NULL ORDER BY created_at ASC) m),
    'sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '{}'::jsonb) FROM sessions s WHERE s.wax_id = p_wax_id AND s.deleted_at IS NULL),
    'learning_data', jsonb_build_object(
      'observations', (SELECT COALESCE(jsonb_agg(to_jsonb(lo.*)), '{}'::jsonb) FROM (SELECT concept_tag, evidence_type, correctness, observed_at FROM learning_observations WHERE wax_id = p_wax_id AND deleted_at IS NULL) lo),
      'knowledge_states', (SELECT COALESCE(jsonb_agg(to_jsonb(ks.*)), '{}'::jsonb) FROM knowledge_states ks WHERE ks.wax_id = p_wax_id),
      'misconceptions', (SELECT COALESCE(jsonb_agg(to_jsonb(mc.*)), '{}'::jsonb) FROM misconceptions mc WHERE mc.wax_id = p_wax_id AND mc.deleted_at IS NULL)
    ),
    'consent_history', (SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '{}'::jsonb) FROM consents c WHERE c.wax_id = p_wax_id),
    'ai_interactions', (SELECT COALESCE(jsonb_agg(to_jsonb(ar.*)), '{}'::jsonb) FROM ai_requests ar WHERE ar.wax_id = p_wax_id)
  ) INTO v_export_data;
  
  v_data_size := pg_column_size(v_export_data);
  export_id := v_export_id; data_size_bytes := v_data_size; export_url := NULL; export_data := v_export_data;
  
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES ('data_export_completed', p_wax_id, jsonb_build_object('export_id', v_export_id, 'format', p_format, 'data_size_bytes', v_data_size, 'completed_at', NOW()));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: get_student_data_summary
-- ============================================================

CREATE OR REPLACE FUNCTION get_student_data_summary(p_wax_id UUID)
RETURNS TABLE (message_count BIGINT, session_count BIGINT, observation_count BIGINT, knowledge_state_count BIGINT, misconception_count BIGINT, ai_request_count BIGINT, estimated_export_size_bytes BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM messages WHERE wax_id = p_wax_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM sessions WHERE wax_id = p_wax_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM learning_observations WHERE wax_id = p_wax_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM knowledge_states WHERE wax_id = p_wax_id),
    (SELECT COUNT(*) FROM misconceptions WHERE wax_id = p_wax_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM ai_requests WHERE wax_id = p_wax_id),
    (SELECT COALESCE(SUM(pg_column_size(m.content) + 200), 0) FROM messages m WHERE m.wax_id = p_wax_id AND m.deleted_at IS NULL)
  FROM students s WHERE s.id = p_wax_id AND s.deleted_at IS NULL LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO schema_migrations (version) VALUES (9) ON CONFLICT (version) DO NOTHING;
