import { DiffBuilderService } from "../diffBuilder.service";

const legacyDiffBuilder = new DiffBuilderService();

export function buildAllybiDiff(input: {
  canonicalOperator: string;
  beforeText: string;
  afterText: string;
}): ReturnType<DiffBuilderService["buildParagraphDiff"]> {
  if (input.canonicalOperator.startsWith("XLSX_")) {
    return legacyDiffBuilder.buildCellDiff(input.beforeText, input.afterText);
  }
  if (input.canonicalOperator.includes("INSERT") || input.canonicalOperator.includes("DELETE") || input.canonicalOperator.includes("LIST_")) {
    return legacyDiffBuilder.buildStructuralDiff(input.beforeText, input.afterText);
  }
  return legacyDiffBuilder.buildParagraphDiff(input.beforeText, input.afterText);
}
