import { getOptionalBank } from "../core/banks/bankLoader.service";

export interface AnswerModeRouterInput {
  promptTask?: string | null;
  explicitAnswerMode?: string | null;
  needsClarification?: boolean;
  disambiguationActive?: boolean;
  operator?: string | null;
  operatorFamily?: string | null;
  intentFamily?: string | null;
  evidenceDocCount?: number;
  systemBlocks?: string[];
}

export interface AnswerModeRouterOutput {
  answerMode: string;
  reasonCodes: string[];
}

function low(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function byIntentFamily(intentFamily: string): string | null {
  if (intentFamily === "file_actions" || intentFamily === "doc_discovery") {
    return "nav_pills";
  }
  if (
    intentFamily === "documents" ||
    intentFamily === "doc_stats" ||
    intentFamily === "editing"
  ) {
    return "doc_grounded_single";
  }
  if (intentFamily === "connectors" || intentFamily === "email") {
    return "action_receipt";
  }
  if (intentFamily === "help") return "help_steps";
  return null;
}

export class AnswerModeRouterService {
  decide(input: AnswerModeRouterInput): AnswerModeRouterOutput {
    const reasons: string[] = [];
    const promptTask = String(input.promptTask || "").trim();
    if (promptTask) {
      reasons.push("prompt_task_action_mode");
      return { answerMode: "action_receipt", reasonCodes: reasons };
    }

    const explicitMode = String(input.explicitAnswerMode || "").trim();
    if (explicitMode) {
      reasons.push("explicit_answer_mode");
      return { answerMode: explicitMode, reasonCodes: reasons };
    }

    if (input.needsClarification || input.disambiguationActive) {
      reasons.push("clarification_or_disambiguation");
      return { answerMode: "rank_disambiguate", reasonCodes: reasons };
    }

    const modeFromFamily = this.resolveFromOperatorFamily(
      input.operator,
      input.operatorFamily,
    );
    if (modeFromFamily) {
      reasons.push("operator_family_default");
      return { answerMode: modeFromFamily, reasonCodes: reasons };
    }

    const intentMode = byIntentFamily(low(input.intentFamily));
    if (intentMode) {
      reasons.push("intent_family_default");
      return { answerMode: intentMode, reasonCodes: reasons };
    }

    const joined = (input.systemBlocks || []).join("\n");
    if (/NAVIGATION MODE/i.test(joined)) {
      reasons.push("system_nav_mode");
      return { answerMode: "nav_pills", reasonCodes: reasons };
    }

    const evidenceDocCount = Number(input.evidenceDocCount || 0);
    if (evidenceDocCount > 1) {
      reasons.push("evidence_multi_doc");
      return { answerMode: "doc_grounded_multi", reasonCodes: reasons };
    }
    if (evidenceDocCount === 1) {
      reasons.push("evidence_single_doc");
      return { answerMode: "doc_grounded_single", reasonCodes: reasons };
    }

    reasons.push("default_general_answer");
    return { answerMode: "general_answer", reasonCodes: reasons };
  }

  private resolveFromOperatorFamily(
    operatorRaw: string | null | undefined,
    operatorFamilyRaw: string | null | undefined,
  ): string | null {
    const bank = getOptionalBank<any>("operator_families");
    const families = Array.isArray(bank?.families) ? bank.families : [];
    if (families.length === 0) return null;

    const operator = low(operatorRaw);
    const explicitFamily = low(operatorFamilyRaw);
    let familyEntry =
      families.find((entry: any) => low(entry?.id) === explicitFamily) || null;

    if (!familyEntry && operator) {
      familyEntry =
        families.find((entry: any) =>
          Array.isArray(entry?.operators)
            ? entry.operators.some((id: unknown) => low(id) === operator)
            : false,
        ) || null;
    }
    if (!familyEntry) return null;

    const hints =
      familyEntry?.operatorHints &&
      typeof familyEntry.operatorHints === "object"
        ? familyEntry.operatorHints
        : null;
    if (hints && operator) {
      const hinted = Object.entries(hints).find(([id]) => low(id) === operator);
      const hintedMode = String((hinted?.[1] as any)?.defaultMode || "").trim();
      if (hintedMode) return hintedMode;
    }
    const familyDefault = String(familyEntry?.defaultAnswerMode || "").trim();
    return familyDefault || null;
  }
}

let _answerModeRouter: AnswerModeRouterService | null = null;
export function getAnswerModeRouterService(): AnswerModeRouterService {
  if (!_answerModeRouter) _answerModeRouter = new AnswerModeRouterService();
  return _answerModeRouter;
}

export default AnswerModeRouterService;
