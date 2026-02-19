import type { EditDiffChange, EditDiffPayload } from "./editing.types";

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitSentences(input: string): string[] {
  return normalizeWhitespace(input)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitWords(input: string): string[] {
  return normalizeWhitespace(input).split(/\s+/).filter(Boolean);
}

function buildSentenceChanges(before: string, after: string): EditDiffChange[] {
  const beforeSentences = splitSentences(before);
  const afterSentences = splitSentences(after);
  if (beforeSentences.length === 0 && afterSentences.length === 0) return [];

  const maxLen = Math.max(beforeSentences.length, afterSentences.length);
  const changes: EditDiffChange[] = [];
  for (let i = 0; i < maxLen; i += 1) {
    const b = beforeSentences[i] || "";
    const a = afterSentences[i] || "";
    if (b === a) continue;
    if (!b && a) {
      changes.push({ type: "add", before: "", after: a });
      continue;
    }
    if (b && !a) {
      changes.push({ type: "remove", before: b, after: "" });
      continue;
    }
    changes.push({ type: "replace", before: b, after: a });
  }
  return changes;
}

function buildWordDeltaSummary(before: string, after: string): string {
  const b = splitWords(before).length;
  const a = splitWords(after).length;
  const delta = a - b;
  if (delta === 0) return "Word count unchanged.";
  if (delta > 0) return `Expanded by ${delta} word${delta > 1 ? "s" : ""}.`;
  return `Reduced by ${Math.abs(delta)} word${Math.abs(delta) > 1 ? "s" : ""}.`;
}

function buildSummary(
  kind: EditDiffPayload["kind"],
  before: string,
  after: string,
  changes: EditDiffChange[],
): string {
  if (before === after) return "No textual change.";
  const changeLabel =
    changes.length === 1
      ? "1 segment changed."
      : `${changes.length} segments changed.`;
  if (kind === "structural") return `Structural update applied. ${changeLabel}`;
  return `${buildWordDeltaSummary(before, after)} ${changeLabel}`;
}

export class DiffBuilderService {
  buildParagraphDiff(before: string, after: string): EditDiffPayload {
    const b = normalizeWhitespace(before);
    const a = normalizeWhitespace(after);
    const changes = buildSentenceChanges(b, a);
    return {
      kind: "paragraph",
      before: b,
      after: a,
      changed: b !== a,
      summary: buildSummary("paragraph", b, a, changes),
      changes,
    };
  }

  buildCellDiff(before: string, after: string): EditDiffPayload {
    const b = normalizeWhitespace(before);
    const a = normalizeWhitespace(after);
    const change: EditDiffChange[] =
      b === a ? [] : [{ type: "replace", before: b, after: a }];
    return {
      kind: "cell",
      before: b,
      after: a,
      changed: b !== a,
      summary: buildSummary("cell", b, a, change),
      changes: change,
    };
  }

  buildSlideTextDiff(before: string, after: string): EditDiffPayload {
    const b = normalizeWhitespace(before);
    const a = normalizeWhitespace(after);
    const changes = buildSentenceChanges(b, a);
    return {
      kind: "slide",
      before: b,
      after: a,
      changed: b !== a,
      summary: buildSummary("slide", b, a, changes),
      changes,
    };
  }

  buildStructuralDiff(
    beforeLabel: string,
    afterLabel: string,
  ): EditDiffPayload {
    const b = normalizeWhitespace(beforeLabel);
    const a = normalizeWhitespace(afterLabel);
    const changes: EditDiffChange[] =
      b === a ? [] : [{ type: "replace", before: b, after: a }];
    return {
      kind: "structural",
      before: b,
      after: a,
      changed: b !== a,
      summary: buildSummary("structural", b, a, changes),
      changes,
    };
  }
}
