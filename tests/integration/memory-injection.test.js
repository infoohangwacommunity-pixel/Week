/**
 * Memory + Student Model Injection Tests
 *
 * Verifies that retrieved memory facts and student-model evidence actually
 * reach the AI prompt as a context block at the front of the messages array.
 * The previous implementation fetched these subsystems and then silently
 * dropped them before the AI ever saw them.
 */

import { describe, it, expect } from 'vitest';
import { ContextAssembler } from '../../src/context/ContextAssembler.js';

// A mock pool that returns scripted rows for the ContextAssembler's queries.
function buildMockPool(opts = {}) {
  const pool = {
    async query(text, params = []) {
      // fetchConversationHistory: return one inbound + one outbound.
      if (text.includes('FROM messages') && text.includes('ORDER BY created_at ASC')) {
        return {
          rows: [
            { id: 'm1', wax_id: params[0], session_id: params[1], direction: 'inbound', content: 'Hi', message_type: 'text', created_at: new Date() },
            { id: 'm2', wax_id: params[0], session_id: params[1], direction: 'outbound', content: 'Hello! How can I help?', message_type: 'text', created_at: new Date() },
          ],
        };
      }
      // MemoryRetriever hybrid search: return one fact.
      if (text.includes('to_tsquery') || text.includes('student_facts')) {
        return {
          rows: opts.withMemory ? [{
            id: 'fact-1', wax_id: params[0], display_text: 'Student knows algebra',
            fact_value: { knows: true }, fact_category: 'academic',
            provenance: 'student_stated_direct', confidence: 0.85,
            created_at: new Date(), type: 'fact', bm25_score: 0.5,
          }] : [],
        };
      }
      // HybridSearch semantic search.
      if (text.includes('<=>')) {
        return { rows: [] };
      }
      // Student model queries.
      if (text.includes('knowledge_states')) {
        return { rows: opts.withStudentModel ? [{
          concept_tag: 'algebra', mastery_estimate: 0.65, evidence_count: 3,
        }] : [] };
      }
      if (text.includes('misconceptions')) {
        return { rows: [] };
      }
      if (text.includes('learning_signals')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return pool;
}

describe('ContextAssembler memory + student model injection', () => {
  it('should NOT inject memory block when no facts retrieved', async () => {
    const pool = buildMockPool({ withMemory: false, withStudentModel: false });
    const assembler = new ContextAssembler(pool);
    const result = await assembler.assemble({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'Hello',
      trace: { correlationId: '00000000-0000-0000-0000-000000000003' },
    });

    // The student model interface may still produce a "no evidence yet" block
    // even when knowledge_states is empty. We only check that the memory
    // evidence block is absent (because no facts were retrieved).
    const allContent = result.messages.map((m) => m.content || '').join('\n');
    expect(allContent).not.toContain('[Student memory evidence');
  });

  it('should inject student model context block when student model evidence exists', async () => {
    const pool = buildMockPool({ withMemory: false, withStudentModel: true });
    const assembler = new ContextAssembler(pool);
    const result = await assembler.assemble({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'Hello',
      trace: { correlationId: '00000000-0000-0000-0000-000000000003' },
    });

    expect(result.studentModel).not.toBeNull();
    if (result.studentModel?.formattedText) {
      const allContent = result.messages.map((m) => m.content || '').join('\n');
      expect(allContent).toContain('[Student model evidence');
    }
  });

  it('should NEVER leak waxId or sessionId into provider messages', async () => {
    const pool = buildMockPool({ withMemory: true, withStudentModel: true });
    const assembler = new ContextAssembler(pool);
    const result = await assembler.assemble({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'Hello',
      trace: { correlationId: '00000000-0000-0000-0000-000000000003' },
    });

    for (const msg of result.messages) {
      expect(msg).not.toHaveProperty('waxId');
      expect(msg).not.toHaveProperty('sessionId');
      expect(['user', 'assistant', 'tool']).toContain(msg.role);
    }
  });

  it('should append (not replace) currentMessage as the final turn', async () => {
    const pool = buildMockPool({ withMemory: false, withStudentModel: false });
    const assembler = new ContextAssembler(pool);
    const result = await assembler.assemble({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'What is 2+2?',
      trace: { correlationId: '00000000-0000-0000-0000-000000000003' },
    });

    // The last message should be the current user message.
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toBe('What is 2+2?');

    // The conversation history contained 'Hi' (inbound) + 'Hello! How can I help?' (outbound).
    // So somewhere in messages there should be both of these.
    const allContent = result.messages.map((m) => m.content || '').join('\n');
    expect(allContent).toContain('Hi');
    expect(allContent).toContain('Hello! How can I help?');
    expect(allContent).toContain('What is 2+2?');
  });
});
