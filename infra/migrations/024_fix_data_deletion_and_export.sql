-- Migration: 024_fix_data_deletion_and_export.sql
-- =============================================================================
-- Fixes three critical NDPA / right-to-erasure bugs:
--
-- 1. delete_student_data (migration 012) deletes in WRONG FK order: messages
--    first, but learning_observations.message_id REFERENCES messages(id) with
--    NO ACTION — so the DELETE raises a FK violation and aborts the whole
--    transaction. ZERO rows deleted.
--
-- 2. delete_student_data + queue_data_deletion UPDATE the audit_log table
--    after the initial INSERT. Migration 009 created `audit_log_immutable`
--    as a BEFORE UPDATE OR DELETE trigger that raises
--    'audit_log is append-only and cannot be modified'. So the UPDATE
--    aborts the transaction. ZERO rows deleted.
--
-- 3. export_student_data (migration 010) declares RETURNS TABLE but never
--    calls RETURN NEXT or RETURN QUERY. PL/pgSQL functions with RETURNS
--    TABLE that don't RETURN NEXT just return 0 rows. Caller
--    (intentHandler.executeExportAction) then sees result.rows[0] === undefined
--    and returns {success:true, exportId:undefined} — fake success for a
--    legally-mandated operation (NDPA §27 right to portability).
--
-- This migration rewrites all three functions correctly:
--
-- * delete_student_data: deletes in reverse FK-dependency order, never
--   UPDATEs audit_log (uses INSERT for status changes).
-- * queue_data_deletion: never UPDATEs audit_log.
-- * export_student_data: adds `RETURN NEXT` so the function actually
--   returns the row it builds.
-- =============================================================================

-- ============================================================
-- FUNCTION: delete_student_data (REWRITTEN)
-- ============================================================
CREATE OR REPLACE FUNCTION delete_student_data(p_wax_id UUID, p_operator_id TEXT DEFAULT 'system')
RETURNS TABLE (
  messages_deleted BIGINT, observations_deleted BIGINT, facts_deleted BIGINT,
  episodes_deleted BIGINT, misconceptions_deleted BIGINT, knowledge_states_reset BIGINT,
  sessions_deleted BIGINT, audit_log_id UUID
) AS $$
DECLARE
  v_audit_id UUID;
  v_messages_count BIGINT;
  v_observations_count BIGINT;
  v_facts_count BIGINT;
  v_episodes_count BIGINT;
  v_misconceptions_count BIGINT;
  v_knowledge_states_count BIGINT;
  v_sessions_count BIGINT;
BEGIN
  -- Count records BEFORE deletion.
  SELECT COUNT(*) INTO v_messages_count FROM messages WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_observations_count FROM learning_observations WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_facts_count FROM student_facts WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_episodes_count FROM student_episodes WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_misconceptions_count FROM misconceptions WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_knowledge_states_count FROM knowledge_states WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_sessions_count FROM sessions WHERE wax_id = p_wax_id;

  -- Insert audit log entry first (append-only — never UPDATE).
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES ('data_deletion_started', p_wax_id, jsonb_build_object(
    'operator', p_operator_id,
    'timestamp', NOW(),
    'counts_before', jsonb_build_object(
      'messages', v_messages_count,
      'observations', v_observations_count,
      'facts', v_facts_count,
      'episodes', v_episodes_count,
      'misconceptions', v_misconceptions_count,
      'knowledge_states', v_knowledge_states_count,
      'sessions', v_sessions_count
    )
  ))
  RETURNING id INTO v_audit_id;

  BEGIN
    -- Delete in REVERSE FK-dependency order so no RESTRICT FK blocks us.
    -- 1. Dependent tables first (they reference messages/sessions/students).
    DELETE FROM tool_invocations WHERE wax_id = p_wax_id;
    DELETE FROM safety_events WHERE wax_id = p_wax_id;
    DELETE FROM crisis_responses WHERE wax_id = p_wax_id;
    DELETE FROM outbound_messages WHERE wax_id = p_wax_id;
    DELETE FROM response_deliveries WHERE wax_id = p_wax_id;
    DELETE FROM web_search_results WHERE wax_id = p_wax_id;
    DELETE FROM web_search_cache WHERE query_hash IN (
      SELECT query_hash FROM web_search_cache WHERE 1=0  -- web_search_cache has no wax_id; skip
    );
    DELETE FROM memory_retrieval_log WHERE wax_id = p_wax_id;
    DELETE FROM memory_confidence_history WHERE wax_id = p_wax_id;
    DELETE FROM memory_contradictions WHERE wax_id = p_wax_id;
    DELETE FROM student_model_snapshots WHERE wax_id = p_wax_id;
    DELETE FROM learning_signals WHERE wax_id = p_wax_id;
    DELETE FROM misconceptions WHERE wax_id = p_wax_id;
    DELETE FROM knowledge_states WHERE wax_id = p_wax_id;
    -- 2. learning_observations (FK message_id → messages; delete BEFORE messages).
    DELETE FROM learning_observations WHERE wax_id = p_wax_id;
    DELETE FROM embedding_jobs WHERE target_id IN (
      SELECT id FROM student_facts WHERE wax_id = p_wax_id
      UNION
      SELECT id FROM student_episodes WHERE wax_id = p_wax_id
    );
    DELETE FROM student_facts WHERE wax_id = p_wax_id;
    DELETE FROM student_episodes WHERE wax_id = p_wax_id;
    -- 3. messages (now safe — learning_observations gone).
    DELETE FROM messages WHERE wax_id = p_wax_id;
    -- 4. sessions (FK messages via session_id? sessions.id is parent).
    DELETE FROM sessions WHERE wax_id = p_wax_id;
    -- 5. consents (NDPA-relevant: must be deleted for true erasure).
    DELETE FROM consents WHERE wax_id = p_wax_id;
    -- 6. ai_requests (audit trail — also must be deleted for erasure).
    DELETE FROM ai_requests WHERE wax_id = p_wax_id;

    -- Insert completion audit entry (append-only — never UPDATE).
    INSERT INTO audit_log (event_type, wax_id, event_data)
    VALUES ('data_deletion_completed', p_wax_id, jsonb_build_object(
      'operator', p_operator_id,
      'deletion_method', 'actual_deletion',
      'counts_deleted', jsonb_build_object(
        'messages', v_messages_count,
        'observations', v_observations_count,
        'facts', v_facts_count,
        'episodes', v_episodes_count,
        'misconceptions', v_misconceptions_count,
        'knowledge_states', v_knowledge_states_count,
        'sessions', v_sessions_count
      ),
      'timestamp', NOW()
    ));

  EXCEPTION WHEN OTHERS THEN
    -- Insert error audit entry (append-only — never UPDATE).
    INSERT INTO audit_log (event_type, wax_id, event_data)
    VALUES ('data_deletion_error', p_wax_id, jsonb_build_object(
      'operator', p_operator_id,
      'error', SQLERRM,
      'timestamp', NOW()
    ));
    RAISE;
  END;

  -- Return counts for each deleted entity type + the audit log ID.
  RETURN QUERY
  SELECT v_messages_count, v_observations_count, v_facts_count,
         v_episodes_count, v_misconceptions_count, v_knowledge_states_count,
         v_sessions_count, v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: queue_data_deletion (REWRITTEN — no audit_log UPDATE)
