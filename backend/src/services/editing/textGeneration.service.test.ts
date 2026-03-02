import { describe, expect, test } from "@jest/globals";
import { EditingTextGenerationService } from "./textGeneration.service";

function makeContext() {
  return {
    userId: "user_1",
    conversationId: "conv_1",
    correlationId: "corr_1",
    clientMessageId: "msg_1",
    language: "en" as const,
  };
}

function makeDocxFindReplacePlan(instruction: string) {
  return {
    operator: "EDIT_DOCX_BUNDLE",
    canonicalOperator: "DOCX_FIND_REPLACE",
    intentSource: "explicit_operator",
    domain: "docx",
    documentId: "doc_1",
    targetHint: "",
    normalizedInstruction: instruction,
    constraints: {
      preserveNumbers: false,
      preserveEntities: false,
      strictNoNewFacts: true,
      tone: "neutral",
      outputLanguage: "en",
      maxExpansionRatio: 2,
    },
    missingRequiredEntities: [],
    preserveTokens: [],
    diagnostics: { extractedEntities: [], extractedHints: [], checks: [] },
  } as any;
}

function makeDocxBundlePlan(input: {
  canonicalOperator: string;
  instruction: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    operator: "EDIT_DOCX_BUNDLE",
    canonicalOperator: input.canonicalOperator,
    intentSource: "classified",
    domain: "docx",
    documentId: "doc_1",
    targetHint: "",
    normalizedInstruction: input.instruction,
    constraints: {
      preserveNumbers: false,
      preserveEntities: false,
      strictNoNewFacts: true,
      tone: "neutral",
      outputLanguage: "en",
      maxExpansionRatio: 2,
    },
    metadata: input.metadata || {},
    missingRequiredEntities: [],
    preserveTokens: [],
    diagnostics: { extractedEntities: [], extractedHints: [], checks: [] },
  } as any;
}

describe("EditingTextGenerationService", () => {
  test("builds DOCX find/replace bundle patch without LLM", async () => {
    const service = new EditingTextGenerationService();
    const out = await service.generateProposedText({
      context: makeContext(),
      plan: makeDocxFindReplacePlan('find and replace "alpha" with "beta"'),
      beforeText: "",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const payload = JSON.parse(out.proposedText);
    expect(Array.isArray(payload.patches)).toBe(true);
    expect(payload.patches[0]).toMatchObject({
      kind: "docx_find_replace",
      findText: "alpha",
      replaceText: "beta",
    });
  });

  test("fails DOCX find/replace when terms are missing", async () => {
    const service = new EditingTextGenerationService();
    const out = await service.generateProposedText({
      context: makeContext(),
      plan: makeDocxFindReplacePlan("find and replace"),
      beforeText: "",
    });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toContain("requires explicit find/replace terms");
  });

  test("builds DOCX update TOC bundle patch without LLM", async () => {
    const service = new EditingTextGenerationService();
    const out = await service.generateProposedText({
      context: makeContext(),
      plan: makeDocxBundlePlan({
        canonicalOperator: "DOCX_UPDATE_TOC",
        instruction: "update the table of contents",
      }),
      beforeText: "",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const payload = JSON.parse(out.proposedText);
    expect(payload.patches?.[0]).toMatchObject({
      kind: "docx_update_toc",
    });
  });

  test("builds DOCX set-table-cell bundle patch from metadata", async () => {
    const service = new EditingTextGenerationService();
    const out = await service.generateProposedText({
      context: makeContext(),
      plan: makeDocxBundlePlan({
        canonicalOperator: "DOCX_SET_TABLE_CELL",
        instruction: 'set table cell to "Revenue"',
        metadata: {
          tableIndex: 2,
          rowIndex: 3,
          colIndex: 1,
          text: "Revenue",
        },
      }),
      beforeText: "",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const payload = JSON.parse(out.proposedText);
    expect(payload.patches?.[0]).toMatchObject({
      kind: "docx_set_table_cell",
      tableIndex: 2,
      rowIndex: 3,
      colIndex: 1,
      text: "Revenue",
    });
  });
});
