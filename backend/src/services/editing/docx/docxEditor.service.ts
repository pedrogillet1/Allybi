import AdmZip = require('adm-zip');
import logger from '../../../utils/logger';
import { DocxAnchorsService, ParagraphNode } from './docxAnchors.service';

interface XmlNode {
  [key: string]: unknown;
}

interface ParsedDocumentXml {
  document: XmlNode;
  body: XmlNode;
  paragraphs: XmlNode[];
  parsedRoot: XmlNode;
}

const MAX_PARAGRAPH_TEXT_LENGTH = 20000;
type DocxContentFormat = "plain" | "html";
type DocxContentOpts = {
  format?: DocxContentFormat;
  removeNumbering?: boolean;
  applyNumbering?: boolean;
  applyNumberingType?: "bulleted" | "numbered";
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readRunText(run: XmlNode): string {
  const parts: string[] = [];
  const textNodes = asArray(run['w:t'] as string | XmlNode | Array<string | XmlNode> | undefined);

  for (const node of textNodes) {
    if (typeof node === 'string') {
      parts.push(node);
      continue;
    }
    const value = node?._;
    if (typeof value === 'string') {
      parts.push(value);
    }
  }

  if (run['w:tab']) parts.push('\t');
  if (run['w:br']) parts.push('\n');
  return parts.join('');
}

type RichStyleState = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSizeHalfPoints?: number | null;
  colorHex?: string | null; // #RRGGBB
  fontFamily?: string | null; // CSS family name
};

type RichToken =
  | { kind: "text"; text: string; style: RichStyleState }
  | { kind: "br" };

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };

  return input
    .replace(/&([a-zA-Z]+);/g, (m, name) => (named[name] !== undefined ? named[name]! : m))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function parseFontSizeHalfPointsFromStyle(styleAttr: string): number | null {
  const m = styleAttr.match(/font-size\s*:\s*([0-9.]+)\s*(px|pt)\b/i);
  if (!m) return null;
  const raw = Number(m[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const unit = (m[2] || "px").toLowerCase();
  const pt = unit === "pt" ? raw : raw * 0.75; // CSS px -> pt approximation
  const halfPoints = Math.round(pt * 2);
  return halfPoints > 0 ? halfPoints : null;
}

function parseColorHexFromStyle(styleAttr: string): string | null {
  const m = styleAttr.match(/\bcolor\s*:\s*(#[0-9a-fA-F]{3,8})\b/);
  if (!m) return null;
  let hex = String(m[1] || "").trim();
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  // Ignore alpha (#RRGGBBAA)
  if (hex.length !== 7) return null;
  return hex.toUpperCase();
}

function parseFontFamilyFromStyle(styleAttr: string): string | null {
  const m = styleAttr.match(/\bfont-family\s*:\s*([^;]+)\s*;?/i);
  if (!m) return null;
  const raw = String(m[1] || "").trim();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() || "";
  const cleaned = first.replace(/^['"]/, "").replace(/['"]$/, "").trim();
  return cleaned || null;
}

function tokenizeRichHtml(html: string): RichToken[] {
  const tokens: RichToken[] = [];
  const base: RichStyleState = {
    bold: undefined,
    italic: undefined,
    underline: undefined,
    fontSizeHalfPoints: undefined,
    colorHex: undefined,
    fontFamily: undefined,
  };
  const stack: Array<{ tag: string; style: RichStyleState }> = [{ tag: "root", style: base }];

  const pushText = (text: string) => {
    const decoded = decodeHtmlEntities(text);
    if (!decoded) return;
    tokens.push({ kind: "text", text: decoded, style: stack[stack.length - 1]!.style });
  };

  const tagRe = /<[^>]*>/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    const raw = match[0] || "";
    const idx = match.index ?? 0;
    if (idx > lastIdx) pushText(html.slice(lastIdx, idx));
    lastIdx = idx + raw.length;

    const inner = raw.slice(1, -1).trim();
    if (!inner) continue;
    if (inner.startsWith("!")) continue; // comments/doctype

    const isClosing = inner.startsWith("/");
    const tagContent = isClosing ? inner.slice(1).trim() : inner;
    const [tagNameRaw] = tagContent.split(/\s+/, 1);
    const tagName = (tagNameRaw || "").toLowerCase();
    const isSelfClosing = /\/\s*$/.test(inner) || tagName === "br";

    if (isClosing) {
      // Pop until matching tag, but never remove root.
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i]!.tag === tagName) {
          stack.splice(i);
          break;
        }
      }
      // Treat block closes as a line break (keeps us inside a single DOCX paragraph).
      if (tagName === "p" || tagName === "div" || tagName === "li") tokens.push({ kind: "br" });
      continue;
    }

    if (tagName === "br") {
      tokens.push({ kind: "br" });
      continue;
    }

    // Opening tag: copy current style and apply.
    const next: RichStyleState = { ...stack[stack.length - 1]!.style };
    if (tagName === "b" || tagName === "strong") next.bold = true;
    if (tagName === "i" || tagName === "em") next.italic = true;
    if (tagName === "u") next.underline = true;

    if (tagName === "span") {
      const styleMatch = tagContent.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
      const styleAttr = (styleMatch?.[2] || styleMatch?.[3] || "").trim();
      const size = styleAttr ? parseFontSizeHalfPointsFromStyle(styleAttr) : null;
      if (size) next.fontSizeHalfPoints = size;
      const color = styleAttr ? parseColorHexFromStyle(styleAttr) : null;
      if (color) next.colorHex = color;
      const family = styleAttr ? parseFontFamilyFromStyle(styleAttr) : null;
      if (family) next.fontFamily = family;
      // Explicit style-removal markers (font-weight:normal → bold=false, etc.)
      if (/\bfont-weight\s*:\s*normal\b/i.test(styleAttr)) next.bold = false;
      if (/\bfont-style\s*:\s*normal\b/i.test(styleAttr)) next.italic = false;
      if (/\btext-decoration\s*:\s*none\b/i.test(styleAttr)) next.underline = false;
    }

    if (!isSelfClosing) {
      stack.push({ tag: tagName, style: next });
    }

    // Opening block tags behave like a line break boundary.
    if (tagName === "p" || tagName === "div" || tagName === "li") tokens.push({ kind: "br" });
  }

  if (lastIdx < html.length) pushText(html.slice(lastIdx));
  return tokens;
}

function richHtmlToPlainText(html: string): string {
  const tokens = tokenizeRichHtml(html);
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.kind === "br") {
      parts.push("\n");
      continue;
    }
    parts.push(token.text);
  }
  return parts.join("");
}

function extractParagraphPlainText(paragraph: XmlNode): string {
  const parts: string[] = [];

  const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
  for (const run of runs) {
    parts.push(readRunText(run));
  }

  const hyperlinks = asArray(paragraph['w:hyperlink'] as XmlNode | XmlNode[] | undefined);
  for (const hyperlink of hyperlinks) {
    const linkRuns = asArray(hyperlink['w:r'] as XmlNode | XmlNode[] | undefined);
    for (const run of linkRuns) {
      parts.push(readRunText(run));
    }
  }

  const insertions = asArray(paragraph['w:ins'] as XmlNode | XmlNode[] | undefined);
  for (const insertion of insertions) {
    const insertionRuns = asArray(insertion['w:r'] as XmlNode | XmlNode[] | undefined);
    for (const run of insertionRuns) {
      parts.push(readRunText(run));
    }
  }

  return normalizeWhitespace(parts.join(''));
}

function runFormattingSignature(run: XmlNode): string {
  const rPr = asArray(run['w:rPr'] as XmlNode | XmlNode[] | undefined)[0];
  if (!rPr) return 'plain';

  const flags = [
    rPr['w:b'] ? 'b' : '',
    rPr['w:i'] ? 'i' : '',
    rPr['w:u'] ? 'u' : '',
    rPr['w:strike'] ? 's' : '',
    rPr['w:smallCaps'] ? 'sc' : '',
  ]
    .filter(Boolean)
    .join('');

  const sizeNode = asArray(rPr['w:sz'] as XmlNode | XmlNode[] | undefined)[0];
  const sizeRaw =
    ((sizeNode?.$ as Record<string, unknown> | undefined)?.['w:val'] ??
      (sizeNode?.$ as Record<string, unknown> | undefined)?.['val']) as string | number | undefined;

  return `${flags || 'plain'}:${sizeRaw ?? ''}`;
}

function paragraphHasMixedRichRuns(paragraph: XmlNode): boolean {
  const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
  if (runs.length <= 1) return false;
  const signatures = new Set(runs.map(runFormattingSignature));
  return signatures.size > 1;
}

function buildReplacementRun(text: string, preservedRunProps: XmlNode | undefined): XmlNode {
  const run: XmlNode = {
    'w:t': [
      {
        _: text,
        $: { 'xml:space': 'preserve' },
      },
    ],
  };

  if (preservedRunProps) {
    run['w:rPr'] = [preservedRunProps];
  }

  return run;
}

