/**
 * Tool Registry - Phase G Stage 35
 * 
 * Static tool registry loaded at startup. Defines all available tools with
 * their schemas, permissions, and execution limits.
 * 
 * The registry is immutable at runtime to prevent tool poisoning attacks.
 */

import config from '../config/index.js';

/**
 * Tool permission categories
 */
export const ToolPermission = {
  STUDENT_READ: 'STUDENT_READ',
  STUDENT_WRITE: 'STUDENT_WRITE',
  RETRIEVAL: 'RETRIEVAL',
  ASSESSMENT: 'ASSESSMENT',
  INTERNAL: 'INTERNAL',
};

/**
 * Complete tool registry definition
 */
const TOOL_REGISTRY = [
  // Category A: Memory Tools (STUDENT_READ)
  {
    name: 'memory_search',
    description: 'Search the student\'s long-term memory for relevant information, facts, and learning observations.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 3,
          maxLength: 500,
          description: 'The search query in natural language',
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: 'Maximum number of results to return (1-5)',
        },
        fact_categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter for fact categories',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: { type: 'object' },
        },
        total_found: { type: 'integer' },
        query_latency_ms: { type: 'integer' },
      },
    },
    handler: 'memorySearchHandler',
    permission_level: ToolPermission.STUDENT_READ,
    execution_limits: {
      timeout_ms: 5000,
      max_arguments_size_bytes: 2048,
      max_calls_per_session: config.TOOL_MEMORY_SEARCH_MAX_PER_SESSION,
    },
    requires_student_context: true,
    audit_required: true,
  },
  {
    name: 'memory_read',
    description: 'Read a specific memory entry by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          format: 'uuid',
          description: 'The UUID of the memory to read',
        },
      },
      required: ['memory_id'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        fact: { type: 'object' },
        episode: { type: 'object' },
        not_found: { type: 'boolean' },
      },
    },
    handler: 'memoryReadHandler',
    permission_level: ToolPermission.STUDENT_READ,
    execution_limits: {
      timeout_ms: 2000,
      max_arguments_size_bytes: 128,
      max_calls_per_session: 10,
    },
    requires_student_context: true,
    audit_required: true,
  },
  {
    name: 'knowledge_query',
    description: 'Query the student model for evidence about a specific concept (mastery estimates, misconceptions, learning signals).',
    input_schema: {
      type: 'object',
      properties: {
        concept_tag: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'The canonical concept tag to query',
        },
        include_misconceptions: {
          type: 'boolean',
          default: true,
        },
        include_learning_signals: {
          type: 'boolean',
          default: true,
        },
      },
      required: ['concept_tag'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        mastery_estimate: { type: 'number', minimum: 0, maximum: 1 },
        evidence_count: { type: 'integer' },
        misconceptions: { type: 'array', items: { type: 'object' } },
        learning_signals: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: 'knowledgeQueryHandler',
    permission_level: ToolPermission.STUDENT_READ,
    execution_limits: {
      timeout_ms: 3000,
      max_arguments_size_bytes: 512,
      max_calls_per_session: 10,
    },
    requires_student_context: true,
    audit_required: true,
  },

  // Category B: Memory Write Tools (STUDENT_WRITE)
  {
    name: 'memory_write',
    description: 'Write a new learning observation or fact to the student\'s long-term memory.',
    input_schema: {
      type: 'object',
      properties: {
        fact_category: {
          type: 'string',
          enum: [
            'profile',
            'academic',
            'preference',
            'misconception',
            'progress',
            'behavioral',
          ],
          description: 'The category of fact being written',
        },
        fact_key: {
          type: 'string',
          maxLength: 100,
          pattern: '^[a-z][a-z0-9_]*$',
          description: 'Unique identifier for this fact (snake_case)',
        },
        fact_value: {
          type: ['object', 'string', 'number', 'boolean'],
          description: 'The fact value (structured data, not instructions)',
        },
        display_text: {
          type: 'string',
          maxLength: 500,
          description: 'Human-readable display text for the fact',
        },
        provenance: {
          type: 'string',
          enum: [
            'student_stated_direct',
            'student_stated_indirect',
            'ai_inferred_from_behavior',
            'ai_inferred_from_error',
            'episode_extracted',
          ],
          description: 'How this fact was discovered',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence score (0.0-1.0)',
        },
        concept_tag: {
          type: 'string',
          maxLength: 100,
          description: 'Optional concept tag this fact relates to',
        },
      },
      required: [
        'fact_category',
        'fact_key',
        'fact_value',
        'display_text',
        'provenance',
        'confidence',
      ],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        fact_id: { type: 'string', format: 'uuid' },
        validation_errors: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: 'memoryWriteHandler',
    permission_level: ToolPermission.STUDENT_WRITE,
    execution_limits: {
      timeout_ms: 3000,
      max_arguments_size_bytes: 4096,
      max_calls_per_session: config.TOOL_MEMORY_WRITE_MAX_PER_SESSION,
    },
    requires_student_context: true,
    audit_required: true,
  },

  // Category C: Retrieval Tools
  {
    name: 'web_search',
    description: 'Search the web for educational content. Results are sanitized to prevent prompt injection attacks.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 3,
          maxLength: 200,
          description: 'The search query',
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
          default: 3,
          description: 'Maximum results to return (1-3)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              domain: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              source_tier: { type: 'integer' },
              was_sanitized: { type: 'boolean' },
            },
          },
        },
        total_found: { type: 'integer' },
        query_latency_ms: { type: 'integer' },
      },
    },
    handler: 'webSearchHandler',
    permission_level: ToolPermission.RETRIEVAL,
    execution_limits: {
      timeout_ms: config.WEB_SEARCH_TIMEOUT_MS,
      max_arguments_size_bytes: 1024,
      max_calls_per_session: config.TOOL_WEB_SEARCH_MAX_PER_SESSION,
    },
    requires_student_context: true,
    audit_required: true,
  },
  {
    name: 'document_fetch',
    description: 'Fetch content from an approved educational URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'The URL to fetch (must be in approved domain list)',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        content: { type: 'string' },
        content_length: { type: 'integer' },
        domain: { type: 'string' },
        approved: { type: 'boolean' },
      },
    },
    handler: 'documentFetchHandler',
    permission_level: ToolPermission.RETRIEVAL,
    execution_limits: {
      timeout_ms: 10000,
      max_arguments_size_bytes: 512,
      max_calls_per_session: 5,
    },
    requires_student_context: true,
    audit_required: true,
  },

  // Category D: Assessment Tools
  {
    name: 'generate_question',
    description: 'Generate a formative assessment question for a specific concept.',
    input_schema: {
      type: 'object',
      properties: {
        concept_tag: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'The concept to assess',
        },
        difficulty: {
          type: 'string',
          enum: ['easy', 'medium', 'hard'],
          default: 'medium',
        },
        format: {
          type: 'string',
          enum: ['multiple_choice', 'short_answer', 'open_ended'],
          default: 'multiple_choice',
        },
        targeted_misconception: {
          type: 'string',
          maxLength: 200,
          description: 'Optional: specific misconception to assess',
        },
      },
      required: ['concept_tag', 'format'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        question_id: { type: 'string', format: 'uuid' },
        question_text: { type: 'string' },
        question_type: { type: 'string' },
        difficulty: { type: 'string' },
        correct_answer: { type: 'object' },
        grading_rubric: { type: 'object' },
        concept_tag: { type: 'string' },
      },
    },
    handler: 'generateQuestionHandler',
    permission_level: ToolPermission.ASSESSMENT,
    execution_limits: {
      timeout_ms: 10000,
      max_arguments_size_bytes: 2048,
      max_calls_per_session: config.TOOL_ASSESSMENT_GENERATE_MAX_PER_SESSION,
    },
    requires_student_context: true,
    audit_required: true,
  },
  {
    name: 'record_evidence',
    description: 'Record a learning observation/evidence for a concept.',
    input_schema: {
      type: 'object',
      properties: {
        concept_tag: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        evidence_type: {
          type: 'string',
          enum: [
            'direct_response',
            'explanation_attempt',
            'correction_response',
            'hint_request',
            'self_reported',
            'error_commission',
            'concept_mention',
            'self_explanation',
          ],
        },
        correctness: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          nullable: true,
        },
        hint_level: {
          type: 'integer',
          minimum: 0,
          default: 0,
        },
        notes: {
          type: 'string',
          maxLength: 1000,
        },
      },
      required: ['concept_tag', 'evidence_type'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        evidence_id: { type: 'string', format: 'uuid' },
        concept_tag: { type: 'string' },
      },
    },
    handler: 'recordEvidenceHandler',
    permission_level: ToolPermission.ASSESSMENT,
    execution_limits: {
      timeout_ms: 2000,
      max_arguments_size_bytes: 2048,
      max_calls_per_session: 20,
    },
    requires_student_context: true,
    audit_required: true,
  },

  // Category E: Internal Tools (not exposed to AI)
  {
    name: 'get_session_context',
    description: 'INTERNAL: Retrieve current session summary and context.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        session_summary: { type: 'string' },
        recent_topics: { type: 'array', items: { type: 'string' } },
        turn_count: { type: 'integer' },
      },
    },
    handler: 'getSessionContextHandler',
    permission_level: ToolPermission.INTERNAL,
    execution_limits: {
      timeout_ms: 1000,
      max_arguments_size_bytes: 0,
      max_calls_per_session: null,
    },
    requires_student_context: true,
    audit_required: false,
  },
  {
    name: 'update_learning_signal',
    description: 'INTERNAL: Record a behavioral learning signal.',
    input_schema: {
      type: 'object',
      properties: {
        signal_type: {
          type: 'string',
          enum: [
            'session_engagement',
            'hint_dependency_session',
            'response_latency_trend',
            'concept_revisit',
            'self_efficacy',
            'frustration_signal',
          ],
        },
        signal_value: { type: 'number' },
        signal_text: { type: 'string' },
      },
      required: ['signal_type'],
      additionalProperties: false,
    },
    output_contract: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        signal_id: { type: 'string', format: 'uuid' },
      },
    },
    handler: 'updateLearningSignalHandler',
    permission_level: ToolPermission.INTERNAL,
    execution_limits: {
      timeout_ms: 1000,
      max_arguments_size_bytes: 1024,
      max_calls_per_session: null,
    },
    requires_student_context: true,
    audit_required: true,
  },
];

