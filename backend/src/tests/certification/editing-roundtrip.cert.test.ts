import { createHash } from "crypto";
import fs from "fs";
import path from "path";

import { describe, expect, test } from "@jest/globals";
import ExcelJS from "exceljs";

import { DocxAnchorsService } from "../../services/editing/docx/docxAnchors.service";
import { DocxEditorService } from "../../services/editing/docx/docxEditor.service";
import { EditOrchestratorService } from "../../services/editing/editOrchestrator.service";
import type {
  EditExecutionContext,
  EditOperator,
  EditPlan,
  EditRevisionStore,
} from "../../services/editing/editing.types";
import { XlsxFileEditorService } from "../../services/editing/xlsx/xlsxFileEditor.service";
import { writeCertificationGateReport } from "./reporting";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

class InMemoryRoundtripStore implements EditRevisionStore {
  private readonly docxEditor = new DocxEditorService();
  private readonly xlsxEditor = new XlsxFileEditorService();
  private readonly docs = new Map<
    string,
    { current: Buffer; history: Buffer[] }
  >();
  private seq = 0;

  seed(documentId: string, bytes: Buffer): void {
    this.docs.set(documentId, { current: Buffer.from(bytes), history: [] });
  }

  hash(documentId: string): string {
    const state = this.docs.get(documentId);
    if (!state) throw new Error(`Unknown document: ${documentId}`);
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
  }> {
    const state = this.docs.get(input.documentId);
    if (!state) throw new Error(`Unknown document: ${input.documentId}`);
    const op = String(input.metadata?.operator || "").trim() as EditOperator;
    const before = Buffer.from(state.current);
    let edited: Buffer;
    if (op === "EDIT_PARAGRAPH") {
      const targetId = String(input.metadata?.targetId || "").trim();
      edited = await this.docxEditor.applyParagraphEdit(
        before,
        targetId,
        input.content,
      );
    } else if (op === "COMPUTE_BUNDLE") {
      edited = await this.xlsxEditor.computeOps(before, input.content);
    } else {
      throw new Error(`Unsupported operator: ${op}`);
    }
    state.history.push(before);
    state.current = Buffer.from(edited);
    this.seq += 1;
    return {
      revisionId: `rev_${this.seq}`,
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
  }> {
    const state = this.docs.get(input.documentId);
    if (!state || state.history.length === 0) {
      throw new Error("No prior revision to restore.");
    }
    const before = Buffer.from(state.current);
    const previous = state.history.pop() as Buffer;
    state.current = Buffer.from(previous);
    this.seq += 1;
    const beforeHash = sha256(before);
    const restoredHash = sha256(state.current);
    const referenceHash = sha256(previous);
    return {
      restoredRevisionId: `undo_${this.seq}`,
      beforeHash,
      restoredHash,
      referenceHash,
      verifiedBitwise: restoredHash === referenceHash,
    };
  }
}

async function buildXlsxFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell("A1").value = "Metric";
  ws.getCell("A2").value = 100;
  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw as ArrayBuffer);
}

describe("Certification: editing roundtrip", () => {
  test("DOCX/XLSX apply->undo contracts remain bitwise-safe", async () => {
    const failures: string[] = [];
    const store = new InMemoryRoundtripStore();
    const orchestrator = new EditOrchestratorService({
      revisionStore: store,
      policy: {
        minConfidenceForAutoApply: 0,
        minDecisionMarginForAutoApply: 0,
        minSimilarityForAutoApply: 0,
        alwaysRequireConfirmation: [],
      },
    });
    const ctx: EditExecutionContext = {
      userId: "cert_user",
      conversationId: "cert_conv",
      correlationId: "cert_corr",
      clientMessageId: "cert_msg",
      language: "en",
    };

    const docxPath = path.resolve(
      process.cwd(),
      "src/tests/fixtures/sample.docx",
    );
    const docxBytes = fs.readFileSync(docxPath);
    const docxId = "cert_docx";
    store.seed(docxId, docxBytes);
    const docxBefore = store.hash(docxId);
    const anchors = new DocxAnchorsService();
    const paragraphs = await anchors.extractParagraphNodes(docxBytes);
    const paragraph = paragraphs.find((node) => String(node.text || "").trim());
    if (!paragraph?.paragraphId) failures.push("DOCX_TARGET_NOT_FOUND");
    if (paragraph?.paragraphId) {
      const plan: EditPlan = {
        operator: "EDIT_PARAGRAPH",
        domain: "docx",
        documentId: docxId,
        normalizedInstruction: "update paragraph",
        constraints: {
          preserveNumbers: true,
          preserveEntities: true,
          strictNoNewFacts: true,
          tone: "neutral",
          outputLanguage: "en",
          maxExpansionRatio: 2,
        },
        missingRequiredEntities: [],
        preserveTokens: [],
        diagnostics: { extractedEntities: [], extractedHints: [], checks: [] },
      };
      const applied = await orchestrator.applyEdit(ctx, {
        plan,
        target: {
          id: String(paragraph.paragraphId),
          label: "paragraph",
          confidence: 1,
          candidates: [],
          decisionMargin: 1,
          isAmbiguous: false,
          resolutionReason: "cert",
        },
        beforeText: String(paragraph.text || ""),
        proposedText: `${String(paragraph.text || "")} (cert)`,
        userConfirmed: true,
      });
      if (!applied.ok || !applied.applied) failures.push("DOCX_APPLY_FAILED");
      const undo = await orchestrator.undoEdit(ctx, {
        documentId: docxId,
        revisionId: applied.revisionId,
      });
      if (!undo.ok || !undo.verifiedBitwise)
        failures.push("DOCX_UNDO_NOT_VERIFIED");
      if (store.hash(docxId) !== docxBefore)
        failures.push("DOCX_HASH_NOT_RESTORED");
    }

    const xlsxBytes = await buildXlsxFixture();
    const xlsxId = "cert_xlsx";
    store.seed(xlsxId, xlsxBytes);
    const xlsxBefore = store.hash(xlsxId);
    const plan: EditPlan = {
      operator: "COMPUTE_BUNDLE",
      domain: "sheets",
      documentId: xlsxId,
      normalizedInstruction: "set A2 to 999",
      constraints: {
        preserveNumbers: true,
        preserveEntities: true,
        strictNoNewFacts: true,
        tone: "neutral",
        outputLanguage: "en",
        maxExpansionRatio: 2,
      },
      missingRequiredEntities: [],
      preserveTokens: [],
      diagnostics: { extractedEntities: [], extractedHints: [], checks: [] },
    };
    const applied = await orchestrator.applyEdit(ctx, {
      plan,
      target: {
        id: "Sheet1!A2",
        label: "Sheet1!A2",
        confidence: 1,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: "cert",
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
    if (!applied.ok || !applied.applied) failures.push("XLSX_APPLY_FAILED");
    const undo = await orchestrator.undoEdit(ctx, {
      documentId: xlsxId,
      revisionId: applied.revisionId,
    });
    if (!undo.ok || !undo.verifiedBitwise)
      failures.push("XLSX_UNDO_NOT_VERIFIED");
    if (store.hash(xlsxId) !== xlsxBefore)
      failures.push("XLSX_HASH_NOT_RESTORED");

    writeCertificationGateReport("editing-roundtrip", {
      passed: failures.length === 0,
      metrics: {
        failures: failures.length,
        docxRestored: !failures.some((code) => code.startsWith("DOCX_")),
        xlsxRestored: !failures.some((code) => code.startsWith("XLSX_")),
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
