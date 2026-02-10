import * as XLSX from 'xlsx';

/**
 * Excel HTML Preview Service
 * Generates HTML table representation of Excel files for visual preview
 *
 * This is separate from excelProcessor.service.ts which handles RAG chunking.
 * This service focuses on visual fidelity for document preview.
 */

interface SheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
}

interface ExcelPreviewResult {
  htmlContent: string;
  sheetCount: number;
  sheets: SheetInfo[];
}

/**
 * Generate HTML preview from Excel buffer
 * Creates styled HTML tables for each sheet
 */
export async function generateExcelHtmlPreview(buffer: Buffer): Promise<ExcelPreviewResult> {
  try {
    console.log('[ExcelHtmlPreview] Generating HTML preview...');

    // Load workbook
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellStyles: true,
      cellDates: true,
      cellNF: true,
    });

    const sheetNames = workbook.SheetNames;
    const sheets: SheetInfo[] = [];
    const htmlParts: string[] = [];

    // Add CSS styles for the preview
    htmlParts.push(`
      <style>
        .excel-preview-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 13px;
        }
        .sheet-container {
          margin-bottom: 24px;
        }
        .sheet-container:last-child {
          margin-bottom: 0;
        }
        .excel-table {
          border-collapse: collapse;
          width: 100%;
          background: white;
          table-layout: auto;
        }
        .excel-table th,
        .excel-table td {
          border: 1px solid #d0d0d0;
          padding: 8px 12px;
          text-align: left;
          white-space: nowrap;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .excel-table th {
          background: #f5f5f5;
          font-weight: 600;
          color: #333;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .excel-table tr:nth-child(even) {
          background: #fafafa;
        }
        .excel-table tr:hover {
          background: #f0f7ff;
        }
        .excel-table td.number {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .excel-table td.date {
          white-space: nowrap;
        }
        .excel-table td.empty {
          color: #999;
          font-style: italic;
        }
        .row-header {
          background: #f9f9f9;
          color: #666;
          font-weight: 500;
          text-align: center;
          width: 40px;
          min-width: 40px;
        }
      </style>
    `);

    // Process each sheet
    for (let sheetIdx = 0; sheetIdx < sheetNames.length; sheetIdx++) {
      const sheetName = sheetNames[sheetIdx];
      const sheet = workbook.Sheets[sheetName];

      // Get range
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const rowCount = range.e.r - range.s.r + 1;
      const colCount = range.e.c - range.s.c + 1;

      sheets.push({
        name: sheetName,
        rowCount,
        colCount,
      });

      // Generate HTML for this sheet
      const sheetHtml = generateSheetHtml(sheet, sheetName, sheetIdx, range);
      htmlParts.push(sheetHtml);

      console.log(`  [ExcelHtmlPreview] Sheet "${sheetName}": ${rowCount} rows x ${colCount} cols`);
    }

    const fullHtml = `
      <div class="excel-preview-container">
        ${htmlParts.join('\n')}
      </div>
    `;

    console.log(`[ExcelHtmlPreview] Generated HTML for ${sheetNames.length} sheets`);

    return {
      htmlContent: fullHtml,
      sheetCount: sheetNames.length,
      sheets,
    };

  } catch (error: any) {
    console.error('[ExcelHtmlPreview] Error:', error);
    throw new Error(`Failed to generate Excel preview: ${error.message}`);
  }
}

/**
 * Generate HTML table for a single sheet
 */
function generateSheetHtml(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  sheetIndex: number,
  range: XLSX.Range
): string {
  const rows: string[] = [];

  // Limit preview to first 500 rows and 50 columns for performance
  const maxRows = Math.min(range.e.r - range.s.r + 1, 500);
  const maxCols = Math.min(range.e.c - range.s.c + 1, 50);

  // Generate header row (column letters)
  const headerCells: string[] = ['<th class="row-header">#</th>'];
  for (let col = 0; col < maxCols; col++) {
    const colLetter = XLSX.utils.encode_col(range.s.c + col);
    headerCells.push(`<th>${colLetter}</th>`);
  }
  rows.push(`<tr>${headerCells.join('')}</tr>`);

  // Generate data rows
  for (let rowOffset = 0; rowOffset < maxRows; rowOffset++) {
    const rowNum = range.s.r + rowOffset;
    const cells: string[] = [`<td class="row-header">${rowNum + 1}</td>`];

    for (let colOffset = 0; colOffset < maxCols; colOffset++) {
      const colNum = range.s.c + colOffset;
      const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
      const cell = sheet[cellAddress];

      if (!cell || cell.v === undefined || cell.v === null || cell.v === '') {
        cells.push('<td class="empty"></td>');
      } else {
        const { value, className } = formatCellForHtml(cell);
        cells.push(`<td class="${className}">${escapeHtml(value)}</td>`);
      }
    }

    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  // Add truncation notice if needed
  let truncationNotice = '';
  if (range.e.r - range.s.r + 1 > 500 || range.e.c - range.s.c + 1 > 50) {
    truncationNotice = `
      <div style="padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin-top: 12px; font-size: 12px; color: #856404;">
        Preview limited to first 500 rows and 50 columns. Full data available in download.
      </div>
    `;
  }

  return `
    <!-- Sheet: ${sheetName} -->
    <div class="sheet-container" data-sheet-index="${sheetIndex}" data-sheet-name="${escapeHtml(sheetName)}">
      <table class="excel-table">
        <thead>
          ${rows[0]}
        </thead>
        <tbody>
          ${rows.slice(1).join('\n')}
        </tbody>
      </table>
      ${truncationNotice}
    </div>
  `;
}

/**
 * Format cell value for HTML display
 */
function formatCellForHtml(cell: XLSX.CellObject): { value: string; className: string } {
  const cellType = cell.t;

  // Number
  if (cellType === 'n') {
    const num = cell.v as number;

    // Check if it's a date (Excel stores dates as numbers)
    if (cell.t === 'n' && cell.w && isDateFormat(cell.z || '')) {
      return { value: cell.w, className: 'date' };
    }

    // Format number
    if (cell.w) {
      return { value: cell.w, className: 'number' };
    }

    // Default number formatting
    if (Number.isInteger(num)) {
      return { value: num.toLocaleString(), className: 'number' };
    }
    return { value: num.toLocaleString(undefined, { maximumFractionDigits: 4 }), className: 'number' };
  }

  // Boolean
  if (cellType === 'b') {
    return { value: cell.v ? 'TRUE' : 'FALSE', className: '' };
  }

  // Date
  if (cellType === 'd') {
    const date = cell.v as Date;
    return { value: date.toLocaleDateString(), className: 'date' };
  }

  // Error
  if (cellType === 'e') {
    return { value: String(cell.v), className: 'error' };
  }

  // String or other
  const str = cell.w || String(cell.v || '');
  return { value: str, className: '' };
}

/**
 * Check if Excel number format is a date format
 */
function isDateFormat(format: string | number | undefined): boolean {
  if (!format) return false;
  const formatStr = String(format);
  const datePatterns = ['d', 'm', 'y', 'h', 's', 'AM', 'PM', 'date', 'time'];
  const lowerFormat = formatStr.toLowerCase();
  return datePatterns.some(p => lowerFormat.includes(p.toLowerCase()));
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char] || char);
}

export default {
  generateExcelHtmlPreview,
};
