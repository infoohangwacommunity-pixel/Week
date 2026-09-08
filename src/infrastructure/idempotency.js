/**
 * WaxPrep - Idempotency Infrastructure
 * 
 * CRITICAL: Redis can lose data on crash. PostgreSQL ACID guarantees are
 * required for durable idempotency guards.
 * 
 * Pattern: Idempotent At-Least-Once
 * - Accept that the same message may be processed more than once
 * - Design operations so processing twice produces the same result as once
 * - Use PostgreSQL unique constraints and ON CONFLICT DO NOTHING
 */

import { createPool } from '../db/index.js';
import config from '../config/index.js';

/**
 * Check if AI call already exists for a message
 * Uses PostgreSQL-based idempotency (NOT Redis)
 */
export async function checkAiCallIdempotency(pool, triggeringMessageId) {
  if (!triggeringMessageId) {
    return { exists: false };
  }
  
  try {
    const result = await pool.query(
      `SELECT id, response_json 
       FROM ai_requests 
       WHERE triggering_message_id = $1 AND status = 'success'`,
      [triggeringMessageId]
    );
    
    return {
      exists: result.rows.length > 0,
      response: result.rows[0]?.response_json,
      aiRequestId: result.rows[0]?.id,
    };
  } catch (error) {
    if (error.code === '42P01') {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Record AI call for idempotency
 */
export async function recordAiCall(pool, waxId, sessionId, correlationId, triggeringMessageId, provider, model, promptVersion, response) {
  try {
    const completedAt = Date.now();
    const latencyMs = completedAt - response.startTime;
    
    await pool.query(
      `INSERT INTO ai_requests (
        wax_id, session_id, correlation_id, triggering_message_id,
        provider, model, prompt_version, status,
        input_tokens, output_tokens, total_tokens,
        started_at, completed_at, latency_ms,
        response_json
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'success',
        $8, $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT (correlation_id) DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = EXCLUDED.completed_at,
        latency_ms = EXCLUDED.latency_ms,
        response_json = EXCLUDED.response_json
      ON CONFLICT (triggering_message_id) DO NOTHING`,
      [
        waxId,
        sessionId,
        correlationId,
        triggeringMessageId || null,
        provider,
        model,
        promptVersion,
        response.usage?.inputTokens || 0,
        response.usage?.outputTokens || 0,
        response.usage?.totalTokens || 0,
        new Date(response.startTime),
        new Date(completedAt),
        latencyMs,
        JSON.stringify(response),
      ]
    );
    
    return { success: true };
  } catch (error) {
    if (error.code === '23505') {
      return { success: true, duplicate: true };
    }
    throw error;
  }
}

/**
 * Check if outbound message chunk was already sent
 */
export async function checkOutboundMessageIdempotency(pool, outboundChunkId) {
  if (!outboundChunkId) {
    return { exists: false };
  }
  
  try {
    const result = await pool.query(
      `SELECT processing_status 
       FROM outbound_messages 
       WHERE outbound_chunk_id = $1`,
      [outboundChunkId]
    );
    
    return {
      exists: result.rows.length > 0,
      status: result.rows[0]?.processing_status,
    };
  } catch (error) {
    if (error.code === '42P01') {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Mark outbound message as sent
 */
export async function markOutboundMessageAsSent(pool, outboundChunkId, waxId, triggeringMessageId, content) {
  try {
    await pool.query(
      `INSERT INTO outbound_messages (
        outbound_chunk_id, wax_id, triggering_message_id, content,
        processing_status, sent_at
      ) VALUES (
        $1, $2, $3, $4, 'sent', NOW()
      )
      ON CONFLICT (outbound_chunk_id) DO UPDATE SET
        processing_status = CASE 
          WHEN outbound_messages.processing_status != 'sent' THEN 'sent'
          ELSE outbound_messages.processing_status
        END,
        sent_at = CASE 
          WHEN outbound_messages.processing_status != 'sent' THEN NOW()
          ELSE outbound_messages.sent_at
        END,
        updated_at = NOW()`,
      [outboundChunkId, waxId, triggeringMessageId, content]
    );
    
    return { success: true };
  } catch (error) {
    if (error.code === '23505') {
      return { success: true, duplicate: true };
    }
    throw error;
  }
}

let rateLimiterInstance = null;

export function getRateLimiter(options = {}) {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new InMemoryRateLimiter({
      messagesPerMinute: options.messagesPerMinute || 10,
      messagesPerDay: options.messagesPerDay || 200,
      burstAllowance: options.burstAllowance || 3,
    });
  }
  return rateLimiterInstance;
}

class InMemoryRateLimiter {
  constructor(options) {
    this.messagesPerMinute = options.messagesPerMinute;
    this.messagesPerDay = options.messagesPerDay;
    this.burstAllowance = options.burstAllowance;
    this.studentRequests = new Map();
  }
  
  checkLimit(waxId) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    let state = this.studentRequests.get(waxId);
    if (!state) {
      state = { minute: [], day: [] };
    }
    
    state.minute = state.minute.filter(t => t > oneMinuteAgo);
    state.day = state.day.filter(t => t > oneDayAgo);
    
    if (state.day.length >= this.messagesPerDay) {
      return { allowed: false, reason: 'daily_limit_exceeded', limit: this.messagesPerDay };
    }
    
    if (state.minute.length >= this.messagesPerMinute) {
      const oldest = state.minute[0];
      const retryAfter = Math.ceil((oldest + 60000 - now) / 1000);
      return { 
        allowed: false, 
        reason: 'minute_limit_exceeded', 
        limit: this.messagesPerMinute,
        retryAfter: Math.max(1, retryAfter)
      };
    }
    
    state.minute.push(now);
    state.day.push(now);
    this.studentRequests.set(waxId, state);
    
    return { allowed: true };
  }
  
  getStatus(waxId) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    let state = this.studentRequests.get(waxId);
    if (!state) {
      return { currentMinute: 0, currentDay: 0 };
    }
    
    state.minute = state.minute.filter(t => t > oneMinuteAgo);
    state.day = state.day.filter(t => t > oneDayAgo);
    
    return {
      currentMinute: state.minute.length,
      currentDay: state.day.length,
    };
  }
}

export default {
  checkAiCallIdempotency,
  recordAiCall,
  checkOutboundMessageIdempotency,
  markOutboundMessageAsSent,
  getRateLimiter,
};
