import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../core/banks/bankLoader.service";
import {
  resolveEditErrorMessage,
  resolveRuntimeFallbackMessage,
} from "./chatMicrocopy.service";

const mockGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

function mockBanks(params: {
  messages: Record<string, Record<string, string[]>>;
  routerRules: Array<any>;
  telemetryMap?: Record<string, string>;
  noDocsBank?: any;
  scopedNotFoundBank?: any;
  disambiguationBank?: any;
  editErrorBank?: any;
}) {
  mockGetOptionalBank.mockImplementation((bankId: string) => {
    if (bankId === "processing_messages") {
      return {
        config: { enabled: true },
        messages: params.messages,
      } as any;
    }
    if (bankId === "fallback_router") {
      return {
        config: { enabled: true, defaults: { action: "ask_one_question" } },
        rules: params.routerRules,
        maps: {
          reasonCodeToTelemetryReason: params.telemetryMap || {},
        },
      } as any;
    }
    if (bankId === "no_docs_messages") {
      return params.noDocsBank || null;
    }
    if (bankId === "scoped_not_found_messages") {
      return params.scopedNotFoundBank || null;
    }
    if (bankId === "disambiguation_microcopy") {
      return params.disambiguationBank || null;
    }
    if (bankId === "edit_error_catalog") {
      return (
        params.editErrorBank || {
          config: { enabled: true, fallbackLanguage: "en" },
          errors: { en: { GENERIC_EDIT_ERROR: "generic" } },
        }
      ) as any;
    }
    return null as any;
  });
}

describe("resolveRuntimeFallbackMessage", () => {
  test("maps route_to_discovery to retry microcopy when no-docs bank is unavailable", () => {
    mockBanks({
      messages: {
        retry: { en: ["retry message"] },
      },
      routerRules: [
        {
          when: { reasonCodeIn: ["no_docs_indexed"] },
          do: { action: "route_to_discovery", telemetryReason: "NO_EVIDENCE" },
        },
      ],
    });

    const out = resolveRuntimeFallbackMessage({
      language: "en",
      reasonCode: "no_docs_indexed",
      seed: "seed-1",
    });
    expect(out).toBe("retry message");
  });

  test("routes no_docs_indexed to no_docs_messages bank when available", () => {
    mockBanks({
      messages: {
        retry: { en: ["retry message"] },
      },
      routerRules: [],
      noDocsBank: {
        config: {
          enabled: true,
          hardConstraints: { maxSentences: 3, maxCharsHard: 300 },
          assembly: {
            partsOrder: ["ack", "detail", "action"],
            optionalParts: ["detail"],
            maxPartsUsed: 3,
            sentenceStrategy: { joiner: " " },
          },
          placeholders: {
            sanitization: { stripNewlines: true, maxReplacementChars: 80 },
          },
        },
        routing: {
          byState: { empty_index: "empty" },
          fallbackScenario: "empty",
        },
        scenarios: {
          empty: {
            parts: {
              ack: [{ lang: "en", t: "No indexed documents yet." }],
              detail: [
                {
                  lang: "en",
                  t: "Supported types: {{expectedDocTypes}}.",
                  useOnlyIfProvided: true,
                },
              ],
              action: [{ lang: "en", t: "Upload a file and try again." }],
            },
          },
        },
      },
    });

    const out = resolveRuntimeFallbackMessage({
      language: "en",
      reasonCode: "no_docs_indexed",
      seed: "seed-2",
      context: {
        expectedDocTypes: "PDF, DOCX",
      },
      routeHints: {
        hasIndexedDocs: false,
      },
    });

    expect(out).toContain("No indexed documents yet.");
    expect(out).toContain("Supported types: PDF, DOCX.");
  });

  test("routes scoped empty reason to scoped_not_found_messages bank", () => {
    mockBanks({
      messages: {
        retry: { en: ["retry message"] },
      },
      routerRules: [],
      scopedNotFoundBank: {
        config: {
          enabled: true,
          hardConstraints: { maxSentences: 3, maxCharsHard: 300 },
          assembly: {
            partsOrder: ["ack", "scope", "action"],
            optionalParts: ["scope"],
            maxPartsUsed: 3,
            sentenceStrategy: { joiner: " " },
          },
          placeholders: {
            sanitization: { stripNewlines: true, maxReplacementChars: 80 },
          },
        },
        routing: {
          byReason: { scope_hard_constraints_empty: "scoped_empty" },
          fallbackScenario: "scoped_empty",
        },
        scenarios: {
          scoped_empty: {
            parts: {
              ack: [
                { lang: "en", t: "I cannot find that in the current scope." },
              ],
              scope: [
                {
                  lang: "en",
                  t: "Scope: {{scopeName}}.",
                  useOnlyIfProvided: true,
                },
              ],
              action: [{ lang: "en", t: "Try broadening scope." }],
            },
          },
        },
      },
    });

    const out = resolveRuntimeFallbackMessage({
      language: "en",
      reasonCode: "scope_hard_constraints_empty",
      seed: "seed-3",
      context: { scopeName: "Budget-2025.xlsx" },
      routeHints: { hardScopeActive: true },
    });

    expect(out).toContain("I cannot find that in the current scope.");
    expect(out).toContain("Scope: Budget-2025.xlsx.");
  });

  test("uses disambiguation microcopy for needs_doc_choice", () => {
    mockBanks({
      messages: {
        retry: { en: ["retry message"] },
      },
      routerRules: [],
      disambiguationBank: {
        config: {
          enabled: true,
          actionsContract: {
            thresholds: {
              maxOptions: 4,
              minOptions: 2,
              maxQuestionSentences: 1,
            },
          },
        },
        rules: [
          {
            id: "autopick_when_confident",
            when: {
              all: [
                {
                  path: "metrics.topConfidence",
                  op: "gte",
                  value: 0.85,
                },
                {
                  path: "metrics.confidenceGap",
                  op: "gte",
                  value: 0.25,
                },
              ],
            },
          },
        ],
      },
    });

    const out = resolveRuntimeFallbackMessage({
      language: "en",
      reasonCode: "needs_doc_choice",
      seed: "seed-4",
      routeHints: {
        needsDocChoice: true,
        disambiguationOptions: ["Q1-Finance.pdf", "Q2-Finance.pdf"],
      },
    });

    expect(out).toBe("Which document should I use: Q1-Finance.pdf, Q2-Finance.pdf?");
  });
});

describe("resolveEditErrorMessage", () => {
  test("hydrates placeholders and strips unresolved tokens", () => {
    mockBanks({
      messages: {
        error: { en: ["error"] },
      },
      routerRules: [],
      editErrorBank: {
        config: { enabled: true, fallbackLanguage: "en" },
        errors: {
          en: {
            XLSX_AGGREGATION_DEST_REQUIRED:
              "Need destination for {{aggLabel}} from {{sourceRange}} ({{missing}})",
          },
        },
      },
    });

    const out = resolveEditErrorMessage(
      "XLSX_AGGREGATION_DEST_REQUIRED",
      "en",
      {
        aggLabel: "SUM",
        sourceRange: "Sheet1!A2:A20",
      },
    );

    expect(out).toBe("Need destination for SUM from Sheet1!A2:A20 ()");
    expect(String(out || "")).not.toContain("{{");
  });
});
