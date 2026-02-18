import * as crypto from 'crypto';

export interface ParagraphNode {
  paragraphId: string;
  sectionPath: string[];
  indexInSection: number;
  /** Document-order paragraph index (0-based). Useful for title/first-paragraph heuristics. */
  docIndex: number;
  text: string;
  styleFingerprint: string;
  // Viewer hints (best-effort, may be empty).
  styleName?: string;
  headingLevel?: number | null;
  numberingSignature?: string;
  alignment?: string;
}

export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  hyperlink?: string;
  fontSize?: string;
  color?: string;
  fontFamily?: string;
}

export interface RichParagraphNode extends ParagraphNode {
  runs: RichRun[];
}

interface ParagraphSnapshot {
  index: number;
  text: string;
  styleName: string;
  headingLevel: number | null;
  runSignature: string;
  numberingSignature: string;
  alignment: string;
}

interface XmlNode {
  [key: string]: unknown;
}

const ROOT_SECTION = 'Document';
const MAX_PARAGRAPHS = 100_000;
const MAX_ID_TEXT_CHARS = 160;
const HEADING_STYLE_REGEX = /(?:heading|título|title)[\s_-]?(\d+)/i;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeForHash(text: string): string {
  return normalizeWhitespace(text).toLowerCase().slice(0, MAX_ID_TEXT_CHARS);
}

function detectHeadingLevel(styleName: string, paragraphProps: XmlNode | undefined): number | null {
  const styleMatch = HEADING_STYLE_REGEX.exec(styleName);
  if (styleMatch) {
    const parsed = Number(styleMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 9) {
      return parsed;
    }
  }

  if (paragraphProps) {
    const outlineLvl = asArray(paragraphProps['w:outlineLvl'] as XmlNode | XmlNode[] | undefined)[0];
    const attrs = (outlineLvl?.$ as Record<string, unknown> | undefined) ?? {};
    const raw = attrs['w:val'] ?? attrs['val'];
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 8) {
      return numeric + 1;
    }
  }

  return null;
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

function readParagraphText(paragraph: XmlNode): string {
  const chunks: string[] = [];

  const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
  for (const run of runs) {
    chunks.push(readRunText(run));
  }

  const hyperlinks = asArray(paragraph['w:hyperlink'] as XmlNode | XmlNode[] | undefined);
  for (const hyperlink of hyperlinks) {
    const linkRuns = asArray(hyperlink['w:r'] as XmlNode | XmlNode[] | undefined);
    for (const run of linkRuns) {
      chunks.push(readRunText(run));
    }
  }

  const insertions = asArray(paragraph['w:ins'] as XmlNode | XmlNode[] | undefined);
  for (const insertion of insertions) {
    const insRuns = asArray(insertion['w:r'] as XmlNode | XmlNode[] | undefined);
    for (const run of insRuns) {
      chunks.push(readRunText(run));
    }
  }

  return chunks.join('').replace(/\r/g, '');
}

function paragraphStyleName(paragraphProps: XmlNode | undefined): string {
  if (!paragraphProps) return '';
  const pStyle = asArray(paragraphProps['w:pStyle'] as XmlNode | XmlNode[] | undefined)[0];
  if (!pStyle) return '';
  const attrs = (pStyle.$ as Record<string, unknown> | undefined) ?? {};
  const raw = attrs['w:val'] ?? attrs['val'];
  return typeof raw === 'string' ? raw : '';
}

function paragraphAlignment(paragraphProps: XmlNode | undefined): string {
  if (!paragraphProps) return '';
  const jc = asArray(paragraphProps['w:jc'] as XmlNode | XmlNode[] | undefined)[0];
  if (!jc) return '';
  const attrs = (jc.$ as Record<string, unknown> | undefined) ?? {};
  const raw = attrs['w:val'] ?? attrs['val'];
  return typeof raw === 'string' ? raw : '';
}

