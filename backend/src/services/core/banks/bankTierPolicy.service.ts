export type BankTier = "hot" | "warm" | "cold";

export interface BankTierDecision {
  bankId: string;
  tier: BankTier;
}

const HOT_PREFIXES = [
  "semantic_search_config",
  "retrieval_ranker_config",
  "diversification_rules",
  "retrieval_negatives",
  "evidence_packaging",
  "intent_",
  "routing_",
];

const COLD_PREFIXES = ["eval_", "test_", "probe_", "template_", "python_"];

function normalizeId(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export class BankTierPolicyService {
  decide(bankId: string): BankTierDecision {
    const id = normalizeId(bankId);

    if (HOT_PREFIXES.some((prefix) => id.startsWith(prefix))) {
      return { bankId, tier: "hot" };
    }
    if (COLD_PREFIXES.some((prefix) => id.startsWith(prefix))) {
      return { bankId, tier: "cold" };
    }
    return { bankId, tier: "warm" };
  }
}

let singleton: BankTierPolicyService | null = null;

export function getBankTierPolicyInstance(): BankTierPolicyService {
  if (!singleton) singleton = new BankTierPolicyService();
  return singleton;
}

