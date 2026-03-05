import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

import { writeCertificationGateReport } from "./reporting";

function readJson(relPath: string): any {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", relPath), "utf8"),
  );
}

function getLocalizedPatterns(value: unknown, locale: "en" | "pt" | "es"): string[] {
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  return [
    ...(Array.isArray(obj[locale]) ? (obj[locale] as unknown[]) : []),
    ...(Array.isArray(obj.any) ? obj.any : []),
  ]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function countInvalidRegex(patterns: string[]): number {
  let invalid = 0;
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, "i");
    } catch {
      invalid += 1;
    }
  }
  return invalid;
}

describe("Certification: follow-up overlay integrity", () => {
  test("required locales and runtime modes are present for follow-up overlays", () => {
    const requiredLocales: Array<"en" | "pt" | "es"> = ["en", "pt", "es"];
    const expectedValidModeCount = 2;
    const failures: string[] = [];
    const missingLocaleEntries: string[] = [];

    const intentPatterns = readJson("routing/intent_patterns.any.json");
    const followupIndicatorsOverlay = intentPatterns?.overlays?.followupIndicators;
    const intentPatternsEnabled = intentPatterns?.config?.enabled === true;
    if (!intentPatternsEnabled) {
      failures.push("intent_patterns_disabled");
    }
    if (!followupIndicatorsOverlay || typeof followupIndicatorsOverlay !== "object") {
      failures.push("intent_patterns_followup_overlay_missing");
    }

    let intentOverlayLocaleCoverageCount = 0;
    let invalidRegexCount = 0;
    for (const locale of requiredLocales) {
      const patterns = getLocalizedPatterns(followupIndicatorsOverlay, locale);
      if (patterns.length === 0) {
        missingLocaleEntries.push(`intent_patterns:${locale}`);
        failures.push(`intent_patterns_followup_overlay_missing_locale_${locale}`);
      } else {
        intentOverlayLocaleCoverageCount += 1;
      }
      invalidRegexCount += countInvalidRegex(patterns);
    }

    const followupIndicatorsBank = readJson("overlays/followup_indicators.any.json");
    const followupIndicatorsEnabled = followupIndicatorsBank?.config?.enabled === true;
    if (!followupIndicatorsEnabled) {
      failures.push("followup_indicators_disabled");
    }
    const applyStage = String(followupIndicatorsBank?.config?.applyStage || "").trim();
    if (applyStage !== "pre_routing") {
      failures.push(`followup_indicators_invalid_apply_stage:${applyStage || "missing"}`);
    }

    const rules = Array.isArray(followupIndicatorsBank?.rules)
      ? followupIndicatorsBank.rules
      : [];
    if (rules.length === 0) {
      failures.push("followup_indicators_rules_missing");
    }

    let indicatorsLocaleCoverageCount = 0;
    for (const locale of requiredLocales) {
      const localePatterns = rules.flatMap((rule: any) =>
        getLocalizedPatterns(rule?.triggerPatterns || {}, locale),
      );
      if (localePatterns.length === 0) {
        missingLocaleEntries.push(`followup_indicators:${locale}`);
        failures.push(`followup_indicators_missing_locale_${locale}`);
      } else {
        indicatorsLocaleCoverageCount += 1;
      }
      invalidRegexCount += countInvalidRegex(localePatterns);
    }

    if (invalidRegexCount > 0) {
      failures.push(`followup_overlay_invalid_regex_count:${invalidRegexCount}`);
    }

    const validModes: string[] = [];
    if (intentPatternsEnabled && intentOverlayLocaleCoverageCount === requiredLocales.length) {
      validModes.push("intent_patterns_overlay");
    }
    if (
      followupIndicatorsEnabled &&
      applyStage === "pre_routing" &&
      indicatorsLocaleCoverageCount === requiredLocales.length
    ) {
      validModes.push("followup_indicators_pre_routing");
    }
    const validModeCount = validModes.length;
    if (validModeCount < expectedValidModeCount) {
      failures.push("followup_overlay_runtime_modes_below_expected");
    }

    writeCertificationGateReport("followup-overlay-integrity", {
      passed: failures.length === 0,
      metrics: {
        requiredLocales: requiredLocales.join(","),
        missingLocales: missingLocaleEntries.join(","),
        missingLocaleCount: missingLocaleEntries.length,
        validModes: validModes.join(","),
        validModeCount,
        intentOverlayLocaleCoverageCount,
        indicatorsLocaleCoverageCount,
        indicatorsRuleCount: rules.length,
        invalidRegexCount,
        applyStage,
      },
      thresholds: {
        requiredLocaleCount: requiredLocales.length,
        expectedValidModeCount,
        maxMissingLocaleCount: 0,
        maxInvalidRegexCount: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
