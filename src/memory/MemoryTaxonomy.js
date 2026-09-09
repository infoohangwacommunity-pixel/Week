export const FACT_CATEGORIES = {
  PROFILE: { name: 'profile', description: 'Durable biographical facts', priority: 1, decay: false, decayRate: 0 },
  ACADEMIC: { name: 'academic', description: 'Academic engagement and performance', priority: 2, decay: true, decayRate: 0.02 },
  MISCONCEPTION: { name: 'misconception', description: 'Incorrect understandings', priority: 3, decay: true, decayRate: 0.05 },
  PREFERENCE: { name: 'preference', description: 'Interaction preferences', priority: 4, decay: true, decayRate: 0.02 },
  PROGRESS: { name: 'progress', description: 'Conceptual mastery evidence', priority: 3, decay: true, decayRate: 0.03 },
  BEHAVIORAL: { name: 'behavioral', description: 'Behavioral patterns', priority: 5, decay: true, decayRate: 0.02 },
};

export const FACT_KEYS = [
  { key: 'exam_target', category: 'profile', description: 'Which examination the student is preparing for', exampleValue: 'WAEC' },
  { key: 'exam_year', category: 'profile', description: 'When the student plans to sit the exam', exampleValue: '2027' },
  { key: 'class_level', category: 'profile', description: 'Current school year', exampleValue: 'SS2' },
  { key: 'preferred_name', category: 'profile', description: 'What the student likes to be called', exampleValue: 'Tunde' },
  { key: 'school_type', category: 'profile', description: 'Type of school', exampleValue: 'State secondary' },
  { key: 'strong_subjects', category: 'academic', description: 'Subjects the student excels in', exampleValue: '["Mathematics", "Physics"]' },
  { key: 'weak_subjects', category: 'academic', description: 'Subjects where the student struggles', exampleValue: '["Chemistry"]' },
  { key: 'study_schedule', category: 'academic', description: 'When the student typically studies', exampleValue: 'evening' },
  { key: 'exam_subjects', category: 'academic', description: 'Which subjects the student is taking', exampleValue: '["Math", "Physics"]' },
  { key: 'preferred_explanation_style', category: 'academic', description: 'How the student prefers explanations', exampleValue: 'step-by-step' },
  { key: 'misconception', category: 'misconception', description: 'A specific incorrect understanding', exampleValue: '{"concept": "Newton\'s Third Law"}' },
  { key: 'explanation_depth', category: 'preference', description: 'Brief or detailed answers preference', exampleValue: 'detailed' },
  { key: 'example_type', category: 'preference', description: 'Type of examples the student prefers', exampleValue: 'real-world' },
  { key: 'feedback_style', category: 'preference', description: 'How the student prefers feedback', exampleValue: 'direct' },
  { key: 'mastered_concept', category: 'progress', description: 'A concept the student has mastered', exampleValue: '{"concept": "Linear equations"}' },
  { key: 'struggling_concept', category: 'progress', description: 'A concept the student struggles with', exampleValue: '{"concept": "Quadratic equations"}' },
  { key: 'typical_session_time', category: 'behavioral', description: 'When the student most often uses WaxPrep', exampleValue: 'evening' },
];

export const PROVENANCE = {
  STUDENT_STATED_DIRECT: { value: 'student_stated_direct', description: 'The student explicitly stated this fact', initialConfidence: 0.80, reinforceDelta: 0.10, contradictDelta: -0.30 },
  STUDENT_STATED_CORRECTION: { value: 'student_stated_correction', description: 'The student corrected a previous statement', initialConfidence: 0.85, reinforceDelta: 0.10, contradictDelta: -0.30 },
  STUDENT_STATED_INDIRECT: { value: 'student_stated_indirect', description: 'The student implied the fact', initialConfidence: 0.55, reinforceDelta: 0.05, contradictDelta: -0.10 },
  AI_INFERRED_FROM_BEHAVIOR: { value: 'ai_inferred_from_behavior', description: 'AI observed behavioral patterns', initialConfidence: 0.45, reinforceDelta: 0.03, contradictDelta: -0.10 },
  AI_INFERRED_FROM_ERROR: { value: 'ai_inferred_from_error', description: 'AI identified misconception from error', initialConfidence: 0.55, reinforceDelta: 0.05, contradictDelta: -0.20 },
  AI_INFERRED_CROSS_SESSION: { value: 'ai_inferred_cross_session', description: 'AI identified pattern across sessions', initialConfidence: 0.35, reinforceDelta: 0.05, contradictDelta: -0.10 },
  SYSTEM_COMPUTED: { value: 'system_computed', description: 'Computed by system from observable data', initialConfidence: 0.65, reinforceDelta: 0.02, contradictDelta: -0.05 },
  EPISODE_EXTRACTED: { value: 'episode_extracted', description: 'Extracted by AI during session summarization', initialConfidence: 0.60, reinforceDelta: 0.07, contradictDelta: -0.15 },
  CONFIRMED_BY_REPETITION: { value: 'confirmed_by_repetition', description: 'Re-stated, increasing confidence', initialConfidence: 0, reinforceDelta: 0.02, contradictDelta: 0 },
};

export const CONFLICT_TYPES = { VALUE_CONFLICT: 'value_conflict', TEMPORAL_CONFLICT: 'temporal_conflict', LOGICAL_CONFLICT: 'logical_conflict' };
export const CONFLICT_RESOLUTION = { SUPERSEDE: 'supersede', CREATE_ARRAY: 'create_array', FLAG_CONTRADICTION: 'flag_contradiction' };
export const CONFIDENCE_BOUNDS = { MIN: 0.000, MAX: 0.950, MIN_FOR_RETRIEVAL: 0.400, MIN_FOR_WRITE: 0.550, ARCHIVE_THRESHOLD: 0.200 };
export const TOKEN_BUDGETS = { FACTS: 400, EPISODES: 600, FUTURE: 400 };
export const RETRIEVAL_STRATEGIES = { RECENCY: 'recency', HYBRID: 'hybrid', SEMANTIC: 'semantic' };
export const CHANGE_REASONS = { INITIALIZE: 'INITIALIZE', REINFORCE: 'REINFORCE', CONTRADICT: 'CONTRADICT', SUPERSEDE: 'SUPERSEDE', DECAY: 'DECAY', CONFIRM: 'CONFIRM' };

export default { FACT_CATEGORIES, FACT_KEYS, PROVENANCE, CONFLICT_TYPES, CONFLICT_RESOLUTION, CONFIDENCE_BOUNDS, TOKEN_BUDGETS, RETRIEVAL_STRATEGIES, CHANGE_REASONS };
