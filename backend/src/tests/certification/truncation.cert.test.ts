import { beforeAll, describe, expect, test } from "@jest/globals";
import path from "path";

import { initializeBanks } from "../../services/core/banks/bankLoader.service";
import {
  estimateTokenCount,
  resolveOutputTokenBudget,
} from "../../services/core/enforcement/tokenBudget.service";
import { getResponseContractEnforcer } from "../../services/core/enforcement/responseContractEnforcer.service";
import { writeCertificationGateReport } from "./reporting";

function buildLargeMarkdownTable(rows: number): string {
  const header = "| Item | Value | Notes |\n|---|---|---|";
  const body = Array.from({ length: rows })
    .map(
      (_, idx) =>
        `| Row ${idx + 1} | ${(idx + 1) * 13} | Detail line ${idx + 1} with context and constraints |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

describe("Certification: truncation and output formatting", () => {
  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  test("enforcer keeps output within hard token budget and preserves table structure", () => {
    const budget = resolveOutputTokenBudget({
      answerMode: "doc_grounded_table",
      outputLanguage: "en",
      userText: "Build a comprehensive table from document evidence.",
      hasTables: true,
      evidenceItems: 10,
    });

    const content = buildLargeMarkdownTable(120);
    const enforcer = getResponseContractEnforcer();
    const hardLimit = Math.max(160, Math.min(220, budget.hardOutputTokens));

    const enforced = enforcer.enforce(
      { content, attachments: [] },
      {
        answerMode: "general_answer",
        language: "en",
        constraints: {
          maxOutputTokens: hardLimit,
          hardMaxOutputTokens: hardLimit,
          maxChars: 9000,
        },
      },
    );

    const rowLines = enforced.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("|"));
    const hasOverlongDashRun = /-{250,}/.test(enforced.content);
    const estimatedTokens = estimateTokenCount(enforced.content);

    const failures: string[] = [];
    if (enforced.enforcement.blocked) failures.push("ENFORCER_BLOCKED_OUTPUT");
    if (estimatedTokens > hardLimit) failures.push("HARD_TOKEN_LIMIT_EXCEEDED");
    if (rowLines.length < 3) failures.push("TABLE_STRUCTURE_COLLAPSED");
    if (hasOverlongDashRun) failures.push("OVERLONG_DASH_SEPARATOR");

    writeCertificationGateReport("truncation", {
      passed: failures.length === 0,
      metrics: {
        estimatedTokens,
        hardLimit,
        rowLines: rowLines.length,
        blocked: enforced.enforcement.blocked,
        hasOverlongDashRun,
      },
      thresholds: {
        maxEstimatedTokens: hardLimit,
        minTableLines: 3,
        maxDashRun: 249,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("portuguese output budget is not lower than english for same prompt", () => {
    const enBudget = resolveOutputTokenBudget({
      answerMode: "doc_grounded_multi",
      outputLanguage: "en",
      userText: "Create a complete answer with evidence and details.",
      evidenceItems: 8,
    });
    const ptBudget = resolveOutputTokenBudget({
      answerMode: "doc_grounded_multi",
      outputLanguage: "pt",
      userText: "Crie uma resposta completa com evidências e detalhes.",
      evidenceItems: 8,
    });

    expect(ptBudget.maxOutputTokens).toBeGreaterThanOrEqual(
      enBudget.maxOutputTokens,
    );
  });
});