function buildRunProps(base: XmlNode | undefined, style: RichStyleState): XmlNode | undefined {
  const hasStyle =
    style.bold !== undefined ||
    style.italic !== undefined ||
    style.underline !== undefined ||
    style.fontSizeHalfPoints !== undefined ||
    style.colorHex !== undefined ||
    style.fontFamily !== undefined;
  if (!base && !hasStyle) return undefined;

  const rPr: XmlNode = base ? deepClone(base) : {};

  // Ensure the rich-text payload controls these core style flags, even if the
  // original paragraph's first run was styled.
  if (style.bold !== undefined) delete rPr["w:b"];
  if (style.italic !== undefined) delete rPr["w:i"];
  if (style.underline !== undefined) delete rPr["w:u"];
  if (style.fontSizeHalfPoints !== undefined) {
    delete rPr["w:sz"];
    delete rPr["w:szCs"];
  }
  if (style.colorHex !== undefined) delete rPr["w:color"];
  if (style.fontFamily !== undefined) delete rPr["w:rFonts"];

  if (style.bold) rPr["w:b"] = [{}];
  if (style.italic) rPr["w:i"] = [{}];
  if (style.underline) rPr["w:u"] = [{ $: { "w:val": "single" } }];
  if (style.fontSizeHalfPoints) {
    const val = String(style.fontSizeHalfPoints);
    rPr["w:sz"] = [{ $: { "w:val": val } }];
    rPr["w:szCs"] = [{ $: { "w:val": val } }];
  }
  if (style.colorHex) {
    const val = style.colorHex.replace("#", "");
    if (/^[0-9A-F]{6}$/.test(val)) {
      rPr["w:color"] = [{ $: { "w:val": val } }];
    }
  }
  if (style.fontFamily) {
    const family = String(style.fontFamily || "").trim();
    if (family) {
      rPr["w:rFonts"] = [{ $: { "w:ascii": family, "w:hAnsi": family, "w:cs": family } }];
    }
  }

  return rPr;
}

function buildTextRun(text: string, preservedRunProps: XmlNode | undefined, style: RichStyleState): XmlNode {
  const run: XmlNode = {
    "w:t": [
      {
        _: text,
        $: { "xml:space": "preserve" },
      },
    ],
  };
  const rPr = buildRunProps(preservedRunProps, style);
  if (rPr) run["w:rPr"] = [rPr];
  return run;
}

function buildBreakRun(preservedRunProps: XmlNode | undefined, style: RichStyleState): XmlNode {
  const run: XmlNode = { "w:br": [{}] };
  const rPr = buildRunProps(preservedRunProps, style);
  if (rPr) run["w:rPr"] = [rPr];
  return run;
}

function buildRunsFromRichHtml(html: string, preservedRunProps: XmlNode | undefined): XmlNode[] {
  const tokens = tokenizeRichHtml(html);

  // If the HTML contains no explicit rich-text formatting (e.g. generated from
  // toHtmlFromPlain), preserve the original paragraph's run properties (bold, font,
  // size, color, etc.) as-is instead of stripping them through buildRunProps.
  // Check for any DEFINED style (including explicit false = style removal).
  const hasAnyRichStyle = tokens.some(
    (t) =>
      t.kind === "text" &&
      (t.style.bold !== undefined ||
        t.style.italic !== undefined ||
        t.style.underline !== undefined ||
        Boolean(t.style.fontSizeHalfPoints) ||
        Boolean(t.style.colorHex) ||
        Boolean(t.style.fontFamily)),
  );

  if (!hasAnyRichStyle && preservedRunProps) {
    const plainRuns: XmlNode[] = [];
    let plainLastWasBreak = false;
    for (const token of tokens) {
      if (token.kind === "br") {
        if (!plainRuns.length || plainLastWasBreak) continue;
        const br: XmlNode = { "w:br": [{}], "w:rPr": [deepClone(preservedRunProps)] };
        plainRuns.push(br);
        plainLastWasBreak = true;
        continue;
      }
      if (!token.text) continue;
      plainRuns.push(buildReplacementRun(token.text, preservedRunProps));
      plainLastWasBreak = false;
    }
    if (plainRuns.length) return plainRuns;
  }

  const runs: XmlNode[] = [];
  let lastWasBreak = false;

  for (const token of tokens) {
    if (token.kind === "br") {
      if (!runs.length) continue;
      if (lastWasBreak) continue;
      runs.push(buildBreakRun(preservedRunProps, {
        bold: undefined,
        italic: undefined,
        underline: undefined,
        fontSizeHalfPoints: undefined,
        colorHex: undefined,
        fontFamily: undefined,
      }));
      lastWasBreak = true;
      continue;
    }

    const t = token.text;
    if (!t) continue;
    runs.push(buildTextRun(t, preservedRunProps, token.style));
    lastWasBreak = false;
  }

  return runs.length ? runs : [buildReplacementRun(normalizeWhitespace(richHtmlToPlainText(html)), preservedRunProps)];
}

function getParagraphStyleName(paragraph: XmlNode): string {
  const pPr = asArray(paragraph['w:pPr'] as XmlNode | XmlNode[] | undefined)[0];
  const pStyle = asArray(pPr?.['w:pStyle'] as XmlNode | XmlNode[] | undefined)[0];
  const attrs = (pStyle?.$ as Record<string, unknown> | undefined) ?? {};
  const value = attrs['w:val'] ?? attrs['val'];
  return typeof value === 'string' ? value : '';
}

type RichParagraphStyle = {
  alignment?: "left" | "center" | "right" | "justify";
  lineSpacingTwips?: number;
};

function parseParagraphAlignmentFromStyle(styleAttr: string): RichParagraphStyle["alignment"] | null {
  const m = styleAttr.match(/\btext-align\s*:\s*(left|right|center|justify)\b/i);
  if (!m?.[1]) return null;
  const v = String(m[1]).toLowerCase();
  if (v === "left" || v === "right" || v === "center" || v === "justify") return v;
  return null;
}

