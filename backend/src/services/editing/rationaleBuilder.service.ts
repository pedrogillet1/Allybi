import type { EditConstraintSet, EditRationale } from "./editing.types";

export interface RationaleInput {
  constraints: EditConstraintSet;
  operationLabel: string;
  preservedTokens?: string[];
  sourceProofCount?: number;
  formatLossRisk?: boolean;
  targetAmbiguous?: boolean;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export class RationaleBuilderService {
  build(input: RationaleInput): EditRationale {
    const reasons: string[] = [
      `Executed ${input.operationLabel.toLowerCase()} on the selected target only.`,
    ];
    const guardrails: string[] = [];

    if (input.constraints.strictNoNewFacts) {
      reasons.push("Applied strict no-new-facts rewriting.");
      guardrails.push("No new facts introduced");
    }
    if (input.constraints.preserveNumbers) {
      reasons.push("Protected numeric tokens from drift.");
      guardrails.push("Numbers preserved");
    }
    if (input.constraints.preserveEntities) {
      reasons.push("Protected named entities from drift.");
      guardrails.push("Named entities preserved");
    }
    if ((input.sourceProofCount || 0) > 0) {
      reasons.push(`Grounded with ${input.sourceProofCount} local proof excerpt(s).`);
      guardrails.push("Evidence anchored");
    }
    if (input.targetAmbiguous) {
      guardrails.push("Ambiguous target flagged");
    }

    const preserved = dedupe(input.preservedTokens || []);

    let riskLevel: "LOW" | "MED" | "HIGH" = "LOW";
    if (input.targetAmbiguous || input.formatLossRisk) riskLevel = "MED";
    if (input.targetAmbiguous && input.formatLossRisk) riskLevel = "HIGH";

    const styleMatched = `${input.constraints.tone}/${input.constraints.outputLanguage}`;

    return {
      reasons,
      preserved,
      styleMatched,
      riskLevel,
      guardrails: dedupe(guardrails),
    };
  }
}

