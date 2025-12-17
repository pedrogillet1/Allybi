/**
 * Services Utils - Barrel Export
 *
 * Re-exports all utility services for clean imports.
 */

// Token Budget Estimator
export {
  TokenBudgetEstimatorService,
  initTokenBudgetEstimator,
  getTokenBudgetEstimator,
  TOKENS_PER_WORD,
  CHARS_PER_TOKEN,
  MODEL_CONTEXT_LIMITS,
  SAFETY_MARGINS,
} from './tokenBudgetEstimator.service';

export type {
  SafetyLevel,
  TokenEstimateDetailed,
  BudgetCheck,
} from './tokenBudgetEstimator.service';

// Context Window Budgeting
export {
  ContextWindowBudgetingService,
  initContextWindowBudgeting,
  getContextWindowBudgeting,
  DEFAULT_ALLOCATIONS,
  MIN_ALLOCATIONS,
  MAX_CHUNKS,
} from './contextWindowBudgeting.service';

export type {
  BudgetAllocation,
  ComponentUsage,
  BudgetUsage,
  ChunkSelectionResult,
  ContextBudgetInput,
  ContextBudgetResult,
} from './contextWindowBudgeting.service';

// Marker Utilities
export {
  encodeMarkerValue,
  decodeMarkerValue,
  createDocMarker,
  createCiteMarker,
  createLoadMoreMarker,
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,
  containsMarkers,
  hasIncompleteMarkers,
  extractMarkers,
  isValidMarker,
  stripMarkers,
  countMarkers,
  validateMarkerLocations,
  getSafeInsertionPoints,
  StreamingMarkerBuffer,
} from './markerUtils';

export type {
  DocMarkerData,
  CiteMarkerData,
  LoadMoreMarkerData,
  MarkerData,
} from './markerUtils';
