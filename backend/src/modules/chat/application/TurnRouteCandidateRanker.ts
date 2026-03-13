import type { RouterCandidate } from "../../../services/config/intentConfig.service";
import type { TurnContext } from "../domain/chat.types";
import { getContextSignals, getPersistedIntentState, low } from "./turnRouter.shared";

export class TurnRouteCandidateRanker {
  constructor(
    private readonly routingBankProvider: (bankId: string) => unknown | null,
  ) {}

  hasOperatorCandidate(
    candidates: RouterCandidate[],
    operators: string[],
  ): boolean {
    const wanted = new Set(operators.map((op) => low(op)));
    return candidates.some((candidate) =>
      wanted.has(low(String(candidate.operatorId || ""))),
    );
  }

  applyRoutingTiebreakers(
    ctx: TurnContext,
    candidates: RouterCandidate[],
    args: {
      hasExplicitDocRef: boolean;
      isFollowup: boolean;
    },
  ): RouterCandidate[] {
    const hasLockedScope = Boolean(
      ctx.activeDocument ||
        ctx.viewer?.documentId ||
        getContextSignals(ctx).explicitDocLock === true,
    );
    const lastIntentFamily = low(
      String(
        getPersistedIntentState(ctx)?.lastRoutingDecision?.intentFamily || "",
      ),
    );
    const lockedScopeWeight = this.getTiebreakWeight("locked_scope_first");
    const explicitDocWeight = this.getTiebreakWeight(
      "explicit_document_reference",
    );
    const followupWeight = this.getTiebreakWeight("recency_and_followup");
    const confidenceWeight = this.getTiebreakWeight("operator_confidence");

    for (const candidate of candidates) {
      const family = low(String(candidate.intentFamily || ""));
      let delta = 0;
      if (
        hasLockedScope &&
        ["documents", "editing", "doc_stats", "file_actions"].includes(family)
      ) {
        delta += 0.03 * lockedScopeWeight;
      }
      if (
        args.hasExplicitDocRef &&
        ["documents", "editing", "doc_stats"].includes(family)
      ) {
        delta += 0.05 * explicitDocWeight;
      }
      if (args.isFollowup && lastIntentFamily && family === lastIntentFamily) {
        delta += 0.03 * followupWeight;
      }
      delta +=
        Math.max(0, Math.min(0.02, candidate.score * 0.02)) * confidenceWeight;
      candidate.score = Math.max(0, Math.min(1, candidate.score + delta));
    }
    return candidates;
  }

  private getTiebreakWeight(stageId: string): number {
    const bank = this.routingBankProvider("routing_priority") as
      | { tiebreakStages?: Array<{ id?: string; weight?: number }> }
      | null;
    const stages = Array.isArray(bank?.tiebreakStages) ? bank.tiebreakStages : [];
    if (stages.length === 0) return 0;
    const maxWeight = Math.max(
      ...stages
        .map((stage) => Number(stage?.weight || 0))
        .filter((weight) => Number.isFinite(weight) && weight > 0),
      0,
    );
    if (maxWeight <= 0) return 0;
    const stage = stages.find(
      (entry) => String(entry?.id || "").trim() === stageId,
    );
    const raw = Number(stage?.weight || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.min(1, raw / maxWeight));
  }
}