// Build lookup maps for performance
const toolByName = new Map();
const toolsByPermission = new Map();
const toolsByCategory = new Map();

for (const tool of TOOL_REGISTRY) {
  toolByName.set(tool.name, tool);
  
  if (!toolsByPermission.has(tool.permission_level)) {
    toolsByPermission.set(tool.permission_level, []);
  }
  toolsByPermission.get(tool.permission_level).push(tool);
  
  if (!toolsByCategory.has(tool.name)) {
    toolsByCategory.set(tool.name, []);
  }
  toolsByCategory.get(tool.name).push(tool);
}

/**
 * Get a tool by name
 * @param {string} name - Tool name
 * @returns {object|null} Tool definition or null if not found
 */
export function getToolByName(name) {
  return toolByName.get(name) || null;
}

/**
 * Get all tools with a specific permission level
 * @param {string} permission - Permission level
 * @returns {Array} Array of tool definitions
 */
export function getToolsByPermission(permission) {
  return toolsByPermission.get(permission) || [];
}

/**
 * Get all tools in a category
 * @param {string} category - Tool category
 * @returns {Array} Array of tool definitions
 */
export function getToolsByCategory(category) {
  return TOOL_REGISTRY.filter(t => t.permission_level === category);
}

/**
 * Validate that a tool name is known
 * @param {string} name - Tool name to validate
 * @returns {boolean} True if tool is known
 */