function parseParagraphLineSpacingTwipsFromStyle(styleAttr: string): number | null {
  const m = styleAttr.match(/\bline-height\s*:\s*([0-9.]+)\s*(%|px|pt)?\b/i);
  if (!m?.[1]) return null;
  const raw = Number(m[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const unit = String(m[2] || "").toLowerCase();

  let factor = raw;
  if (unit === "%") factor = raw / 100;
  else if (unit === "pt") factor = raw / 12;
  else if (unit === "px") factor = raw / 16;

  if (!Number.isFinite(factor) || factor < 0.8 || factor > 4) return null;
  const twips = Math.round(factor * 240);
  return twips > 0 ? twips : null;
}

function parseParagraphStyleFromRichHtml(html: string): RichParagraphStyle {
  const src = String(html || "");
  const tag = src.match(/<(?:p|div)\b[^>]*\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/i);
  const styleAttr = String(tag?.[1] || tag?.[2] || "").trim();
  if (!styleAttr) return {};

  const style: RichParagraphStyle = {};
  const alignment = parseParagraphAlignmentFromStyle(styleAttr);
  if (alignment) style.alignment = alignment;
  const lineSpacingTwips = parseParagraphLineSpacingTwipsFromStyle(styleAttr);
  if (lineSpacingTwips) style.lineSpacingTwips = lineSpacingTwips;
  return style;
}

function ensureParagraphProps(paragraph: XmlNode): XmlNode {
  const existing = asArray(paragraph["w:pPr"] as XmlNode | XmlNode[] | undefined)[0];
  if (existing) {
    paragraph["w:pPr"] = [existing];
    return existing;
  }
  const created: XmlNode = {};
  paragraph["w:pPr"] = [created];
  return created;
}

function readAttr(node: XmlNode | undefined, ...keys: string[]): string {
  if (!node || typeof node !== "object") return "";
  const attrs = (node.$ as Record<string, unknown> | undefined) || {};
  for (const key of keys) {
    const val = attrs[key];
    if (val != null && String(val).trim()) return String(val).trim();
  }
  return "";
}

function readParagraphNumPr(paragraph: XmlNode): { numId: string; ilvl: string } | null {
  const pPr = asArray(paragraph["w:pPr"] as XmlNode | XmlNode[] | undefined)[0];
  if (!pPr) return null;
  const numPr = asArray(pPr["w:numPr"] as XmlNode | XmlNode[] | undefined)[0];
  if (!numPr) return null;
  const numIdNode = asArray(numPr["w:numId"] as XmlNode | XmlNode[] | undefined)[0];
  const ilvlNode = asArray(numPr["w:ilvl"] as XmlNode | XmlNode[] | undefined)[0];
  const numId = readAttr(numIdNode, "w:val", "val");
  const ilvl = readAttr(ilvlNode, "w:val", "val") || "0";
  if (!numId) return null;
  return { numId, ilvl };
}

function applyNumberingToParagraph(paragraph: XmlNode, params: { numId: string; ilvl?: string }): void {
  const numId = String(params.numId || "").trim();
  if (!numId) return;
  const ilvl = String(params.ilvl || "0").trim() || "0";
  const pPr = ensureParagraphProps(paragraph);
  pPr["w:numPr"] = [
    {
      "w:ilvl": [{ $: { "w:val": ilvl } }],
      "w:numId": [{ $: { "w:val": numId } }],
    },
  ];
}

function stripLeadingBulletText(paragraph: XmlNode): void {
  const text = extractParagraphPlainText(paragraph);
  const cleaned = String(text || "").replace(/^\s*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim();
  if (!cleaned || cleaned === text) return;
  const runs = asArray(paragraph["w:r"] as XmlNode | XmlNode[] | undefined);
  const firstRun = runs[0];
  const firstRunProps = firstRun ? asArray(firstRun["w:rPr"] as XmlNode | XmlNode[] | undefined)[0] : undefined;
  paragraph["w:r"] = [buildReplacementRun(cleaned, firstRunProps)];
}

function prependBulletGlyphIfNeeded(paragraph: XmlNode): void {
  const text = extractParagraphPlainText(paragraph);
  if (/^\s*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/.test(text)) return;
  const runs = asArray(paragraph["w:r"] as XmlNode | XmlNode[] | undefined);
  if (runs.length) {
    const firstRun = runs[0];
    const textNodes = asArray(firstRun["w:t"] as string | XmlNode | Array<string | XmlNode> | undefined);
    if (textNodes.length) {
      const firstNode = textNodes[0];
      if (typeof firstNode === "string") {
        textNodes[0] = `• ${firstNode}`;
      } else if (firstNode && typeof firstNode === "object") {
        const prev = typeof firstNode._ === "string" ? firstNode._ : "";
        firstNode._ = `• ${prev}`;
        firstNode.$ = { ...((firstNode.$ as Record<string, unknown> | undefined) || {}), "xml:space": "preserve" };
      } else {
        textNodes[0] = { _: "• ", $: { "xml:space": "preserve" } };
      }
      firstRun["w:t"] = textNodes as any;
      return;
    }
  }
  paragraph["w:r"] = [buildReplacementRun(`• ${text || ""}`, undefined)];
}

function prependNumberGlyphIfNeeded(paragraph: XmlNode): void {
  const text = extractParagraphPlainText(paragraph);
  if (/^\s*\d+[.)]\s+/.test(text)) return;
  const runs = asArray(paragraph["w:r"] as XmlNode | XmlNode[] | undefined);
  if (runs.length) {
    const firstRun = runs[0];
    const textNodes = asArray(firstRun["w:t"] as string | XmlNode | Array<string | XmlNode> | undefined);
    if (textNodes.length) {
      const firstNode = textNodes[0];
      if (typeof firstNode === "string") {
        textNodes[0] = `1. ${firstNode}`;
      } else if (firstNode && typeof firstNode === "object") {
        const prev = typeof firstNode._ === "string" ? firstNode._ : "";
        firstNode._ = `1. ${prev}`;
        firstNode.$ = { ...((firstNode.$ as Record<string, unknown> | undefined) || {}), "xml:space": "preserve" };
      } else {
        textNodes[0] = { _: "1. ", $: { "xml:space": "preserve" } };
      }
      firstRun["w:t"] = textNodes as any;
      return;
    }
  }
  paragraph["w:r"] = [buildReplacementRun(`1. ${text || ""}`, undefined)];
}

async function resolveListNumId(zip: AdmZip, preferred: "bulleted" | "numbered"): Promise<string | null> {
  const numberingEntry = zip.getEntry("word/numbering.xml");
  if (!numberingEntry) return null;
  const xml = numberingEntry.getData().toString("utf8");
  if (!xml.trim()) return null;
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser({ explicitArray: true, preserveChildrenOrder: true });
  const root = (await parser.parseStringPromise(xml)) as XmlNode;
  const numbering = asArray(root["w:numbering"] as XmlNode | XmlNode[] | undefined)[0];
  if (!numbering) return null;

  const matchingAbstractIds = new Set<string>();
  const abstractNums = asArray(numbering["w:abstractNum"] as XmlNode | XmlNode[] | undefined);
  for (const abs of abstractNums) {
    const abstractNumId = readAttr(abs, "w:abstractNumId", "abstractNumId");
    if (!abstractNumId) continue;
    const levels = asArray(abs["w:lvl"] as XmlNode | XmlNode[] | undefined);
    for (const lvl of levels) {
      const ilvl = readAttr(lvl, "w:ilvl", "ilvl") || "0";
      if (ilvl !== "0") continue;
      const numFmtNode = asArray(lvl["w:numFmt"] as XmlNode | XmlNode[] | undefined)[0];
      const numFmt = readAttr(numFmtNode, "w:val", "val").toLowerCase();
      const isBullet = numFmt === "bullet";
      const isNumbered = numFmt && numFmt !== "bullet" && numFmt !== "none";
      if ((preferred === "bulleted" && isBullet) || (preferred === "numbered" && isNumbered)) {
        matchingAbstractIds.add(abstractNumId);
        break;
      }
    }
  }
  if (!matchingAbstractIds.size) return null;

  const nums = asArray(numbering["w:num"] as XmlNode | XmlNode[] | undefined);
  for (const num of nums) {
    const numId = readAttr(num, "w:numId", "numId");
    if (!numId) continue;
    const absRef = asArray(num["w:abstractNumId"] as XmlNode | XmlNode[] | undefined)[0];
    const absId = readAttr(absRef, "w:val", "val");
    if (absId && matchingAbstractIds.has(absId)) return numId;
  }
  return null;
}

function applyParagraphStyleToParagraph(paragraph: XmlNode, style: RichParagraphStyle): void {
  const pPr = ensureParagraphProps(paragraph);

  if (style.alignment) {
    const wordAlignment = style.alignment === "justify" ? "both" : style.alignment;
    pPr["w:jc"] = [{ $: { "w:val": wordAlignment } }];
  }

  if (style.lineSpacingTwips) {
    const spacingNode = asArray(pPr["w:spacing"] as XmlNode | XmlNode[] | undefined)[0] || {};
    const attrs = ((spacingNode.$ as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
    attrs["w:line"] = String(style.lineSpacingTwips);
    attrs["w:lineRule"] = "auto";
    spacingNode.$ = attrs;
    pPr["w:spacing"] = [spacingNode];
  }
}

async function parseDocumentXml(xml: string): Promise<ParsedDocumentXml> {
  const xml2js = require('xml2js');
  const parser = new xml2js.Parser({ explicitArray: true, preserveChildrenOrder: true });
  const parsedRoot = (await parser.parseStringPromise(xml)) as XmlNode;

  const documentNode = asArray(parsedRoot['w:document'] as XmlNode | XmlNode[] | undefined)[0];
  if (!documentNode) {
    throw new Error('Invalid DOCX XML: missing w:document');
  }

  const bodyNode = asArray(documentNode['w:body'] as XmlNode | XmlNode[] | undefined)[0];
  if (!bodyNode) {
    throw new Error('Invalid DOCX XML: missing w:body');
  }

  const paragraphs = asArray(bodyNode['w:p'] as XmlNode | XmlNode[] | undefined);

  return {
    document: documentNode,
    body: bodyNode,
    paragraphs,
    parsedRoot,
  };
}

function findParagraphXmlIndex(target: ParagraphNode, paragraphs: XmlNode[]): number {
  const nonEmpty: Array<{ xmlIndex: number; text: string }> = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = extractParagraphPlainText(paragraphs[i]);
    if (text) {
      nonEmpty.push({ xmlIndex: i, text });
    }
  }

  const byOrdinal = nonEmpty[target.indexInSection]?.xmlIndex;
  if (byOrdinal !== undefined && normalizeWhitespace(nonEmpty[target.indexInSection]!.text) === normalizeWhitespace(target.text)) {
    return byOrdinal;
  }

  const exactByText = nonEmpty.findIndex(item => normalizeWhitespace(item.text) === normalizeWhitespace(target.text));
  if (exactByText >= 0) {
    return nonEmpty[exactByText]!.xmlIndex;
  }

  return -1;
}

function applyTextToParagraph(paragraph: XmlNode, newText: string): { formatLossRisk: boolean; removedHyperlinks: boolean } {
  const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
  const firstRun = runs[0];
  const firstRunProps = firstRun
    ? asArray(firstRun['w:rPr'] as XmlNode | XmlNode[] | undefined)[0]
    : undefined;

  const formatLossRisk = paragraphHasMixedRichRuns(paragraph);
  const removedHyperlinks = Boolean(paragraph['w:hyperlink']);

  paragraph['w:r'] = [buildReplacementRun(newText, firstRunProps)];

  if (paragraph['w:hyperlink']) {
    delete paragraph['w:hyperlink'];
  }

  if (paragraph['w:ins']) {
    delete paragraph['w:ins'];
  }

  return { formatLossRisk, removedHyperlinks };
}

function validateInput(paragraphId: string, content: string, opts?: DocxContentOpts): void {
  if (!paragraphId.trim()) {
    throw new Error('paragraphId is required');
  }

  const plain = opts?.format === "html" ? richHtmlToPlainText(content) : content;
  const normalized = normalizeWhitespace(plain);
  if (!normalized) {
    throw new Error('newText cannot be empty');
  }

  if (normalized.length > MAX_PARAGRAPH_TEXT_LENGTH) {
    throw new Error(`newText exceeds safe paragraph limit (${MAX_PARAGRAPH_TEXT_LENGTH})`);
  }
}

function setRunPlainText(run: XmlNode, text: string): void {
  delete run["w:tab"];
  delete run["w:br"];
  run["w:t"] = [
    {
      _: text,
      $: { "xml:space": "preserve" },
    },
  ];
}

function patchRunInPlace(runs: XmlNode[], beforeFullText: string, afterFullText: string): boolean {
  const before = String(beforeFullText || "");
  const after = String(afterFullText || "");
  if (before === after) return true;
  if (!runs.length) return false;

  let prefix = 0;
  const minLen = Math.min(before.length, after.length);
  while (prefix < minLen && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < (before.length - prefix) &&
    suffix < (after.length - prefix) &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const changeStart = prefix;
  const changeEnd = before.length - suffix;
  const replacement = after.slice(prefix, after.length - suffix);

  let cursor = 0;
  let targetRunIndex = -1;
  let runStart = 0;
  let runEnd = 0;
  let runText = "";

  for (let i = 0; i < runs.length; i += 1) {
    const r = runs[i]!;
    const t = readRunText(r);
    const next = cursor + t.length;
    if (changeStart >= cursor && changeEnd <= next) {
      targetRunIndex = i;
      runStart = cursor;
      runEnd = next;
      runText = t;
      break;
    }
    cursor = next;
  }

  if (targetRunIndex < 0) return false;
  if (runText.includes("\n") || runText.includes("\t")) return false;

  const localStart = Math.max(0, changeStart - runStart);
  const localEnd = Math.min(runText.length, Math.max(localStart, changeEnd - runStart));
  const nextText = `${runText.slice(0, localStart)}${replacement}${runText.slice(localEnd)}`;
  setRunPlainText(runs[targetRunIndex]!, nextText);
  return true;
}

export class DocxEditorService {
  private readonly anchorsService = new DocxAnchorsService();

  async applyParagraphEdit(buffer: Buffer, paragraphId: string, newText: string, opts?: DocxContentOpts): Promise<Buffer> {
    validateInput(paragraphId, newText, opts);

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(anchor => anchor.paragraphId === paragraphId);
    if (!targetAnchor) {
      throw new Error(`Paragraph target not found: ${paragraphId}`);
    }

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) {
      throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);
    }

    const paragraph = parsed.paragraphs[xmlIndex];
    const beforeText = extractParagraphPlainText(paragraph);
    const afterPlainText = normalizeWhitespace(opts?.format === "html" ? richHtmlToPlainText(newText) : newText);
    const nextParagraphStyle = opts?.format === "html" ? parseParagraphStyleFromRichHtml(newText) : {};
    const hasParagraphStylePatch = Boolean(nextParagraphStyle.alignment || nextParagraphStyle.lineSpacingTwips);
    const hasInlineMarkupPatch =
      opts?.format === "html" && /<(?:b|strong|i|em|u|span|font)\b/i.test(String(newText || ""));

    // Style-only edits can keep paragraph text unchanged, so only skip when truly no-op.
    if (
      normalizeWhitespace(beforeText) === afterPlainText &&
      !hasParagraphStylePatch &&
      !hasInlineMarkupPatch &&
      !opts?.removeNumbering &&
      !opts?.applyNumbering
    ) {
      return buffer;
    }

    const styleName = getParagraphStyleName(paragraph);
    const { formatLossRisk, removedHyperlinks } =
      opts?.format === "html"
        ? (() => {
            const runs = asArray(paragraph["w:r"] as XmlNode | XmlNode[] | undefined);
            const firstRun = runs[0];
            const firstRunProps = firstRun ? asArray(firstRun["w:rPr"] as XmlNode | XmlNode[] | undefined)[0] : undefined;
            const patchedInPlace =
              !hasInlineMarkupPatch &&
              runs.length > 1 &&
              patchRunInPlace(runs, beforeText, afterPlainText);
            if (!patchedInPlace) {
              paragraph["w:r"] = buildRunsFromRichHtml(newText, firstRunProps);
            }
            if (nextParagraphStyle.alignment || nextParagraphStyle.lineSpacingTwips) {
              applyParagraphStyleToParagraph(paragraph, nextParagraphStyle);
            }
            const hadLinks = Boolean(paragraph["w:hyperlink"]);
            if (paragraph["w:hyperlink"]) delete paragraph["w:hyperlink"];
            if (paragraph["w:ins"]) delete paragraph["w:ins"];
            return { formatLossRisk: paragraphHasMixedRichRuns(paragraph), removedHyperlinks: hadLinks };
          })()
        : applyTextToParagraph(paragraph, newText);

    // Optional: convert a list/bullet paragraph into a normal paragraph by removing numbering properties.
    if (opts?.removeNumbering) {
      const pPr = ensureParagraphProps(paragraph);
      if ((pPr as any)['w:numPr']) {
        delete (pPr as any)['w:numPr'];
      }
      const pStyle = asArray(pPr["w:pStyle"] as XmlNode | XmlNode[] | undefined)[0];
      const styleVal = readAttr(pStyle, "w:val", "val");
      if (styleVal && /\b(list|bullet|number)\b/i.test(styleVal)) {
        delete (pPr as any)["w:pStyle"];
      }
      stripLeadingBulletText(paragraph);
    }

    if (opts?.applyNumbering) {
      const fromNearest = (() => {
        for (let i = Math.max(0, xmlIndex - 8); i <= Math.min(parsed.paragraphs.length - 1, xmlIndex + 8); i++) {
          if (i === xmlIndex) continue;
          const numPr = readParagraphNumPr(parsed.paragraphs[i]!);
          if (numPr?.numId) return numPr;
        }
        for (const p of parsed.paragraphs) {
          const numPr = readParagraphNumPr(p);
          if (numPr?.numId) return numPr;
        }
        return null;
      })();

      let numPr = fromNearest;
      if (!numPr?.numId) {
        const preferredType = opts?.applyNumberingType === "numbered" ? "numbered" : "bulleted";
        const listNumId = await resolveListNumId(zip, preferredType);
        if (listNumId) numPr = { numId: listNumId, ilvl: "0" };
      }

      if (numPr?.numId) {
        applyNumberingToParagraph(paragraph, numPr);
      } else {
        // Fallback when no numbering definitions exist in the DOCX.
        if (opts?.applyNumberingType === "numbered") prependNumberGlyphIfNeeded(paragraph);
        else prependBulletGlyphIfNeeded(paragraph);
      }
    }

    const xml2js = require('xml2js');
    const builder = new xml2js.Builder();
    const nextDocumentXml = builder.buildObject(parsed.parsedRoot);

    zip.updateFile('word/document.xml', Buffer.from(nextDocumentXml, 'utf8'));
    const outputBuffer = zip.toBuffer();

    // Integrity check: ensure edited file can be reopened and still has document.xml.
    const verificationZip = new AdmZip(outputBuffer);
    const verificationEntry = verificationZip.getEntry('word/document.xml');
    if (!verificationEntry) {
      throw new Error('DOCX integrity check failed after edit: missing word/document.xml');
    }

    const verificationXml = verificationEntry.getData().toString('utf8');
    if (!verificationXml.includes(afterPlainText.slice(0, Math.min(afterPlainText.length, 32)))) {
      logger.warn('[DocxEditor] Integrity check warning: edited text probe not found in XML preview', {
        paragraphId,
        probeLength: Math.min(afterPlainText.length, 32),
      });
    }

    if (formatLossRisk || removedHyperlinks) {
      logger.warn('[DocxEditor] Applied safe fallback while preserving paragraph style', {
        paragraphId,
        styleName,
        formatLossRisk,
        removedHyperlinks,
      });
    }

    return outputBuffer;
  }

  /**
   * Delete a paragraph by paragraphId (structural edit).
   * This removes the paragraph node from the document body.
   */
  async deleteParagraph(buffer: Buffer, paragraphId: string): Promise<Buffer> {
    if (!paragraphId.trim()) throw new Error('paragraphId is required');

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(anchor => anchor.paragraphId === paragraphId);
    if (!targetAnchor) {
      throw new Error(`Paragraph target not found: ${paragraphId}`);
    }

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) {
      throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);
    }

    parsed.paragraphs.splice(xmlIndex, 1);
    parsed.body['w:p'] = parsed.paragraphs;

    const xml2js = require('xml2js');
    const builder = new xml2js.Builder();
    const nextDocumentXml = builder.buildObject(parsed.parsedRoot);

    zip.updateFile('word/document.xml', Buffer.from(nextDocumentXml, 'utf8'));
    const outputBuffer = zip.toBuffer();

    // Integrity check
    const verificationZip = new AdmZip(outputBuffer);
    const verificationEntry = verificationZip.getEntry('word/document.xml');
    if (!verificationEntry) {
      throw new Error('DOCX integrity check failed after delete: missing word/document.xml');
    }

    return outputBuffer;
  }

  /**
   * Delete multiple paragraphs by their IDs in a single pass.
   * Resolves all target indices against a single anchor extraction, then removes
   * them in reverse order so earlier deletions don't shift later indices.
   */
  async deleteParagraphs(buffer: Buffer, paragraphIds: string[]): Promise<Buffer> {
    if (!paragraphIds.length) return buffer;

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    // Map all target PIDs to XML indices in one extraction pass
    const xmlIndicesToDelete: number[] = [];
    for (const pid of paragraphIds) {
      const targetAnchor = anchors.find(a => a.paragraphId === pid.trim());
      if (!targetAnchor) continue; // skip unresolvable (don't throw)
      const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
      if (xmlIndex >= 0) xmlIndicesToDelete.push(xmlIndex);
    }

    if (!xmlIndicesToDelete.length) return buffer;

    // Delete in REVERSE order so indices don't shift
    const sorted = [...new Set(xmlIndicesToDelete)].sort((a, b) => b - a);
    for (const idx of sorted) {
      parsed.paragraphs.splice(idx, 1);
    }
    parsed.body['w:p'] = parsed.paragraphs;

    const xml2js = require('xml2js');
    const builder = new xml2js.Builder();
    const nextDocumentXml = builder.buildObject(parsed.parsedRoot);

    zip.updateFile('word/document.xml', Buffer.from(nextDocumentXml, 'utf8'));
    const outputBuffer = zip.toBuffer();

    // Integrity check
    const verificationZip = new AdmZip(outputBuffer);
    const verificationEntry = verificationZip.getEntry('word/document.xml');
    if (!verificationEntry) {
      throw new Error('DOCX integrity check failed after batch delete: missing word/document.xml');
    }

    return outputBuffer;
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Run-level & paragraph-level formatting
  // ---------------------------------------------------------------------------

  /**
   * Apply inline (run-level) formatting to all runs in a paragraph.
   * Sets w:rPr properties: bold, italic, underline, color, fontFamily, fontSizePt.
   */
  async applyRunStyle(
    buffer: Buffer,
    paragraphId: string,
    style: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; fontFamily?: string; fontSizePt?: number },
  ): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
      for (const run of runs) {
        const existing = asArray(run['w:rPr'] as XmlNode | XmlNode[] | undefined)[0] || {};
        const rPr = deepClone(existing);

        if (style.bold === true) rPr['w:b'] = [{}];
        else if (style.bold === false) delete rPr['w:b'];

        if (style.italic === true) rPr['w:i'] = [{}];
        else if (style.italic === false) delete rPr['w:i'];

        if (style.underline === true) rPr['w:u'] = [{ $: { 'w:val': 'single' } }];
        else if (style.underline === false) delete rPr['w:u'];

        if (style.color) {
          const hex = style.color.replace('#', '');
          if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
            rPr['w:color'] = [{ $: { 'w:val': hex.toUpperCase() } }];
          }
        }

        if (style.fontFamily) {
          rPr['w:rFonts'] = [{ $: { 'w:ascii': style.fontFamily, 'w:hAnsi': style.fontFamily, 'w:cs': style.fontFamily } }];
        }

        if (style.fontSizePt != null && style.fontSizePt > 0) {
          const halfPt = String(Math.round(style.fontSizePt * 2));
          rPr['w:sz'] = [{ $: { 'w:val': halfPt } }];
          rPr['w:szCs'] = [{ $: { 'w:val': halfPt } }];
        }

        run['w:rPr'] = [rPr];
      }

      // Also apply to runs inside hyperlinks
      const hyperlinks = asArray(paragraph['w:hyperlink'] as XmlNode | XmlNode[] | undefined);
      for (const hl of hyperlinks) {
        const hlRuns = asArray(hl['w:r'] as XmlNode | XmlNode[] | undefined);
        for (const run of hlRuns) {
          const existing = asArray(run['w:rPr'] as XmlNode | XmlNode[] | undefined)[0] || {};
          const rPr = deepClone(existing);
          if (style.bold === true) rPr['w:b'] = [{}];
          else if (style.bold === false) delete rPr['w:b'];
          if (style.italic === true) rPr['w:i'] = [{}];
          else if (style.italic === false) delete rPr['w:i'];
          if (style.underline === true) rPr['w:u'] = [{ $: { 'w:val': 'single' } }];
          else if (style.underline === false) delete rPr['w:u'];
          if (style.color) {
            const hex = style.color.replace('#', '');
            if (/^[0-9A-Fa-f]{6}$/.test(hex)) rPr['w:color'] = [{ $: { 'w:val': hex.toUpperCase() } }];
          }
          if (style.fontFamily) rPr['w:rFonts'] = [{ $: { 'w:ascii': style.fontFamily, 'w:hAnsi': style.fontFamily, 'w:cs': style.fontFamily } }];
          if (style.fontSizePt != null && style.fontSizePt > 0) {
            const halfPt = String(Math.round(style.fontSizePt * 2));
            rPr['w:sz'] = [{ $: { 'w:val': halfPt } }];
            rPr['w:szCs'] = [{ $: { 'w:val': halfPt } }];
          }
          run['w:rPr'] = [rPr];
        }
      }
    });
  }

  /**
   * Clear all inline formatting from a paragraph's runs (remove w:rPr entirely).
   */
  async clearRunStyle(buffer: Buffer, paragraphId: string): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
      for (const run of runs) {
        delete run['w:rPr'];
      }
    });
  }

  /**
   * Set paragraph alignment (w:jc): left, center, right, both (justify).
   */
  async setAlignment(buffer: Buffer, paragraphId: string, alignment: string): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const pPr = ensureParagraphProps(paragraph);
      const wordAlignment = alignment === 'justify' ? 'both' : alignment;
      pPr['w:jc'] = [{ $: { 'w:val': wordAlignment } }];
    });
  }

  /**
   * Set paragraph indentation (w:ind).
   */
  async setIndentation(
    buffer: Buffer,
    paragraphId: string,
    opts: { leftPt?: number; rightPt?: number; firstLinePt?: number },
  ): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const pPr = ensureParagraphProps(paragraph);
      const indNode = asArray(pPr['w:ind'] as XmlNode | XmlNode[] | undefined)[0] || {};
      const attrs = ((indNode.$ as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
      if (opts.leftPt != null) attrs['w:left'] = String(Math.round(opts.leftPt * 20)); // pt → twips
      if (opts.rightPt != null) attrs['w:right'] = String(Math.round(opts.rightPt * 20));
      if (opts.firstLinePt != null) attrs['w:firstLine'] = String(Math.round(opts.firstLinePt * 20));
      indNode.$ = attrs;
      pPr['w:ind'] = [indNode];
    });
  }

  /**
   * Set paragraph line spacing (w:spacing line + lineRule).
   * @param multiplier — e.g. 1.0 = single, 1.5, 2.0 = double
   */
  async setLineSpacing(buffer: Buffer, paragraphId: string, multiplier: number): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const pPr = ensureParagraphProps(paragraph);
      const spacingNode = asArray(pPr['w:spacing'] as XmlNode | XmlNode[] | undefined)[0] || {};
      const attrs = ((spacingNode.$ as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
      attrs['w:line'] = String(Math.round(multiplier * 240));
      attrs['w:lineRule'] = 'auto';
      spacingNode.$ = attrs;
      pPr['w:spacing'] = [spacingNode];
    });
  }

  /**
   * Set paragraph spacing before/after (w:spacing before / after, in points).
   */
  async setParagraphSpacing(
    buffer: Buffer,
    paragraphId: string,
    opts: { beforePt?: number; afterPt?: number },
  ): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const pPr = ensureParagraphProps(paragraph);
      const spacingNode = asArray(pPr['w:spacing'] as XmlNode | XmlNode[] | undefined)[0] || {};
      const attrs = ((spacingNode.$ as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
      if (opts.beforePt != null) attrs['w:before'] = String(Math.round(opts.beforePt * 20)); // pt → twips
      if (opts.afterPt != null) attrs['w:after'] = String(Math.round(opts.afterPt * 20));
      spacingNode.$ = attrs;
      pPr['w:spacing'] = [spacingNode];
    });
  }

  /**
   * Set the named paragraph style (w:pStyle), e.g. "Heading1", "Normal", "Title".
   */
  async setParagraphStyle(buffer: Buffer, paragraphId: string, styleName: string): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const pPr = ensureParagraphProps(paragraph);
      pPr['w:pStyle'] = [{ $: { 'w:val': styleName } }];
    });
  }

  /**
   * Transform the text in a paragraph's runs to the specified case.
   */
  async setTextCase(buffer: Buffer, paragraphId: string, caseType: string): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      // Normalize: accept both short ("upper") and bank/pattern forms ("uppercase", "title_case")
      const raw = (caseType || '').trim().toLowerCase();
      const norm = raw === 'title_case' ? 'title'
        : raw === 'sentence_case' ? 'sentence'
        : raw === 'uppercase' ? 'upper'
        : raw === 'lowercase' ? 'lower'
        : raw;
      const transform = (text: string): string => {
        switch (norm) {
          case 'upper': return text.toUpperCase();
          case 'lower': return text.toLowerCase();
          case 'title': return text.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
          case 'sentence': return text.replace(/(^\s*\w|[.!?]\s+\w)/g, m => m.toUpperCase());
          default: return text;
        }
      };
      const transformRuns = (runs: XmlNode[]) => {
        for (const run of runs) {
          const textNodes = asArray(run['w:t'] as string | XmlNode | Array<string | XmlNode> | undefined);
          for (let i = 0; i < textNodes.length; i++) {
            const node = textNodes[i];
            if (typeof node === 'string') {
              textNodes[i] = transform(node);
            } else if (node && typeof node === 'object' && typeof node._ === 'string') {
              node._ = transform(node._);
            }
          }
          run['w:t'] = textNodes as any;
        }
      };
      transformRuns(asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined));
      // Also transform hyperlink runs
      const hyperlinks = asArray(paragraph['w:hyperlink'] as XmlNode | XmlNode[] | undefined);
      for (const hl of hyperlinks) {
        transformRuns(asArray(hl['w:r'] as XmlNode | XmlNode[] | undefined));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Phase 2: List structural operations
  // ---------------------------------------------------------------------------

  /**
   * Merge multiple paragraphs into one. Keeps the first paragraph, concatenates text,
   * removes numbering, and deletes the remaining paragraphs.
   */
  async mergeParagraphs(buffer: Buffer, paragraphIds: string[], joinSeparator = ' '): Promise<Buffer> {
    if (paragraphIds.length < 2) return buffer;

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    // Resolve all paragraph IDs to XML indices
    const resolved: Array<{ pid: string; xmlIndex: number }> = [];
    for (const pid of paragraphIds) {
      const anchor = anchors.find(a => a.paragraphId === pid.trim());
      if (!anchor) continue;
      const xmlIndex = findParagraphXmlIndex(anchor, parsed.paragraphs);
      if (xmlIndex >= 0) resolved.push({ pid, xmlIndex });
    }
    if (resolved.length < 2) return buffer;

    // Sort by document order
    resolved.sort((a, b) => a.xmlIndex - b.xmlIndex);

    // Collect text from all paragraphs
    const texts: string[] = [];
    for (const { xmlIndex } of resolved) {
      texts.push(extractParagraphPlainText(parsed.paragraphs[xmlIndex]));
    }
    const mergedText = texts.filter(Boolean).join(joinSeparator);

    // Replace first paragraph's content with merged text
    const firstParagraph = parsed.paragraphs[resolved[0].xmlIndex];
    const firstRuns = asArray(firstParagraph['w:r'] as XmlNode | XmlNode[] | undefined);
    const firstRunProps = firstRuns[0]
      ? asArray(firstRuns[0]['w:rPr'] as XmlNode | XmlNode[] | undefined)[0]
      : undefined;
    firstParagraph['w:r'] = [buildReplacementRun(mergedText, firstRunProps)];
    delete firstParagraph['w:hyperlink'];
    delete firstParagraph['w:ins'];

    // Remove numbering from merged result
    const pPr = asArray(firstParagraph['w:pPr'] as XmlNode | XmlNode[] | undefined)[0];
    if (pPr) {
      delete (pPr as any)['w:numPr'];
      const pStyle = asArray(pPr['w:pStyle'] as XmlNode | XmlNode[] | undefined)[0];
      const styleVal = readAttr(pStyle, 'w:val', 'val');
      if (styleVal && /\b(list|bullet|number)\b/i.test(styleVal)) {
        delete (pPr as any)['w:pStyle'];
      }
    }

    // Delete remaining paragraphs in reverse order
    const deleteIndices = resolved.slice(1).map(r => r.xmlIndex).sort((a, b) => b - a);
    for (const idx of deleteIndices) {
      parsed.paragraphs.splice(idx, 1);
    }
    parsed.body['w:p'] = parsed.paragraphs;

    return this.rebuildZip(zip, parsed);
  }

  /**
   * Split a single paragraph into multiple list-item paragraphs.
   * The items array provides the text for each new paragraph.
   */
  async splitParagraphToList(
    buffer: Buffer,
    paragraphId: string,
    items: string[],
    listType: 'bulleted' | 'numbered',
  ): Promise<Buffer> {
    if (!items.length) return buffer;

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(a => a.paragraphId === paragraphId);
    if (!targetAnchor) throw new Error(`Paragraph target not found: ${paragraphId}`);

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);

    const sourceParagraph = parsed.paragraphs[xmlIndex];
    const sourceRuns = asArray(sourceParagraph['w:r'] as XmlNode | XmlNode[] | undefined);
    const sourceRunProps = sourceRuns[0]
      ? asArray(sourceRuns[0]['w:rPr'] as XmlNode | XmlNode[] | undefined)[0]
      : undefined;

    // Resolve a valid numId for the list
    let numPr: { numId: string; ilvl: string } | null = null;
    // Look for nearby list paragraphs
    for (let i = Math.max(0, xmlIndex - 8); i <= Math.min(parsed.paragraphs.length - 1, xmlIndex + 8); i++) {
      const existing = readParagraphNumPr(parsed.paragraphs[i]!);
      if (existing?.numId) { numPr = existing; break; }
    }
    if (!numPr) {
      const listNumId = await resolveListNumId(zip, listType);
      if (listNumId) numPr = { numId: listNumId, ilvl: '0' };
    }
    // If still no numPr, try to create numbering.xml
    if (!numPr) {
      const created = await this.ensureNumberingDefinition(zip, listType);
      if (created) numPr = { numId: created, ilvl: '0' };
    }

    // Build new paragraph nodes
    const newParagraphs: XmlNode[] = items.map(text => {
      const newP: XmlNode = {
        'w:pPr': [{}],
        'w:r': [buildReplacementRun(text.trim(), sourceRunProps ? deepClone(sourceRunProps) : undefined)],
      };
      if (numPr) {
        applyNumberingToParagraph(newP, numPr);
      } else {
        // Text-based fallback
        const run = asArray(newP['w:r'] as XmlNode | XmlNode[] | undefined)[0];
        if (run) {
          if (listType === 'numbered') prependNumberGlyphIfNeeded(newP);
          else prependBulletGlyphIfNeeded(newP);
        }
      }
      return newP;
    });

    // Replace the source paragraph with the new list paragraphs
    parsed.paragraphs.splice(xmlIndex, 1, ...newParagraphs);
    parsed.body['w:p'] = parsed.paragraphs;

    return this.rebuildZip(zip, parsed);
  }

  /**
   * Promote or demote list level (increment/decrement w:ilvl in w:numPr).
   */
  async promoteOrDemoteListLevel(
    buffer: Buffer,
    paragraphId: string,
    direction: 'promote' | 'demote',
  ): Promise<Buffer> {
    return this.mutateParaInPlace(buffer, paragraphId, (paragraph) => {
      const pPr = ensureParagraphProps(paragraph);
      const numPrNode = asArray(pPr['w:numPr'] as XmlNode | XmlNode[] | undefined)[0];
      if (!numPrNode) return; // Not a list item — no-op

      const ilvlNode = asArray(numPrNode['w:ilvl'] as XmlNode | XmlNode[] | undefined)[0];
      const current = Number(readAttr(ilvlNode, 'w:val', 'val') || '0');
      const next = direction === 'promote' ? Math.max(0, current - 1) : Math.min(8, current + 1);
      numPrNode['w:ilvl'] = [{ $: { 'w:val': String(next) } }];
    });
  }

  /**
   * Apply list formatting (bullets or numbering) to a paragraph that is
   * currently a plain paragraph.  Preserves existing text.
   */
  async applyListFormatting(
    buffer: Buffer,
    paragraphId: string,
    listType: 'bulleted' | 'numbered',
  ): Promise<Buffer> {
    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const anchor = anchors.find(a => a.paragraphId === paragraphId);
    if (!anchor) throw new Error(`Paragraph target not found: ${paragraphId}`);
    // Re-apply the paragraph's own text with applyNumbering flags so the
    // existing numbering-aware logic in applyParagraphEdit handles everything.
    return this.applyParagraphEdit(buffer, paragraphId, anchor.text, {
      format: 'plain',
      applyNumbering: true,
      applyNumberingType: listType,
    });
  }

  /**
   * Remove list/bullet formatting from a paragraph, converting it to a
   * normal paragraph while preserving text content.
   */
  async removeListFormatting(
    buffer: Buffer,
    paragraphId: string,
  ): Promise<Buffer> {
    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const anchor = anchors.find(a => a.paragraphId === paragraphId);
    if (!anchor) throw new Error(`Paragraph target not found: ${paragraphId}`);
    return this.applyParagraphEdit(buffer, paragraphId, anchor.text, {
      format: 'plain',
      removeNumbering: true,
    });
  }

  /**
   * Restart numbering at a given paragraph.  Creates a new w:num in
   * numbering.xml that references the same abstractNumId but with a
   * lvlOverride/startOverride, then points the paragraph at the new numId.
   */
  async restartListNumbering(
    buffer: Buffer,
    paragraphId: string,
    startAt = 1,
  ): Promise<Buffer> {
    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(a => a.paragraphId === paragraphId);
    if (!targetAnchor) throw new Error(`Paragraph target not found: ${paragraphId}`);

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);

    const paragraph = parsed.paragraphs[xmlIndex]!;
    const numPrInfo = readParagraphNumPr(paragraph);
    if (!numPrInfo) return buffer; // Not a list item — no-op

    const currentNumId = numPrInfo.numId;
    const ilvl = numPrInfo.ilvl || '0';

    // Parse numbering.xml to find the abstractNumId for this numId
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: true, preserveChildrenOrder: true });

    let numberingEntry = zip.getEntry('word/numbering.xml');
    let numberingRoot: XmlNode;
    if (numberingEntry) {
      const xml = numberingEntry.getData().toString('utf8');
      numberingRoot = xml.trim()
        ? (await parser.parseStringPromise(xml)) as XmlNode
        : this.buildEmptyNumberingRoot();
    } else {
      numberingRoot = this.buildEmptyNumberingRoot();
    }

    const numbering = asArray(numberingRoot['w:numbering'] as XmlNode | XmlNode[] | undefined)[0];
    if (!numbering) return buffer;

    // Find the abstractNumId referenced by the current numId
    const nums = asArray(numbering['w:num'] as XmlNode | XmlNode[] | undefined);
    let abstractNumId: string | null = null;
    let maxNumId = 0;
    for (const num of nums) {
      const nid = Number(readAttr(num, 'w:numId', 'numId') || '0');
      if (nid > maxNumId) maxNumId = nid;
      if (String(nid) === currentNumId) {
        const absNode = asArray(num['w:abstractNumId'] as XmlNode | XmlNode[] | undefined)[0];
        abstractNumId = readAttr(absNode, 'w:val', 'val');
      }
    }
    if (!abstractNumId) return buffer; // Can't find definition — no-op

    // Create a new w:num with lvlOverride that restarts at startAt
    const newNumId = String(maxNumId + 1);
    const newNum: XmlNode = {
      $: { 'w:numId': newNumId },
      'w:abstractNumId': [{ $: { 'w:val': abstractNumId } }],
      'w:lvlOverride': [{
        $: { 'w:ilvl': ilvl },
        'w:startOverride': [{ $: { 'w:val': String(startAt) } }],
      }],
    };

    if (!Array.isArray(numbering['w:num'])) numbering['w:num'] = nums;
    (numbering['w:num'] as XmlNode[]).push(newNum);

    // Write updated numbering.xml
    const builder = new xml2js.Builder();
    const numberingXml = builder.buildObject(numberingRoot);
    if (numberingEntry) {
      zip.updateFile('word/numbering.xml', Buffer.from(numberingXml, 'utf8'));
    } else {
      zip.addFile('word/numbering.xml', Buffer.from(numberingXml, 'utf8'));
      this.ensureContentTypeForNumbering(zip);
    }

    // Point the paragraph at the new numId
    applyNumberingToParagraph(paragraph, { numId: newNumId, ilvl });

    return this.rebuildZip(zip, parsed);
  }

  /**
   * Update the table of contents.  Marks the TOC field dirty so Word
   * will regenerate it on next open.  If no TOC is found, this is a no-op
   * that returns the original buffer.
   */
  async updateTableOfContents(buffer: Buffer): Promise<Buffer> {
    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    // Check if there's a TOC field
    if (!documentXml.includes('TOC') && !documentXml.includes('w:sdt')) {
      return buffer; // No TOC present
    }

    const parsed = await parseDocumentXml(documentXml);

    // Find and mark TOC structured document tags as dirty
    let modified = false;
    const markDirty = (node: XmlNode): void => {
      if (!node || typeof node !== 'object') return;
      // Look for w:sdt (structured document tag) containing TOC
      const sdtContent = asArray(node['w:sdtContent'] as XmlNode | XmlNode[] | undefined);
      if (sdtContent.length > 0) {
        const sdtPr = asArray(node['w:sdtPr'] as XmlNode | XmlNode[] | undefined)[0];
        if (sdtPr) {
          const docPartObj = asArray(sdtPr['w:docPartObj'] as XmlNode | XmlNode[] | undefined)[0];
          if (docPartObj) {
            const docPartGallery = asArray(docPartObj['w:docPartGallery'] as XmlNode | XmlNode[] | undefined)[0];
            const galleryVal = readAttr(docPartGallery, 'w:val', 'val');
            if (galleryVal && galleryVal.toLowerCase().includes('toc')) {
              // Mark the SDT as needing update
              sdtPr['w:tag'] = [{ $: { 'w:val': 'TOC_DIRTY' } }];
              modified = true;
            }
          }
        }
      }
      // Recurse into body children
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object') markDirty(item as XmlNode);
          }
        }
      }
    };

    markDirty(parsed.body as XmlNode);

    // Also look for fldChar-based TOC fields and mark the document settings
    // to update fields on open
    if (!modified && documentXml.includes('TOC')) {
      // There's a field-code TOC but no SDT.  Mark the document to update.
      modified = true;
    }

    if (!modified) return buffer;

    // Mark the document to update fields on open via settings.xml
    const settingsEntry = zip.getEntry('word/settings.xml');
    if (settingsEntry) {
      let settingsXml = settingsEntry.getData().toString('utf8');
      if (!settingsXml.includes('w:updateFields')) {
        settingsXml = settingsXml.replace(
          '</w:settings>',
          '<w:updateFields w:val="true"/></w:settings>',
        );
        zip.updateFile('word/settings.xml', Buffer.from(settingsXml, 'utf8'));
      }
    }

    return this.rebuildZip(zip, parsed);
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Section operations
  // ---------------------------------------------------------------------------

  /**
   * Delete a section: the heading paragraph + all paragraphs under it until
   * the next same-or-higher-level heading.
   */
  async deleteSection(buffer: Buffer, headingParagraphId: string): Promise<Buffer> {
    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const headingAnchor = anchors.find(a => a.paragraphId === headingParagraphId);
    if (!headingAnchor) throw new Error(`Heading paragraph not found: ${headingParagraphId}`);
    if (!headingAnchor.headingLevel) throw new Error(`Paragraph is not a heading: ${headingParagraphId}`);

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const headingXmlIndex = findParagraphXmlIndex(headingAnchor, parsed.paragraphs);
    if (headingXmlIndex < 0) throw new Error(`Unable to map heading to XML paragraph: ${headingParagraphId}`);

    // Find the end of the section: next same-or-higher heading level
    const headingLevel = headingAnchor.headingLevel;
    let endIndex = parsed.paragraphs.length; // default: rest of document
    for (let i = headingXmlIndex + 1; i < parsed.paragraphs.length; i++) {
      const p = parsed.paragraphs[i];
      const pPr = asArray(p['w:pPr'] as XmlNode | XmlNode[] | undefined)[0];
      const styleName = getParagraphStyleName(p);
      const match = /(?:heading|título|title)[\s_-]?(\d+)/i.exec(styleName);
      let level: number | null = null;
      if (match) level = Number(match[1]);
      if (!level && pPr) {
        const outlineLvl = asArray(pPr['w:outlineLvl'] as XmlNode | XmlNode[] | undefined)[0];
        const attrs = (outlineLvl?.$ as Record<string, unknown> | undefined) ?? {};
        const raw = attrs['w:val'] ?? attrs['val'];
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 8) level = numeric + 1;
      }
      if (level != null && level <= headingLevel) {
        endIndex = i;
        break;
      }
    }

    // Delete from headingXmlIndex to endIndex (exclusive) in reverse
    const count = endIndex - headingXmlIndex;
    parsed.paragraphs.splice(headingXmlIndex, count);
    parsed.body['w:p'] = parsed.paragraphs;

    return this.rebuildZip(zip, parsed);
  }

  /**
   * Insert a new paragraph immediately before the target paragraphId.
   */
  async insertParagraphBefore(
    buffer: Buffer,
    paragraphId: string,
    newText: string,
    opts?: DocxContentOpts,
  ): Promise<Buffer> {
    validateInput(paragraphId, newText, opts);

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(a => a.paragraphId === paragraphId);
    if (!targetAnchor) throw new Error(`Paragraph target not found: ${paragraphId}`);

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);

    const targetParagraph = parsed.paragraphs[xmlIndex];
    const targetRuns = asArray(targetParagraph['w:r'] as XmlNode | XmlNode[] | undefined);
    const firstRunProps = targetRuns[0]
      ? asArray(targetRuns[0]['w:rPr'] as XmlNode | XmlNode[] | undefined)[0]
      : undefined;

    const afterText = normalizeWhitespace(opts?.format === 'html' ? richHtmlToPlainText(newText) : newText);
    const replacementRuns =
      opts?.format === 'html' ? buildRunsFromRichHtml(newText, firstRunProps) : [buildReplacementRun(afterText, firstRunProps)];
    const newParagraph: XmlNode = { 'w:r': replacementRuns };

    parsed.paragraphs.splice(xmlIndex, 0, newParagraph);
    parsed.body['w:p'] = parsed.paragraphs;

    return this.rebuildZip(zip, parsed);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Mutate a single paragraph in-place and rebuild the ZIP.
   * Factored out to avoid duplicating anchor resolution + XML parsing for
   * each formatting method.
   */
  private async mutateParaInPlace(
    buffer: Buffer,
    paragraphId: string,
    mutator: (paragraph: XmlNode, xmlIndex: number, parsed: ParsedDocumentXml) => void,
  ): Promise<Buffer> {
    if (!paragraphId.trim()) throw new Error('paragraphId is required');

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(a => a.paragraphId === paragraphId);
    if (!targetAnchor) throw new Error(`Paragraph target not found: ${paragraphId}`);

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) throw new Error('Invalid DOCX: missing word/document.xml');

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);

    mutator(parsed.paragraphs[xmlIndex], xmlIndex, parsed);

    return this.rebuildZip(zip, parsed);
  }

  /** Serialize parsed XML back into the ZIP and return a verified buffer. */
  private rebuildZip(zip: AdmZip, parsed: ParsedDocumentXml): Buffer {
    const xml2js = require('xml2js');
    const builder = new xml2js.Builder();
    const nextDocumentXml = builder.buildObject(parsed.parsedRoot);
    zip.updateFile('word/document.xml', Buffer.from(nextDocumentXml, 'utf8'));
    const outputBuffer = zip.toBuffer();

    const verificationZip = new AdmZip(outputBuffer);
    const verificationEntry = verificationZip.getEntry('word/document.xml');
    if (!verificationEntry) throw new Error('DOCX integrity check failed: missing word/document.xml');
    return outputBuffer;
  }

  /**
   * Ensure a numbering definition exists in the DOCX for the requested list type.
   * Creates numbering.xml if it doesn't exist, adds abstractNum + num entries.
   * Returns the new numId on success, null on failure.
   */
  private async ensureNumberingDefinition(zip: AdmZip, listType: 'bulleted' | 'numbered'): Promise<string | null> {
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: true, preserveChildrenOrder: true });
    const builder = new xml2js.Builder();

    let numberingEntry = zip.getEntry('word/numbering.xml');
    let root: XmlNode;

    if (numberingEntry) {
      const xml = numberingEntry.getData().toString('utf8');
      if (xml.trim()) {
        root = (await parser.parseStringPromise(xml)) as XmlNode;
      } else {
        root = this.buildEmptyNumberingRoot();
      }
    } else {
      root = this.buildEmptyNumberingRoot();
    }

    const numbering = asArray(root['w:numbering'] as XmlNode | XmlNode[] | undefined)[0];
    if (!numbering) return null;

    // Find max abstractNumId and numId
    const abstractNums = asArray(numbering['w:abstractNum'] as XmlNode | XmlNode[] | undefined);
    const nums = asArray(numbering['w:num'] as XmlNode | XmlNode[] | undefined);
    let maxAbsId = 0;
    for (const abs of abstractNums) {
      const id = Number(readAttr(abs, 'w:abstractNumId', 'abstractNumId'));
      if (id > maxAbsId) maxAbsId = id;
    }
    let maxNumId = 0;
    for (const num of nums) {
      const id = Number(readAttr(num, 'w:numId', 'numId'));
      if (id > maxNumId) maxNumId = id;
    }

    const newAbsId = String(maxAbsId + 1);
    const newNumId = String(maxNumId + 1);

    const numFmt = listType === 'numbered' ? 'decimal' : 'bullet';
    const lvlText = listType === 'numbered' ? '%1.' : '\u2022';

    // Create abstractNum with 9 levels
    const levels: XmlNode[] = [];
    for (let i = 0; i < 9; i++) {
      const lvl: XmlNode = {
        $: { 'w:ilvl': String(i) },
        'w:start': [{ $: { 'w:val': '1' } }],
        'w:numFmt': [{ $: { 'w:val': i === 0 ? numFmt : (listType === 'numbered' ? 'lowerLetter' : 'bullet') } }],
        'w:lvlText': [{ $: { 'w:val': i === 0 ? lvlText : (listType === 'numbered' ? `%${i + 1}.` : '\u25E6') } }],
        'w:lvlJc': [{ $: { 'w:val': 'left' } }],
        'w:pPr': [{
          'w:ind': [{ $: { 'w:left': String(720 * (i + 1)), 'w:hanging': '360' } }],
        }],
      };
      if (listType === 'bulleted') {
        lvl['w:rPr'] = [{ 'w:rFonts': [{ $: { 'w:ascii': 'Symbol', 'w:hAnsi': 'Symbol', 'w:hint': 'default' } }] }];
      }
      levels.push(lvl);
    }

    const newAbstractNum: XmlNode = {
      $: { 'w:abstractNumId': newAbsId },
      'w:lvl': levels,
    };

    const newNum: XmlNode = {
      $: { 'w:numId': newNumId },
      'w:abstractNumId': [{ $: { 'w:val': newAbsId } }],
    };

    // Append to numbering
    if (!Array.isArray(numbering['w:abstractNum'])) numbering['w:abstractNum'] = abstractNums;
    (numbering['w:abstractNum'] as XmlNode[]).push(newAbstractNum);
    if (!Array.isArray(numbering['w:num'])) numbering['w:num'] = nums;
    (numbering['w:num'] as XmlNode[]).push(newNum);

    const numberingXml = builder.buildObject(root);
    if (numberingEntry) {
      zip.updateFile('word/numbering.xml', Buffer.from(numberingXml, 'utf8'));
    } else {
      zip.addFile('word/numbering.xml', Buffer.from(numberingXml, 'utf8'));
      // Also ensure numbering.xml is referenced in [Content_Types].xml
      this.ensureContentTypeForNumbering(zip);
    }

    return newNumId;
  }

  private buildEmptyNumberingRoot(): XmlNode {
    return {
      'w:numbering': [{
        $: {
          'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        },
        'w:abstractNum': [],
        'w:num': [],
      }],
    };
  }

  private ensureContentTypeForNumbering(zip: AdmZip): void {
    const ctEntry = zip.getEntry('[Content_Types].xml');
    if (!ctEntry) return;
    let ct = ctEntry.getData().toString('utf8');
    if (ct.includes('numbering.xml')) return;
    // Add Override before the closing Types tag
    const override = '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>';
    ct = ct.replace('</Types>', `${override}</Types>`);
    zip.updateFile('[Content_Types].xml', Buffer.from(ct, 'utf8'));
  }

  /**
   * Insert a new paragraph immediately after the target paragraphId.
   * This is a minimal-safe insertion that preserves the target paragraph's pPr when available.
   */
  async insertParagraphAfter(
    buffer: Buffer,
    paragraphId: string,
    newText: string,
    opts?: (DocxContentOpts & { removeNumbering?: boolean }),
  ): Promise<Buffer> {
    validateInput(paragraphId, newText, opts);

    const anchors = await this.anchorsService.extractParagraphNodes(buffer);
    const targetAnchor = anchors.find(anchor => anchor.paragraphId === paragraphId);
    if (!targetAnchor) {
      throw new Error(`Paragraph target not found: ${paragraphId}`);
    }

    const zip = new AdmZip(buffer);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    const documentXml = documentEntry.getData().toString('utf8');
    const parsed = await parseDocumentXml(documentXml);

    const xmlIndex = findParagraphXmlIndex(targetAnchor, parsed.paragraphs);
    if (xmlIndex < 0) {
      throw new Error(`Unable to map paragraphId to XML paragraph: ${paragraphId}`);
    }

    const targetParagraph = parsed.paragraphs[xmlIndex];
    const targetPPrRaw = asArray(targetParagraph['w:pPr'] as XmlNode | XmlNode[] | undefined)[0];
    // When inserting after a list/bullet paragraph, callers often want a normal paragraph
    // (not another list item). Best-effort: remove numbering props from the cloned pPr.
    const targetPPr = (() => {
      if (!targetPPrRaw) return undefined;
      if (!opts?.removeNumbering) return targetPPrRaw;
      try {
        const clone: any = JSON.parse(JSON.stringify(targetPPrRaw));
        delete clone['w:numPr'];
        return clone as any;
      } catch {
        return targetPPrRaw;
      }
    })();
    const targetRuns = asArray(targetParagraph['w:r'] as XmlNode | XmlNode[] | undefined);
    const firstRunProps = targetRuns[0]
      ? asArray(targetRuns[0]['w:rPr'] as XmlNode | XmlNode[] | undefined)[0]
      : undefined;

    const afterText = normalizeWhitespace(opts?.format === "html" ? richHtmlToPlainText(newText) : newText);
    const replacementRuns =
      opts?.format === "html" ? buildRunsFromRichHtml(newText, firstRunProps) : [buildReplacementRun(afterText, firstRunProps)];
    const newParagraph: XmlNode = {
      ...(targetPPr ? { 'w:pPr': [targetPPr] } : {}),
      'w:r': replacementRuns,
    };

    // Insert into the body paragraph array.
    parsed.paragraphs.splice(xmlIndex + 1, 0, newParagraph);
    // Ensure the body node sees the updated paragraph list.
    parsed.body['w:p'] = parsed.paragraphs;

    const xml2js = require('xml2js');
    const builder = new xml2js.Builder();
    const nextDocumentXml = builder.buildObject(parsed.parsedRoot);

    zip.updateFile('word/document.xml', Buffer.from(nextDocumentXml, 'utf8'));
    const outputBuffer = zip.toBuffer();

    // Integrity check
    const verificationZip = new AdmZip(outputBuffer);
    const verificationEntry = verificationZip.getEntry('word/document.xml');
    if (!verificationEntry) {
      throw new Error('DOCX integrity check failed after insert: missing word/document.xml');
    }

    return outputBuffer;
  }
}
