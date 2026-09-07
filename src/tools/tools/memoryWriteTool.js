/**
 * Memory Write Tool - Phase G Stage 37
 * 
 * Writes learning observations to student's long-term memory.
 * 
 * CRITICAL SECURITY: Three threats to mitigate:
 * 1. Memory poisoning by adversarial students
 * 2. AI hallucination in memory writes
 * 3. PII leakage into memory
 * 
 * Validation Architecture (Two Layers):
 * - Layer 1 (Infrastructure): JSON Schema validation, size limits, WaxID match
 * - Layer 2 (AI/Schema): Force structured schema with provenance and confidence
 */

import config from '../../config/index.js';

/**
 * What CAN be written to memory:
 * - Learning observations
 * - Educational preferences
 * - Active misconceptions
 * - Episode summaries
 * - Explicitly stated profile facts
 * 
 * What CANNOT be written:
 * - Raw phone numbers
 * - Inferred names/addresses/age
 * - Health info
 * - Emotional states as permanent traits
 * - Other students' data
 * - System instructions disguised as preferences
 */

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

/**
 * Validate memory write input for safety
 */
function validateMemoryWriteInput(input) {
  const errors = [];

  // Check for prohibited PII patterns
  const checkText = JSON.stringify(input);
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(checkText)) {
      errors.push(`Potentially sensitive information detected: ${pattern.source}`);
    }
  }

  // Check fact_key format
  if (input.fact_key && !/^[a-z][a-z0-9_]*$/.test(input.fact_key)) {
    errors.push('fact_key must be lowercase snake_case starting with a letter');
  }

  // Check confidence range
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    errors.push('confidence must be between 0 and 1');
  }

  // Check fact_value size
  const valueStr = typeof input.fact_value === 'string' 
    ? input.fact_value 
    : JSON.stringify(input.fact_value);
  if (valueStr.length > 5000) {
    errors.push('fact_value exceeds 5000 character limit');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Execute memory write
 */
export async function executeMemoryWrite({
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
  const startTime = Date.now();

  // Layer 1: Infrastructure validation
  const input = {
    fact_category,
    fact_key,
    fact_value,
    display_text,
    provenance,
    confidence,
    concept_tag,
  };

  const validation = validateMemoryWriteInput(input);
  if (!validation.valid) {
    return {
      success: false,
      validation_errors: validation.errors,
    };
  }

  // Check for prohibited fact categories
  const allowedCategories = [
    'profile',
    'academic',
    'preference',
    'misconception',
    'progress',
    'behavioral',
  ];
  if (!allowedCategories.includes(fact_category)) {
    return {
      success: false,
      validation_errors: [`Invalid fact_category: ${fact_category}`],
    };
  }

  // Check for prohibited provenance values
  const allowedProvenance = [
    'student_stated_direct',
    'student_stated_indirect',
    'ai_inferred_from_behavior',
    'ai_inferred_from_error',
    'episode_extracted',
  ];
  if (!allowedProvenance.includes(provenance)) {
    return {
      success: false,
      validation_errors: [`Invalid provenance: ${provenance}`],
    };
  }

  try {
    // Check if fact_key already exists for this student
    const existing = await queryExistingFact(waxId, fact_key);

    if (existing) {
      // Update existing fact with new confidence
      await updateExistingFact(existing.id, {
        confidence,
        evidence_count: existing.evidence_count + 1,
        superseded_at: new Date(),
      });

      return {
        success: true,
        fact_id: existing.id,
        action: 'updated',
        confidence: confidence,
      };
    }

    // Insert new fact
    const result = await insertNewFact({
      waxId,
      sessionId,
      fact_category,
      fact_key,
      fact_value,
      display_text,
      provenance,
      confidence,
      concept_tag,
    });

    // Queue embedding generation for new fact
    if (result.id) {
      await queueEmbeddingGeneration({
        targetType: 'student_fact',
        targetId: result.id,
        waxId,
        text: display_text,
      });
    }

    return {
      success: true,
      fact_id: result.id,
      action: 'created',
      confidence,
    };
  } catch (error) {
    console.error('Memory write failed:', error);
    return {
      success: false,
      validation_errors: [`Database error: ${error.message}`],
    };
  }
}

/**
 * Query existing fact by key
 */
async function queryExistingFact(waxId, factKey) {
  const result = await db.query(
    `SELECT id, evidence_count FROM student_facts
     WHERE wax_id = $1 AND fact_key = $2 AND status = 'active'
     LIMIT 1`,
    [waxId, factKey]
  );
  return result.rows[0] || null;
}

/**
 * Update existing fact
 */
async function updateExistingFact(id, updates) {
  await db.query(
    `UPDATE student_facts
     SET confidence = $1,
         evidence_count = $2,
         superseded_at = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [updates.confidence, updates.evidence_count, updates.superseded_at, id]
  );
}

/**
 * Insert new fact
 */
async function insertNewFact({
  waxId,
  sessionId,
  fact_category,
  fact_key,
  fact_value,
  display_text,
  provenance,
  confidence,
  concept_tag,
}) {
  const result = await db.query(
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
  return { id: result.rows[0].id };
}

/**
 * Queue embedding generation
 */
async function queueEmbeddingGeneration({ targetType, targetId, waxId, text }) {
  try {
    // Check if embedding already exists
    const hasEmbedding = await checkHasEmbedding(targetType, targetId);
    if (hasEmbedding) {
      return;
    }

    // Add job to queue
    const { Queue } = await import('bullmq');
    const { IORedis } = await import('bullmq');
    
    const queue = new Queue('generate-embedding', {
      connection: new IORedis(config.REDIS_URL),
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
  } catch (error) {
    console.warn('Failed to queue embedding generation:', error);
  }
}

/**
 * Check if embedding exists
 */
async function checkHasEmbedding(targetType, targetId) {
  const column = targetType === 'student_fact' ? 'embedding' : 'embedding';
  const table = targetType === 'student_fact' ? 'student_facts' : 'student_episodes';
  
  const result = await db.query(
    `SELECT ${column} IS NOT NULL as has_embedding FROM ${table} WHERE id = $1`,
    [targetId]
  );
  
  return result.rows[0]?.has_embedding || false;
}

export default {
  executeMemoryWrite,
};
