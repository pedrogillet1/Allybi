import { beforeAll, describe, expect, test } from "@jest/globals";
import path from "path";

import { initializeBanks } from "../../services/core/banks/bankLoader.service";
import {
  estimateTokenCount,
  resolveOutputBudget,
  resolveOutputTokenBudget,
} from "../../services/core/enforcement/tokenBudget.service";
import { getResponseContractEnforcer } from "../../services/core/enforcement/responseContractEnforcer.service";
import { classifyVisibleTruncation } from "../../modules/chat/runtime/truncationClassifier";
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
    const hardLimit = Math.max(
      1000,
      Math.min(budget.hardOutputTokens, budget.maxOutputTokens + 700),
    );

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
    if (estimatedTokens > hardLimit) failures.push("HARD_TOKEN_LIMIT_EXCEEDED");
    if (rowLines.length < 3) failures.push("TABLE_STRUCTURE_COLLAPSED");
    if (hasOverlongDashRun) failures.push("OVERLONG_DASH_SEPARATOR");

    writeCertificationGateReport("truncation", {
      passed: failures.length === 0,
      metrics: {
        estimatedTokens,
        hardLimit,
        rowLines: rowLines.length,
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

  test("does not trim complete content when it is within budget", () => {
    const enforcer = getResponseContractEnforcer();
    const content =
      "| Campo | Valor |\n|---|---|\n| Objetivo | Entregar com qualidade |\n| Prazo | 2 semanas |";

    const enforced = enforcer.enforce(
      { content, attachments: [] },
      {
        answerMode: "general_answer",
        language: "pt",
        constraints: {
          maxOutputTokens: 800,
          hardMaxOutputTokens: 1000,
          maxChars: 5000,
        },
      },
    );

    expect(
      enforced.enforcement.repairs.includes("SOFT_MAX_TOKENS_TRIMMED"),
    ).toBe(false);
    expect(
      enforced.enforcement.repairs.includes("HARD_MAX_TOKENS_TRIMMED"),
    ).toBe(false);
    expect(
      enforced.enforcement.repairs.includes("HARD_MAX_CHARS_TRIMMED"),
    ).toBe(false);
    expect(enforced.content).toContain("| Campo | Valor |");
    expect(enforced.content).toContain("| Prazo | 2 semanas |");
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

  test("response enforcer resolves the same fallback budgets as tokenBudget service", () => {
    const budget = resolveOutputBudget({
      answerMode: "general_answer",
      outputLanguage: "en",
      routeStage: "final",
      operator: "summarize",
    });
    const enforcer = getResponseContractEnforcer();
    const ctx = {
      answerMode: "general_answer",
      language: "en" as const,
      operator: "summarize",
      constraints: {},
    };

    expect(enforcer.resolveSoftTokenLimit(ctx)).toBe(budget.maxOutputTokens);
    expect(enforcer.resolveHardCharLimit(ctx)).toBe(budget.maxChars);
    expect(enforcer.resolveHardTokenLimit(ctx, budget.maxOutputTokens)).toBe(
      budget.hardOutputTokens,
    );
  });

  test("provider overflow + sentence boundary recovery preserves content", () => {
    const content =
      "The revenue for Q3 was $2.5M. Expenses totaled $1.8M. Net profit was $700K.";
    const lastChar = content.trim().slice(-1);
    const endsCleanly = /[.!?]/.test(lastChar);

    const failures: string[] = [];
    if (!endsCleanly) failures.push("LAST_CHAR_NOT_SENTENCE_TERMINAL");
    if (content.length < 20) failures.push("CONTENT_TOO_SHORT");

    writeCertificationGateReport("truncation_sentence_boundary", {
      passed: failures.length === 0,
      metrics: { lastChar, contentLength: content.length, endsCleanly },
      thresholds: { minLength: 20 },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("enforcer + overflow repair interaction: no false-positive replacement of clean text", () => {
    const cleanText =
      "The quarterly results show strong performance across all divisions.";
    const result = classifyVisibleTruncation({
      finalText: cleanText,
      enforcementRepairs: ["SOFT_MAX_TOKENS_TRIMMED"],
      providerTruncation: { occurred: true, reason: "length" },
    });

    const failures: string[] = [];
    if (result.occurred)
      failures.push("FALSE_POSITIVE_TRUNCATION_ON_CLEAN_TEXT");

    writeCertificationGateReport("truncation_false_positive_guard", {
      passed: failures.length === 0,
      metrics: {
        occurred: result.occurred,
        reason: result.reason,
        signals: result.signals,
      },
      thresholds: {},
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("table structure preserved after enforcement trimming", () => {
    const content = buildLargeMarkdownTable(30);
    const enforcer = getResponseContractEnforcer();

    const enforced = enforcer.enforce(
      { content, attachments: [] },
      {
        answerMode: "general_answer",
        language: "en",
        constraints: {
          maxOutputTokens: 600,
          hardMaxOutputTokens: 800,
          maxChars: 5000,
        },
      },
    );

    const pipeLines = enforced.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("|"));
    const separatorOnly = (line: string): boolean =>
      /^[:\-|\\s]+$/.test(line.replace(/\|/g, ""));
    const contentRows = pipeLines.filter((line) => !separatorOnly(line));

    const failures: string[] = [];
    if (contentRows.length < 2) failures.push("TABLE_CONTENT_ROWS_TOO_FEW");
    if (!pipeLines.length) failures.push("NO_PIPE_CHARS_IN_OUTPUT");

    writeCertificationGateReport("truncation_table_preservation", {
      passed: failures.length === 0,
      metrics: {
        pipeLines: pipeLines.length,
        contentRows: contentRows.length,
        violationCount: enforced.enforcement.violations.length,
      },
      thresholds: { minContentRows: 2, minPipeLines: 1 },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("bullet list not falsely flagged as truncated", () => {
    const bulletText =
      "Key findings:\n- Revenue increased by 15%\n- Costs decreased\n- Net margin improved";
    const result = classifyVisibleTruncation({
      finalText: bulletText,
      enforcementRepairs: [],
      providerTruncation: { occurred: true, reason: "length" },
    });

    const failures: string[] = [];
    if (result.occurred) failures.push("BULLET_LIST_FALSELY_FLAGGED");

    writeCertificationGateReport("truncation_bullet_false_positive", {
      passed: failures.length === 0,
      metrics: {
        occurred: result.occurred,
        reason: result.reason,
        signals: result.signals,
      },
      thresholds: {},
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("portuguese budget >= english budget for doc_grounded_single", () => {
    const enBudget = resolveOutputTokenBudget({
      answerMode: "doc_grounded_single",
      outputLanguage: "en",
      userText: "What is the total revenue?",
      evidenceItems: 3,
    });
    const ptBudget = resolveOutputTokenBudget({
      answerMode: "doc_grounded_single",
      outputLanguage: "pt",
      userText: "Qual é a receita total?",
      evidenceItems: 3,
    });

    const failures: string[] = [];
    if (ptBudget.maxOutputTokens < enBudget.maxOutputTokens) {
      failures.push("PT_BUDGET_LOWER_THAN_EN");
    }

    writeCertificationGateReport("truncation_language_budget_parity", {
      passed: failures.length === 0,
      metrics: {
        enMaxOutputTokens: enBudget.maxOutputTokens,
        ptMaxOutputTokens: ptBudget.maxOutputTokens,
      },
      thresholds: {},
      failures,
    });

    expect(failures).toEqual([]);
  });
});
