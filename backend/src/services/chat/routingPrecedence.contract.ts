export const ROUTING_PRECEDENCE_CONTRACT = Object.freeze({
  id: "routing_precedence_contract",
  version: "2026-03-05",
  followupSourcePriority: [
    "context",
    "followup_indicators",
    "intent_patterns",
    "none",
  ] as const,
  connectorDecisionPriority: [
    "resolveConnectorDecision",
    "isConnectorTurn",
  ] as const,
  navIntentBankFallbackPriority: [
    "nav_intents_<locale>",
    "nav_intents_en",
    "none",
  ] as const,
});

export type FollowupSource =
  (typeof ROUTING_PRECEDENCE_CONTRACT.followupSourcePriority)[number];

export function followupSourceRank(source: string): number {
  const priority = ROUTING_PRECEDENCE_CONTRACT.followupSourcePriority;
  const idx = priority.indexOf(source as FollowupSource);
  return idx >= 0 ? idx : priority.length;
}
