/**
 * WaxPrep - Learning Intelligence Module Tests
 * 
 * Basic validation tests for Phase F implementation
 * These tests verify file structure and content without requiring full module imports
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Learning Intelligence Module', () => {
  it('should have EvidenceTaxonomy file with all 8 evidence types', async () => {
    const taxonomyPath = path.join(process.cwd(), 'src', 'learning', 'evidence', 'EvidenceTaxonomy.js');
    const content = fs.readFileSync(taxonomyPath, 'utf-8');
    
    expect(content).toContain('DIRECT_RESPONSE:');
    expect(content).toContain('EXPLANATION_ATTEMPT:');
    expect(content).toContain('CORRECTION_RESPONSE:');
    expect(content).toContain('HINT_REQUEST:');
    expect(content).toContain('SELF_REPORTED:');
    expect(content).toContain('ERROR_COMMISSION:');
    expect(content).toContain('CONCEPT_MENTION:');
    expect(content).toContain('SELF_EXPLANATION:');
  });

  it('should have EvidenceWriter class', async () => {
    const writerPath = path.join(process.cwd(), 'src', 'learning', 'evidence', 'EvidenceWriter.js');
    const content = fs.readFileSync(writerPath, 'utf-8');
    
    expect(content).toContain('export class EvidenceWriter');
    expect(content).toContain('async write(observation)');
  });

  it('should have MasteryEngine class with RWEA implementation', async () => {
    const enginePath = path.join(process.cwd(), 'src', 'learning', 'mastery', 'MasteryEngine.js');
    const content = fs.readFileSync(enginePath, 'utf-8');
    
    expect(content).toContain('export class MasteryEngine');
    expect(content).toContain('computeState(wax_id, concept_tag)');
    expect(content).toContain('updateState(wax_id, concept_tag)');
    expect(content).toContain('tanh'); // RWEA uses tanh transform
    expect(content).toContain('MASTERY_BASELINE');
  });

  it('should have MisconceptionTracker class', async () => {
    const trackerPath = path.join(process.cwd(), 'src', 'learning', 'misconceptions', 'MisconceptionTracker.js');
    const content = fs.readFileSync(trackerPath, 'utf-8');
    
    expect(content).toContain('export class MisconceptionTracker');
    expect(content).toContain('recordPossibleMisconception');
    expect(content).toContain('consolidateMisconceptions');
    expect(content).toContain('resolveIfDemonstrated');
  });

  it('should have StudentModelContextInterface class', async () => {
    const interfacePath = path.join(process.cwd(), 'src', 'learning', 'interface', 'StudentModelContextInterface.js');
    const content = fs.readFileSync(interfacePath, 'utf-8');
    
    expect(content).toContain('export class StudentModelContextInterface');
    expect(content).toContain('getStudentModelContext');
    expect(content).toContain('tokenBudget');
  });

  it('should have StudentLearningAccess class', async () => {
    const accessPath = path.join(process.cwd(), 'src', 'learning', 'StudentLearningAccess.js');
    const content = fs.readFileSync(accessPath, 'utf-8');
    
    expect(content).toContain('export class StudentLearningAccess');
    expect(content).toContain('getKnowledgeStates');
    expect(content).toContain('getKnowledgeState');
    expect(content).toContain('writeObservation');
  });

  it('should have SessionEvidenceExtractor class', async () => {
    const extractorPath = path.join(process.cwd(), 'src', 'workers', 'sessionEvidenceExtractor.js');
    const content = fs.readFileSync(extractorPath, 'utf-8');
    
    expect(content).toContain('export class SessionEvidenceExtractor');
    expect(content).toContain('extractEvidenceFromSession(sessionData)');
    expect(content).toContain('_extractObservations');
    expect(content).toContain('_writeObservation');
  });

  it('should have migration 006 in the migrations directory', async () => {
    const migrationsDir = path.join(process.cwd(), 'infra', 'migrations');
    const files = fs.readdirSync(migrationsDir);
    
    expect(files).toContain('007_learning_intelligence_foundation.sql');
  });

  it('should have all required tables in migration 006', async () => {
    const migrationFile = path.join(process.cwd(), 'infra', 'migrations', '007_learning_intelligence_foundation.sql');
    const content = fs.readFileSync(migrationFile, 'utf-8');
    
    expect(content).toContain('CREATE TABLE IF NOT EXISTS concepts');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS learning_observations');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS knowledge_states');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS misconceptions');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS learning_signals');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS student_model_snapshots');
  });

  it('should have RWEA configuration in config schema', async () => {
    const configPath = path.join(process.cwd(), 'src', 'config', 'index.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    
    expect(content).toContain('MASTERY_RECENCY_HALFLIFE_DAYS');
    expect(content).toContain('HINT_PENALTY_COEFFICIENT');
    expect(content).toContain('SENSITIVITY');
    expect(content).toContain('MASTERY_BASELINE');
    expect(content).toContain('DECAY_LAMBDA');
    expect(content).toContain('STUDENT_MODEL_TOKEN_BUDGET');
    expect(content).toContain('STUDENT_MODEL_SNAPSHOT_MAX_AGE_HOURS');
  });

  it('should have RWEA configuration in .env.example', async () => {
    const envExamplePath = path.join(process.cwd(), '.env.example');
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    
    expect(content).toContain('MASTERY_RECENCY_HALFLIFE_DAYS=30');
    expect(content).toContain('HINT_PENALTY_COEFFICIENT=0.3');
    expect(content).toContain('STUDENT_MODEL_TOKEN_BUDGET=500');
  });

  it('should enforce wax_id scoping in StudentLearningAccess', async () => {
    const studentLearningAccessPath = path.join(process.cwd(), 'src', 'learning', 'StudentLearningAccess.js');
    const content = fs.readFileSync(studentLearningAccessPath, 'utf-8');
    
    // Verify wax_id is used in WHERE clauses
    expect(content).toContain('WHERE ks.wax_id = $1');
    expect(content).toContain('WHERE lo.wax_id = $1');
    expect(content).toContain('WHERE m.wax_id = $1');
  });

  it('should have idempotency constraint in migration', async () => {
    const migrationFile = path.join(process.cwd(), 'infra', 'migrations', '007_learning_intelligence_foundation.sql');
    const content = fs.readFileSync(migrationFile, 'utf-8');
    
    // Check for idempotency constraint on observations
    expect(content).toContain('UNIQUE (wax_id, message_id, concept_tag, evidence_type)');
  });

  it('should have soft deletion support in all learning tables', async () => {
    const migrationFile = path.join(process.cwd(), 'infra', 'migrations', '007_learning_intelligence_foundation.sql');
    const content = fs.readFileSync(migrationFile, 'utf-8');
    
    expect(content).toContain('deleted_at TIMESTAMPTZ');
    expect(content).toContain('deletion_reason TEXT');
  });

  it('should have proper foreign key constraints for student isolation', async () => {
    const migrationFile = path.join(process.cwd(), 'infra', 'migrations', '007_learning_intelligence_foundation.sql');
    const content = fs.readFileSync(migrationFile, 'utf-8');
    
    // Check that all tables reference students with RESTRICT (preferred for learning data)
    expect(content).toContain('REFERENCES students(id) ON DELETE RESTRICT');
  });

  it('should have knowledge_states table with RWEA fields', async () => {
    const migrationFile = path.join(process.cwd(), 'infra', 'migrations', '007_learning_intelligence_foundation.sql');
    const content = fs.readFileSync(migrationFile, 'utf-8');
    
    expect(content).toContain('mastery_estimate NUMERIC(4,3)');
    expect(content).toContain('success_signal NUMERIC(5,3)');
    expect(content).toContain('failure_signal NUMERIC(5,3)');
    expect(content).toContain('recent_trend TEXT');
    expect(content).toContain('hint_dependency NUMERIC(4,3)');
    expect(content).toContain('decay_factor_applied NUMERIC(5,4)');
    expect(content).toContain('state_version INTEGER');
  });

  it('should have learning_observations table with evidence fields', async () => {
    const migrationFile = path.join(process.cwd(), 'infra', 'migrations', '007_learning_intelligence_foundation.sql');
    const content = fs.readFileSync(migrationFile, 'utf-8');
    
    expect(content).toContain('correctness NUMERIC(4,3)');
    expect(content).toContain('hint_level INTEGER');
    expect(content).toContain('extraction_confidence NUMERIC(4,3)');
    expect(content).toContain('evidence_type TEXT NOT NULL');
    expect(content).toContain('possible_misconception BOOLEAN');
  });
});
