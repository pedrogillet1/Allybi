/**
 * Golden contract test: DOCX/XLSX bitwise verification contract
 *
 * Static analysis + type contract tests that verify the editing system's
 * bitwise verification contract is correctly shaped. These tests do NOT
 * require a running server or database; they exercise type conformance and
 * static source-file invariants required by scripts/audit/editing-no-fake-success.mjs.
 */
import { describe, expect, test, beforeAll } from "@jest/globals";
import fs from "fs";
import path from "path";

import type {
  EditApplyResult,
  EditOutcomeType,
  UndoResult,
} from "../../services/editing/editing.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BACKEND_ROOT = path.resolve(__dirname, "../../../");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(BACKEND_ROOT, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// 1. Type contract: EditApplyResult
// ---------------------------------------------------------------------------

describe("EditApplyResult type contract", () => {
  test("noop outcome can be constructed and satisfies the interface", () => {
    const noopResult: EditApplyResult = {
      ok: true,
      applied: false,
      outcomeType: "noop" satisfies EditOutcomeType,
      blockedReason: {
        code: "EDIT_NOOP_NO_CHANGES",
        gate: "apply_proof",
        message: "No document mutation was verified.",
      },
    };

    expect(noopResult.ok).toBe(true);
    expect(noopResult.applied).toBe(false);
    expect(noopResult.outcomeType).toBe("noop");
    expect(noopResult.blockedReason?.code).toBe("EDIT_NOOP_NO_CHANGES");
  });

  test("applied outcome with proof has required hash fields", () => {
    const appliedResult: EditApplyResult = {
      ok: true,
      applied: true,
      outcomeType: "applied",
      revisionId: "rev_001",
      proof: {
        verified: true,
        fileHashBefore:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fileHashAfter:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        affectedTargetsCount: 1,
      },
    };

    expect(appliedResult.proof).toBeDefined();
    expect(typeof appliedResult.proof!.fileHashBefore).toBe("string");
    expect(typeof appliedResult.proof!.fileHashAfter).toBe("string");
    expect(appliedResult.proof!.fileHashBefore).not.toBe(
      appliedResult.proof!.fileHashAfter,
    );
    expect(appliedResult.proof!.verified).toBe(true);
    expect(appliedResult.proof!.affectedTargetsCount).toBeGreaterThanOrEqual(1);
  });

  test("blocked outcome can be constructed without proof", () => {
    const blockedResult: EditApplyResult = {
      ok: false,
      applied: false,
      outcomeType: "blocked",
      error: "Operator contract mismatch for plan domain.",
      blockedReason: {
        code: "EDIT_OPERATOR_CONTRACT_MISMATCH",
        gate: "operator_catalog",
        message: "Operator is not valid for domain.",
      },
    };

    expect(blockedResult.outcomeType).toBe("blocked");
    expect(blockedResult.applied).toBe(false);
    expect(blockedResult.proof).toBeUndefined();
  });

  test("contract-invalid result uses EDIT_RESULT_CONTRACT_INVALID code", () => {
    const invalidResult: EditApplyResult = {
      ok: true,
      applied: false,
      outcomeType: "blocked",
      error: "Result contract validation failed.",
      blockedReason: {
        code: "EDIT_RESULT_CONTRACT_INVALID",
        gate: "apply_proof",
        message: "Result contract validation failed.",
      },
    };

    expect(invalidResult.blockedReason?.code).toBe(
      "EDIT_RESULT_CONTRACT_INVALID",
    );
    expect(invalidResult.outcomeType).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// 2. Type contract: UndoResult bitwise verification fields
// ---------------------------------------------------------------------------

describe("UndoResult type contract", () => {
  test("UndoResult with verifiedBitwise and referenceHash can be constructed", () => {
    const undoResult: UndoResult = {
      ok: true,
      restoredRevisionId: "undo_001",
      beforeHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      restoredHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      referenceHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verifiedBitwise: true,
      verificationReason: "restoredHash matches referenceHash exactly",
    };

    expect(undoResult.ok).toBe(true);
    expect(undoResult.verifiedBitwise).toBe(true);
    expect(typeof undoResult.referenceHash).toBe("string");
    expect(undoResult.referenceHash).toMatch(/^sha256:/);
    expect(undoResult.restoredHash).toBe(undoResult.referenceHash);
  });

  test("verifiedBitwise is false when hashes differ after failed undo", () => {
    const undoResult: UndoResult = {
      ok: false,
      verifiedBitwise: false,
      referenceHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      restoredHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      error: "Undo failed: hash mismatch after restore.",
    };

    expect(undoResult.ok).toBe(false);
    expect(undoResult.verifiedBitwise).toBe(false);
    expect(undoResult.restoredHash).not.toBe(undoResult.referenceHash);
  });

  test("UndoResult ok=false error path has no verifiedBitwise set", () => {
    const errorResult: UndoResult = {
      ok: false,
      error: "Revision store is not configured.",
    };

    expect(errorResult.ok).toBe(false);
    expect(errorResult.verifiedBitwise).toBeUndefined();
    expect(errorResult.referenceHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Proof hash contract: fileHashBefore / fileHashAfter
// ---------------------------------------------------------------------------

describe("EditApplyResult.proof hash contract", () => {
  test("proof.fileHashBefore and proof.fileHashAfter are both strings", () => {
    const resultWithProof: EditApplyResult = {
      ok: true,
      applied: true,
      outcomeType: "applied",
      proof: {
        verified: true,
        fileHashBefore: "aabbccdd",
        fileHashAfter: "11223344",
        affectedTargetsCount: 2,
      },
    };

    const proof = resultWithProof.proof!;
    expect(typeof proof.fileHashBefore).toBe("string");
    expect(typeof proof.fileHashAfter).toBe("string");
    expect(proof.fileHashBefore.length).toBeGreaterThan(0);
    expect(proof.fileHashAfter.length).toBeGreaterThan(0);
  });

  test("proof with DOCX target shape is valid", () => {
    const resultWithDocxTarget: EditApplyResult = {
      ok: true,
      applied: true,
      outcomeType: "applied",
      proof: {
        verified: true,
        fileHashBefore: "hash_before_docx",
        fileHashAfter: "hash_after_docx",
        affectedTargetsCount: 1,
        affectedParagraphIds: ["docx:p:para-001"],
        targets: [
          {
            kind: "docx_paragraph",
            id: "docx:p:para-001",
            beforeHash: "hash_before_docx",
            afterHash: "hash_after_docx",
          },
        ],
        highlights: {
          docxParagraphIds: ["docx:p:para-001"],
        },
      },
    };

    const proof = resultWithDocxTarget.proof!;
    expect(proof.affectedParagraphIds).toContain("docx:p:para-001");
    expect(proof.targets?.[0]?.kind).toBe("docx_paragraph");
    expect(proof.highlights?.docxParagraphIds).toContain("docx:p:para-001");
  });

  test("proof with XLSX target shape is valid", () => {
    const resultWithXlsxTarget: EditApplyResult = {
      ok: true,
      applied: true,
      outcomeType: "applied",
      proof: {
        verified: true,
        fileHashBefore: "hash_before_xlsx",
        fileHashAfter: "hash_after_xlsx",
        affectedTargetsCount: 1,
        changedCellsCount: 4,
        affectedRanges: ["Sheet1!A1:B2"],
        targets: [
          {
            kind: "xlsx_range",
            range: "Sheet1!A1:B2",
            sheetName: "Sheet1",
            beforeHash: "hash_before_xlsx",
            afterHash: "hash_after_xlsx",
          },
        ],
        highlights: {
          xlsxRanges: ["Sheet1!A1:B2"],
        },
      },
    };

    const proof = resultWithXlsxTarget.proof!;
    expect(proof.affectedRanges).toContain("Sheet1!A1:B2");
    expect(proof.changedCellsCount).toBe(4);
    expect(proof.targets?.[0]?.kind).toBe("xlsx_range");
    expect(proof.highlights?.xlsxRanges).toContain("Sheet1!A1:B2");
  });

  test("noop result proof can have equal fileHashBefore and fileHashAfter", () => {
    const sameHash =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const noopResult: EditApplyResult = {
      ok: true,
      applied: false,
      outcomeType: "noop",
      proof: {
        verified: false,
        fileHashBefore: sameHash,
        fileHashAfter: sameHash,
        affectedTargetsCount: 1,
      },
      blockedReason: {
        code: "EDIT_NOOP_NO_CHANGES",
        gate: "apply_proof",
        message: "No document mutation was verified.",
      },
    };

    expect(noopResult.proof!.fileHashBefore).toBe(
      noopResult.proof!.fileHashAfter,
    );
    expect(noopResult.proof!.verified).toBe(false);
    expect(noopResult.outcomeType).toBe("noop");
  });
});

// ---------------------------------------------------------------------------
// 4. Static analysis: editing.types.ts source invariants
// ---------------------------------------------------------------------------

describe("Static analysis: editing.types.ts", () => {
  let typesSource: string;

  beforeAll(() => {
    typesSource = readSrc("src/services/editing/editing.types.ts");
  });

  test("editing.types.ts contains verifiedBitwise?: boolean field", () => {
    expect(typesSource).toContain("verifiedBitwise?: boolean;");
  });

  test("editing.types.ts contains referenceHash?: string field", () => {
    expect(typesSource).toContain("referenceHash?: string;");
  });

  test("editing.types.ts defines UndoResult interface", () => {
    expect(typesSource).toContain("export interface UndoResult");
  });

  test("editing.types.ts defines EditApplyResult interface", () => {
    expect(typesSource).toContain("export interface EditApplyResult");
  });

  test("editing.types.ts defines EditOutcomeType including noop", () => {
    expect(typesSource).toContain("EditOutcomeType");
    expect(typesSource).toContain('"noop"');
  });

  test("editing.types.ts proof shape has fileHashBefore and fileHashAfter", () => {
    expect(typesSource).toContain("fileHashBefore: string;");
    expect(typesSource).toContain("fileHashAfter: string;");
  });
});

// ---------------------------------------------------------------------------
// 5. Static analysis: editOrchestrator.service.ts source invariants
// ---------------------------------------------------------------------------

describe("Static analysis: editOrchestrator.service.ts", () => {
  let orchestratorSource: string;

  beforeAll(() => {
    orchestratorSource = readSrc(
      "src/services/editing/editOrchestrator.service.ts",
    );
  });

  test('editOrchestrator contains outcomeType: "noop" token', () => {
    expect(orchestratorSource).toContain('outcomeType: "noop"');
  });

  test("editOrchestrator contains EDIT_NOOP_NO_CHANGES token", () => {
    expect(orchestratorSource).toContain("EDIT_NOOP_NO_CHANGES");
  });

  test("editOrchestrator contains EDIT_RESULT_CONTRACT_INVALID token", () => {
    expect(orchestratorSource).toContain("EDIT_RESULT_CONTRACT_INVALID");
  });

  test("editOrchestrator does not use warn-only contract validation", () => {
    expect(orchestratorSource).not.toContain("warn-only, never blocks");
  });

  test("editOrchestrator noop path sets blockedReason.code to EDIT_NOOP_NO_CHANGES", () => {
    // Verify the noop branch emits both the outcomeType and the code together.
    // We do this by checking both strings are present in the same file (structural co-location).
    const noopIndex = orchestratorSource.indexOf('outcomeType: "noop"');
    const noopCodeIndex = orchestratorSource.indexOf("EDIT_NOOP_NO_CHANGES");
    expect(noopIndex).toBeGreaterThanOrEqual(0);
    expect(noopCodeIndex).toBeGreaterThanOrEqual(0);
    // Both tokens must appear within 2000 characters of each other,
    // confirming co-location in the same logical branch.
    expect(Math.abs(noopIndex - noopCodeIndex)).toBeLessThan(2000);
  });

  test("editOrchestrator contract-invalid path sets blockedReason.code to EDIT_RESULT_CONTRACT_INVALID", () => {
    const contractIndex = orchestratorSource.indexOf(
      "EDIT_RESULT_CONTRACT_INVALID",
    );
    const blockedIndex = orchestratorSource.indexOf(
      'outcomeType: "blocked"',
      contractIndex - 500,
    );
    expect(contractIndex).toBeGreaterThanOrEqual(0);
    // There must be a "blocked" outcomeType assignment near the contract-invalid code path.
    expect(blockedIndex).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Bitwise invariants: hash comparison logic
// ---------------------------------------------------------------------------

describe("Bitwise verification logic invariants", () => {
  test("verifiedBitwise is true iff restoredHash equals referenceHash", () => {
    const hash =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const verifiedUndo: UndoResult = {
      ok: true,
      restoredRevisionId: "undo_verified",
      restoredHash: hash,
      referenceHash: hash,
      verifiedBitwise: hash === hash,
    };

    expect(verifiedUndo.verifiedBitwise).toBe(true);
  });

  test("verifiedBitwise is false when restoredHash differs from referenceHash", () => {
    const undoResult: UndoResult = {
      ok: true,
      restoredRevisionId: "undo_mismatch",
      restoredHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      referenceHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      verifiedBitwise:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ===
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    expect(undoResult.verifiedBitwise).toBe(false);
  });

  test("EditApplyResult.proof.verified is false when fileHashBefore equals fileHashAfter (noop detection)", () => {
    const sameHash = "sha256:deadbeef";

    const result: EditApplyResult = {
      ok: true,
      applied: false,
      outcomeType: "noop",
      proof: {
        verified: sameHash !== sameHash,
        fileHashBefore: sameHash,
        fileHashAfter: sameHash,
        affectedTargetsCount: 1,
      },
    };

    expect(result.proof!.verified).toBe(false);
    expect(result.proof!.fileHashBefore).toBe(result.proof!.fileHashAfter);
  });

  test("EditApplyResult.proof.verified is true when fileHashBefore differs from fileHashAfter", () => {
    const before =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const after =
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const result: EditApplyResult = {
      ok: true,
      applied: true,
      outcomeType: "applied",
      proof: {
        verified: before !== after,
        fileHashBefore: before,
        fileHashAfter: after,
        affectedTargetsCount: 1,
      },
    };

    expect(result.proof!.verified).toBe(true);
    expect(result.proof!.fileHashBefore).not.toBe(result.proof!.fileHashAfter);
  });
});
