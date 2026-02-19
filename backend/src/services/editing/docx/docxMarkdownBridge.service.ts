/**
 * DocxMarkdownBridge — DOCX ↔ Markdown conversion layer.
 *
 * Converts RichParagraphNodes to annotated Markdown (with paragraph identity
 * markers), diffs old/new Markdown to produce patches, and converts Markdown
 * blocks back to the HTML subset that docxEditor.applyParagraphEdit() accepts.
 */

import {
  DocxAnchorsService,
  RichParagraphNode,
  RichRun,
} from "./docxAnchors.service";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParagraphMapEntry {
  docIndex: number;
  paragraphId: string;
  mdLineStart: number;
  mdLineEnd: number;
}

export interface ToMarkdownResult {
  markdown: string;
  paragraphMap: ParagraphMapEntry[];
}

export interface MarkdownPatch {
  type: "modify" | "insert" | "delete";
  docIndex: number;
  /** For insert: the docIndex of the paragraph this goes after (-1 = before all) */
  afterDocIndex?: number;
  paragraphId?: string;
  newMarkdown?: string;
}

export interface DocxBundlePatch {
  kind: string;
  paragraphId: string;
  afterHtml?: string;
  afterText?: string;
  content?: string;
  format?: string;
}

export interface MarkdownBundleBuildResult {
  currentMarkdown: string;
  currentParagraphMap: ParagraphMapEntry[];
  markdownPatches: MarkdownPatch[];
  bundlePatches: DocxBundlePatch[];
}

// ─── Number format resolution ────────────────────────────────────────────────

export type NumberingFormatMap = Map<string, Map<string, string>>;

function resolveListType(
  numberingSignature: string | undefined,
  numberingFormats: NumberingFormatMap | undefined,
): "bullet" | "numbered" | null {
  if (!numberingSignature) return null;
  const [ilvl, numId] = numberingSignature.split(":");
  if (!numId || !numberingFormats) return "bullet"; // default to bullet if no numbering.xml
  const lvlMap = numberingFormats.get(numId);
  if (!lvlMap) return "bullet";
  const fmt = lvlMap.get(ilvl || "0") || "";
  if (
    fmt === "decimal" ||
    fmt === "lowerLetter" ||
    fmt === "upperLetter" ||
    fmt === "lowerRoman" ||
    fmt === "upperRoman"
  ) {
    return "numbered";
  }
  return "bullet";
}

function listIndent(numberingSignature: string | undefined): number {
  if (!numberingSignature) return 0;
  const ilvl = Number(numberingSignature.split(":")[0]);
  return Number.isFinite(ilvl) && ilvl > 0 ? ilvl : 0;
}

// ─── Rich runs → Markdown inline formatting ─────────────────────────────────

function runsToMarkdown(runs: RichRun[]): string {
  if (!runs.length) return "";

  const parts: string[] = [];
  for (const run of runs) {
    let text = run.text;
    if (!text) continue;

    // Apply inline formatting (order: hyperlink wraps everything else)
    if (run.bold) text = `**${text}**`;
    if (run.italic) text = `*${text}*`;
    if (run.strikethrough) text = `~~${text}~~`;
    if (run.underline) text = `<u>${text}</u>`;
    if (run.hyperlink) text = `[${text}](${run.hyperlink})`;

    parts.push(text);
  }

  return parts.join("");
}

// ─── toMarkdown ──────────────────────────────────────────────────────────────

export function toMarkdown(
  richNodes: RichParagraphNode[],
  numberingFormats?: NumberingFormatMap,
): ToMarkdownResult {
  const lines: string[] = [];
  const paragraphMap: ParagraphMapEntry[] = [];

  for (const node of richNodes) {
    const lineStart = lines.length;

    // Paragraph identity marker (invisible in rendered Markdown)
    lines.push(`<!-- docx:${node.docIndex} -->`);

    // Build the content line
    const inlineText =
      node.runs.length > 0 ? runsToMarkdown(node.runs) : node.text;

    let line = "";

    if (node.headingLevel && node.headingLevel >= 1 && node.headingLevel <= 6) {
      line = `${"#".repeat(node.headingLevel)} ${inlineText}`;
    } else if (node.numberingSignature) {
      const type = resolveListType(node.numberingSignature, numberingFormats);
      const indent = "  ".repeat(listIndent(node.numberingSignature));
      if (type === "numbered") {
        line = `${indent}1. ${inlineText}`;
      } else {
        line = `${indent}- ${inlineText}`;
      }
    } else {
      line = inlineText;
    }

    lines.push(line);
    lines.push(""); // blank line between paragraphs

    paragraphMap.push({
      docIndex: node.docIndex,
      paragraphId: node.paragraphId,
      mdLineStart: lineStart,
      mdLineEnd: lines.length - 1,
    });
  }

  return {
    markdown: lines.join("\n"),
    paragraphMap,
  };
}

