/**
 * WaxPrep - AI Intent Handler
 * 
 * AI-FIRST DESIGN:
 * - AI understands student's natural language and determines intent
 * - Infrastructure provides context and executes validated actions
 * - NO keyword matching, YES/NO scripts, or rigid conversational logic
 * 
 * Architecture:
 * AI understands -> structured intent -> schema validation -> policy/authorization -> infrastructure executes -> result to AI
 */

import { z } from 'zod';

// Intent schemas - validated by AI, executed by infrastructure
const IntentSchema = z.object({
  type: z.enum(['consent_given', 'consent_withdrawn', 'data_deletion_requested', 'data_export_requested', 'rate_limit_query']),
  waxId: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional(),
  aiReasoning: z.string(),
  timestamp: z.string().datetime(),
});

// Structured action output for infrastructure
const ActionSchema = z.object({
  action: z.enum(['record_consent', 'execute_deletion', 'execute_export', 'check_rate_limit']),
  params: z.record(z.any()),
  validationToken: z.string(),
});

/**
 * Build system context for AI to understand privacy needs
 */
export function buildPrivacyContext(config) {
  const contextParts = [];
  
  if (config.isNewStudent && !config.hasConsent) {
    contextParts.push(`
You are speaking with a new student. Before collecting any personal data or storing conversation history, you must explain what WaxPrep collects and why.

Explain naturally:
- You store their learning history to help them progress
- You remember what they've learned to provide continuity
- They can request deletion or export of their data at any time

Wait for their response. If they indicate understanding and agreement (through any natural language like "yes", "okay", "sure", "I agree", "absolutely", etc.), record that consent has been given.

Important: Do not use scripted YES/NO questions. Let the conversation flow naturally. The student's affirmative response in context is consent.
    `);
  }
  
  if (config.rateLimitExceeded) {
    contextParts.push(`
The student has exceeded the rate limit (${config.limitsPerMinute} messages per minute, ${config.limitsPerDay} per day). 

Inform them naturally that they've sent many messages quickly, and suggest pausing if needed. Do NOT use scripted abuse responses. The AI should respond conversationally and contextually.

Example natural responses:
- "I notice you've sent a lot of messages quickly - is everything okay?"
- "It seems like you're in a hurry - let me know if you need anything specific"
- "Take your time, I'm here when you're ready"
    `);
  }
  
  if (config.deletionRequestReceived || config.exportRequestReceived) {
    contextParts.push(`
The student has indicated they want to delete or export their data. 

For deletion:
- Acknowledge their request
- Confirm they understand this will remove all their learning history
- Once confirmed by their response, execute the deletion

For export:
- Acknowledge their request  
- Explain you'll prepare all their data in JSON format
- Execute the export and provide summary

The student might say: "delete everything you know about me", "I want my data", "remove my history", "export my chats", etc. Understand the intent naturally.
    `);
  }
  
  return contextParts.join('\n');
}

export function validateIntent(determination) {
  try {
    return IntentSchema.parse(determination);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Invalid intent determination: ${err.errors.map(e => e.message).join(', ')}`);
    }
    throw err;
  }
}

export function validateAction(action, waxId) {
  try {
    const validated = ActionSchema.parse(action);
    
    if (validated.params.waxId && validated.params.waxId !== waxId) {
      throw new Error('Action waxId does not match student WaxID');
    }
    
    return validated;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Invalid action: ${err.errors.map(e => e.message).join(', ')}`);
    }
    throw err;
  }
}

export async function executeConsentAction(pool, waxId, status, context, aiReasoning) {
  if (!waxId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(waxId)) {
    throw new Error('Invalid WaxID format');
  }
  
  const result = await pool.query(
    `SELECT record_consent_event($1, $2, $3, $4, $5, $6)`,
    [waxId, 'general', status, '1.0', JSON.stringify({ context, aiReasoning }), 'whatsapp']
  );
  
  return {
    success: true,
    consentId: result.rows[0].record_consent_event,
    waxId,
    status,
  };
}

export async function executeDeletionAction(pool, waxId, requesterId) {
  if (!waxId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(waxId)) {
    throw new Error('Invalid WaxID format');
  }
  
  const result = await pool.query(
    `SELECT * FROM queue_data_deletion($1, $2)`,
    [waxId, requesterId || 'student']
  );
  
  return {
    success: true,
    auditLogId: result.rows[0].queue_data_deletion,
    waxId,
  };
}

export async function executeExportAction(pool, waxId) {
  if (!waxId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(waxId)) {
    throw new Error('Invalid WaxID format');
  }
  
  const result = await pool.query(
    `SELECT * FROM export_student_data($1, 'json')`,
    [waxId]
  );
  
  return {
    success: true,
    exportId: result.rows[0].export_student_data.export_id,
    waxId,
    dataSizeBytes: result.rows[0].export_student_data.data_size_bytes,
  };
}

export default {
  buildPrivacyContext,
  validateIntent,
  validateAction,
  executeConsentAction,
  executeDeletionAction,
  executeExportAction,
};
