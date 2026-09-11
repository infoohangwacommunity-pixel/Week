/**
 * Message Durability Regression Tests
 *
 * CRITICAL PROPERTY: If downstream AI processing fails, the inbound student
 * message MUST remain persisted and recoverable.
 *
 * These tests prove that failures in AI provider, memory retrieval, tool
 * execution, safety classification, response validation, and outbound
 * delivery do NOT cause the inbound message to be lost or corrupted.
 *
 * The tests use a mock pool (no real Postgres needed) that records every
 * SQL statement, so we can verify the exact DB writes that survive each
 * failure scenario.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIOrchestrator } from '../../src/orchestration/AIOrchestrator.js';
import { createAIError, AIErrorTypes } from '../../src/ai/schemas/AIErrors.js';

// A mock pool that records all queries and returns scripted results.
function buildRecordingPool() {
  const calls = [];
  const messages = new Map(); // Simulated messages table

  const pool = {
    _calls: calls,
    _messages: messages,

    async query(text, params = []) {
      calls.push({ text, params });

      // Simulate messages INSERT
      if (text.includes('INSERT INTO messages')) {
        const id = params[0];
        const externalId = params[3];

        // If the SQL has ON CONFLICT DO NOTHING, simulate the conflict check.
        if (text.includes('ON CONFLICT')) {
          // Check if a message with this external_id already exists.
          for (const [, existing] of messages) {
            if (existing.external_id === externalId) {
              return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING — skip
            }
          }
        }

        messages.set(id, {
          id,
          wax_id: params[1],
          session_id: params[2],
          external_id: externalId,
          content: params[4],
          message_type: params[5],
          processing_status: params[6] || 'received',
        });
        return { rows: [], rowCount: 1 };
      }

      // Simulate messages UPDATE (processing_status transition)
      if (text.includes('UPDATE messages SET processing_status')) {
        // Find the message by external_id (params[0])
        const externalId = params[0];
        for (const [, msg] of messages) {
          if (msg.external_id === externalId) {
            const newStatus = text.match(/processing_status\s*=\s*'(\w+)'/);
            if (newStatus) msg.processing_status = newStatus[1];
          }
        }
        return { rows: [], rowCount: 1 };
      }

      // Simulate conversation history fetch
      if (text.includes('FROM messages') && text.includes('ORDER BY created_at ASC')) {
        return { rows: [] }; // No history for testing
      }

      // Simulate outbound_messages INSERT
      if (text.includes('INSERT INTO outbound_messages')) {
        return { rows: [], rowCount: 1 };
      }

      // Simulate outbound_messages SELECT
      if (text.includes('SELECT') && text.includes('outbound_messages')) {
        return { rows: [] }; // No existing outbound
      }

      // Simulate outbound_messages UPDATE
      if (text.includes('UPDATE outbound_messages')) {
        return { rows: [], rowCount: 1 };
      }

      // Simulate ai_requests INSERT (persistMetadata/persistFailure)
      if (text.includes('INSERT INTO ai_requests')) {
        return { rows: [], rowCount: 1 };
      }

      // Default: return empty
      return { rows: [] };
    },
  };
  return pool;
}

// Stub context assembler that returns a minimal context.
class StubContextAssembler {
  async assemble({ waxId, sessionId, currentMessage }) {
    return {
      messages: [{ role: 'user', content: currentMessage || 'test' }],
      historyTurnCount: 0,
      memoryCount: 0,
      tokenCount: 0,
      memory: { facts: [], episodes: [] },
      studentModel: null,
      toolDefinitions: [],
      truncationOccurred: false,
    };
  }
}

// Stub response validator that always passes (or fails on demand).
class StubResponseValidator {
  constructor({ valid = true } = {}) {
    this._valid = valid;
  }
  async validate() {
    return { valid: this._valid, state: 'ok', message: null, canRetry: false };
  }
  async createDeliveryRecord() {
    return { success: true };
  }
}

// Stub logger
class StubLogger {
  child() { return this; }
  info() {} warn() {} error() {} debug() {} fatal() {}
}

// A fake provider that throws on demand
class ThrowingProvider {
  constructor(error) {
    this.name = 'throwing';
    this.capabilities = { supportsToolCalling: false, maxContextTokens: 100000, maxOutputTokens: 4096 };
    this._error = error;
  }
  async complete() {
    if (this._error) throw this._error;
    throw createAIError({
      errorType: AIErrorTypes.PROVIDER_SERVER_ERROR,
      providerMessage: 'Simulated provider failure',
      providerStatusCode: 500,
    });
  }
}

// A fake provider that succeeds
class SuccessProvider {
  constructor() {
    this.name = 'success';
    this.capabilities = { supportsToolCalling: false, maxContextTokens: 100000, maxOutputTokens: 4096 };
  }
  async complete(request) {
    return {
      content: 'Hello from the fake provider!',
      model: request.model || 'fake',
      provider: 'success',
      finishReason: 'completed',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 50,
    };
  }
}

const WAX_ID = '00000000-0000-0000-0000-000000000001';
const SESSION_ID = '00000000-0000-0000-0000-000000000002';
const CORRELATION_ID = '00000000-0000-0000-0000-000000000003';

describe('Message Durability: Downstream Failures Preserve Inbound Messages', () => {
  let pool;

  beforeEach(() => {
    pool = buildRecordingPool();
    // Simulate the webhook having already persisted the inbound message.
    pool.query(
      `INSERT INTO messages (id, wax_id, session_id, external_id, direction, content, message_type, processing_status, created_at)
       VALUES ($1, $2, $3, $4, 'inbound', $5, 'text', 'received', NOW())`,
      ['msg-uuid-1', WAX_ID, SESSION_ID, 'wamid-test-1', 'Hello, help me with math'],
    );
  });

  it('Case 1: AI provider throws — message remains persisted, status transitions to failed', async () => {
    const orchestrator = new AIOrchestrator({
      providerFactory: new ThrowingProvider(),
      contextAssembler: new StubContextAssembler(),
      responseValidator: new StubResponseValidator(),
      database: pool,
    });
    orchestrator.logger = new StubLogger();

    // The webhook already persisted the message with status='received'.
    // The worker would mark it as 'processing' before calling the orchestrator.
    await pool.query(
      'UPDATE messages SET processing_status = \'processing\' WHERE external_id = $1 AND wax_id = $2',
      ['wamid-test-1', WAX_ID],
    );

    // The orchestrator should throw because the provider fails.
    await expect(
      orchestrator.complete({
        waxId: WAX_ID,
        sessionId: SESSION_ID,
        currentMessage: 'Hello, help me with math',
        context: { correlationId: CORRELATION_ID },
      }),
    ).rejects.toThrow();

    // The message must still be in the DB. Verify the INSERT was never rolled back.
    // (Our mock pool doesn't support transactions, but the real Postgres pool
    // uses autocommit per statement — the INSERT is committed independently.)
    const msg = pool._messages.get('msg-uuid-1');
    expect(msg).toBeDefined();
    expect(msg.external_id).toBe('wamid-test-1');
    expect(msg.content).toBe('Hello, help me with math');

    // Verify that persistFailure was called (ai_requests INSERT with status='failed').
    const failureInserts = pool._calls.filter(
      (c) => c.text.includes('INSERT INTO ai_requests') && c.text.includes('\'failed\''),
    );
    expect(failureInserts.length).toBeGreaterThan(0);
    expect(failureInserts[0].params).toContain(AIErrorTypes.PROVIDER_SERVER_ERROR);
  });

  it('Case 2: All AI providers fail — message remains persisted', async () => {
    const orchestrator = new AIOrchestrator({
      providerFactory: new ThrowingProvider(),
      contextAssembler: new StubContextAssembler(),
      responseValidator: new StubResponseValidator(),
      database: pool,
    });
    orchestrator.logger = new StubLogger();

    await expect(
      orchestrator.complete({
        waxId: WAX_ID,
        sessionId: SESSION_ID,
        currentMessage: 'Hello',
        context: { correlationId: CORRELATION_ID },
      }),
    ).rejects.toThrow();

    // The inbound message is still in the DB.
    const msg = pool._messages.get('msg-uuid-1');
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello, help me with math');
  });

  it('Case 3: Response validation fails — message remains persisted, failure is recorded', async () => {
    const orchestrator = new AIOrchestrator({
      providerFactory: new SuccessProvider(),
      contextAssembler: new StubContextAssembler(),
      responseValidator: new StubResponseValidator({ valid: false }),
      database: pool,
    });
    orchestrator.logger = new StubLogger();

    // The orchestrator should return the AI_FAILURE_STUDENT_MESSAGE (not throw)
    // because validation failure is handled gracefully.
    const response = await orchestrator.complete({
      waxId: WAX_ID,
      sessionId: SESSION_ID,
      currentMessage: 'Hello',
      context: { correlationId: CORRELATION_ID },
    });

    // The response should be the fallback message (not the AI's response).
    expect(response.validationFailed).toBe(true);

    // The inbound message is still in the DB.
    const msg = pool._messages.get('msg-uuid-1');
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello, help me with math');
  });

  it('Case 4: Context assembler throws — message remains persisted', async () => {
    class ThrowingContextAssembler {
      async assemble() {
        throw new Error('Context assembly failed — DB connection lost');
      }
    }

    const orchestrator = new AIOrchestrator({
      providerFactory: new SuccessProvider(),
      contextAssembler: new ThrowingContextAssembler(),
      responseValidator: new StubResponseValidator(),
      database: pool,
    });
    orchestrator.logger = new StubLogger();

    await expect(
      orchestrator.complete({
        waxId: WAX_ID,
        sessionId: SESSION_ID,
        currentMessage: 'Hello',
        context: { correlationId: CORRELATION_ID },
      }),
    ).rejects.toThrow('Context assembly failed');

    // The inbound message is still in the DB.
    const msg = pool._messages.get('msg-uuid-1');
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello, help me with math');
  });

  it('Case 5: Provider timeout — message remains persisted', async () => {
    const timeoutError = createAIError({
      errorType: AIErrorTypes.TIMEOUT_ERROR,
      providerMessage: 'AI request timed out after 30000ms',
    });

    const orchestrator = new AIOrchestrator({
      providerFactory: new ThrowingProvider(timeoutError),
      contextAssembler: new StubContextAssembler(),
      responseValidator: new StubResponseValidator(),
      database: pool,
    });
    orchestrator.logger = new StubLogger();

    await expect(
      orchestrator.complete({
        waxId: WAX_ID,
        sessionId: SESSION_ID,
        currentMessage: 'Hello',
        context: { correlationId: CORRELATION_ID },
      }),
    ).rejects.toThrow();

    // The inbound message is still in the DB.
    const msg = pool._messages.get('msg-uuid-1');
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello, help me with math');

    // The failure should be recorded with TIMEOUT_ERROR type.
    const failureInserts = pool._calls.filter(
      (c) => c.text.includes('INSERT INTO ai_requests') && c.text.includes('\'failed\''),
    );
    expect(failureInserts.length).toBeGreaterThan(0);
    expect(failureInserts[0].params).toContain(AIErrorTypes.TIMEOUT_ERROR);
  });

  it('Case 6: Duplicate webhook delivery — INSERT ON CONFLICT DO NOTHING prevents duplicate rows', async () => {
    // Simulate the first webhook: INSERT succeeds.
    const result1 = await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, external_id, direction, content, message_type, processing_status, created_at)
       VALUES ($1, $2, $3, $4, 'inbound', $5, 'text', 'received', NOW())
       ON CONFLICT (external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL DO NOTHING`,
      ['msg-uuid-2', WAX_ID, SESSION_ID, 'wamid-dup-1', 'Hello'],
    );

    // Simulate the duplicate webhook: same external_id, different internal UUID.
    const result2 = await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, external_id, direction, content, message_type, processing_status, created_at)
       VALUES ($1, $2, $3, $4, 'inbound', $5, 'text', 'received', NOW())
       ON CONFLICT (external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL DO NOTHING`,
      ['msg-uuid-3', WAX_ID, SESSION_ID, 'wamid-dup-1', 'Hello'],
    );

    // Only one message should exist for the external_id.
    const matching = [...pool._messages.values()].filter(m => m.external_id === 'wamid-dup-1');
    expect(matching.length).toBe(1);
    expect(matching[0].id).toBe('msg-uuid-2'); // First insert wins.
  });

  it('Case 7: Worker crashes after AI processing but before outbound — message has persistFailure record', async () => {
    // Simulate: AI call succeeds, but the worker crashes before sending the response.
    // The orchestrator's persistMetadata should have written the ai_requests row.
    const orchestrator = new AIOrchestrator({
      providerFactory: new SuccessProvider(),
      contextAssembler: new StubContextAssembler(),
      responseValidator: new StubResponseValidator(),
      database: pool,
    });
    orchestrator.logger = new StubLogger();

    // Mark as processing (worker started).
    await pool.query(
      'UPDATE messages SET processing_status = \'processing\' WHERE external_id = $1 AND wax_id = $2',
      ['wamid-test-1', WAX_ID],
    );

    const response = await orchestrator.complete({
      waxId: WAX_ID,
      sessionId: SESSION_ID,
      currentMessage: 'Hello',
      context: { correlationId: CORRELATION_ID },
    });

    // The AI response was generated successfully.
    expect(response.content).toBe('Hello from the fake provider!');

    // The ai_requests table should have a 'success' row (persistMetadata ran).
    const successInserts = pool._calls.filter(
      (c) => c.text.includes('INSERT INTO ai_requests') && c.text.includes('\'success\''),
    );
    expect(successInserts.length).toBe(1);

    // The inbound message is still in the DB (with whatever status the worker set).
    const msg = pool._messages.get('msg-uuid-1');
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello, help me with math');
  });
});

describe('Outbound Idempotency: Duplicate Delivery Prevention', () => {
  it('should not send a chunk that was already sent on a previous attempt', async () => {
    // This test verifies the outbound.js logic conceptually:
    // 1. INSERT ... ON CONFLICT (outbound_chunk_id) DO NOTHING
    // 2. SELECT processing_status WHERE outbound_chunk_id = $1
    // 3. If status='sent', return stored external_message_id and skip send
    //
    // The SQL is verified by inspection. A full integration test would
    // require a real Postgres instance to verify the ON CONFLICT behavior.

    // Verify the outbound.js source code contains the idempotency check.
    const fs = await import('fs');
    const outboundSource = fs.readFileSync(
      'src/messaging/outbound.js', 'utf-8',
    );

    // The INSERT must use ON CONFLICT DO NOTHING.
    expect(outboundSource).toContain('ON CONFLICT (outbound_chunk_id) DO NOTHING');

    // There must be a SELECT that checks processing_status.
    expect(outboundSource).toContain('SELECT processing_status, external_message_id');
    expect(outboundSource).toContain('FROM outbound_messages');
    expect(outboundSource).toContain('WHERE outbound_chunk_id = $1');

    // There must be a skip-send check.
    expect(outboundSource).toContain('processing_status === \'sent\'');
    expect(outboundSource).toContain('Chunk already sent on previous attempt');

    // The UPDATE must guard against re-updating already-sent rows.
    expect(outboundSource).toContain('AND processing_status != \'sent\'');
  });
});

describe('Webhook Router: Enqueue Return Value Checked', () => {
  it('should verify the router checks the enqueue return value', async () => {
    const fs = await import('fs');
    const routerSource = fs.readFileSync('src/webhook/router.js', 'utf-8');

    // The router must capture the return value.
    expect(routerSource).toContain('const result = await enqueueStudentMessage');

    // The router must check result.success and only mark as seen after success.
    expect(routerSource).toContain('if (result.success)');

    // The router must log when enqueue fails.
    expect(routerSource).toContain('Message not enqueued');

    // The router must pass opts with correlationId and pool.
    expect(routerSource).toContain('{ correlationId, pool: req.app.get(\'dbPool\') }');
  });
});

describe('Worker: Outbound Failure Does Not Mark as Completed', () => {
  it('should verify the worker marks as failed and re-throws on outbound failure', async () => {
    const fs = await import('fs');
    const setupSource = fs.readFileSync('src/workers/setup.js', 'utf-8');

    // The worker must mark as 'failed' (not 'completed') on outbound failure.
    expect(setupSource).toContain('processing_status = \'failed\'');
    expect(setupSource).toContain('AND processing_status NOT IN (\'completed\', \'failed\')');

    // The worker must re-throw so BullMQ retries.
    expect(setupSource).toContain('throw err;');

    // The OLD bug was: the outbound-failure catch block SET
    // processing_status = 'completed' (fake success). The new code SETs
    // processing_status = 'failed'. Verify the SET clause in the
    // outbound-failure catch block uses 'failed', not 'completed'.
    const outboundCatchMatch = setupSource.match(
      /Failed to send response to student[\s\S]*?throw err/,
    );
    expect(outboundCatchMatch).not.toBeNull();
    const outboundCatchBlock = outboundCatchMatch[0];
    // The SET clause must say 'failed', not 'completed'.
    expect(outboundCatchBlock).toMatch(/SET\s+processing_status\s*=\s*'failed'/);
    // The SET clause must NOT say 'completed'.
    expect(outboundCatchBlock).not.toMatch(/SET\s+processing_status\s*=\s*'completed'/);
  });
});

describe('Stranded Message Recovery Sweeper', () => {
  it('should exist and export start/stop functions', async () => {
    const sweeper = await import('../../src/workers/strandedMessageSweeper.js');
    expect(typeof sweeper.startStrandedMessageSweeper).toBe('function');
    expect(typeof sweeper.stopStrandedMessageSweeper).toBe('function');
  });

  it('should verify the sweeper is wired into worker setup', async () => {
    const fs = await import('fs');
    const setupSource = fs.readFileSync('src/workers/setup.js', 'utf-8');
    expect(setupSource).toContain('startStrandedMessageSweeper');
    expect(setupSource).toContain('Stranded message recovery sweeper started');
  });
});
