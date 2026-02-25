import { describe, expect, test } from "@jest/globals";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { EditOrchestratorService } from "../../services/editing/editOrchestrator.service";
import { DocxAnchorsService } from "../../services/editing/docx/docxAnchors.service";
import { DocxEditorService } from "../../services/editing/docx/docxEditor.service";
import { XlsxFileEditorService } from "../../services/editing/xlsx/xlsxFileEditor.service";
import type {
  EditExecutionContext,
  EditPlan,
  EditRevisionStore,
  EditOperator,
} from "../../services/editing/editing.types";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

class InMemoryCertifiedRevisionStore implements EditRevisionStore {
  private readonly docxEditor = new DocxEditorService();
  private readonly xlsxEditor = new XlsxFileEditorService();
  private readonly docs = new Map<
    string,
    { current: Buffer; history: Buffer[] }
  >();
  private seq = 0;

  seed(documentId: string, bytes: Buffer): void {
    this.docs.set(documentId, {
      current: Buffer.from(bytes),
      history: [],
    });
  }

  currentHash(documentId: string): string {
    const state = this.docs.get(documentId);
    if (!state) throw new Error(`Unknown seeded document: ${documentId}`);
    return sha256(state.current);
  }

  async createRevision(input: {
    documentId: string;
    userId: string;
    correlationId: string;
    conversationId: string;
    clientMessageId: string;
    content: string;
    idempotencyKey?: string;
    expectedDocumentUpdatedAtIso?: string;
    expectedDocumentFileHash?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    revisionId: string;
    fileHashBefore?: string;
    fileHashAfter?: string;
    applyMetrics?: {
      changedCellsCount?: number;
      changedStructuresCount?: number;
      affectedRanges?: string[];
      affectedParagraphIds?: string[];
      locateRange?: string | null;
      changedSamples?: Array<{
        sheetName: string;
        cell: string;
        before: string;
        after: string;
      }>;
      rejectedOps?: string[];
      patchesApplied?: number;
    };
  }> {
    const state = this.docs.get(input.documentId);
    if (!state) throw new Error(`Unknown seeded document: ${input.documentId}`);
    const op = String(input.metadata?.operator || "").trim() as EditOperator;
    const targetId = String(input.metadata?.targetId || "").trim();

    const before = Buffer.from(state.current);
    let edited: Buffer;
    if (op === "EDIT_PARAGRAPH") {
      if (!targetId) throw new Error("EDIT_PARAGRAPH requires targetId");
      edited = await this.docxEditor.applyParagraphEdit(
        before,
        targetId,
        input.content,
      );
    } else if (op === "COMPUTE_BUNDLE") {
      edited = await this.xlsxEditor.computeOps(before, input.content);
    } else {
      const err = new Error(`Operator not implemented in test store: ${op}`);
      (err as any).code = "OPERATOR_NOT_IMPLEMENTED";
      throw err;
    }

    state.history.push(before);
    state.current = Buffer.from(edited);
    const revisionId = `rev_${++this.seq}`;

    return {
      revisionId,
      fileHashBefore: sha256(before),
      fileHashAfter: sha256(edited),
    };
  }

  async undoToRevision(input: {
    documentId: string;
    userId: string;
    revisionId?: string;
  }): Promise<{
    restoredRevisionId: string;
    beforeHash?: string;
    restoredHash?: string;
    referenceHash?: string;
    verifiedBitwise?: boolean;
    verificationReason?: string;
  }> {
    const state = this.docs.get(input.documentId);
    if (!state) throw new Error(`Unknown seeded document: ${input.documentId}`);
    if (state.history.length === 0) throw new Error("No previous revision.");

    const before = Buffer.from(state.current);
    const previous = state.history.pop() as Buffer;
    state.current = Buffer.from(previous);

    const beforeHash = sha256(before);
    const restoredHash = sha256(state.current);
    const referenceHash = sha256(previous);
    const verifiedBitwise = restoredHash === referenceHash;

    return {
      restoredRevisionId: `undo_${++this.seq}`,
      beforeHash,
      restoredHash,
      referenceHash,
      verifiedBitwise,
      ...(verifiedBitwise
        ? {}
        : { verificationReason: "UNDO_HASH_MISMATCH_TEST_STORE" }),
    };
  }
}

const ctx: EditExecutionContext = {
  userId: "user_1",
  conversationId: "conv_1",
  correlationId: "corr_1",
  clientMessageId: "msg_1",
  language: "en",
};

function permissivePolicy() {
  return {
    minConfidenceForAutoApply: 0,
    minDecisionMarginForAutoApply: 0,
    minSimilarityForAutoApply: 0,
    alwaysRequireConfirmation: [] as EditOperator[],
  };
}

async function buildXlsxFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell("A1").value = "Revenue";
  ws.getCell("A2").value = 100;
  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw as ArrayBuffer);
}

