/**
 * WaxPrep - Session Summarizer Worker
 * Stage 24: Episodic Memory
 */
import { pool } from '../db/index.js';
import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { MemoryWriter } from '../memory/index.js';
import SessionEvidenceExtractor from './sessionEvidenceExtractor.js';

export class SessionSummarizer {
  constructor(aiService) {
    this.aiService = aiService;
    this.logger = logger.child({ component: 'SessionSummarizer' });
  }

  async summarizeSession(session) {
    const log = this.logger.child({ sessionId: session.id, waxId: session.wax_id });
    try {
      log.info('Starting session summarization');
      const messages = await this.fetchSessionMessages(session.id);
      const summary = await this.generateAISummary(messages, session.wax_id);
      const extractedFacts = summary.extractedFacts || [];
      const episode = await this.createEpisodeRecord({
        sessionId: session.id,
        waxId: session.wax_id,
        summary: summary,
        messages,
      });
      if (extractedFacts.length > 0) {
        const memoryWriter = new MemoryWriter(session.wax_id);
        await memoryWriter.writeExtractedFacts(extractedFacts, session.id);
      }

      // Extract learning evidence (Stage 28)
      try {
        const evidenceExtractor = new SessionEvidenceExtractor(pool, this.aiService);
        const evidenceResults = await evidenceExtractor.extractEvidenceFromSession({
          session_id: session.id,
          wax_id: session.wax_id,
          messages,
          summarizedFacts: extractedFacts,
        });
        log.info({
          observationsWritten: evidenceResults.observationsWritten,
          misconceptionsDetected: evidenceResults.misconceptionsDetected,
        }, 'Learning evidence extracted');
      } catch (error) {
        log.warn({ error: error.message }, 'Failed to extract learning evidence');
      }

      log.info({ episodeId: episode.id, summaryLength: summary.summary_text.length }, 'Session summarized successfully');
      return { success: true, episode, extractedFacts };
    } catch (error) {
      log.error({ error: error.message }, 'Session summarization failed');
      await this.markEpisodeFailed(session.id, error.message);
      return { success: false, error: error.message };
    }
  }

  async fetchSessionMessages(sessionId) {
    const pool = await this.db.createPool(config);
    const result = await pool.query(
      'SELECT wax_id, direction, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    return result.rows;
  }

  async generateAISummary(messages, waxId) {
    const conversation = messages.map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content,
    })).map(m => `${m.role}: ${m.content}`).join('\n\n');

    const prompt = `
You are a tutoring assistant for WaxPrep. Generate a concise summary of a tutoring session.

SESSION CONTENT:
${conversation}

OUTPUT FORMAT (JSON):
{
  "summary_text": "Natural language summary...",
  "topics": ["topic1", "topic2"],
  "subjects": ["subject1"],
  "breakthroughs": ["breakthrough1"],
  "confusions": ["confusion1"],
  "questions_asked": 5,
  "student_mood": "engaged",
  "extractedFacts": [
    {
      "fact_key": "exam_target",
      "fact_category": "profile",
      "fact_value": "WAEC",
      "display_text": "Student is preparing for WAEC",
      "provenance": "student_stated_direct"
    }
  ]
}
`;

    const summary = await this.aiService.complete({
      messages: [{ role: 'system', content: prompt }],
      systemPrompt: 'You are a session summarizer for WaxPrep tutoring platform.',
    });

    try {
      return JSON.parse(summary);
    } catch (err) {
      throw new Error(`Failed to parse AI summary: ${err.message}`);
    }
  }

  async createEpisodeRecord({ sessionId, waxId, summary, messages }) {
    const pool = await this.db.createPool(config);
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const episodeQuery = `
      INSERT INTO student_episodes (
        wax_id, session_id, summary_text, topics, subjects,
        breakthroughs, confusions, questions_asked, student_mood,
        session_start, session_end, session_duration_minutes, turn_count,
        summary_generated_by, summary_model, summary_prompt_version, summary_generated_at, summary_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'complete')
      RETURNING *
    `;
    const durationMinutes = Math.floor((new Date(lastMessage.created_at) - new Date(firstMessage.created_at)) / 60000);
    const result = await pool.query(episodeQuery, [
      waxId, sessionId, summary.summary_text,
      JSON.stringify(summary.topics || []),
      JSON.stringify(summary.subjects || []),
      JSON.stringify(summary.breakthroughs || []),
      JSON.stringify(summary.confusions || []),
      summary.questions_asked || 0,
      summary.student_mood || 'neutral',
      firstMessage.created_at,
      lastMessage.created_at,
      durationMinutes || 0,
      messages.length,
      'session_summarizer',
      'Claude Sonnet 4.6',
      'v1',
      new Date(),
    ]);
    return result.rows[0];
  }

  async markEpisodeFailed(sessionId, errorMessage) {
    const pool = await this.db.createPool(config);
    await pool.query(
      'UPDATE student_episodes SET summary_status = $1, summary_error = $2 WHERE session_id = $3',
      ['failed', errorMessage, sessionId]
    );
  }
}

export default SessionSummarizer;
