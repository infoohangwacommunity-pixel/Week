/**
 * Message Burst Handling Tests
 *
 * When a student sends several messages in a burst, the debounce window
 * collapses them into ONE AI job for the LAST message. These tests pin the
 * burst-correctness contract:
 * - fetchConversationHistory includes 'received' inbound messages (the burst
 *   predecessors) so the AI sees everything the student said
 * - fetchConversationHistory excludes 'processing' (the current message, which
 *   is passed explicitly) and 'failed'
 * - the worker's burst-absorption UPDATE is registered on the production path
 */

import { describe, it, expect } from 'vitest';
import { ContextAssembler } from '../../src/context/ContextAssembler.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockPool(rows) {
  return {
    async query() {
      return { rows };
    },
  };
}

describe('ContextAssembler.fetchConversationHistory burst correctness', () => {
  const ARGS = {
    waxId: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-000000000002',
    currentMessage: 'help me with algebra',
    trace: {},
  };

  it('includes received inbound messages (burst predecessors) in history', async () => {
    const db = mockPool([
      { id: 'm1', direction: 'inbound', content: 'Hi', processing_status: 'received', created_at: new Date() },
      { id: 'm2', direction: 'inbound', content: 'I am preparing for JAMB', processing_status: 'received', created_at: new Date() },
      { id: 'm3', direction: 'outbound', content: 'Great, let us start.', processing_status: 'sent', created_at: new Date() },
    ]);
    const assembler = new ContextAssembler(db);
    const result = await assembler.assemble(ARGS);

    const contents = result.messages.map((m) => m.content);
    // Every burst message must reach the AI.
    expect(contents).toContain('Hi');
    expect(contents).toContain('I am preparing for JAMB');
    // The last burst message is the explicit current turn.
    expect(contents[contents.length - 1]).toBe('help me with algebra');
  });

  it('the history SQL excludes processing + failed inbound and failed outbound', () => {
    const source = readFileSync(
      join(__dirname, '../../src/context/ContextAssembler.js'),
      'utf-8'
    );
    expect(source).toContain("processing_status NOT IN ('failed', 'processing')");
    // The old filter dropped 'received' burst messages entirely.
    expect(source).not.toContain("NOT IN ('failed', 'received')");
  });

  it('the worker absorbs burst predecessors into completed after success', () => {
    const source = readFileSync(
      join(__dirname, '../../src/workers/setup.js'),
      'utf-8'
    );
    expect(source).toContain('Absorb burst predecessors');
    expect(source).toContain("AND processing_status = 'received'");
    expect(source).toContain('AND external_id <> $3');
  });
});