// ─── diffMarkdown ────────────────────────────────────────────────────────────

interface MdBlock {
  docIndex: number;
  content: string;
}

const MARKER_RE = /^<!-- docx:(\d+) -->$/;

function parseMdBlocks(md: string): MdBlock[] {
  const lines = md.split("\n");
  const blocks: MdBlock[] = [];
  let currentIndex = -1;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = MARKER_RE.exec(line.trim());
    if (match) {
      // Flush previous block
      if (currentIndex >= 0) {
        blocks.push({
          docIndex: currentIndex,
          content: currentLines.join("\n").trim(),
        });
      }
      currentIndex = Number(match[1]);
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last block
  if (currentIndex >= 0) {
    blocks.push({
      docIndex: currentIndex,
      content: currentLines.join("\n").trim(),
    });
  }

  // Capture any content before the first marker as an insert
  const firstMarkerLine = lines.findIndex((l) => MARKER_RE.test(l.trim()));
  if (firstMarkerLine > 0) {
    const preContent = lines.slice(0, firstMarkerLine).join("\n").trim();
    if (preContent) {
      blocks.unshift({ docIndex: -1, content: preContent });
    }
  }

  return blocks;
}

export function diffMarkdown(
  oldMd: string,
  newMd: string,
  paragraphMap: ParagraphMapEntry[],
): MarkdownPatch[] {
  const oldBlocks = parseMdBlocks(oldMd);
  const newBlocks = parseMdBlocks(newMd);

  const patches: MarkdownPatch[] = [];
  const oldByIndex = new Map(oldBlocks.map((b) => [b.docIndex, b]));
  const newByIndex = new Map(newBlocks.map((b) => [b.docIndex, b]));

  // Find modifications and deletions
  for (const oldBlock of oldBlocks) {
    if (oldBlock.docIndex < 0) continue; // skip pre-content blocks
    const newBlock = newByIndex.get(oldBlock.docIndex);
    if (!newBlock) {
      // Deleted
      const mapEntry = paragraphMap.find(
        (e) => e.docIndex === oldBlock.docIndex,
      );
      patches.push({
        type: "delete",
        docIndex: oldBlock.docIndex,
        paragraphId: mapEntry?.paragraphId,
      });
    } else if (newBlock.content !== oldBlock.content) {
      // Modified
      const mapEntry = paragraphMap.find(
        (e) => e.docIndex === oldBlock.docIndex,
      );
      patches.push({
        type: "modify",
        docIndex: oldBlock.docIndex,
        paragraphId: mapEntry?.paragraphId,
        newMarkdown: newBlock.content,
      });
    }
  }

  // Find insertions (blocks in new that aren't in old, including pre-content and untagged)
  for (let i = 0; i < newBlocks.length; i++) {
    const newBlock = newBlocks[i];
    if (newBlock.docIndex >= 0 && oldByIndex.has(newBlock.docIndex)) continue;

    // This is a new block — determine what it goes after
    let afterDocIndex = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (newBlocks[j].docIndex >= 0) {
        afterDocIndex = newBlocks[j].docIndex;
        break;
      }
    }

    const afterEntry =
      afterDocIndex >= 0
        ? paragraphMap.find((e) => e.docIndex === afterDocIndex)
        : null;

    patches.push({
      type: "insert",
      docIndex: newBlock.docIndex,
      afterDocIndex,
      paragraphId: afterEntry?.paragraphId,
      newMarkdown: newBlock.content,
    });
  }

  return patches;
}

// ─── markdownBlockToHtml ─────────────────────────────────────────────────────
//
// Convert a single Markdown paragraph back to the HTML subset that
// tokenizeRichHtml() in docxEditor.service.ts understands.
// We do a simple regex-based conversion (no remark dependency needed for this
// limited HTML subset).