function numberingSignature(paragraphProps: XmlNode | undefined): string {
  if (!paragraphProps) return '';
  const numPr = asArray(paragraphProps['w:numPr'] as XmlNode | XmlNode[] | undefined)[0];
  if (!numPr) return '';

  const ilvl = asArray(numPr['w:ilvl'] as XmlNode | XmlNode[] | undefined)[0];
  const numId = asArray(numPr['w:numId'] as XmlNode | XmlNode[] | undefined)[0];

  const ilvlVal = ((ilvl?.$ as Record<string, unknown> | undefined)?.['w:val'] ??
    (ilvl?.$ as Record<string, unknown> | undefined)?.['val'] ??
    '') as string | number;
  const numIdVal = ((numId?.$ as Record<string, unknown> | undefined)?.['w:val'] ??
    (numId?.$ as Record<string, unknown> | undefined)?.['val'] ??
    '') as string | number;

  return `${String(ilvlVal)}:${String(numIdVal)}`;
}

function runSignature(paragraph: XmlNode): string {
  const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
  if (runs.length === 0) return 'no-runs';

  const signatures: string[] = [];
  for (const run of runs) {
    const rPr = asArray(run['w:rPr'] as XmlNode | XmlNode[] | undefined)[0];
    if (!rPr) {
      signatures.push('plain');
      continue;
    }

    const markers = [
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

    signatures.push(`${markers || 'plain'}:${sizeRaw ?? ''}`);
  }

  return signatures.join('|');
}

function styleFingerprint(snapshot: ParagraphSnapshot): string {
  const payload = [
    snapshot.styleName,
    snapshot.runSignature,
    snapshot.numberingSignature,
    snapshot.alignment,
  ].join('::');

  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function paragraphId(snapshot: ParagraphSnapshot, sectionPath: string[], indexInSection: number): string {
  const payload = JSON.stringify({
    sectionPath,
    indexInSection,
    paragraphIndex: snapshot.index,
    styleName: snapshot.styleName,
    text: normalizeForHash(snapshot.text),
  });

  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 20);
  return `docx:p:${digest}`;
}

function extractRunFormatting(run: XmlNode): { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; fontSize?: string; color?: string; fontFamily?: string } {
  const rPr = asArray(run['w:rPr'] as XmlNode | XmlNode[] | undefined)[0];
  if (!rPr) return {};
  const result: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; fontSize?: string; color?: string; fontFamily?: string } = {};
  if (rPr['w:b']) result.bold = true;
  if (rPr['w:i']) result.italic = true;
  if (rPr['w:u']) result.underline = true;
  if (rPr['w:strike']) result.strikethrough = true;

  // Font size: w:sz value is in half-points (e.g. 24 = 12pt)
  const szNode = asArray(rPr['w:sz'] as XmlNode | XmlNode[] | undefined)[0];
  if (szNode) {
    const szAttrs = (szNode.$ as Record<string, unknown> | undefined) ?? {};
    const halfPts = Number(szAttrs['w:val'] ?? '');
    if (Number.isFinite(halfPts) && halfPts > 0) result.fontSize = `${halfPts / 2}pt`;
  }

  // Text color: w:color
  const colorNode = asArray(rPr['w:color'] as XmlNode | XmlNode[] | undefined)[0];
  if (colorNode) {
    const colorAttrs = (colorNode.$ as Record<string, unknown> | undefined) ?? {};
    const val = String(colorAttrs['w:val'] ?? '').trim();
    if (val && val !== 'auto' && /^[0-9a-fA-F]{6}$/.test(val)) result.color = val;
  }

  // Font family: w:rFonts
  const fontsNode = asArray(rPr['w:rFonts'] as XmlNode | XmlNode[] | undefined)[0];
  if (fontsNode) {
    const fontAttrs = (fontsNode.$ as Record<string, unknown> | undefined) ?? {};
    const ascii = String(fontAttrs['w:ascii'] ?? fontAttrs['w:hAnsi'] ?? '').trim();
    if (ascii) result.fontFamily = ascii;
  }

  return result;
}

