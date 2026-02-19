import { parseA1Range } from "./spreadsheetModel.range";
import type { PatchOp } from "./spreadsheetModel.patch.types";
import type { SpreadsheetModel } from "./spreadsheetModel.types";

function hasSheet(model: SpreadsheetModel, sheetName: string): boolean {
  return model.sheets.some(
    (sheet) =>
      sheet.name.toLowerCase() ===
      String(sheetName || "")
        .trim()
        .toLowerCase(),
  );
}

function resolveSheetName(op: PatchOp): string | null {
  if ("sheet" in op && typeof op.sheet === "string" && op.sheet.trim())
    return op.sheet.trim();
  if ("range" in op) {
    const raw = String(op.range || "").trim();
    const bang = raw.indexOf("!");
    if (bang > 0)
      return raw.slice(0, bang).replace(/^'/, "").replace(/'$/, "").trim();
  }
  return null;
}

export function validatePatchOps(
  model: SpreadsheetModel,
  patchOps: PatchOp[],
): {
  validOps: PatchOp[];
  rejectedOps: string[];
} {
  const validOps: PatchOp[] = [];
  const rejectedOps: string[] = [];

  patchOps.forEach((op, idx) => {
    try {
      const sheetName = resolveSheetName(op);
      if (
        op.op !== "ADD_SHEET" &&
        op.op !== "RENAME_SHEET" &&
        op.op !== "DELETE_SHEET" &&
        sheetName &&
        !hasSheet(model, sheetName)
      ) {
        rejectedOps.push(`op#${idx}:${op.op}:sheet_not_found:${sheetName}`);
        return;
      }

      if ("range" in op && typeof op.range === "string") {
        parseA1Range(op.range, sheetName || undefined);
      }

      validOps.push(op);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      rejectedOps.push(`op#${idx}:${op.op}:${msg}`);
    }
  });

  return { validOps, rejectedOps };
}
