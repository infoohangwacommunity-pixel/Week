/**
 * Memory Read Tool - Phase G Stage 36
 *
 * Reads a specific memory entry by its ID. Looks first in student_facts,
 * then in student_episodes. Always enforces student isolation via wax_id.
 */

/**
 * Execute memory read.
 *
 * @param {Object} ctx - Handler context.
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool.
 * @param {string} ctx.waxId - Student identifier (from session).
 * @param {string} ctx.memory_id - UUID of the memory entry to read.
 */
export async function executeMemoryRead({ db, waxId, memory_id }) {
  if (!db) {
    throw new Error('executeMemoryRead: db pool is required');
  }
  if (!waxId) {
    throw new Error('executeMemoryRead: waxId is required');
  }
  if (!memory_id) {
    return { success: false, error: 'memory_id is required' };
  }

  try {
    // Try student_facts first.
    const factResult = await db.query(
      `SELECT
         'fact' as type,
         id,
         fact_key,
         fact_category,
         fact_value,
         display_text,
         confidence,
         provenance,
         created_at
       FROM student_facts
       WHERE id = $1 AND wax_id = $2 AND status = 'active'
       LIMIT 1`,
      [memory_id, waxId],
    );

    if (factResult.rows.length > 0) {
      return {
        success: true,
        found: true,
        type: 'fact',
        ...factResult.rows[0],
      };
    }

    // Then student_episodes.
    const episodeResult = await db.query(
      `SELECT
         'episode' as type,
         id,
         session_id::text as fact_key,
         'episode' as fact_category,
         jsonb_build_object('summary', summary_text) as fact_value,
         summary_text as display_text,
         0.7 as confidence,
         'episode_extracted' as provenance,
         session_end as created_at
       FROM student_episodes
       WHERE id = $1 AND wax_id = $2
       LIMIT 1`,
      [memory_id, waxId],
    );

    if (episodeResult.rows.length > 0) {
      return {
        success: true,
        found: true,
        type: 'episode',
        ...episodeResult.rows[0],
      };
    }

    return {
      success: true,
      found: false,
      memory_id,
      waxId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Memory read failed: ${error.message}`,
    };
  }
}

export default { executeMemoryRead };