function extractRichRunsFromParagraph(paragraph: XmlNode, relsMap: Map<string, string>): RichRun[] {
  const richRuns: RichRun[] = [];

  const runs = asArray(paragraph['w:r'] as XmlNode | XmlNode[] | undefined);
  for (const run of runs) {
    const text = readRunText(run);
    if (!text) continue;
    const fmt = extractRunFormatting(run);
    richRuns.push({ text, ...fmt });
  }

  const hyperlinks = asArray(paragraph['w:hyperlink'] as XmlNode | XmlNode[] | undefined);
  for (const hyperlink of hyperlinks) {
    const attrs = (hyperlink.$ as Record<string, unknown> | undefined) ?? {};
    const rId = (attrs['r:id'] ?? attrs['id'] ?? '') as string;
    const url = rId ? (relsMap.get(rId) || '') : '';

    const linkRuns = asArray(hyperlink['w:r'] as XmlNode | XmlNode[] | undefined);
    for (const run of linkRuns) {
      const text = readRunText(run);
      if (!text) continue;
      const fmt = extractRunFormatting(run);
      richRuns.push({ text, ...fmt, ...(url ? { hyperlink: url } : {}) });
    }
  }

  const insertions = asArray(paragraph['w:ins'] as XmlNode | XmlNode[] | undefined);
  for (const insertion of insertions) {
    const insRuns = asArray(insertion['w:r'] as XmlNode | XmlNode[] | undefined);
    for (const run of insRuns) {
      const text = readRunText(run);
      if (!text) continue;
      const fmt = extractRunFormatting(run);
      richRuns.push({ text, ...fmt });
    }
  }

  return richRuns;
}

interface ParsedDocxData {
  snapshots: ParagraphSnapshot[];
  paragraphs: XmlNode[];
  relsMap: Map<string, string>;
}

async function parseDocxBuffer(buffer: Buffer): Promise<ParsedDocxData> {
  const AdmZip = require('adm-zip');
  const xml2js = require('xml2js');

  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error('Invalid DOCX: missing word/document.xml');
  const xml = entry.getData().toString('utf8');
  const parser = new xml2js.Parser({ explicitArray: true, preserveChildrenOrder: true });
  const parsed = (await parser.parseStringPromise(xml)) as XmlNode;

  const documentNode = asArray(parsed['w:document'] as XmlNode | XmlNode[] | undefined)[0];
  const bodyNode = asArray(documentNode?.['w:body'] as XmlNode | XmlNode[] | undefined)[0];
  const paragraphs = asArray(bodyNode?.['w:p'] as XmlNode | XmlNode[] | undefined);

  if (paragraphs.length > MAX_PARAGRAPHS) {
    throw new Error(`DOCX paragraph limit exceeded: ${paragraphs.length}`);
  }

  // Parse document.xml.rels for hyperlink targets
  const relsMap = new Map<string, string>();
  const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
  if (relsEntry) {
    const relsXml = relsEntry.getData().toString('utf8');
    const relsParsed = (await parser.parseStringPromise(relsXml)) as XmlNode;
    const relationships = asArray(
      (relsParsed?.['Relationships'] as XmlNode)?.[
        'Relationship'
      ] as XmlNode | XmlNode[] | undefined
    );
    for (const rel of relationships) {
      const attrs = (rel.$ as Record<string, unknown> | undefined) ?? {};
      const id = String(attrs['Id'] || '');
      const target = String(attrs['Target'] || '');
      const type = String(attrs['Type'] || '');
      if (id && target && type.includes('hyperlink')) {
        relsMap.set(id, target);
      }
    }
  }

  const snapshots = paragraphs.map((paragraph, index) => {
    const text = normalizeWhitespace(readParagraphText(paragraph));
    const paragraphProps = asArray(paragraph['w:pPr'] as XmlNode | XmlNode[] | undefined)[0];
    const styleName = paragraphStyleName(paragraphProps);

    return {
      index,
      text,
      styleName,
      headingLevel: detectHeadingLevel(styleName, paragraphProps),
      runSignature: runSignature(paragraph),
      numberingSignature: numberingSignature(paragraphProps),
      alignment: paragraphAlignment(paragraphProps),
    };
  });

  return { snapshots, paragraphs, relsMap };
}

