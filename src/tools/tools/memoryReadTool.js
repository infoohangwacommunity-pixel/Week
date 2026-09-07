/**
 * Memory Read Tool - Phase G Stage 36
 * 
 * Reads a specific memory entry by its ID.
 */

/**
 * Execute memory read
 */
export async function executeMemoryRead({
  waxId,
  memory_id,
}) {
  try {
    // Read from student_facts
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
      [memory_id, waxId]
    );

    if (factResult.rows.length > 0) {
      return {
        found: true,
        type: 'fact',
        ...factResult.rows[0],
      };
    }

    // Read from student_episodes
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
      [memory_id]
    );

    if (episodeResult.rows.length > 0) {
      return {
        found: true,
        type: 'episode',
        ...episodeResult.rows[0],
      };
    }

    // Not found
    return {
      found: false,
      memory_id,
      wax_id: waxId,
    };
  } catch (error) {
    console.error('Memory read failed:', error);
    throw error;
  }
}

export default {
  executeMemoryRead,
};
