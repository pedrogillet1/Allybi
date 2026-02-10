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

async function parseParagraphSnapshots(buffer: Buffer): Promise<ParagraphSnapshot[]> {
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

  return paragraphs.map((paragraph, index) => {
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
}

export class DocxAnchorsService {
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
}
