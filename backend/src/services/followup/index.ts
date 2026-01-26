/**
 * Follow-up System Exports
 *
 * ChatGPT-quality follow-up suggestions for Koda.
 */

// Types
export * from '../../types/conversationState.types';

// Services
export { getCapabilityRegistry, CapabilityRegistry } from './capabilityRegistry.service';
export type { CapabilityConfig, FileTypeSupport, FollowUpActionType } from './capabilityRegistry.service';

export { getFollowUpGenerator, generateFollowUps } from './followupGenerator.service';
export type { FollowUpSuggestion, FollowUpContext, LatestResult } from './followupGenerator.service';

export { getFollowUpQualityGate, validateFollowUps } from './followupQualityGate.service';
export type { QualityGateResult, QualityGateConfig } from './followupQualityGate.service';

// Convenience function: generate and validate in one call
import { FollowUpSuggestion, FollowUpContext, generateFollowUps } from './followupGenerator.service';
import { validateFollowUps } from './followupQualityGate.service';

export function getValidatedFollowUps(context: FollowUpContext): FollowUpSuggestion[] {
  const suggestions = generateFollowUps(context);
  return validateFollowUps(
    suggestions,
    context.state,
    context.latestResult,
    context.userLanguage
  );
}
