/**
 * Safety Module - Phase I
 * 
 * Central export point for all safety-related functionality.
 */

import SafetyClassifier from './SafetyClassifier.js';
import CrisisProtocol from './CrisisProtocol.js';
import SafetyEventLogger from './SafetyEventLogger.js';
import { SafetyLevel, SafetyDimension } from './SafetyClassifier.js';
import { CrisisLevel, getCrisisResponseText } from './CrisisProtocol.js';

export {
  SafetyClassifier,
  CrisisProtocol,
  SafetyEventLogger,
  SafetyLevel,
  SafetyDimension,
  CrisisLevel,
  getCrisisResponseText,
};

export default {
  SafetyClassifier,
  CrisisProtocol,
  SafetyEventLogger,
};
