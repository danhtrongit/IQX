export { JourneyIdentityModule } from './identity.module.js';
export { JourneyIdentityService } from './identity.service.js';
export { buildFrozenDataset, type FrozenDatasetPayload } from './identity.dataset.js';
export {
  MASCOTS,
  MASCOT_RULES_VERSION,
  chooseMascot,
  classifyEvidence,
  completeAssessmentMap,
  digest,
  validateFrozenAssignment,
  type ClassificationResult,
  type EvidenceRecord,
  type MascotId,
} from './identity.classification.js';
