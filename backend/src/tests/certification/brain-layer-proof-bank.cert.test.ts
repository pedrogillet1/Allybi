import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

import { writeCertificationGateReport } from "./reporting";

type GoldCase = {
  id: string;
  brainQuestionId: string;
  brainLayer: string;
  category: string;
  lang: string;
  regressionLinks?: string[];
};

type TrapCase = {
  id: string;
  brainLayer: string;
  category: string;
  lang: string;
  regressionLinks?: string[];
};

type ParityPair = {
  pairId: string;
  brainLayer: string;
  category: string;
  docId: string;
  en: { query: string };
  pt: { query: string };
  regressionLinks?: string[];
};

type StyleCase = {
  id: string;
  brainLayer: string;
  dimension: string;
  language: string;
};

function readJson<T>(relativePath: string): T {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;
}

describe("Certification: brain-layer proof bank", () => {
  test("owned proof banks cover all required layers, traps, and parity paths", () => {
    const gold = readJson<{ cases: GoldCase[] }>(
      "src/data_banks/document_intelligence/eval/gold_queries/brain_questions.any.json",
    );
    const adversarial = readJson<{ cases: TrapCase[] }>(
      "src/data_banks/document_intelligence/eval/adversarial/brain_traps.any.json",
    );
    const multilingual = readJson<{ pairs: ParityPair[] }>(
      "src/data_banks/document_intelligence/eval/multilingual/pt_en_parity.any.json",
    );
    const style = readJson<{ cases: StyleCase[] }>(
      "src/data_banks/document_intelligence/eval/style/composition.any.json",
    );

    const failures: string[] = [];
    const brainQuestionIds = new Set(gold.cases.map((item) => item.brainQuestionId));
    for (let index = 1; index <= 8; index += 1) {
      const id = `BQ${index}`;
      if (!brainQuestionIds.has(id)) failures.push(`MISSING_${id}`);
    }

    const requiredCategories = [
      "retrieval_precision",
      "field_exactness",
      "wrong_doc_trap",
      "provenance_richness",
      "false_clarification_trap",
      "weak_answer_recovery",
      "composition",
      "multilingual_parity",
    ];
    const categories = new Set(
      gold.cases
        .map((item) => item.category)
        .concat(adversarial.cases.map((item) => item.category))
        .concat(multilingual.pairs.map((item) => item.category)),
    );
    for (const category of requiredCategories) {
      if (!categories.has(category)) failures.push(`MISSING_CATEGORY_${category}`);
    }

    const dimensions = new Set(style.cases.map((item) => item.dimension));
    for (const dimension of [
      "analytical_format_blocks",
      "evidence_first_structure",
      "non_robotic_tone",
      "uncertainty_language",
    ]) {
      if (!dimensions.has(dimension)) {
        failures.push(`MISSING_STYLE_DIMENSION_${dimension}`);
      }
    }

    const ptCases = gold.cases.filter((item) => item.lang === "pt").length;
    const enCases = gold.cases.filter((item) => item.lang === "en").length;
    if (ptCases === 0 || enCases === 0) failures.push("MISSING_GOLD_LANGUAGE_COVERAGE");

    const invalidPairs = multilingual.pairs.filter(
      (item) =>
        !item.docId ||
        !String(item.en?.query || "").trim() ||
        !String(item.pt?.query || "").trim(),
    );
    if (invalidPairs.length > 0) failures.push("INVALID_PARITY_PAIRS");

    const regressionLinkCount =
      gold.cases.reduce((count, item) => count + (item.regressionLinks?.length || 0), 0) +
      adversarial.cases.reduce(
        (count, item) => count + (item.regressionLinks?.length || 0),
        0,
      ) +
      multilingual.pairs.reduce(
        (count, item) => count + (item.regressionLinks?.length || 0),
        0,
      );
    if (regressionLinkCount < 10) failures.push("REGRESSION_LINKS_TOO_FEW");

    writeCertificationGateReport("brain-layer-proof-bank", {
      passed: failures.length === 0,
      metrics: {
        goldCaseCount: gold.cases.length,
        adversarialCaseCount: adversarial.cases.length,
        parityPairCount: multilingual.pairs.length,
        styleCaseCount: style.cases.length,
        brainQuestionCoverage: brainQuestionIds.size,
        categoryCoverage: categories.size,
        regressionLinkCount,
      },
      thresholds: {
        minGoldCaseCount: 8,
        minAdversarialCaseCount: 6,
        minParityPairCount: 4,
        minStyleCaseCount: 6,
        minBrainQuestionCoverage: 8,
        minRegressionLinkCount: 10,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