describe("Editing bitwise certification contracts (DOCX/XLSX)", () => {
  test("DOCX apply -> undo restores exact bytes hash", async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "src/tests/fixtures/sample.docx",
    );
    const sourceDoc = fs.readFileSync(fixturePath);
    const store = new InMemoryCertifiedRevisionStore();
    const docId = "docx_cert_1";
    store.seed(docId, sourceDoc);
    const hashBefore = store.currentHash(docId);

    const anchors = new DocxAnchorsService();
    const paragraphs = await anchors.extractParagraphNodes(sourceDoc);
    const target = paragraphs.find((node) => String(node.text || "").trim());
    expect(target).toBeDefined();

    const plan: EditPlan = {
      operator: "EDIT_PARAGRAPH",
      domain: "docx",
      documentId: docId,
      normalizedInstruction: "rewrite selected paragraph",
      constraints: {
        preserveNumbers: true,
        preserveEntities: true,
        strictNoNewFacts: true,
        tone: "neutral",
        outputLanguage: "en",
        maxExpansionRatio: 2.2,
      },
      missingRequiredEntities: [],
      preserveTokens: [],
      diagnostics: {
        extractedEntities: [],
        extractedHints: [],
        checks: [{ id: "instruction_non_empty", pass: true }],
      },
    };

    const orchestrator = new EditOrchestratorService({
      revisionStore: store,
      policy: permissivePolicy(),
    });

    const beforeText = String(target?.text || "");
    const proposedText = `${beforeText} (certified update)`;
    const applied = await orchestrator.applyEdit(ctx, {
      plan,
      target: {
        id: String(target?.paragraphId || ""),
        label: "paragraph",
        confidence: 1,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: "test",
      },
      beforeText,
      proposedText,
      userConfirmed: true,
    });

    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(true);
    expect(applied.proof?.verified).toBe(true);
    expect(store.currentHash(docId)).not.toBe(hashBefore);

    const undone = await orchestrator.undoEdit(ctx, {
      documentId: docId,
      revisionId: applied.revisionId,
    });
    expect(undone.ok).toBe(true);
    expect(undone.verifiedBitwise).toBe(true);
    expect(store.currentHash(docId)).toBe(hashBefore);
  });

  test("XLSX apply -> undo restores exact bytes hash", async () => {
    const sourceXlsx = await buildXlsxFixture();
    const store = new InMemoryCertifiedRevisionStore();
    const docId = "xlsx_cert_1";
    store.seed(docId, sourceXlsx);
    const hashBefore = store.currentHash(docId);

    const plan: EditPlan = {
      operator: "COMPUTE_BUNDLE",
      domain: "sheets",
      documentId: docId,
      normalizedInstruction: "set A2 to 999",
      constraints: {
        preserveNumbers: true,
        preserveEntities: true,
        strictNoNewFacts: true,
        tone: "neutral",
        outputLanguage: "en",
        maxExpansionRatio: 2.2,
      },
      missingRequiredEntities: [],
      preserveTokens: [],
      diagnostics: {
        extractedEntities: [],
        extractedHints: ["set", "value"],
        checks: [{ id: "instruction_non_empty", pass: true }],
      },
    };

    const orchestrator = new EditOrchestratorService({
      revisionStore: store,
      policy: permissivePolicy(),
    });
    const applied = await orchestrator.applyEdit(ctx, {
      plan,
      target: {
        id: "Sheet1!A2",
        label: "Sheet1!A2",
        confidence: 1,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: "test",
      },
      beforeText: "100",
      proposedText: JSON.stringify({
        ops: [
          {
            kind: "set_values",
            rangeA1: "Sheet1!A2:A2",
            values: [[999]],
          },
        ],
      }),
      userConfirmed: true,
    });

    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(true);
    expect(applied.proof?.verified).toBe(true);
    expect(store.currentHash(docId)).not.toBe(hashBefore);

    const undone = await orchestrator.undoEdit(ctx, {
      documentId: docId,
      revisionId: applied.revisionId,
    });
    expect(undone.ok).toBe(true);
    expect(undone.verifiedBitwise).toBe(true);
    expect(store.currentHash(docId)).toBe(hashBefore);
  });
});
