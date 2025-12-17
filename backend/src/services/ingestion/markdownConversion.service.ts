/**
 * Markdown Conversion Service
 * Converts all document types (PDF, DOCX, XLSX, PPTX) to markdown format
 * with structure preservation for deep linking
 */

import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
// pdf-parse v2 will be required when needed
// Note: Storage operations handled by S3 via storage.ts

interface MarkdownConversionResult {
  markdownContent: string;
  structure: DocumentStructure;
  images: string[]; // URLs of extracted images
  document_metadata: {
    pageCount?: number;
    sheetCount?: number;
    slideCount?: number;
    wordCount?: number;
  };
}

interface DocumentStructure {
  headings: Heading[];
  sections: Section[];
  toc: TOCItem[];
}

interface Heading {
  level: number;
  text: string;
  lineNumber: number;
  sectionId: string;
}

interface Section {
  heading: string;
  level: number;
  sectionId: string;
  startLine: number;
  endLine: number;
  content: string[];
}

interface TOCItem {
  text: string;
  level: number;
  sectionId: string;
  lineNumber: number;
}

class MarkdownConversionService {
  constructor() {
    // Storage is now handled by S3 via storage.ts
  }

  /**
   * Main conversion function - routes to appropriate converter
   */
  async convertToMarkdown(
    buffer: Buffer,
    mimeType: string,
    filename: string,
    documentId: string
  ): Promise<MarkdownConversionResult> {
    console.log(`🔄 Converting ${filename} to markdown (${mimeType})`);

    switch (mimeType) {
      case 'application/pdf':
        return await this.pdfToMarkdown(buffer, documentId);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return await this.docxToMarkdown(buffer, documentId);

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        return await this.excelToMarkdown(buffer, documentId);

      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      case 'application/vnd.ms-powerpoint':
        return await this.pptxToMarkdown(buffer, documentId);

      case 'text/plain':
        return await this.textToMarkdown(buffer);

      default:
        throw new Error(`Unsupported document type: ${mimeType}`);
    }
  }

  /**
   * Convert PDF to Markdown
   */
  private async pdfToMarkdown(
    buffer: Buffer,
    documentId: string
  ): Promise<MarkdownConversionResult> {
    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      const markdownParts: string[] = [];
      const images: string[] = [];

      if (!data.text || data.text.trim().length === 0) {
        markdownParts.push('<!-- Scanned PDF - OCR required -->\n');
        markdownParts.push('[This appears to be a scanned PDF. OCR processing is needed.]\n');
      } else {
        // Add document header
        markdownParts.push('# Document Content\n\n');

        // Split text by pages (if available) or by paragraphs
        const pageCount = data.numpages || 1;
        const textPerPage = Math.ceil(data.text.length / pageCount);

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          // Add page marker (for deep linking)
          markdownParts.push(`<!-- PAGE ${pageNum} -->\n\n`);

          // Extract text for this page (estimate)
          const startIdx = (pageNum - 1) * textPerPage;
          const endIdx = Math.min(pageNum * textPerPage, data.text.length);
          const pageText = data.text.substring(startIdx, endIdx);

          // Split into paragraphs and add to markdown
          const paragraphs = pageText.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
          paragraphs.forEach((paragraph: string) => {
            markdownParts.push(`${paragraph.trim()}\n\n`);
          });

          // Add page break
          if (pageNum < pageCount) {
            markdownParts.push('\n---\n\n');
          }
        }
      }

      const markdownContent = markdownParts.join('');
      const structure = this.parseMarkdownStructure(markdownContent);

