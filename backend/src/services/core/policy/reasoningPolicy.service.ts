import { getOptionalBank } from "../banks/bankLoader.service";

export type ReasoningGuidance = {
  text: string;
  assumptionsLimit: number;
  domain: string | null;
};

const DOMAIN_HINTS = new Set(["finance", "legal", "medical", "ops", "accounting"]);

function normalizeDomain(input: unknown): string | null {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (DOMAIN_HINTS.has(value)) return value;
  return null;
}

function clampInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(5, Math.floor(parsed)));
}

export class ReasoningPolicyService {
  buildGuidance(input: {
    domain?: string | null;
    answerMode?: string | null;
    outputLanguage?: string | null;
  }): ReasoningGuidance {
    const assumptionPolicy = getOptionalBank<Record<string, unknown>>("assumption_policy");
    const apConfig = assumptionPolicy?.config as Record<string, unknown> | undefined;
    const assumptionsLimit = clampInt(
      apConfig?.maxAssumptionsPerAnswer,
      2,
    );

    const domain = normalizeDomain(input.domain);
    const decisionSupport = domain
      ? getOptionalBank<Record<string, unknown>>(`decision_support_${domain}`)
      : null;
    const explainStyle = domain
      ? getOptionalBank<Record<string, unknown>>(`explain_style_${domain}`)
      : null;

    const lines: string[] = [];
    lines.push(`- Maximum explicit assumptions: ${assumptionsLimit}.`);

    const framework = decisionSupport?.framework as Record<string, unknown> | undefined;
    if (framework?.requireOptions) lines.push("- Provide at least 2 options when recommending a decision.");
    if (framework?.requireRiskTradeoffs) lines.push("- Include explicit risk tradeoffs.");
    if (framework?.requireEvidenceSummary) lines.push("- Include a concise evidence-bounded summary.");
    if (framework?.requireUncertaintyStatement)
      lines.push("- State uncertainty and separate facts from assumptions.");
    if (framework?.requireWhatChangesMyMind)
      lines.push("- Include what evidence would change the recommendation.");

    const template = Array.isArray(explainStyle?.templates)
      ? (explainStyle.templates as Array<Record<string, unknown>>).find((item: Record<string, unknown>) => {
          const depth = String(item?.depth || "").trim().toLowerCase();
          const language = String(item?.language || "").trim().toLowerCase();
          const requested = String(input.outputLanguage || "en")
            .trim()
            .toLowerCase();
          const isLangOk = !language || language === requested || language === "any";
          return isLangOk && (depth === "summary" || depth === "paragraph");
        })
      : null;
    if (template?.uncertaintyStyle) {
      lines.push(`- ${String(template.uncertaintyStyle).trim()}`);
    }

    if (String(input.answerMode || "") === "rank_disambiguate") {
      lines.push("- Ask at most one clarification question.");
    }

    return {
      text: lines.join("\n"),
      assumptionsLimit,
      domain,
    };
  }
}