async function parseParagraphSnapshots(buffer: Buffer): Promise<ParagraphSnapshot[]> {
  const { snapshots } = await parseDocxBuffer(buffer);
  return snapshots;
}

export class DocxAnchorsService {
  /**
   * Return all paragraphs that have a heading style (headingLevel >= 1).
   */
  async getHeadingParagraphs(buffer: Buffer): Promise<ParagraphNode[]> {
    const all = await this.extractParagraphNodes(buffer);
    return all.filter(n => n.headingLevel != null && n.headingLevel >= 1);
  }

  /**
   * Return all paragraphs "under" a heading, i.e. from the heading's next sibling
   * until the next same-or-higher-level heading (exclusive).
   * Includes the heading paragraph itself.
   */
  async getSectionParagraphs(buffer: Buffer, headingParagraphId: string): Promise<ParagraphNode[]> {
    const all = await this.extractParagraphNodes(buffer);
    const headingIdx = all.findIndex(n => n.paragraphId === headingParagraphId);
    if (headingIdx < 0) return [];
    const heading = all[headingIdx];
    if (!heading.headingLevel) return [heading];

    const result: ParagraphNode[] = [heading];
    for (let i = headingIdx + 1; i < all.length; i++) {
      const node = all[i];
      if (node.headingLevel != null && node.headingLevel <= heading.headingLevel!) break;
      result.push(node);
    }
    return result;
  }

  /**
   * Return all paragraphs that are list items (have a numberingSignature).
   */
  async getListItemParagraphs(buffer: Buffer): Promise<ParagraphNode[]> {
    const all = await this.extractParagraphNodes(buffer);
    return all.filter(n => n.numberingSignature && n.numberingSignature !== '');
  }

  async extractParagraphNodes(buffer: Buffer): Promise<ParagraphNode[]> {
    const snapshots = await parseParagraphSnapshots(buffer);
    const nodes: ParagraphNode[] = [];

    const headingStack: string[] = [];
    const sectionCounters = new Map<string, number>();

    for (const snapshot of snapshots) {
      if (!snapshot.text) continue;

      if (snapshot.headingLevel !== null) {
        const keepCount = Math.max(snapshot.headingLevel - 1, 0);
        headingStack.splice(keepCount);
        headingStack.push(snapshot.text);
      }

      const sectionPath = headingStack.length > 0 ? [...headingStack] : [ROOT_SECTION];
      const key = sectionPath.join(' > ');
      const indexInSection = sectionCounters.get(key) ?? 0;
      sectionCounters.set(key, indexInSection + 1);

      nodes.push({
        paragraphId: paragraphId(snapshot, sectionPath, indexInSection),
        sectionPath,
        indexInSection,
        docIndex: snapshot.index,
        text: snapshot.text,
        styleFingerprint: styleFingerprint(snapshot),
        styleName: snapshot.styleName || undefined,
        headingLevel: snapshot.headingLevel,
        numberingSignature: snapshot.numberingSignature || undefined,
        alignment: snapshot.alignment || undefined,
      });
    }

    return nodes;
  }

