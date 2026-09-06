/**
 * WaxPrep - Configuration Module
 * 
 * This module loads and validates all environment variables using Zod.
 * It provides a centralized, type-safe configuration registry.
 * 
 * All application code imports from this module - never read process.env directly.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env files in development only (Railway injects env vars in production)
if (process.env.NODE_ENV !== 'production') {
  try {
    dotenv.config({ override: true });
  } catch {
    // If .env doesn't exist, that's ok in production
  }
}

// Define the complete configuration schema
const configSchema = z.object({
  // --- RUNTIME ---
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // --- DATABASE ---
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),

  // --- REDIS ---
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // --- WHATSAPP ---
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_VERIFY_TOKEN is required'),
  WHATSAPP_APP_SECRET: z.string().min(1, 'WHATSAPP_APP_SECRET is required'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'WHATSAPP_PHONE_NUMBER_ID is required'),
  WHATSAPP_API_VERSION: z.string().min(1, 'WHATSAPP_API_VERSION is required').default('v21.0'),
  WHATSAPP_API_BASE_URL: z.string().url().default('https://graph.facebook.com'),

  // --- AI PROVIDER ---
  AI_PRIMARY_PROVIDER: z.string().min(1, 'AI_PRIMARY_PROVIDER is required'),
  AI_PRIMARY_MODEL: z.string().min(1, 'AI_PRIMARY_MODEL is required'),
  AI_PRIMARY_API_KEY: z.string().min(1, 'AI_PRIMARY_API_KEY is required'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  AI_MAX_TOKENS: z.coerce.number().int().min(100).default(1024),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),

  // --- AI PROVIDER - ANTHROPIC ---
  AI_ANTHROPIC_API_KEY: z.string().optional(),
  AI_ANTHROPIC_MODEL: z.string().optional(),
  AI_ANTHROPIC_BASE_URL: z.string().optional(),
  
  // --- AI PROVIDER - OPENAI ---
  AI_OPENAI_API_KEY: z.string().optional(),
  AI_OPENAI_MODEL: z.string().optional(),
  AI_OPENAI_BASE_URL: z.string().optional(),
  
  // --- AI PROVIDER - GROQ ---
  AI_GROQ_API_KEY: z.string().optional(),
  AI_GROQ_MODEL: z.string().optional(),
  
  // --- AI FAKE PROVIDER (for development/testing) ---
  AI_FAKE_RESPONSE: z.string().optional().default('This is a simulated response from the Fake AI Provider.'),
  AI_FAKE_LATENCY_MS: z.coerce.number().int().min(0).default(500),
  AI_FAKE_SIMULATE_FAILURE: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  AI_FAKE_FAILURE_MESSAGE: z.string().optional().default('Simulated failure for testing'),
  AI_FAKE_FAILURE_TYPE: z.string().optional().default('PROVIDER_SERVER_ERROR'),
  
  // --- AI SYSTEM PROMPT ---
  AI_SYSTEM_PROMPT_PATH: z.string().optional(),
  
  // --- QUEUE ---
  // --- QUEUE ---
  QUEUE_DEBOUNCE_WINDOW_MS: z.coerce.number().int().min(500).max(30000).default(3000),
  QUEUE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  QUEUE_RETRY_DELAY_BASE_MS: z.coerce.number().int().min(100).default(1000),
  QUEUE_RETRY_DELAY_MAX_MS: z.coerce.number().int().min(1000).default(60000),
  QUEUE_LOCK_DURATION_MS: z.coerce.number().int().min(1000).default(30000),

  // --- RESPONSE ---
  RESPONSE_MAX_CHUNK_CHARS: z.coerce.number().int().min(100).default(1000),
  RESPONSE_TYPING_INDICATOR_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),

  // --- SESSION ---
  SESSION_INACTIVITY_TIMEOUT_MS: z.coerce.number().int().min(60000).default(1800000),

  // --- IDENTITY ---
  PHONE_HMAC_SECRET: z.string().min(32, 'PHONE_HMAC_SECRET must be at least 32 characters'),

  // --- CIRCUIT BREAKER ---
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(5),
  CIRCUIT_BREAKER_DURATION_MS: z.coerce.number().int().min(1000).default(60000),

  // --- SHUTDOWN ---
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(5000).default(30000),

  // --- ERROR MESSAGES ---
  AI_FAILURE_STUDENT_MESSAGE: z.string().min(1).default('Sorry, I\'m having a bit of trouble right now. Could you send your message again in a moment?'),

  // --- CONTEXT (Stage 18) ---
  CONTEXT_MAX_HISTORY_MESSAGES: z.coerce.number().int().min(1).default(20),
  CONTEXT_MAX_INPUT_TOKENS: z.coerce.number().int().min(100).default(4000),
  CONTEXT_RESPONSE_TOKEN_BUDGET: z.coerce.number().int().min(100).default(1024),

  // --- ORCHESTRATION (Stage 20) ---
  AI_FALLBACK_PROVIDER: z.string().optional(),
  AI_ORCHESTRATOR_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),

  // --- LEARNING INTELLIGENCE (Stage 29 - RWEA) ---
  MASTERY_RECENCY_HALFLIFE_DAYS: z.coerce.number().int().min(1).default(30),
  // How quickly recent evidence matters more. 30 days = evidence halves in influence after 30 days.
  
  HINT_PENALTY_COEFFICIENT: z.coerce.number().min(0).max(1).default(0.3),
  // How strongly hint use penalizes evidence. 0.3 = each hint reduces evidence weight by ~23%.
  
  SENSITIVITY: z.coerce.number().min(0.5).default(2.0),
  // Controls how sharply mastery responds to evidence. Higher = more responsive.
  
  MASTERY_BASELINE: z.coerce.number().min(0).max(0.5).default(0.10),
  // Baseline mastery for new concepts (before any evidence).
  
  DECAY_LAMBDA: z.coerce.number().min(0).default(0.015),
  // Time decay rate for forgetting. 0.015 ≈ 46-day half-life.
  
  STUDENT_MODEL_TOKEN_BUDGET: z.coerce.number().int().min(100).default(500),
  // Maximum tokens for student model context in AI prompts.
  
  STUDENT_MODEL_SNAPSHOT_MAX_AGE_HOURS: z.coerce.number().int().min(1).default(6),
  // Maximum age of cached snapshot before forcing refresh.
});

// Parse and validate environment variables
const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuration validation failed:');
  for (const error of parsed.error.errors) {
    console.error(`  - ${error.path.join('.')}: ${error.message}`);
  }
  console.error('\nPlease check your .env.local or Railway environment variables.');
  console.error('See .env.example for all required variables.');
  process.exit(1);
}

// Create frozen configuration object
const config = Object.freeze(parsed.data);

/**
 * Returns a log-safe version of the config with secrets redacted
 */
