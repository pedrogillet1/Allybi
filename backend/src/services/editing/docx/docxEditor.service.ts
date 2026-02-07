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

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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

function validateInput(paragraphId: string, newText: string): void {
  if (!paragraphId.trim()) {
    throw new Error('paragraphId is required');
  }

  const normalized = normalizeWhitespace(newText);
  if (!normalized) {
    throw new Error('newText cannot be empty');
  }

  if (normalized.length > MAX_PARAGRAPH_TEXT_LENGTH) {
    throw new Error(`newText exceeds safe paragraph limit (${MAX_PARAGRAPH_TEXT_LENGTH})`);
  }
}

export class DocxEditorService {
  private readonly anchorsService = new DocxAnchorsService();

  async applyParagraphEdit(buffer: Buffer, paragraphId: string, newText: string): Promise<Buffer> {
    validateInput(paragraphId, newText);

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
    const afterText = normalizeWhitespace(newText);

    if (normalizeWhitespace(beforeText) === afterText) {
      return buffer;
    }

    const styleName = getParagraphStyleName(paragraph);
    const { formatLossRisk, removedHyperlinks } = applyTextToParagraph(paragraph, newText);

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
    if (!verificationXml.includes(afterText.slice(0, Math.min(afterText.length, 32)))) {
      logger.warn('[DocxEditor] Integrity check warning: edited text probe not found in XML preview', {
        paragraphId,
        probeLength: Math.min(afterText.length, 32),
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
}
