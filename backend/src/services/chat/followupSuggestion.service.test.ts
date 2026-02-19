import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

import { FollowupSuggestionService } from "./followupSuggestion.service";

type AnyBank = Record<string, any>;

function loadDefaultBank(): AnyBank {
  const p = path.resolve(
    process.cwd(),
    "src/data_banks/microcopy/followup_suggestions.any.json",
  );
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function makeService(bank: AnyBank): FollowupSuggestionService {
  return new FollowupSuggestionService(() => bank as any);
}

function mkDocInput(
  overrides: Partial<Parameters<FollowupSuggestionService["select"]>[0]> = {},
) {
  return {
    lang: "en" as const,
    answerMode: "doc_grounded_single",
    answerClass: "DOCUMENT",
    intent: "RAG_QUERY",
    query: "Where does this appear in the report?",
    answerText: "It appears on page 3 in section 2.",
    sources: [
      {
        documentId: "doc-1",
        filename: "Q4 Revenue Report.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        page: 3,
      },
    ],
    ...overrides,
  };
}

describe("FollowupSuggestionService", () => {
  test("suppresses followups for non-document answers", () => {
    const service = makeService(loadDefaultBank());
    const out = service.select(
      mkDocInput({
        answerMode: "general_answer",
        answerClass: "GENERAL",
        intent: "GENERAL_CHAT",
      }),
    );
    expect(out).toEqual([]);
  });

  test("returns adaptive spreadsheet followups with document placeholders rendered", () => {
    const service = makeService(loadDefaultBank());
    const out = service.select(
      mkDocInput({
        query: "What are the totals and variances?",
        answerText: "Revenue is $1,245,000 and margin is 12.5%.",
      }),
    );

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0]?.label).toBeTruthy();
    expect(out[0]?.query).toContain("Q4 Revenue Report");
    expect(out.some((x) => /totals|outliers|line items/i.test(x.query))).toBe(
      true,
    );
  });

  test("returns no chips when no adaptive rule matches", () => {
    const service = makeService(loadDefaultBank());
    const out = service.select(
      mkDocInput({
        query: "Review this file.",
        answerText: "This file describes onboarding process details.",
        sources: [
          {
            documentId: "doc-2",
            filename: "Onboarding.pdf",
            mimeType: "application/pdf",
            page: null,
          },
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  test("uses language-specific suggestions when available", () => {
    const service = makeService(loadDefaultBank());
    const out = service.select(
      mkDocInput({
        lang: "pt",
        query: "Onde isso aparece?",
        answerText: "Aparece na pagina 2.",
        sources: [
          {
            documentId: "doc-3",
            filename: "Contrato.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            page: 2,
          },
        ],
      }),
    );
    expect(out.length).toBeGreaterThan(0);
    expect(
      out.some((x) => /secao|pagina|linhas|contexto/i.test(x.label + x.query)),
    ).toBe(true);
  });

  test("deduplicates and caps followups by maxFollowups", () => {
    const service = makeService({
      config: { enabled: true, maxFollowups: 2, requireDocumentEvidence: true },
      rules: [
        {
          when: {
            all: [{ path: "answerClass", op: "eq", value: "DOCUMENT" }],
          },
          suggestions: {
            en: [
              { label: "A", query: "Repeat this" },
              { label: "B", query: "Repeat this" },
              { label: "C", query: "Unique third" },
            ],
          },
        },
      ],
    });

    const out = service.select(mkDocInput());
    expect(out).toEqual([
      { label: "A", query: "Repeat this" },
      { label: "C", query: "Unique third" },
    ]);
  });

  test("classifies pptx mime types correctly for docType-based rules", () => {
    const service = makeService({
      config: { enabled: true, maxFollowups: 3, requireDocumentEvidence: true },
      rules: [
        {
          when: {
            all: [
              { path: "answerClass", op: "eq", value: "DOCUMENT" },
              { path: "answerMode", op: "startsWith", value: "doc_grounded" },
              { path: "intent", op: "eq", value: "RAG_QUERY" },
              { path: "hasSources", op: "eq", value: true },
              { path: "docType", op: "eq", value: "pptx" },
            ],
          },
          suggestions: {
            en: [{ label: "Slide recap", query: "Summarize each slide" }],
          },
        },
      ],
    });

    const out = service.select(
      mkDocInput({
        query: "Summarize this deck",
        answerText: "The deck has 12 slides.",
        sources: [
          {
            documentId: "deck-1",
            filename: "Board Review.pptx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            page: null,
          },
        ],
      }),
    );
    expect(out).toEqual([{ label: "Slide recap", query: "Summarize each slide" }]);
  });
});
