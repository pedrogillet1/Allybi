import { getOptionalBank } from "../banks/bankLoader.service";
import { PolicyRuntimeEngine } from "./policyRuntimeEngine.service";
import { allowPolicyDecision, type PolicyDecision } from "./policyDecision";

type ClarificationPolicyBank = {
  config?: {
    enabled?: boolean;
    actionsContract?: {
      thresholds?: {
        maxQuestions?: number;
        minOptions?: number;
        maxOptions?: number;
      };
    };
  };
  policies?: {
    rules?: Array<Record<string, unknown>>;
  };
};

type ClarificationPolicyBankProvider = {
  getBank(): ClarificationPolicyBank | null;
};

export type ClarificationPolicyLimits = {
  enabled: boolean;
  maxQuestions: number;
  minOptions: number;
  maxOptions: number;
};

export type ClarificationPolicyDecision = PolicyDecision & {
  blocked: boolean;
};

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function defaultRuntime(input?: {
  runtime?: Record<string, unknown>;
}): Record<string, unknown> {
  return (
    (input?.runtime as Record<string, unknown>) || {
      signals: {},
      metrics: {},
    }
  );
}

export class ClarificationPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  constructor(
    private readonly bankProvider: ClarificationPolicyBankProvider = {
      getBank: () =>
        getOptionalBank<ClarificationPolicyBank>("clarification_policy"),
    },
  ) {}

  resolveLimits(input?: {
    runtime?: Record<string, unknown>;
  }): ClarificationPolicyLimits {
    const bank = this.bankProvider.getBank();
    const thresholds = bank?.config?.actionsContract?.thresholds || {};
    const maxQuestions = clamp(thresholds.maxQuestions, 0, 3, 1);
    const minOptions = clamp(thresholds.minOptions, 1, 8, 2);
    const maxOptions = clamp(thresholds.maxOptions, 1, 12, 4);
    const overrides = this.decide(input).constraints || {};
    const resolvedMaxQuestions =
      overrides.maxQuestions !== undefined
        ? clamp(overrides.maxQuestions, 0, 3, maxQuestions)
        : maxQuestions;
    const resolvedMaxOptions =
      overrides.maxOptions !== undefined
        ? clamp(overrides.maxOptions, 1, 12, maxOptions)
        : maxOptions;
    const resolvedMinOptions =
      overrides.minOptions !== undefined
        ? clamp(overrides.minOptions, 1, 8, minOptions)
        : minOptions;

    return {
      enabled: bank?.config?.enabled !== false,
      maxQuestions: resolvedMaxQuestions,
      minOptions: Math.min(resolvedMinOptions, resolvedMaxOptions),
      maxOptions: resolvedMaxOptions,
    };
  }

  decide(input?: {
    runtime?: Record<string, unknown>;
  }): ClarificationPolicyDecision {
    const bank = this.bankProvider.getBank();
    if (!bank?.config?.enabled) {
      return { ...allowPolicyDecision(), blocked: false };
    }

    const match = this.engine.firstMatch({
      policyBank: bank as Record<string, unknown>,
      runtime: defaultRuntime(input),
    });
    if (!match || match.ruleId === "__default__") {
      return { ...allowPolicyDecision(), blocked: false };
    }

    const action = String(match.then.action || "allow").trim() || "allow";
    const routeTo = String(match.then.routeTo || "").trim() || null;

    return {
      blocked: action !== "allow",
      action,
      ruleId: match.ruleId || null,
      reasonCode: match.reasonCode,
      terminal:
        match.terminal === true ||
        (match.then as Record<string, unknown> | undefined)?.terminal === true,
      routeTo,
      category: null,
      constraints: this.extractLimitOverrides(match.then),
    };
  }

  private extractLimitOverrides(input: Record<string, unknown>): {
    maxQuestions?: number;
    minOptions?: number;
    maxOptions?: number;
  } {
    const constraints =
      input.constraints && typeof input.constraints === "object"
        ? (input.constraints as Record<string, unknown>)
        : {};
    const transforms = Array.isArray(input.transform)
      ? (input.transform as Array<Record<string, unknown>>)
      : [];

    let maxQuestions = Number(constraints.maxQuestions);
    let minOptions = Number(constraints.minOptions);
    let maxOptions = Number(constraints.maxOptions);

    for (const transform of transforms) {
      const type = String(transform?.type || "").trim();
      if (type === "limit_questions") {
        const max = Number(transform?.max);
        if (Number.isFinite(max)) maxQuestions = max;
      }
      if (type === "limit_options") {
        const min = Number(transform?.min);
        const max = Number(transform?.max);
        if (Number.isFinite(min)) minOptions = min;
        if (Number.isFinite(max)) maxOptions = max;
      }
    }

    return {
      ...(Number.isFinite(maxQuestions) ? { maxQuestions } : {}),
      ...(Number.isFinite(minOptions) ? { minOptions } : {}),
      ...(Number.isFinite(maxOptions) ? { maxOptions } : {}),
    };
  }
}