  async extractRichParagraphNodes(buffer: Buffer): Promise<RichParagraphNode[]> {
    const { snapshots, paragraphs, relsMap } = await parseDocxBuffer(buffer);
    const nodes: RichParagraphNode[] = [];

    const headingStack: string[] = [];
    const sectionCounters = new Map<string, number>();

    for (const snapshot of snapshots) {
      if (!snapshot.text) continue;

      if (snapshot.headingLevel !== null) {
        const keepCount = Math.max(snapshot.headingLevel - 1, 0);
        headingStack.splice(keepCount);
        headingStack.push(snapshot.text);
      }

      const sectionPath = headingStack.length > 0 ? [...headingStack] : [ROOT_SECTION];
      const key = sectionPath.join(' > ');
      const indexInSection = sectionCounters.get(key) ?? 0;
      sectionCounters.set(key, indexInSection + 1);

      const xmlParagraph = paragraphs[snapshot.index];
      const runs = xmlParagraph ? extractRichRunsFromParagraph(xmlParagraph, relsMap) : [];

      nodes.push({
        paragraphId: paragraphId(snapshot, sectionPath, indexInSection),
        sectionPath,
        indexInSection,
        docIndex: snapshot.index,
        text: snapshot.text,
        styleFingerprint: styleFingerprint(snapshot),
        styleName: snapshot.styleName || undefined,
        headingLevel: snapshot.headingLevel,
        numberingSignature: snapshot.numberingSignature || undefined,
        alignment: snapshot.alignment || undefined,
        runs,
      });
    }

    return nodes;
  }

  /**
   * Parse word/numbering.xml to build a map: numId → { ilvl → numFmt }.
   * Used to distinguish bullet vs decimal lists in toMarkdown().
   */
  async extractNumberingFormats(buffer: Buffer): Promise<Map<string, Map<string, string>>> {
    const AdmZip = require('adm-zip');
    const xml2js = require('xml2js');

    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('word/numbering.xml');
    if (!entry) return new Map();

    const xml = entry.getData().toString('utf8');
    const parser = new xml2js.Parser({ explicitArray: true, preserveChildrenOrder: true });
    const parsed = (await parser.parseStringPromise(xml)) as XmlNode;

    const numberingNode = asArray(parsed['w:numbering'] as XmlNode | XmlNode[] | undefined)[0];
    if (!numberingNode) return new Map();

    // Build abstractNum map: abstractNumId → { ilvl → numFmt }
    const abstractMap = new Map<string, Map<string, string>>();
    const abstractNums = asArray(numberingNode['w:abstractNum'] as XmlNode | XmlNode[] | undefined);
    for (const abs of abstractNums) {
      const absAttrs = (abs.$ as Record<string, unknown> | undefined) ?? {};
      const absId = String(absAttrs['w:abstractNumId'] ?? '');
      if (!absId) continue;

      const lvlMap = new Map<string, string>();
      const lvls = asArray(abs['w:lvl'] as XmlNode | XmlNode[] | undefined);
      for (const lvl of lvls) {
        const lvlAttrs = (lvl.$ as Record<string, unknown> | undefined) ?? {};
        const ilvl = String(lvlAttrs['w:ilvl'] ?? '');
        const numFmtNode = asArray(lvl['w:numFmt'] as XmlNode | XmlNode[] | undefined)[0];
        const fmtAttrs = (numFmtNode?.$ as Record<string, unknown> | undefined) ?? {};
        const numFmt = String(fmtAttrs['w:val'] ?? fmtAttrs['val'] ?? '');
        if (ilvl && numFmt) lvlMap.set(ilvl, numFmt);
      }
      abstractMap.set(absId, lvlMap);
    }

    // Build numId → abstractNumId mapping, then resolve to numId → { ilvl → numFmt }
    const result = new Map<string, Map<string, string>>();
    const nums = asArray(numberingNode['w:num'] as XmlNode | XmlNode[] | undefined);
    for (const num of nums) {
      const numAttrs = (num.$ as Record<string, unknown> | undefined) ?? {};
      const numId = String(numAttrs['w:numId'] ?? '');
      const absRef = asArray(num['w:abstractNumId'] as XmlNode | XmlNode[] | undefined)[0];
      const absRefAttrs = (absRef?.$ as Record<string, unknown> | undefined) ?? {};
      const absId = String(absRefAttrs['w:val'] ?? absRefAttrs['val'] ?? '');
      if (numId && absId && abstractMap.has(absId)) {
        result.set(numId, abstractMap.get(absId)!);
      }
    }

    return result;
  }
}