export function logSafeConfig() {
  return {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    LOG_LEVEL: config.LOG_LEVEL,
    DATABASE_URL: config.DATABASE_URL.replace(/password=[^&]+/, 'password=[REDACTED]'),
    REDIS_URL: config.REDIS_URL.replace(/:(.+?)@/, ':[REDACTED]@'),
    WHATSAPP_VERIFY_TOKEN: '[REDACTED]',
    WHATSAPP_APP_SECRET: '[REDACTED]',
    WHATSAPP_PHONE_NUMBER_ID: config.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_API_VERSION: config.WHATSAPP_API_VERSION,
    AI_PRIMARY_PROVIDER: config.AI_PRIMARY_PROVIDER,
    AI_PRIMARY_MODEL: config.AI_PRIMARY_MODEL,
    AI_PRIMARY_API_KEY: '[REDACTED]',
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
    AI_MAX_TOKENS: config.AI_MAX_TOKENS,
    AI_TEMPERATURE: config.AI_TEMPERATURE,
    AI_ANTHROPIC_API_KEY: config.AI_ANTHROPIC_API_KEY ? '[REDACTED]' : undefined,
    AI_OPENAI_API_KEY: config.AI_OPENAI_API_KEY ? '[REDACTED]' : undefined,
    AI_GROQ_API_KEY: config.AI_GROQ_API_KEY ? '[REDACTED]' : undefined,
    QUEUE_DEBOUNCE_WINDOW_MS: config.QUEUE_DEBOUNCE_WINDOW_MS,
    RESPONSE_MAX_CHUNK_CHARS: config.RESPONSE_MAX_CHUNK_CHARS,
    PHONE_HMAC_SECRET: '[REDACTED]',
    MASTERY_RECENCY_HALFLIFE_DAYS: config.MASTERY_RECENCY_HALFLIFE_DAYS,
    HINT_PENALTY_COEFFICIENT: config.HINT_PENALTY_COEFFICIENT,
    SENSITIVITY: config.SENSITIVITY,
    MASTERY_BASELINE: config.MASTERY_BASELINE,
    DECAY_LAMBDA: config.DECAY_LAMBDA,
    STUDENT_MODEL_TOKEN_BUDGET: config.STUDENT_MODEL_TOKEN_BUDGET,
    STUDENT_MODEL_SNAPSHOT_MAX_AGE_HOURS: config.STUDENT_MODEL_SNAPSHOT_MAX_AGE_HOURS,
  };
}

export default config;
