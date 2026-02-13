import type { EditDomain } from "../editing.types";
import { classifyAllybiIntent } from "./intentClassifier";
import { planAllybiOperatorSteps, type AllybiOperatorStep } from "./operatorPlanner";
import { resolveAllybiScope } from "./scopeResolver";

export interface MultiIntentConflict {
  code: string;
  message: string;
  stepIds: string[];
}

export interface MultiIntentPlan {
  directives: string[];
  steps: AllybiOperatorStep[];
  conflicts: MultiIntentConflict[];
}

function detectLanguage(message: string): "en" | "pt" {
  const low = String(message || "").toLowerCase();
  if (/\b(portugu[eê]s|pt-br|pt)\b/.test(low)) return "pt";
  if (/[ãõçáâêôàéíóú]/.test(low)) return "pt";
  return "en";
}

function splitDirectives(message: string, language: "en" | "pt"): string[] {
  const text = String(message || "").trim();
  if (!text) return [];
  const separators = language === "pt"
    ? /^(?:,\s*|\s+\be\b\s+|\s+\btamb[eé]m\b\s+|\s+\bem seguida\b\s+|\s+\bdepois\b\s+|\s+\bal[eé]m disso\b\s+)/i
    : /^(?:,\s*|\s+\band\b\s+|\s+\bthen\b\s+|\s+\balso\b\s+|\s+\bafter that\b\s+|\s+\bplus\b\s+)/i;

  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === "\"") {
      if (!quote) quote = ch as "'" | '"';
      else if (quote === ch) quote = null;
      current += ch;
      continue;
    }
    if (!quote) {
      const rest = text.slice(i);
      const m = rest.match(separators);
      if (m) {
        if (current.trim()) out.push(current.trim());
        current = "";
        i += m[0].length - 1;
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.length > 0 ? out : [text];
}

function rankStep(domain: EditDomain, canonicalOperator: string): number {
  const op = String(canonicalOperator || "");
  if (domain === "docx") {
    if (/LIST_|INSERT|DELETE|MERGE|SPLIT|TOC/.test(op)) return 10;
    if (/REWRITE|REPLACE|FIND_REPLACE/.test(op)) return 20;
    if (/TRANSLATE/.test(op)) return 30;
    if (/STYLE|FORMAT/.test(op)) return 40;
    return 50;
  }
  if (domain === "sheets") {
    if (/TABLE|SORT|FILTER|FREEZE/.test(op)) return 10;
    if (/FORMULA|COMPUTE/.test(op)) return 20;
    if (/CHART/.test(op)) return 30;
    if (/FORMAT/.test(op)) return 40;
    return 50;
  }
  return 50;
}

function hasTranslateFirstCue(message: string): boolean {
  const low = String(message || "").toLowerCase();
  const hasTranslate = /\b(translate|traduza|traduzir|tradu[çc][aã]o)\b/.test(low);
  const hasFirst = /\b(first|firstly|primeiro|primeiramente)\b/.test(low);
  return hasTranslate && hasFirst;
}

function mergeCompatible(steps: AllybiOperatorStep[]): AllybiOperatorStep[] {
  const merged: AllybiOperatorStep[] = [];
  const seen = new Map<string, AllybiOperatorStep>();
  for (const step of steps) {
    const key = `${step.canonicalOperator}::${step.targetHint || ""}`;
    if (step.isFormattingOnly) {
      if (!seen.has(key)) {
        seen.set(key, step);
        merged.push(step);
      }
      continue;
    }
    merged.push(step);
  }
  return merged.map((step, idx) => ({ ...step, stepId: `step_${idx + 1}` }));
}

function detectConflicts(steps: AllybiOperatorStep[]): MultiIntentConflict[] {
  const conflicts: MultiIntentConflict[] = [];
  const byTarget = new Map<string, AllybiOperatorStep[]>();
  for (const step of steps) {
    const key = step.targetHint || "__global__";
    const list = byTarget.get(key) || [];
    list.push(step);
    byTarget.set(key, list);
  }

  for (const [target, ops] of byTarget.entries()) {
    const hasRewrite = ops.some((x) => /REWRITE|REPLACE/.test(x.canonicalOperator));
    const hasTranslate = ops.some((x) => /TRANSLATE/.test(x.canonicalOperator));
    if (hasRewrite && hasTranslate) {
      conflicts.push({
        code: "MULTI_INTENT_TARGET_CONFLICT",
        message: `Target '${target}' has both rewrite and translate directives.`,
        stepIds: ops.map((x) => x.stepId),
      });
    }
  }
  return conflicts;
}

export function buildMultiIntentPlan(input: {
  domain: EditDomain;
  message: string;
  frozenSelection?: unknown;
  liveSelection?: unknown;
  explicitTarget?: string | null;
}): MultiIntentPlan {
  const language = detectLanguage(input.message);
  const directives = splitDirectives(input.message, language);
  const allSteps: AllybiOperatorStep[] = [];

  for (const directive of directives) {
    const domainForIntent = input.domain === "sheets" ? "xlsx" : input.domain;
    if (domainForIntent !== "docx" && domainForIntent !== "xlsx") continue;

    const intent = classifyAllybiIntent(directive, domainForIntent, language);
    const scope = resolveAllybiScope({
      domain: domainForIntent,
      frozenSelection: input.frozenSelection,
      liveSelection: input.liveSelection,
      explicitTarget: input.explicitTarget || null,
      message: directive,
      classifiedIntent: intent,
    });
    const steps = planAllybiOperatorSteps({
      domain: input.domain,
      message: directive,
      classifiedIntent: intent,
      scope,
    });
    for (const step of steps) allSteps.push(step);
  }

  const preferTranslateFirst = hasTranslateFirstCue(input.message);
  const ordered = allSteps
    .slice()
    .sort((a, b) => {
      if (preferTranslateFirst) {
        const aTrans = /TRANSLATE/.test(a.canonicalOperator);
        const bTrans = /TRANSLATE/.test(b.canonicalOperator);
        if (aTrans !== bTrans) return aTrans ? -1 : 1;
      }
      return rankStep(input.domain, a.canonicalOperator) - rankStep(input.domain, b.canonicalOperator);
    });
  const merged = mergeCompatible(ordered);
  const conflicts = detectConflicts(merged);

  return {
    directives,
    steps: merged,
    conflicts,
  };
}
