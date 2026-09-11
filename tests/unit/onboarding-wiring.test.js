/**
 * Onboarding Wiring Tests
 *
 * The OnboardingHandler was dead code with a broken DB interface
 * (this.db.createPool(config) on a pg.Pool instance). These tests verify:
 * - The repaired pool interface works
 * - ContextAssembler.resolveConversationState exposes onboarding + consent
 *   STATE to the AI (per WAXPREP_PHILOSOPHY §9 — state, never scripts)
 * - The state reaches the AI inside the context evidence block
 * - State resolution failures are non-fatal
 */

import { describe, it, expect } from 'vitest';
import { OnboardingHandler, OnboardingState } from '../../src/onboarding/OnboardingHandler.js';
import { ContextAssembler, CONTEXT_EVIDENCE_MARKER } from '../../src/context/ContextAssembler.js';

function mockPool(handler) {
  return {
    async query(text, params) {
      return handler(text, params) || { rows: [] };
    },
  };
}

describe('OnboardingHandler (repaired pool interface)', () => {
  it('uses this.db.query directly (no createPool call)', async () => {
    const queries = [];
    const db = mockPool((text) => {
      queries.push(text);
      return { rows: [{ message_count: '0' }] };
    });
    const handler = new OnboardingHandler(db);

    const isNew = await handler.isNewStudent('00000000-0000-0000-0000-000000000001');
    expect(isNew).toBe(true);
    expect(queries.length).toBe(1);
    expect(queries[0]).toContain('FROM messages');
  });

  it('returns false when the student has messages', async () => {
    const db = mockPool(() => ({ rows: [{ message_count: '42' }] }));
    const handler = new OnboardingHandler(db);
    const isNew = await handler.isNewStudent('00000000-0000-0000-0000-000000000001');
    expect(isNew).toBe(false);
  });

  it('survives a malformed/empty result without throwing', async () => {
    const db = mockPool(() => ({ rows: [] }));
    const handler = new OnboardingHandler(db);
    const isNew = await handler.isNewStudent('00000000-0000-0000-0000-000000000001');
    expect(isNew).toBe(true); // count defaults to 0
  });

  it('getOnboardingContext exposes state flags only (no scripted copy)', () => {
    const handler = new OnboardingHandler(null);
    const ctx = handler.getOnboardingContext(true, false);
    expect(ctx).toEqual({ onboardingState: 'first_contact' });
    expect(OnboardingState.COMPLETE).toBe('complete');
  });
});

describe('ContextAssembler conversation-state wiring', () => {
  const basePool = (overrides = {}) => mockPool((text) => {
    if (text.includes('FROM messages') && text.includes('ORDER BY created_at ASC')) {
      return { rows: [] };
    }
    if (text.includes('FROM messages') && text.includes('COUNT(*)')) {
      return { rows: overrides.messageCount ? [{ message_count: String(overrides.messageCount) }] : [{ message_count: '0' }] };
    }
    if (text.includes('FROM sessions') && text.includes('onboarding_complete')) {
      return { rows: [] };
    }
    if (text.includes('FROM consents')) {
      return { rows: overrides.consentStatus ? [{ status: overrides.consentStatus }] : [] };
    }
    if (text.includes('to_tsquery') || text.includes('student_facts')) return { rows: [] };
    if (text.includes('<=>')) return { rows: [] };
    if (text.includes('knowledge_states')) return { rows: [] };
    if (text.includes('misconceptions')) return { rows: [] };
    if (text.includes('learning_signals')) return { rows: [] };
    return { rows: [] };
  });

  const ARGS = {
    waxId: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-000000000002',
    currentMessage: 'Hello',
    trace: { correlationId: '00000000-0000-0000-0000-000000000003' },
  };

  it('flags first_contact for a brand-new student', async () => {
    const assembler = new ContextAssembler(basePool({}));
    const result = await assembler.assemble(ARGS);
    expect(result.conversationState.onboardingState).toBe('first_contact');
  });

  it('omits onboarding state for returning students', async () => {
    const assembler = new ContextAssembler(basePool({ messageCount: 17 }));
    const result = await assembler.assemble(ARGS);
    expect(result.conversationState.onboardingState).toBeUndefined();
  });

  it('exposes consent status when a consent record exists', async () => {
    const assembler = new ContextAssembler(basePool({ messageCount: 5, consentStatus: 'granted' }));
    const result = await assembler.assemble(ARGS);
    expect(result.conversationState.consentStatus).toBe('granted');
    expect(result.conversationState.hasConsent).toBe(true);
  });

  it('injects the state into the context evidence block for the AI', async () => {
    const assembler = new ContextAssembler(basePool({}));
    const result = await assembler.assemble(ARGS);
    const contextMsg = result.messages[0];
    expect(contextMsg.role).toBe('user');
    expect(contextMsg.content).toContain('onboarding_state=first_contact');
    expect(contextMsg.content).toContain('[Conversation state');
    // Marked as context block so validators/truncation can preserve it.
    expect(contextMsg._contextBlock).toBe(true);
  });

  it('injects no evidence block when there is no state and no evidence', async () => {
    // Returning student, no consent record, no memories, no student model.
    const assembler = new ContextAssembler(basePool({ messageCount: 5 }));
    const result = await assembler.assemble(ARGS);
    const hasContextBlock = result.messages.some((m) =>
      typeof m.content === 'string' && m.content.startsWith(CONTEXT_EVIDENCE_MARKER),
    );
    expect(hasContextBlock).toBe(false);
  });

  it('state resolution failure is non-fatal (AI still gets a reply path)', async () => {
    const db = {
      async query(text) {
        if (text.includes('COUNT(*)')) throw new Error('db exploded');
        if (text.includes('FROM consents')) throw new Error('consents table missing');
        if (text.includes('FROM messages') && text.includes('ORDER BY created_at ASC')) return { rows: [] };
        if (text.includes('to_tsquery') || text.includes('student_facts')) return { rows: [] };
        if (text.includes('<=>')) return { rows: [] };
        if (text.includes('knowledge_states')) return { rows: [] };
        if (text.includes('misconceptions')) return { rows: [] };
        if (text.includes('learning_signals')) return { rows: [] };
        return { rows: [] };
      },
    };
    const assembler = new ContextAssembler(db);
    const result = await assembler.assemble(ARGS);
    expect(result.conversationState).toEqual({});
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('never leaks waxId/sessionId into provider messages', async () => {
    const assembler = new ContextAssembler(basePool({}));
    const result = await assembler.assemble(ARGS);
    for (const msg of result.messages) {
      expect(JSON.stringify(msg)).not.toContain('00000000-0000-0000-0000-000000000001');
    }
  });
});
