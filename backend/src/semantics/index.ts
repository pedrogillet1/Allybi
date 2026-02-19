/**
 * Semantics Module - ChatGPT Parity Understanding Layer
 *
 * Exports:
 * - SemanticQuery type and builder
 * - Domain detection
 * - Entity extraction
 * - Helper functions
 */

export {
  // Types
  type SemanticQuery,
  type Domain,
  type DepthPreference,
  type Language,
  type ExtractedEntities,
  type FollowUpContext,
  type BuildSemanticQueryInput,

  // Main builder
  buildSemanticQuery,

  // Helper functions
  requiresRetrieval,
  getPrimaryDocRef,
  hasExplicitFormatRequirements,
  semanticQuerySummary,

  // Module export
  semanticQueryModule,
} from "./semanticQuery";
