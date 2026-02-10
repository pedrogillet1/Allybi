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
type DocxContentOpts = { format?: DocxContentFormat };

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
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSizeHalfPoints: number | null;
  colorHex: string | null; // #RRGGBB
  fontFamily: string | null; // CSS family name
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
    bold: false,
    italic: false,
    underline: false,
    fontSizeHalfPoints: null,
    colorHex: null,
    fontFamily: null,
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
    style.bold ||
    style.italic ||
    style.underline ||
    Boolean(style.fontSizeHalfPoints) ||
    Boolean(style.colorHex) ||
    Boolean(style.fontFamily);
  if (!base && !hasStyle) return undefined;

  const rPr: XmlNode = base ? deepClone(base) : {};

  // Ensure the rich-text payload controls these core style flags, even if the
  // original paragraph's first run was styled.
  delete rPr["w:b"];
  delete rPr["w:i"];
  delete rPr["w:u"];
  delete rPr["w:sz"];
  delete rPr["w:szCs"];
  delete rPr["w:color"];
  delete rPr["w:rFonts"];

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
  const runs: XmlNode[] = [];
  let lastWasBreak = false;

  for (const token of tokens) {
    if (token.kind === "br") {
      if (!runs.length) continue;
      if (lastWasBreak) continue;
      runs.push(buildBreakRun(preservedRunProps, {
        bold: false,
        italic: false,
        underline: false,
        fontSizeHalfPoints: null,
        colorHex: null,
        fontFamily: null,
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

    if (normalizeWhitespace(beforeText) === afterPlainText) {
      return buffer;
    }

    const styleName = getParagraphStyleName(paragraph);
    const { formatLossRisk, removedHyperlinks } =
      opts?.format === "html"
        ? (() => {
            const runs = asArray(paragraph["w:r"] as XmlNode | XmlNode[] | undefined);
            const firstRun = runs[0];
            const firstRunProps = firstRun ? asArray(firstRun["w:rPr"] as XmlNode | XmlNode[] | undefined)[0] : undefined;
            paragraph["w:r"] = buildRunsFromRichHtml(newText, firstRunProps);
            const hadLinks = Boolean(paragraph["w:hyperlink"]);
            if (paragraph["w:hyperlink"]) delete paragraph["w:hyperlink"];
            if (paragraph["w:ins"]) delete paragraph["w:ins"];
            return { formatLossRisk: paragraphHasMixedRichRuns(paragraph), removedHyperlinks: hadLinks };
          })()
        : applyTextToParagraph(paragraph, newText);

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
   * Insert a new paragraph immediately after the target paragraphId.
   * This is a minimal-safe insertion that preserves the target paragraph's pPr when available.
   */
  async insertParagraphAfter(buffer: Buffer, paragraphId: string, newText: string, opts?: DocxContentOpts): Promise<Buffer> {
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
    const targetPPr = asArray(targetParagraph['w:pPr'] as XmlNode | XmlNode[] | undefined)[0];
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
