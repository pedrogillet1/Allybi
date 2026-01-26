/**
 * RoutingSignals - Bank-driven signal layer for intent routing
 *
 * This replaces hardcoded regex heuristics in routingPriority.service.ts.
 * All signals come from data bank matches, not raw query parsing.
 *
 * @version 1.0.0
 */

export type Match = {
  name: string;
  score: number;
  matchedIds?: string[];  // Pattern IDs from banks that matched
};

export type ScopeMode = 'single_doc' | 'multi_doc' | 'none';

export type RoutingSignals = {
  // Language detected from query
  language: 'en' | 'pt' | 'es';

  // Content guard result (true = query is about doc content, not file operations)
  contentGuard: boolean;

  // Resolved operator from bank matches
  operator: Match;

  // Ranked intents with scores from bank matches
  intents: Match[];

  // Domain detection (finance/legal/medical/etc)
  domain?: Match;

  // Document scope
  scope?: {
    mode: ScopeMode;
    confidence: number;
    lockedDocId?: string;  // If scope is locked to specific doc
  };

  // Format constraints parsed from query
  constraints: {
    tableRequired: boolean;
    exactBullets?: number;
    exactSentences?: number;
    buttonOnly?: boolean;
    maxLength?: number;
  };

  // Conversation memory signals
  memory: {
    hasLastDoc: boolean;
    lastIntent?: string;
    lastOperator?: string;
    lastDocIds?: string[];
    turnCount: number;
  };

  // Negative blockers that fired
  blockers: {
    notFileActions: boolean;
    notReasoning: boolean;
    notConversation: boolean;
    notHelp: boolean;
  };

  // Follow-up inheritance signals
  followup: {
    isFollowup: boolean;
    inheritFrom?: string;  // Intent to inherit from
    inheritOperator?: string;
  };
};

/**
 * RoutingDecision - Output of the routing policy engine
 */
export type RoutingDecision = {
  intent: string;
  confidence: number;
  operator: string;

  // Adjustments applied with reasons
  adjustments: Array<{
    rule: string;
    intent: string;
    boost: number;
    reason: string;
  }>;

  // Final scores after all adjustments
  finalScores: Record<string, number>;

  // Debug info for logging
  debug: {
    signalsUsed: string[];
    rulesApplied: string[];
    blockersFired: string[];
  };
};

/**
 * RoutingRule - A single rule in the routing policy
 */
export type RoutingRule = {
  id: string;
  description: string;

  // Conditions (all must be true)
  when: {
    operator?: string | string[];
    operatorConfidenceGte?: number;
    intent?: string | string[];
    domain?: string | string[];
    scopeMode?: ScopeMode | ScopeMode[];
    hasDocuments?: boolean;
    constraint?: keyof RoutingSignals['constraints'];
    blocker?: keyof RoutingSignals['blockers'];
    isFollowup?: boolean;
    memoryHasLastDoc?: boolean;
  };

  // Actions to apply
  then: {
    boost?: { intent: string; amount: number };
    dampen?: { intent: string; amount: number };
    setIntent?: string;
    setOperator?: string;
  }[];
};

/**
 * RoutingPolicy - Collection of rules loaded from bank
 */
export type RoutingPolicy = {
  _meta: {
    bank: string;
    version: string;
    description: string;
  };
  rules: RoutingRule[];
};

/**
 * Default empty signals for initialization
 */
export const EMPTY_SIGNALS: RoutingSignals = {
  language: 'en',
  contentGuard: false,
  operator: { name: 'unknown', score: 0 },
  intents: [],
  constraints: {
    tableRequired: false,
  },
  memory: {
    hasLastDoc: false,
    turnCount: 0,
  },
  blockers: {
    notFileActions: false,
    notReasoning: false,
    notConversation: false,
    notHelp: false,
  },
  followup: {
    isFollowup: false,
  },
};

/**
 * Helper to check if a condition matches
 */
export function conditionMatches(
  condition: RoutingRule['when'],
  signals: RoutingSignals
): boolean {
  // Check operator
  if (condition.operator) {
    const ops = Array.isArray(condition.operator) ? condition.operator : [condition.operator];
    if (!ops.includes(signals.operator.name)) return false;
  }

  // Check operator confidence
  if (condition.operatorConfidenceGte !== undefined) {
    if (signals.operator.score < condition.operatorConfidenceGte) return false;
  }

  // Check domain
  if (condition.domain) {
    const domains = Array.isArray(condition.domain) ? condition.domain : [condition.domain];
    if (!signals.domain || !domains.includes(signals.domain.name)) return false;
  }

  // Check scope mode
  if (condition.scopeMode) {
    const modes = Array.isArray(condition.scopeMode) ? condition.scopeMode : [condition.scopeMode];
    if (!signals.scope || !modes.includes(signals.scope.mode)) return false;
  }

  // Check hasDocuments
  if (condition.hasDocuments !== undefined) {
    const hasDoc = signals.memory.hasLastDoc || (signals.intents.some(i =>
      ['documents', 'finance', 'legal', 'medical', 'accounting', 'excel'].includes(i.name)
    ));
    if (condition.hasDocuments !== hasDoc) return false;
  }

  // Check constraint
  if (condition.constraint) {
    if (!signals.constraints[condition.constraint]) return false;
  }

  // Check blocker
  if (condition.blocker) {
    if (!signals.blockers[condition.blocker]) return false;
  }

  // Check followup
  if (condition.isFollowup !== undefined) {
    if (signals.followup.isFollowup !== condition.isFollowup) return false;
  }

  // Check memory
  if (condition.memoryHasLastDoc !== undefined) {
    if (signals.memory.hasLastDoc !== condition.memoryHasLastDoc) return false;
  }

  return true;
}
