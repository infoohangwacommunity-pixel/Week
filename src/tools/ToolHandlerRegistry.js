/**
 * WaxPrep - Tool Handler Registry
 *
 * Maps canonical tool names (from ToolRegistry) to their executor functions.
 * Each handler accepts a single context object:
 *   { waxId, sessionId, aiRequestId, args, db, config, logger }
 *
 * `db` is the shared pg.Pool. `args` is the validated arguments object
 * (snake_case keys, matching ToolRegistry's input_schema).
 *
 * Returns whatever the handler returns — typically `{ success, ... }` for
 * structured tools, or `{ success: false, error }` on failure.
 *
 * Per AGENTS.md §20 (TOOLS): least privilege. Each handler is responsible
 * for student isolation (always filter by waxId in SQL).
 */

import { executeMemorySearch } from './tools/memorySearchTool.js';
import { executeMemoryRead } from './tools/memoryReadTool.js';
import { executeMemoryWrite } from './tools/memoryWriteTool.js';
import { executeKnowledgeQuery } from './tools/knowledgeQueryTool.js';
import { executeWebSearch } from './tools/webSearchTool.js';
import { executeDocumentFetch } from './tools/documentFetchTool.js';
import { executeGenerateQuestion } from './tools/generateQuestionTool.js';
import { executeRecordEvidence } from './tools/recordEvidenceTool.js';

/**
 * Tool handler dispatch table.
 *
 * The key is the `tool.name` (from ToolRegistry), the value is an object
 * `{ handler, requiresDb }` describing the handler function and whether it
 * needs the database pool injected.
 */
export const TOOL_HANDLERS = Object.freeze({
  memory_search:      { handler: executeMemorySearch,      requiresDb: true  },
  memory_read:        { handler: executeMemoryRead,        requiresDb: true  },
  memory_write:       { handler: executeMemoryWrite,       requiresDb: true  },
  knowledge_query:    { handler: executeKnowledgeQuery,    requiresDb: true  },
  web_search:         { handler: executeWebSearch,         requiresDb: true  },
  document_fetch:     { handler: executeDocumentFetch,     requiresDb: false },
  generate_question:  { handler: executeGenerateQuestion,  requiresDb: true  },
  record_evidence:    { handler: executeRecordEvidence,    requiresDb: true  },
});

/**
 * Look up a handler by tool name.
 * @param {string} toolName
 * @returns {{ handler: Function, requiresDb: boolean } | null}
 */
export function getToolHandler(toolName) {
  return TOOL_HANDLERS[toolName] ?? null;
}

export default {
  TOOL_HANDLERS,
  getToolHandler,
};