export function markdownBlockToHtml(md: string): string {
  let text = md.trim();

  // Strip heading prefix (the patch kind targets a specific paragraph, heading level is preserved)
  text = text.replace(/^#{1,6}\s+/, "");

  // Strip list prefix
  text = text.replace(/^(\s*)([-*]|\d+\.)\s+/, "");

  // Convert inline formatting to HTML
  // Order matters: process longer patterns first

  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // Italic: *text*
  text = text.replace(/\*(.+?)\*/g, "<i>$1</i>");
  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
  // Underline: <u>text</u> — pass through as-is
  // Hyperlinks: [text](url) → <a href="url">text</a>
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return text;
}

// ─── toPatchPayload ──────────────────────────────────────────────────────────

export function toPatchPayload(
  patches: MarkdownPatch[],
  richNodes: RichParagraphNode[],
): DocxBundlePatch[] {
  const nodeByDocIndex = new Map(richNodes.map((n) => [n.docIndex, n]));
  const result: DocxBundlePatch[] = [];

  for (const patch of patches) {
    switch (patch.type) {
      case "modify": {
        const node = nodeByDocIndex.get(patch.docIndex);
        const pid = patch.paragraphId || node?.paragraphId;
        if (!pid || !patch.newMarkdown) continue;
        result.push({
          kind: "docx_paragraph",
          paragraphId: pid,
          afterHtml: markdownBlockToHtml(patch.newMarkdown),
        });
        break;
      }

      case "delete": {
        const node = nodeByDocIndex.get(patch.docIndex);
        const pid = patch.paragraphId || node?.paragraphId;
        if (!pid) continue;
        result.push({
          kind: "docx_delete_paragraph",
          paragraphId: pid,
        });
        break;
      }

      case "insert": {
        // Insert before the next existing paragraph after the insertion point.
        // If afterDocIndex is -1, insert before the first paragraph.
        const html = patch.newMarkdown
          ? markdownBlockToHtml(patch.newMarkdown)
          : "";
        if (!html) continue;

        if (patch.afterDocIndex != null && patch.afterDocIndex >= 0) {
          // Find the paragraph AFTER afterDocIndex to use as insert-before target
          const sortedNodes = [...richNodes].sort(
            (a, b) => a.docIndex - b.docIndex,
          );
          const afterIdx = sortedNodes.findIndex(
            (n) => n.docIndex === patch.afterDocIndex,
          );
          const nextNode =
            afterIdx >= 0 && afterIdx < sortedNodes.length - 1
              ? sortedNodes[afterIdx + 1]
              : null;

          if (nextNode) {
            result.push({
              kind: "docx_insert_before",
              paragraphId: nextNode.paragraphId,
              content: html,
              format: "html",
            });
          } else {
            // Inserting at the end — use the after-node's ID with insert_before
            // of a non-existent next node won't work; use the afterDocIndex node
            // and insert after it via applyParagraphEdit with the new content appended.
            // Fallback: modify the last paragraph to append content.
            const afterNode = nodeByDocIndex.get(patch.afterDocIndex);
            if (afterNode) {
              result.push({
                kind: "docx_insert_before",
                paragraphId: afterNode.paragraphId,
                content: html,
                format: "html",
              });
            }
          }
        } else {
          // Insert before the first paragraph
          const first = richNodes[0];
          if (first) {
            result.push({
              kind: "docx_insert_before",
              paragraphId: first.paragraphId,
              content: html,
              format: "html",
            });
          }
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Convert a target Markdown document into DOCX bundle patches using the
 * current DOCX bytes as source of truth.
 */
export async function buildDocxBundlePatchesFromMarkdown(
  docxBytes: Buffer,
  targetMarkdown: string,
  paragraphMap?: ParagraphMapEntry[],
): Promise<MarkdownBundleBuildResult> {
  const anchors = new DocxAnchorsService();
  const richNodes = await anchors.extractRichParagraphNodes(docxBytes);
  const numberingFormats = await anchors.extractNumberingFormats(docxBytes);
  const current = toMarkdown(richNodes, numberingFormats);
  const mapForDiff =
    Array.isArray(paragraphMap) && paragraphMap.length > 0
      ? paragraphMap
      : current.paragraphMap;

  const markdownPatches = diffMarkdown(
    current.markdown,
    targetMarkdown,
    mapForDiff,
  );
  const bundlePatches = toPatchPayload(markdownPatches, richNodes);

  return {
    currentMarkdown: current.markdown,
    currentParagraphMap: current.paragraphMap,
    markdownPatches,
    bundlePatches,
  };
}

// ─── Utility: strip markers for LLM ─────────────────────────────────────────

export function stripDocxMarkers(md: string): string {
  return md.replace(/<!-- docx:\d+ -->\n?/g, "");
}

/**
 * Re-attach <!-- docx:N --> markers to edited Markdown by aligning paragraphs
 * with the original order. Paragraphs are matched by position (1:1 mapping).
 * Extra paragraphs get no marker (they'll be treated as inserts by diffMarkdown).
 */
export function reattachMarkers(
  editedMd: string,
  originalDocIndices: number[],
): string {
  const paragraphs = editedMd.split(/\n{2,}/);
  const result: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    if (i < originalDocIndices.length) {
      result.push(`<!-- docx:${originalDocIndices[i]} -->`);
    }
    result.push(para);
    result.push("");
  }

  return result.join("\n");
}
