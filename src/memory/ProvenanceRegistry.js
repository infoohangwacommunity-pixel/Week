import { PROVENANCE } from './MemoryTaxonomy.js';
export function getProvenanceByKey(key) { return PROVENANCE[key] || null; }
export function isValidProvenance(provenance) { return Object.values(PROVENANCE).some(p => p.value === provenance); }
export function getInitialConfidence(provenance) { const prov = Object.values(PROVENANCE).find(p => p.value === provenance); return prov ? prov.initialConfidence : 0.500; }
export function getReinforceDelta(provenance) { const prov = Object.values(PROVENANCE).find(p => p.value === provenance); return prov ? prov.reinforceDelta : 0.02; }
export function getContradictDelta(provenance) { const prov = Object.values(PROVENANCE).find(p => p.value === provenance); return prov ? prov.contradictDelta : -0.05; }
export function getDescription(provenance) { const prov = Object.values(PROVENANCE).find(p => p.value === provenance); return prov ? prov.description : 'Unknown'; }
export function getTrustLevel(provenance) { const prov = Object.values(PROVENANCE).find(p => p.value === provenance); if (!prov) return 'low'; if (prov.initialConfidence >= 0.70) return 'high'; if (prov.initialConfidence >= 0.50) return 'medium'; return 'low'; }
export function isStudentStated(provenance) { return [PROVENANCE.STUDENT_STATED_DIRECT.value, PROVENANCE.STUDENT_STATED_CORRECTION.value].includes(provenance); }
export function isAIInferred(provenance) { return [PROVENANCE.AI_INFERRED_FROM_BEHAVIOR.value, PROVENANCE.AI_INFERRED_FROM_ERROR.value, PROVENANCE.AI_INFERRED_CROSS_SESSION.value].includes(provenance); }
export function getAllProvenances() { return Object.values(PROVENANCE).map(p => ({ value: p.value, description: p.description, initialConfidence: p.initialConfidence })); }
export default { getProvenanceByKey, isValidProvenance, getInitialConfidence, getReinforceDelta, getContradictDelta, getDescription, getTrustLevel, isStudentStated, isAIInferred, getAllProvenances };
