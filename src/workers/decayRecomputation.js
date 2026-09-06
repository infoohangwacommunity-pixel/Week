/**
 * WaxPrep - Mastery Decay Recomputation Worker
 * 
 * Stage 29: Weekly background job to recompute mastery estimates
 * 
 * This worker runs weekly and recomputes mastery estimates for all students
 * with evidence older than 3 days, applying temporal decay to reflect
 * the Ebbinghaus forgetting curve.
 * 
 * Without this job, a student who studied intensely a month ago would
 * retain their pre-decay mastery estimate indefinitely.
 */

import { Worker } from 'bullmq';
import { IORedis } from 'bullmq';
import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { MasteryEngine } from '../learning/mastery/MasteryEngine.js';

/**
 * Setup decay recomputation worker
 */
export async function setupDecayWorker({ redis, pool }) {
  const decayWorker = new Worker(
    'mastery-decay-recomputation',
    async () => {
      const log = logger.child({ job: 'mastery-decay-recomputation' });
      log.info('Starting weekly mastery decay recomputation');

      try {
        const engine = new MasteryEngine(pool);
        
        // Get all students with evidence older than 3 days
        const result = await pool.query(`
          SELECT DISTINCT wax_id, MAX(last_evidence_at) as last_evidence_at
          FROM knowledge_states
          WHERE wax_id IN (
            SELECT DISTINCT wax_id 
            FROM learning_observations 
            WHERE deleted_at IS NULL 
            AND observed_at <= NOW() - INTERVAL '3 days'
          )
          AND last_computed_at <= NOW() - INTERVAL '1 day'
        `);

        const students = result.rows;
        log.info({ studentCount: students.length }, 'Found students needing decay recomputation');

        let recomputed = 0;
        let errors = 0;

        for (const student of students) {
          try {
            // Get all concept tags for this student
            const conceptsResult = await pool.query(
              'SELECT DISTINCT concept_tag FROM learning_observations WHERE wax_id = $1 AND deleted_at IS NULL',
              [student.wax_id]
            );

            for (const row of conceptsResult.rows) {
              await engine.updateState(student.wax_id, row.concept_tag);
              recomputed++;
            }
          } catch (error) {
            errors++;
            log.error({ wax_id: student.wax_id, error: error.message }, 'Failed to recompute student states');
          }
        }

        log.info({ recomputed, errors, total: students.length }, 'Decay recomputation complete');
        return { recomputed, errors, total: students.length };
      } catch (error) {
        log.error({ error: error.message }, 'Decay recomputation failed');
        throw error;
      }
    },
    {
      connection: new IORedis(redis),
      concurrency: 1,
      lockDuration: 300000, // 5 minutes
      limiter: {
        max: 1,
        duration: 7 * 24 * 60 * 60 * 1000, // Once per week (in milliseconds)
      },
    },
  );

  decayWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Decay recomputation job completed');
  });

  decayWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Decay recomputation job failed');
  });

  logger.info('Mastery decay recomputation worker setup complete');
  return decayWorker;
}

export default setupDecayWorker;
