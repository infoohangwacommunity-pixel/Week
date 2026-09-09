-- =============================================================================
-- Migration: 012_fix_data_deletion.sql
-- =============================================================================
-- Fix CRITICAL-002: Data deletion now actually deletes sessions (not soft delete)
-- 
-- NDPA 2023 COMPLIANCE:
-- - Right to erasure (Section 26): ACTUAL deletion, not soft deletion
-- - Sessions are now deleted with CASCADE behavior
-- =============================================================================

-- ============================================================
-- FUNCTION: delete_student_data (FIXED)
-- ============================================================
-- Overwrites the previous version to actually delete sessions
-- =============================================================================

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
  -- Count records BEFORE deletion
  SELECT COUNT(*) INTO v_messages_count FROM messages WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_observations_count FROM learning_observations WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_facts_count FROM student_facts WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_episodes_count FROM student_episodes WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_misconceptions_count FROM misconceptions WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_knowledge_states_count FROM knowledge_states WHERE wax_id = p_wax_id;
  SELECT COUNT(*) INTO v_sessions_count FROM sessions WHERE wax_id = p_wax_id;
  
  -- Start a transaction for atomicity
  BEGIN
    -- Insert audit log entry first
    INSERT INTO audit_log (event_type, wax_id, event_data)
    VALUES ('data_deletion_started', p_wax_id, jsonb_build_object('operator', p_operator_id, 'timestamp', NOW()))
    RETURNING id INTO v_audit_id;
    
    -- Delete messages (hard delete)
    DELETE FROM messages WHERE wax_id = p_wax_id;
    
    -- Delete learning observations
    DELETE FROM learning_observations WHERE wax_id = p_wax_id;
    
    -- Delete student facts
    DELETE FROM student_facts WHERE wax_id = p_wax_id;
    
    -- Delete student episodes (episodic memory)
    DELETE FROM student_episodes WHERE wax_id = p_wax_id;
    
    -- Delete misconceptions
    DELETE FROM misconceptions WHERE wax_id = p_wax_id;
    
    -- Delete knowledge states
    DELETE FROM knowledge_states WHERE wax_id = p_wax_id;
    
    -- Delete sessions (HARD DELETE - not soft delete)
    -- ON DELETE CASCADE will handle related data
    DELETE FROM sessions WHERE wax_id = p_wax_id;
    
    -- Update audit log with completion
    UPDATE audit_log 
    SET event_data = event_data || jsonb_build_object(
      'status', 'completed',
      'deletion_method', 'actual_deletion',
      'messages_deleted', v_messages_count,
      'observations_deleted', v_observations_count,
      'facts_deleted', v_facts_count,
      'episodes_deleted', v_episodes_count,
      'misconceptions_deleted', v_misconceptions_count,
      'knowledge_states_reset', v_knowledge_states_count,
      'sessions_deleted', v_sessions_count
    )
    WHERE id = v_audit_id;
    
    -- Insert completion audit entry
    INSERT INTO audit_log (event_type, wax_id, event_data)
    VALUES ('data_deletion_completed', p_wax_id, jsonb_build_object(
      'operator', p_operator_id,
      'deletion_method', 'actual_deletion',
      'timestamp', NOW()
    ));
    
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the entire operation
    INSERT INTO audit_log (event_type, wax_id, event_data)
    VALUES ('data_deletion_error', p_wax_id, jsonb_build_object(
      'operator', p_operator_id,
      'error', SQLERRM,
      'timestamp', NOW()
    ));
    RAISE;
  END;
  
  -- Return counts for each deleted entity type
  RETURN QUERY
  SELECT v_messages_count, v_observations_count, v_facts_count,
         v_episodes_count, v_misconceptions_count, v_knowledge_states_count,
         v_sessions_count, v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: queue_data_deletion (UPDATED)
-- ============================================================
-- Updated to use the new fixed delete_student_data function
-- =============================================================================

CREATE OR REPLACE FUNCTION queue_data_deletion(p_wax_id UUID, p_requester_id TEXT DEFAULT 'student')
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  -- Record deletion request
  INSERT INTO audit_log (event_type, wax_id, event_data)
  VALUES ('data_deletion_requested', p_wax_id, jsonb_build_object(
    'requester', p_requester_id,
    'requested_at', NOW(),
    'status', 'pending'
  )) RETURNING id INTO v_audit_id;
  
  -- Execute the deletion
  PERFORM delete_student_data(p_wax_id, p_requester_id);
  
  -- Update audit log to completed
  UPDATE audit_log 
  SET event_data = event_data || jsonb_build_object('status', 'completed')
  WHERE id = v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO schema_migrations (version) VALUES (12) ON CONFLICT (version) DO NOTHING;
