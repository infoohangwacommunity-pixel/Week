export class MemoryError extends Error {
  constructor(message, code) { super(message); this.name = 'MemoryError'; this.code = code; Error.captureStackTrace(this, MemoryError); }
}
export class StudentIsolationError extends MemoryError {
  constructor(waxId, operation) { super(`Student isolation violation: attempted ${operation} for wax_id ${waxId}`, 'STUDENT_ISOLATION_VIOLATION'); this.name = 'StudentIsolationError'; }
}
export class FactConflictError extends MemoryError {
  constructor(waxId, factKey, existingFactId, newFactId) { super(`Fact conflict: wax_id=${waxId}, fact_key=${factKey}. Existing: ${existingFactId}, New: ${newFactId}`, 'FACT_CONFLICT'); this.name = 'FactConflictError'; this.waxId = waxId; this.factKey = factKey; this.existingFactId = existingFactId; this.newFactId = newFactId; }
}
export class ConfidenceBoundsError extends MemoryError {
  constructor(value, bounds, operation) { super(`Confidence out of bounds: ${value} (valid: ${bounds.min} to ${bounds.max}). Operation: ${operation}`, 'CONFIDENCE_BOUNDS_ERROR'); this.name = 'ConfidenceBoundsError'; this.value = value; this.bounds = bounds; this.operation = operation; }
}
export class FactNotFoundError extends MemoryError {
  constructor(factId, waxId) { super(`Fact not found: fact_id=${factId}, wax_id=${waxId}`, 'FACT_NOT_FOUND'); this.name = 'FactNotFoundError'; this.factId = factId; this.waxId = waxId; }
}
export class EpisodeNotFoundError extends MemoryError {
  constructor(episodeId, waxId) { super(`Episode not found: episode_id=${episodeId}, wax_id=${waxId}`, 'EPISODE_NOT_FOUND'); this.name = 'EpisodeNotFoundError'; this.episodeId = episodeId; this.waxId = waxId; }
}
export class ContradictionError extends MemoryError {
  constructor(message, factAId, factBId) { super(`Contradiction error: ${message}. Facts: ${factAId}, ${factBId}`, 'CONTRADICTION_ERROR'); this.name = 'ContradictionError'; this.factAId = factAId; this.factBId = factBId; }
}
export class RetrievalError extends MemoryError {
  constructor(message, waxId, strategy) { super(`Retrieval error: ${message}. wax_id=${waxId}, strategy=${strategy}`, 'RETRIEVAL_ERROR'); this.name = 'RetrievalError'; this.waxId = waxId; this.strategy = strategy; }
}
export class SupersessionError extends MemoryError {
  constructor(message, oldFactId, newFactId) { super(`Supersession error: ${message}. Old: ${oldFactId}, New: ${newFactId}`, 'SUPERSESSION_ERROR'); this.name = 'SupersessionError'; this.oldFactId = oldFactId; this.newFactId = newFactId; }
}
export class ConfidenceHistoryError extends MemoryError {
  constructor(message, factId) { super(`Confidence history error: ${message}. fact_id=${factId}`, 'CONFIDENCE_HISTORY_ERROR'); this.name = 'ConfidenceHistoryError'; this.factId = factId; }
}
export class MemoryWriterError extends MemoryError {
  constructor(message, waxId, factKey) { super(`Memory writer error: ${message}. wax_id=${waxId}, fact_key=${factKey}`, 'MEMORY_WRITER_ERROR'); this.name = 'MemoryWriterError'; this.waxId = waxId; this.factKey = factKey; }
}
export class DatabaseError extends MemoryError {
  constructor(message, query, params) { super(`Database error: ${message}. Query: ${query}`, 'DATABASE_ERROR'); this.name = 'DatabaseError'; this.query = query; this.params = params; }
}
export default { MemoryError, StudentIsolationError, FactConflictError, ConfidenceBoundsError, FactNotFoundError, EpisodeNotFoundError, ContradictionError, RetrievalError, SupersessionError, ConfidenceHistoryError, MemoryWriterError, DatabaseError };
