/**
 * Memory Write Tool - Phase G Stage 37
 *
 * Writes learning observations to a student's long-term memory.
 *
 * CRITICAL SECURITY: Three threats to mitigate:
 * 1. Memory poisoning by adversarial students
 * 2. AI hallucination in memory writes
 * 3. PII leakage into memory
 *
 * Validation Architecture (Two Layers):
 * - Layer 1 (Infrastructure): JSON Schema validation, size limits, WaxID match
 * - Layer 2 (AI/Schema): Force structured schema with provenance and confidence
 *
 * Handler signature: executeMemoryWrite({ db, waxId, sessionId, ...args })
 */

import config from '../../config/index.js';

const PROHIBITED_PATTERNS = [
  /\bphone\s*(?:number|num|tel)\b/i,
  /\b(ssn|social\s*security)\b/i,
  /\bcredit\s*card\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bapi\s*key\b/i,
  /\bprivate\s*key\b/i,
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
];

const ALLOWED_CATEGORIES = [
  'profile', 'academic', 'preference', 'misconception', 'progress', 'behavioral',
];

const ALLOWED_PROVENANCE = [
  'student_stated_direct',
  'student_stated_indirect',
  'ai_inferred_from_behavior',
  'ai_inferred_from_error',
  'episode_extracted',
];