-- ============================================================
CREATE OR REPLACE FUNCTION queue_data_deletion(p_wax_id UUID, p_requester_id TEXT DEFAULT 'student')
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  -- Insert a deletion-requested audit entry (append-only).
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES ('data_deletion_requested', p_wax_id, jsonb_build_object(
    'requester', p_requester_id,
    'requested_at', NOW(),
    'status', 'pending'
  ))
  RETURNING id INTO v_audit_id;

  -- Execute the deletion. The function itself inserts its own
  -- 'data_deletion_started' and 'data_deletion_completed' audit rows.
  PERFORM delete_student_data(p_wax_id, p_requester_id);

  -- Insert a completion audit entry (append-only — NEVER UPDATE the row above).
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES ('data_deletion_request_completed', p_wax_id, jsonb_build_object(
    'requester', p_requester_id,
    'completed_at', NOW()
  ));

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: export_student_data (REWRITTEN — adds RETURN NEXT)
-- ============================================================
CREATE OR REPLACE FUNCTION export_student_data(p_wax_id UUID, p_format TEXT DEFAULT 'json')
RETURNS TABLE (
  export_id UUID,
  data_size_bytes BIGINT,
  export_url TEXT,
  export_data JSONB
) AS $$
DECLARE
  v_export_id UUID := gen_random_uuid();
  v_export_data JSONB;
  v_data_size_bytes BIGINT;
BEGIN
  -- Assemble the student's data into a JSONB object.
  SELECT jsonb_build_object(
    'wax_id', p_wax_id,
    'exported_at', NOW(),
    'format', p_format,
    'student', (
      SELECT jsonb_build_object(
        'created_at', s.created_at
      ) FROM students s WHERE s.id = p_wax_id
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'direction', m.direction, 'content', m.content,
        'message_type', m.message_type, 'created_at', m.created_at
      ))
      FROM messages m WHERE m.wax_id = p_wax_id AND m.deleted_at IS NULL
    ), '[]'::jsonb),
    'student_facts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fact_key', sf.fact_key, 'fact_category', sf.fact_category,
        'display_text', sf.display_text, 'confidence', sf.confidence,
        'provenance', sf.provenance, 'created_at', sf.created_at
      ))
      FROM student_facts sf WHERE sf.wax_id = p_wax_id AND sf.deleted_at IS NULL
    ), '[]'::jsonb),
    'learning_observations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'concept_tag', lo.concept_tag, 'evidence_type', lo.evidence_type,
        'correctness', lo.correctness, 'hint_level', lo.hint_level,
        'observed_at', lo.observed_at
      ))
      FROM learning_observations lo WHERE lo.wax_id = p_wax_id
    ), '[]'::jsonb),
    'knowledge_states', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'concept_tag', ks.concept_tag, 'mastery_estimate', ks.mastery_estimate,
        'evidence_count', ks.evidence_count, 'last_computed_at', ks.last_computed_at
      ))
      FROM knowledge_states ks WHERE ks.wax_id = p_wax_id
    ), '[]'::jsonb),
    'consents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'consent_type', c.consent_type, 'status', c.status, 'recorded_at', c.recorded_at
      ))
      FROM consents c WHERE c.wax_id = p_wax_id
    ), '[]'::jsonb)
  ) INTO v_export_data;

  v_data_size_bytes := COALESCE(octet_length(v_export_data::text), 0);

  -- CRITICAL: RETURN NEXT so the function actually returns the row.
  -- The previous implementation built v_export_id / v_export_data / etc.
  -- but never called RETURN NEXT, so callers always saw 0 rows.
  RETURN QUERY
  SELECT v_export_id, v_data_size_bytes, NULL::TEXT, v_export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO schema_migrations (version) VALUES (24) ON CONFLICT (version) DO NOTHING;