export function isToolKnown(name) {
  return toolByName.has(name);
}

/**
 * Get all registered tool names
 * @returns {Array} Array of tool names
 */
export function getAllToolNames() {
  return Array.from(toolByName.keys());
}

/**
 * Get the complete tool registry
 * @returns {Array} Complete tool registry
 */
export function getToolRegistry() {
  return [...TOOL_REGISTRY];
}

/**
 * Validate tool arguments against the tool's input schema
 * @param {string} toolName - Name of the tool
 * @param {object} arguments - Arguments to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateToolArguments(toolName, toolArguments) {
  const tool = getToolByName(toolName);
  if (!tool) {
    return { valid: false, errors: ['Unknown tool'] };
  }
  
  const schema = tool.input_schema;
  const errors = [];
  
  // Check required fields
  if (schema.required) {
    for (const requiredField of schema.required) {
      if (!(requiredField in toolArguments)) {
        errors.push(`Missing required field: ${requiredField}`);
      }
    }
  }
  
  // Check additional properties
  if (schema.additionalProperties === false) {
    const allowedProps = Object.keys(schema.properties || {});
    for (const argKey of Object.keys(toolArguments)) {
      if (!allowedProps.includes(argKey)) {
        errors.push(`Additional property not allowed: ${argKey}`);
      }
    }
  }
  
  // Validate field types and constraints
  if (schema.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (fieldName in toolArguments) {
        const value = arguments[fieldName];
        const fieldErrors = validateFieldValue(fieldName, value, fieldSchema);
        errors.push(...fieldErrors);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a single field value against its schema
 * @private
 */