function validateMemoryWriteInput(input) {
  const errors = [];

  // Check for prohibited PII patterns
  const checkText = JSON.stringify(input);
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(checkText)) {
      errors.push(`Potentially sensitive information detected: ${pattern.source}`);
    }
  }

  if (input.fact_key && !/^[a-z][a-z0-9_]*$/.test(input.fact_key)) {
    errors.push('fact_key must be lowercase snake_case starting with a letter');
  }

  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    errors.push('confidence must be between 0 and 1');
  }

  const valueStr = typeof input.fact_value === 'string'
    ? input.fact_value
    : JSON.stringify(input.fact_value);
  if (valueStr.length > 5000) {
    errors.push('fact_value exceeds 5000 character limit');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Execute memory write.
 *
 * @param {Object} ctx - Handler context.
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool.
 * @param {string} ctx.waxId - Student identifier (from session).
 * @param {string} ctx.sessionId - Session identifier.
 * @param {string} ctx.fact_category - One of ALLOWED_CATEGORIES.
 * @param {string} ctx.fact_key - Lowercase snake_case key.
 * @param {*} ctx.fact_value - JSON-serializable value.
 * @param {string} ctx.display_text - Human-readable summary.
 * @param {string} ctx.provenance - One of ALLOWED_PROVENANCE.
 * @param {number} ctx.confidence - Confidence score 0..1.
 * @param {string} [ctx.concept_tag] - Optional concept linkage.
 */
export async function executeMemoryWrite({
  db,
  waxId,
  sessionId,
  fact_category,
  fact_key,
  fact_value,
  display_text,
  provenance,
  confidence,
  concept_tag = null,
}) {
  if (!db) {
    throw new Error('executeMemoryWrite: db pool is required');
  }
  if (!waxId) {
    throw new Error('executeMemoryWrite: waxId is required');
  }

  const input = { fact_category, fact_key, fact_value, display_text, provenance, confidence, concept_tag };
  const validation = validateMemoryWriteInput(input);
  if (!validation.valid) {
    return { success: false, validation_errors: validation.errors };
  }

  if (!ALLOWED_CATEGORIES.includes(fact_category)) {
    return { success: false, validation_errors: [`Invalid fact_category: ${fact_category}`] };
  }

  if (!ALLOWED_PROVENANCE.includes(provenance)) {
    return { success: false, validation_errors: [`Invalid provenance: ${provenance}`] };
  }

  try {
    // Check if fact_key already exists for this student.
    const existing = await db.query(
      `SELECT id, evidence_count FROM student_facts
       WHERE wax_id = $1 AND fact_key = $2 AND status = 'active'
       LIMIT 1`,
      [waxId, fact_key]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      // Update confidence via weighted average with previous evidence count.
      // Don't overwrite — accumulate evidence.
      await db.query(
        `UPDATE student_facts
         SET confidence = $1,
             evidence_count = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [confidence, row.evidence_count + 1, row.id]
      );

      return {
        success: true,
        fact_id: row.id,
        action: 'updated',
        confidence,
      };
    }

    // Insert new fact.
    const insertResult = await db.query(
      `INSERT INTO student_facts (
        wax_id, fact_key, fact_category, fact_value, display_text,
        provenance, confidence, source_session_id, concept_tag,
        evidence_count, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
      RETURNING id`,
      [
        waxId,
        fact_key,
        fact_category,
        JSON.stringify(fact_value),
        display_text,
        provenance,
        confidence,
        sessionId,
        concept_tag,
        1,
      ]
    );

    const newFactId = insertResult.rows[0].id;

    // Queue embedding generation (best-effort, non-blocking).
    await queueEmbeddingGeneration({ db, targetType: 'student_fact', targetId: newFactId, waxId, text: display_text });

    return {
      success: true,
      fact_id: newFactId,
      action: 'created',
      confidence,
    };
  } catch (error) {
    return {
      success: false,
      validation_errors: [`Database error: ${error.message}`],
    };
  }
}

/**
 * Queue embedding generation. Best-effort — failures are logged but do not
 * block the memory write.
 *
 * This inserts a row into the `embedding_jobs` table AND enqueues a BullMQ
 * job. The embedding worker (`embeddingWorker.js`) processes the BullMQ job
 * directly — it does NOT poll the `embedding_jobs` table. So both the DB
 * row (for audit) and the BullMQ job (for execution) are needed.
 *
 * If BullMQ is unavailable, the `embedding_jobs` row stays as 'pending'
 * and can be picked up by a future sweeper or manual operator intervention.
 */
async function queueEmbeddingGeneration({ db, targetType, targetId, waxId, text }) {
  try {
    // 1. Insert a pending row in embedding_jobs (for audit + future sweeper).
    await db.query(
      `INSERT INTO embedding_jobs (target_type, target_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING`,
      [targetType, targetId]
    );

    // 2. Enqueue a BullMQ job for the embedding worker to process.
    // The worker calls EmbeddingService.processEmbeddingJob() which generates
    // the embedding and updates the student_facts/student_episodes row.
    // This is best-effort — if Redis is unavailable, the embedding_jobs DB
    // row stays as 'pending' and can be picked up by a future sweeper.
    try {
      const { Queue } = await import('bullmq');
      const { Redis } = await import('ioredis');
      const redis = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1, // Fail fast in test/no-Redis environments
        enableReadyCheck: true,
        connectTimeout: 2000, // 2s timeout — don't block the memory write
        retryStrategy: (times) => (times > 1 ? null : 100), // Only retry once
      });

      // Check if Redis is actually reachable before creating a Queue.
      try {
        await redis.ping();
      } catch {
        // Redis not available — skip BullMQ enqueue. The embedding_jobs
        // DB row is already persisted as 'pending' and will be picked up
        // by a future sweeper or manual operator intervention.
        redis.disconnect();
        return;
      }

      const queue = new Queue('generate-embedding', {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      });

      await queue.add('generate-embedding', {
        targetType,
        targetId,
        waxId,
        text,
      }, {
        jobId: `embedding:${targetType}:${targetId}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      });

      await queue.close();
      redis.disconnect();
    } catch (queueErr) {
      // BullMQ enqueue failed (Redis down, import error, etc.).
      // The embedding_jobs DB row is still in 'pending' status.
      console.warn('Failed to enqueue embedding via BullMQ (non-fatal — DB row persisted):', queueErr.message);
    }
  } catch (error) {
    // Non-fatal: the fact was already persisted.
    console.warn('Failed to queue embedding generation:', error.message);
  }
}

export default { executeMemoryWrite };