      return {
        markdownContent,
        structure,
        images,
        document_metadata: {
          pageCount: data.numpages || 1,
          wordCount: data.text ? data.text.split(/\s+/).length : 0,
        },
      };
    } catch (error) {
      console.error('Error converting PDF to markdown:', error);
      throw error;
    }
  }

  /**
   * Convert DOCX to Markdown
   */
  private async docxToMarkdown(
    buffer: Buffer,
    documentId: string
  ): Promise<MarkdownConversionResult> {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      // Convert HTML to markdown (basic conversion)
      let markdownContent = result.value;
      markdownContent = markdownContent.replace(/<h([1-6])>(.*?)<\/h\1>/g, (_, level, text) => `${'#'.repeat(parseInt(level))} ${text}\n\n`);
      markdownContent = markdownContent.replace(/<p>(.*?)<\/p>/g, '$1\n\n');
      markdownContent = markdownContent.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
      markdownContent = markdownContent.replace(/<em>(.*?)<\/em>/g, '*$1*');
      markdownContent = markdownContent.replace(/<[^>]*>/g, ''); // Remove remaining HTML tags
      const images: string[] = [];

      // Clean up the markdown
      markdownContent = markdownContent
        .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
        .trim();

      const structure = this.parseMarkdownStructure(markdownContent);

      return {
        markdownContent,
        structure,
        images,
        document_metadata: {
          wordCount: markdownContent.split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error('Error converting DOCX to markdown:', error);
      throw error;
    }
  }

  /**
   * Convert Excel to Markdown
   */
  private async excelToMarkdown(
    buffer: Buffer,
    documentId: string
  ): Promise<MarkdownConversionResult> {
    try {
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellFormula: true,
        cellDates: true,
      });

      const markdownParts: string[] = [];
      markdownParts.push('# Excel Workbook\n\n');

      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const sheet = workbook.Sheets[sheetName];

        // Add sheet heading
        markdownParts.push(`## Sheet ${sheetIndex + 1}: ${sheetName}\n\n`);

        // Add sheet marker (for deep linking)
        markdownParts.push(`<!-- SHEET ${sheetIndex + 1} -->\n\n`);

        // Convert to JSON to get cell data
        const jsonData = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          blankrows: false,
          raw: false,
        });

        if (jsonData && jsonData.length > 0) {
          const rows = jsonData as any[][];

          // Create markdown table
          if (rows.length > 0) {
            // Header row
            const headerRow = rows[0].map((cell: any) =>
              String(cell || '').replace(/\|/g, '\\|')
            );
            markdownParts.push('| ' + headerRow.join(' | ') + ' |\n');

            // Separator row
            markdownParts.push('| ' + headerRow.map(() => '---').join(' | ') + ' |\n');

            // Data rows
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i].map((cell: any) =>
                String(cell || '').replace(/\|/g, '\\|')
              );
              // Pad row to match header length
              while (row.length < headerRow.length) {
                row.push('');
              }
              markdownParts.push('| ' + row.join(' | ') + ' |\n');
            }
          }
        } else {
          markdownParts.push('*Empty sheet*\n');
        }

        markdownParts.push('\n---\n\n');
      });

      const markdownContent = markdownParts.join('');
      const structure = this.parseMarkdownStructure(markdownContent);

      return {
        markdownContent,
        structure,
        images: [],
        document_metadata: {
          sheetCount: workbook.SheetNames.length,
          wordCount: markdownContent.split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error('Error converting Excel to markdown:', error);
      throw error;
    }
  }

  /**
   * Convert PowerPoint to Markdown
   */
  private async pptxToMarkdown(
    buffer: Buffer,
    documentId: string
  ): Promise<MarkdownConversionResult> {
    try {
      // Note: Full PPTX parsing requires additional libraries like `pptx-parser` or `officegen`
      // For now, create a basic structure with placeholders

      const markdownParts: string[] = [];
      markdownParts.push('# PowerPoint Presentation\n\n');
      markdownParts.push('<!-- SLIDE 1 -->\n\n');
      markdownParts.push('## Slide 1: Title Slide\n\n');
      markdownParts.push('[PowerPoint content - Full PPTX parsing to be implemented]\n\n');
      markdownParts.push('---\n\n');

      const markdownContent = markdownParts.join('');
      const structure = this.parseMarkdownStructure(markdownContent);

      return {
        markdownContent,
        structure,
        images: [],
        document_metadata: {
          slideCount: 1,
          wordCount: markdownContent.split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error('Error converting PPTX to markdown:', error);
      throw error;
    }
  }

  /**
   * Convert plain text to Markdown
   */
  private async textToMarkdown(buffer: Buffer): Promise<MarkdownConversionResult> {
    const text = buffer.toString('utf-8');

    // Wrap plain text in markdown
    const markdownContent = `# Document Content\n\n${text}`;
    const structure = this.parseMarkdownStructure(markdownContent);

    return {
      markdownContent,
      structure,
      images: [],
      document_metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  }

  /**
   * Parse markdown structure for navigation and deep linking
   */
  private parseMarkdownStructure(markdownContent: string): DocumentStructure {
    const lines = markdownContent.split('\n');
    const headings: Heading[] = [];
    const sections: Section[] = [];
    let currentSection = null as Section | null;

    lines.forEach((line, lineNum) => {
      // Check if line is a heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const sectionId = this.createSectionId(text, lineNum + 1);

        // Save heading
        headings.push({
          level,
          text,
          lineNumber: lineNum + 1,
          sectionId,
        });

        // Save previous section
        if (currentSection) {
          currentSection.endLine = lineNum;
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          heading: text,
          level,
          sectionId,
          startLine: lineNum + 1,
          endLine: lines.length,
          content: [],
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    });

    // Save last section
    if (currentSection !== null) {
      currentSection.endLine = lines.length;
      sections.push(currentSection);
    }

    // Generate table of contents
    const toc: TOCItem[] = headings.map(h => ({
      text: h.text,
      level: h.level,
      sectionId: h.sectionId,
      lineNumber: h.lineNumber,
    }));

    return {
      headings,
      sections,
      toc,
    };
  }

  /**
   * Create unique section ID for deep linking
   */
  private createSectionId(text: string, lineNum: number): string {
    // Convert to lowercase, replace spaces with hyphens
    let sectionId = text.toLowerCase();
    sectionId = sectionId.replace(/[^\w\s-]/g, ''); // Remove special chars
    sectionId = sectionId.replace(/[\s_]+/g, '-'); // Replace spaces with hyphens
    sectionId = sectionId.substring(0, 50); // Limit length

    // Add line number to ensure uniqueness
    return `${sectionId}-line-${lineNum}`;
  }

  /**
   * Create chunks with position information for deep linking
   */
  createChunksWithPositions(
    markdownContent: string,
    structure: DocumentStructure,
    chunkSize: number = 500
  ): Array<{
    chunkText: string;
    chunkIndex: number;
    startLine: number;
    endLine: number;
    sectionId: string;
    heading: string;
    headingLevel: number;
  }> {
    const lines = markdownContent.split('\n');
    const chunks: any[] = [];
    let chunkIndex = 0;

    structure.sections.forEach(section => {
      const sectionLines = lines.slice(section.startLine - 1, section.endLine);
      const sectionText = sectionLines.join('\n');

      // Split section into chunks
      const words = sectionText.split(/\s+/);
      let currentChunk: string[] = [];
      let currentLine = section.startLine;

      words.forEach(word => {
        currentChunk.push(word);

        if (currentChunk.join(' ').length >= chunkSize) {
          // Save chunk
          const chunkText = currentChunk.join(' ');
          const chunkLineCount = chunkText.split('\n').length;

          chunks.push({
            chunkText,
            chunkIndex,
            startLine: currentLine,
            endLine: currentLine + chunkLineCount,
            sectionId: section.sectionId,
            heading: section.heading,
            headingLevel: section.level,
          });

          chunkIndex++;
          currentLine += chunkLineCount;
          currentChunk = [];
        }
      });

      // Save remaining chunk
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join(' ');
        const chunkLineCount = chunkText.split('\n').length;

        chunks.push({
          chunkText,
          chunkIndex,
          startLine: currentLine,
          endLine: currentLine + chunkLineCount,
          sectionId: section.sectionId,
          heading: section.heading,
          headingLevel: section.level,
        });

        chunkIndex++;
      }
    });

    return chunks;
  }
}

export default new MarkdownConversionService();