function validateFieldValue(fieldName, value, fieldSchema) {
  const errors = [];
  
  if (fieldSchema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${fieldName} must be a string`);
    } else {
      if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
        errors.push(`${fieldName} must be at least ${fieldSchema.minLength} characters`);
      }
      if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
        errors.push(`${fieldName} must be at most ${fieldSchema.maxLength} characters`);
      }
      if (fieldSchema.pattern) {
        const pattern = new RegExp(fieldSchema.pattern);
        if (!pattern.test(value)) {
          errors.push(`${fieldName} does not match required pattern`);
        }
      }
    }
  } else if (fieldSchema.type === 'integer') {
    if (!Number.isInteger(value)) {
      errors.push(`${fieldName} must be an integer`);
    } else {
      if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
        errors.push(`${fieldName} must be at least ${fieldSchema.minimum}`);
      }
      if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
        errors.push(`${fieldName} must be at most ${fieldSchema.maximum}`);
      }
    }
  } else if (fieldSchema.type === 'number') {
    if (typeof value !== 'number') {
      errors.push(`${fieldName} must be a number`);
    } else {
      if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
        errors.push(`${fieldName} must be at least ${fieldSchema.minimum}`);
      }
      if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
        errors.push(`${fieldName} must be at most ${fieldSchema.maximum}`);
      }
    }
  } else if (fieldSchema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`${fieldName} must be a boolean`);
    }
  } else if (fieldSchema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${fieldName} must be an array`);
    }
  } else if (fieldSchema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${fieldName} must be an object`);
    }
  }
  
  // Check enum values
  if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
    errors.push(`${fieldName} must be one of: ${fieldSchema.enum.join(', ')}`);
  }
  
  // Check format
  if (fieldSchema.format === 'uuid') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      errors.push(`${fieldName} must be a valid UUID`);
    }
  } else if (fieldSchema.format === 'uri') {
    try {
      new URL(value);
    } catch {
      errors.push(`${fieldName} must be a valid URI`);
    }
  }
  
  return errors;
}

/**
 * Check if a tool requires student context
 * @param {string} toolName - Tool name
 * @returns {boolean} True if tool requires student context
 */
export function toolRequiresStudentContext(toolName) {
  const tool = getToolByName(toolName);
  return tool?.requires_student_context ?? false;
}

/**
 * Get tool execution limits
 * @param {string} toolName - Tool name
 * @returns {object} Execution limits
 */
export function getToolLimits(toolName) {
  const tool = getToolByName(toolName);
  return tool?.execution_limits || {};
}

// Export singleton instance
export default {
  getToolByName,
  getToolsByPermission,
  getToolsByCategory,
  isToolKnown,
  getAllToolNames,
  validateToolArguments,
  toolRequiresStudentContext,
  getToolLimits,
  getToolRegistry,
  ToolPermission,
};
