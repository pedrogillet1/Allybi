import type { EditDomain } from "../editing.types";
import type { AllybiOperatorPlan } from "./operatorPlanner";

export interface AllybiExecutionEnvelope {
  instruction: string;
  domain: EditDomain;
  canonicalOperator: string;
  runtimeOperator: string;
  payload: Record<string, unknown>;
  metadata: {
    source: "allybi_planner";
    previewRenderType: string;
    requiresConfirmation: boolean;
  };
}

export function buildAllybiExecutionEnvelope(input: {
  instruction: string;
  plan: AllybiOperatorPlan;
  payload: Record<string, unknown>;
}): AllybiExecutionEnvelope {
  return {
    instruction: input.instruction,
    domain: input.plan.domain,
    canonicalOperator: input.plan.canonicalOperator,
    runtimeOperator: input.plan.runtimeOperator,
    payload: input.payload,
    metadata: {
      source: "allybi_planner",
      previewRenderType: input.plan.previewRenderType,
      requiresConfirmation: input.plan.requiresConfirmation,
    },
  };
}
