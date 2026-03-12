import { injectable } from "tsyringe";
import { getOptionalBank } from "../banks/bankLoader.service";
import {
  evaluateExtractionQualityGates,
  evaluateQualityGate,
  getAvailableQualityGateNames,
  type QualityGateContext,
  type QualityGatesBank,
  type QualityGateResult,
  type QualityRunResult,
  resolveQualityGateOrder,
  validateConfiguredGateNames,
  validateRequiredHookBanks,
} from "./qualityGateRegistry";

function resolveRuntimeEnv(): "production" | "staging" | "dev" | "local" {
  const raw = String(
    process.env.RUNTIME_ENV ||
      process.env.APP_ENV ||
      process.env.NODE_ENV ||
      "",
  )
    .trim()
    .toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  if (raw === "local") return "local";
  return "dev";
}

@injectable()
export class QualityGateRunnerService {
  private getQualityBank(): QualityGatesBank | null {
    return getOptionalBank<QualityGatesBank>("quality_gates");
  }

  private isStrictFailClosedMode(qualityBank: QualityGatesBank | null): boolean {
    const env = resolveRuntimeEnv();
    const configured = qualityBank?.config?.modes?.byEnv?.[env];
    if (typeof configured?.failClosed === "boolean") {
      return configured.failClosed;
    }
    return env === "production" || env === "staging";
  }

  async runGates(response: string, context: unknown): Promise<QualityRunResult> {
    const ctx = (context || {}) as QualityGateContext;
    const qualityBank = this.getQualityBank();
    const strictFailClosed = this.isStrictFailClosedMode(qualityBank);
    const gateOrder = resolveQualityGateOrder(qualityBank);

    const results: QualityGateResult[] = [
      ...validateConfiguredGateNames(gateOrder, strictFailClosed),
      ...validateRequiredHookBanks(gateOrder, qualityBank, strictFailClosed),
    ];

    for (const gateName of gateOrder) {
      results.push(evaluateQualityGate(gateName, response, ctx, qualityBank));
    }
    results.push(...evaluateExtractionQualityGates(response, ctx));

    const allPassed = results.every((result) => result.passed);
    const finalScore =
      results.length > 0
        ? results.reduce((sum, result) => sum + (result.score ?? 0), 0) /
          results.length
        : 1;

    return { allPassed, results, finalScore };
  }

  async runGate(
    gateName: string,
    response: string,
    context: unknown,
  ): Promise<QualityGateResult> {
    return evaluateQualityGate(
      gateName,
      response,
      (context || {}) as QualityGateContext,
      this.getQualityBank(),
    );
  }

  getAvailableGates(): string[] {
    return getAvailableQualityGateNames();
  }
}

export type {
  QualityGateContext,
  QualityGateResult,
  QualityRunResult,
} from "./qualityGateRegistry";
