/**
 * Worklog builder.
 *
 * Converts ResolvedPlanStep[] → user-friendly WorklogStep[] (EN/PT)
 * using uiStepTemplate from the operator catalog.
 */

import type { ResolvedPlanStep, WorklogStep } from "./types";
import { loadOperatorCatalog } from "./loaders";

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

function interpolateTemplate(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, slotName) => {
    const value = params[slotName];
    if (value === null || value === undefined) return "...";
    return String(value);
  });
}

// ---------------------------------------------------------------------------
// Fallback labels
// ---------------------------------------------------------------------------

function fallbackLabel(op: string, lang: "en" | "pt"): string {
  // Generate a readable label from the operator ID
  const clean = op
    .replace(/^(?:XLSX_|DOCX_)/, "")
    .replace(/_/g, " ")
    .toLowerCase();

  if (lang === "pt") {
    return `Executando ${clean}...`;
  }
  return `Running ${clean}...`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildWorklog(
  steps: ResolvedPlanStep[],
  language: "en" | "pt",
): WorklogStep[] {
  const catalog = loadOperatorCatalog();

  return steps.map((step) => {
    const entry = catalog[step.op];
    let title: string;

    if (entry?.uiStepTemplate) {
      const template =
        language === "pt"
          ? entry.uiStepTemplate.pt
          : entry.uiStepTemplate.en;
      title = interpolateTemplate(template, step.params);
    } else {
      title = fallbackLabel(step.op, language);
    }

    // Append locale conversion note if formula was normalized
    if (step.localeConversions?.length) {
      const note =
        language === "pt"
          ? `(fórmula PT interpretada: ${step.localeConversions.join(", ")})`
          : `(interpreted PT formula: ${step.localeConversions.join(", ")})`;
      title = `${title} ${note}`;
    }

    return {
      stepId: step.stepId,
      title,
      status: "queued" as const,
    };
  });
}
