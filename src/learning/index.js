/**
 * WaxPrep - Learning Intelligence Module
 * 
 * Phase F: Learning Intelligence Infrastructure (Stages 27-34)
 * 
 * This module provides the complete learning intelligence infrastructure:
 * - Stage 27: Student Model Schema (concepts, knowledge states, observations)
 * - Stage 28: Evidence Collection Pipeline
 * - Stage 29: Mastery Estimation (RWEA)
 * - Stage 30: Misconception Detection
 * - Stage 31: Learning Signals and Behavioral Analytics
 * - Stage 33: Student Model Versioning and Integrity
 * - Stage 34: Student Model to AI Interface
 * 
 * The module follows the AI-first principle:
 * - Infrastructure produces evidence and measurements
 * - AI interprets evidence and makes pedagogical decisions
 * - No hardcoded educational logic or pedagogical decisions
 */

import { StudentLearningAccess } from './StudentLearningAccess.js';
import { EvidenceWriter } from './evidence/EvidenceWriter.js';
import { MasteryEngine } from './mastery/MasteryEngine.js';
import { MisconceptionTracker } from './misconceptions/MisconceptionTracker.js';
import { StudentModelContextInterface } from './interface/StudentModelContextInterface.js';
import * as EvidenceTaxonomy from './evidence/EvidenceTaxonomy.js';

/**
 * Create and initialize the learning module
 * @param {import('../db/index.js').Pool} pool - Database connection pool
 * @returns {Object} Learning module with all components
 */
export function createLearningModule(pool) {
  const evidenceWriter = new EvidenceWriter(pool);
  const masteryEngine = new MasteryEngine(pool);
  const misconceptionTracker = new MisconceptionTracker(pool);
  const studentLearningAccess = new StudentLearningAccess(
    pool, 
    evidenceWriter, 
    masteryEngine, 
    EvidenceTaxonomy,
  );
  const contextInterface = new StudentModelContextInterface(pool, studentLearningAccess);

  return {
    // Main access layer
    studentLearningAccess,
    
    // Individual components
    evidenceWriter,
    masteryEngine,
    misconceptionTracker,
    contextInterface,
    
    // Taxonomy
    evidenceTaxonomy: EvidenceTaxonomy,
    
    // Legacy compatibility
    getKnowledgeStates: studentLearningAccess.getKnowledgeStates.bind(studentLearningAccess),
    getKnowledgeState: studentLearningAccess.getKnowledgeState.bind(studentLearningAccess),
    updateKnowledgeState: studentLearningAccess.updateKnowledgeState.bind(studentLearningAccess),
    writeObservation: studentLearningAccess.writeObservation.bind(studentLearningAccess),
    getActiveMisconceptions: studentLearningAccess.getActiveMisconceptions.bind(studentLearningAccess),
    getStudentModelSnapshot: studentLearningAccess.getStudentModelSnapshot.bind(studentLearningAccess),
    getLearningSignals: studentLearningAccess.getLearningSignals.bind(studentLearningAccess),
    writeSignal: studentLearningAccess.writeSignal.bind(studentLearningAccess),
    getEvidenceTypeMetadata: studentLearningAccess.getEvidenceTypeMetadata.bind(studentLearningAccess),
    getAllEvidenceTypes: studentLearningAccess.getAllEvidenceTypes.bind(studentLearningAccess),
  };
}

export {
  EvidenceWriter,
  MasteryEngine,
  MisconceptionTracker,
  StudentModelContextInterface,
  EvidenceTaxonomy,
  StudentLearningAccess,
};

export default {
  createLearningModule,
  EvidenceWriter,
  MasteryEngine,
  MisconceptionTracker,
  StudentModelContextInterface,
  EvidenceTaxonomy,
};
