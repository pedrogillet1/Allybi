import * as XLSX from 'xlsx';
import { isExcelDateSerial, formatExcelDate } from '../../utils/excelDateUtils';
import { formatNumber } from '../../utils/excelCellUtils';

/**
 * Enhanced Excel Processor
 * Extracts data from Excel with cell-level precision for deep linking
 * Creates semantic chunks for better RAG understanding
 *
 * ✅ FIX: Added proper date serial number detection and formatting
 */

interface CellData {
  cell: string;
  value: string;
  formula?: string;
  isMerged?: boolean;      // Indicates this cell is part of a merged range
  mergeRange?: string;     // The merge range (e.g., "A1:C3")
}

interface MergedCellInfo {
  value: string;           // The master cell value
  masterCell: string;      // The top-left cell address
  range: string;           // The full merge range
}

interface ExcelChunk {
  content: string;
  metadata: {
    sheetName: string;
    sheetNumber: number;
    rowNumber: number;
    cells: string[];
    emptyCells?: string[];
    chunkIndex: number;
    sourceType: string;
    tableHeaders?: string[];
    // ✅ Formula metadata for better RAG retrieval (Issue #2 fix)
    hasFormula?: boolean;
    formulas?: string[];  // Array of formulas in the row (e.g., ["=SUM(B2:B4)", "=A1*B1"])
    // ✅ Entity metadata for property/investment name extraction
    entities?: string[];  // Array of entity names found in the row (e.g., ["Carlyle", "Lone Mountain Ranch"])
    // ✅ NEW: Merged cell metadata for complete data extraction
    hasMergedCells?: boolean;  // Indicates row contains merged cells
    mergedRanges?: string[];   // Array of merge ranges in this row (e.g., ["A1:C1", "D1:D3"])
  };
}

// ============================================================================
// MERGED CELL EXTRACTION
// ============================================================================
// PURPOSE: Handle merged cells in Excel files to extract complete data
// WHY: Only the master (top-left) cell contains the value in merged ranges
// IMPACT: Prevents missing data in reports with merged cells

/**
 * Extract merged cell information from a worksheet
 * Creates a map of cell address -> merged cell info for all cells in merged ranges
 *
 * @param sheet - XLSX worksheet object
 * @param sheetValues - XLSX worksheet with calculated values
 * @returns Map of cell addresses to their merged cell info
 */
function extractMergedCells(
  sheet: XLSX.WorkSheet,
  sheetValues: XLSX.WorkSheet
): Map<string, MergedCellInfo> {
  const mergedCells = new Map<string, MergedCellInfo>();

  // Get merged cell ranges from the sheet
  const merges = sheet['!merges'];

  if (!merges || merges.length === 0) {
    return mergedCells;
  }

  console.log(`  📐 Found ${merges.length} merged cell ranges`);

  for (const merge of merges) {
    // merge is in format: { s: { r: startRow, c: startCol }, e: { r: endRow, c: endCol } }
    const startCell = XLSX.utils.encode_cell(merge.s);
    const endCell = XLSX.utils.encode_cell(merge.e);
    const rangeStr = `${startCell}:${endCell}`;

    // Get the master cell value (top-left cell of the merge)
    const masterCellFormula = sheet[startCell];
    const masterCellValue = sheetValues[startCell];

    // Extract the value from master cell
    let value = '';
    if (masterCellValue?.v !== undefined && masterCellValue?.v !== null) {
      value = String(masterCellValue.v);
    } else if (masterCellFormula?.v !== undefined && masterCellFormula?.v !== null) {
      value = String(masterCellFormula.v);
    }

    // Apply this value to ALL cells in the merged range
    for (let row = merge.s.r; row <= merge.e.r; row++) {
      for (let col = merge.s.c; col <= merge.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });

        mergedCells.set(cellAddress, {
          value,
          masterCell: startCell,
          range: rangeStr
        });
      }
    }
  }

  console.log(`  ✅ Mapped ${mergedCells.size} cells from merged ranges`);
  return mergedCells;
}

/**
 * Check if a cell is part of a merged range (but not the master cell)
 * Used to avoid duplicating content in row output
 */
function isMergedSecondaryCell(
  cellAddress: string,
  mergedCells: Map<string, MergedCellInfo>
): boolean {
  const mergeInfo = mergedCells.get(cellAddress);
  if (!mergeInfo) return false;
  return mergeInfo.masterCell !== cellAddress;
}

class ExcelProcessorService {
  /**
   * Process Excel file comprehensively
   * Reads ALL sheets, ALL rows, ALL cells with formulas and coordinates
   * Now includes merged cell handling for complete data extraction
   * @param buffer - Excel file buffer
   * @returns Array of chunks with metadata for vector embedding
   */
  async processExcel(buffer: Buffer): Promise<ExcelChunk[]> {
    try {
      console.log('📊 Enhanced Excel processing started...');

      // Load workbook with formulas
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellFormula: true,
        cellStyles: true,
        cellDates: true,
        cellNF: true
      });

      // Also load with calculated values
      const workbookValues = XLSX.read(buffer, {
        type: 'buffer',
        cellFormula: false // Get calculated values
      });

      const chunks: ExcelChunk[] = [];
      let chunkIndex = 0;

      // Process each sheet
      for (let sheetIdx = 0; sheetIdx < workbook.SheetNames.length; sheetIdx++) {
        const sheetName = workbook.SheetNames[sheetIdx];
        const sheetNumber = sheetIdx + 1;
        const sheet = workbook.Sheets[sheetName];
        const sheetValues = workbookValues.Sheets[sheetName];

        console.log(`  Processing sheet ${sheetNumber}/${workbook.SheetNames.length}: "${sheetName}"`);

        // ✅ NEW: Extract merged cell information for complete data extraction
        const mergedCells = extractMergedCells(sheet, sheetValues);

        // Method 1: Row-by-row processing with cell coordinates (now with merged cell support)
        const rowChunks = this.processSheetByRows(sheet, sheetValues, sheetName, sheetNumber, chunkIndex, mergedCells);
        chunks.push(...rowChunks);
        chunkIndex += rowChunks.length;

        // Method 2: Table detection for semantic understanding (now with merged cell support)
        const tableChunks = this.processSheetAsTables(sheet, sheetValues, sheetName, sheetNumber, chunkIndex, mergedCells);
        chunks.push(...tableChunks);
        chunkIndex += tableChunks.length;

        console.log(`  ✅ Created ${rowChunks.length + tableChunks.length} chunks from "${sheetName}"`);
      }

      console.log(`✅ Excel processing complete: ${chunks.length} total chunks from ${workbook.SheetNames.length} sheets`);
      return chunks;

    } catch (error) {
      console.error('❌ Error in enhanced Excel processing:', error);
      throw error;
    }
  }

  /**
   * Process sheet row by row, preserving exact cell coordinates
   * Now includes merged cell handling for complete data extraction
   * Creates chunks like: "Sheet 2 'Revenue', Row 5: A5: Q1 Total | B5: $1,200,000 (formula: =SUM(B2:B4))"
   */
  private processSheetByRows(
    sheet: XLSX.WorkSheet,
    sheetValues: XLSX.WorkSheet,
    sheetName: string,
    sheetNumber: number,
    startChunkIndex: number,
    mergedCells: Map<string, MergedCellInfo>  // ✅ NEW: Merged cell data
  ): ExcelChunk[] {
    const chunks: ExcelChunk[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

    let chunkIndex = startChunkIndex;

    // Iterate through all rows
    for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
      const rowCells: CellData[] = [];

      // Iterate through all columns in this row
      for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
        const cell = sheet[cellAddress];
        const cellValue = sheetValues[cellAddress];

        // ✅ NEW: Check if this cell is part of a merged range
        const mergeInfo = mergedCells.get(cellAddress);

        // ✅ NEW: Skip secondary merged cells (not the master cell)
        // This prevents duplicate content in the row output
        if (mergeInfo && isMergedSecondaryCell(cellAddress, mergedCells)) {
          continue; // Skip - value will be from master cell
        }

        // ✅ NEW: Get value - prefer merged cell value if this is a master cell
        let value = '';
        if (mergeInfo) {
          // This is the master cell of a merged range - use the merged value
          value = this.formatCellValue(mergeInfo.value);
        } else {
          // Regular cell - use normal extraction
          value = this.formatCellValue(cellValue?.v ?? '');
        }

        // Create cell data
        const cellData: CellData = {
          cell: cellAddress,
          value,
          ...(mergeInfo && { isMerged: true, mergeRange: mergeInfo.range })
        };

        // Check if cell has a formula
        if (cell && cell.f) {
          cellData.formula = cell.f;
        }

        rowCells.push(cellData);
      }

      // Create chunk for this row if it has data
      if (rowCells.length > 0) {
        const cellTexts = rowCells.map(cellData => {
          // ✅ NEW: Include merge range info for merged cells
          const mergeIndicator = cellData.isMerged ? ` [merged: ${cellData.mergeRange}]` : '';

          if (cellData.formula) {
            return `${cellData.cell}: ${cellData.value} (formula: =${cellData.formula})${mergeIndicator}`;
          }
          // Don't include empty cells in chunk text to reduce noise
          if (cellData.value === '[empty]') {
            return null;
          }
          return `${cellData.cell}: ${cellData.value}${mergeIndicator}`;
        }).filter(Boolean); // Remove null entries

        const rowText = cellTexts.join(' | ');

        // ✅ Issue #2 Fix: Extract formulas for searchable metadata
        const rowFormulas = rowCells
          .filter(c => c.formula)
          .map(c => `=${c.formula}`);
        const hasFormula = rowFormulas.length > 0;

        // ✅ NEW: Track merged cells in this row
        const hasMergedCells = rowCells.some(c => c.isMerged);
        const mergedRanges = [...new Set(
          rowCells
            .filter(c => c.mergeRange)
            .map(c => c.mergeRange as string)  // Assert non-undefined after filter
        )];

        chunks.push({
          content: `Sheet ${sheetNumber} '${sheetName}', Row ${rowNum + 1}: ${rowText}`,
          metadata: {
            sheetName,
            sheetNumber,
            rowNumber: rowNum + 1,
            cells: rowCells.map(c => c.cell),
            emptyCells: rowCells.filter(c => c.value === '[empty]').map(c => c.cell),
            chunkIndex: chunkIndex++,
            sourceType: 'excel',
            // ✅ Formula metadata for better RAG retrieval
            ...(hasFormula && { hasFormula: true }),
            ...(hasFormula && { formulas: rowFormulas }),
            // ✅ NEW: Merged cell metadata
            ...(hasMergedCells && { hasMergedCells: true }),
            ...(mergedRanges.length > 0 && { mergedRanges }),
          }
        });
      }
    }

    return chunks;
  }

  /**
   * Process sheet as tables with ENTITY-AWARE semantic understanding
   * Now includes merged cell handling for complete data extraction
   * Detects and labels entities like property names, investment names, etc.
   * Creates chunks like: "[Entities: Carlyle, Lone Mountain Ranch] Sheet 2 'Revenue' table data: Property: Carlyle, Revenue: $450,000"
   */
  private processSheetAsTables(
    sheet: XLSX.WorkSheet,
    sheetValues: XLSX.WorkSheet,  // ✅ NEW: Add sheetValues for merged cell handling
    sheetName: string,
    sheetNumber: number,
    startChunkIndex: number,
    mergedCells: Map<string, MergedCellInfo>  // ✅ NEW: Merged cell data
  ): ExcelChunk[] {
    const chunks: ExcelChunk[] = [];

    // ✅ NEW: Build a sheet with merged cell values filled in
    // This ensures sheet_to_json gets complete data
    const enhancedSheet = this.fillMergedCellValues(sheetValues, mergedCells);

    // Convert sheet to JSON array (now with merged cell values)
    const jsonData = XLSX.utils.sheet_to_json(enhancedSheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false
    }) as any[][];

    if (!jsonData || jsonData.length === 0) {
      return chunks;
    }

    // Check if first row looks like headers (contains strings)
    const firstRow = jsonData[0];
    const hasHeaders = firstRow && firstRow.some((cell: any) =>
      cell && typeof cell === 'string' && cell.trim().length > 0
    );

    if (!hasHeaders || jsonData.length < 2) {
      return chunks; // Need headers and at least one data row
    }

    const headers = firstRow.map((h: any) => String(h || '').trim());
    let chunkIndex = startChunkIndex;

    // ✅ NEW: Detect entity columns (property names, investment names, etc.)
    const entityColumnIndices = this.detectEntityColumns(headers);

    // Process each data row with column context
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowItems: string[] = [];
      const entities: string[] = []; // ✅ NEW: Track entities in this row

      for (let j = 0; j < Math.min(row.length, headers.length); j++) {
        const header = headers[j];
        const value = row[j];

        if (header && value !== null && value !== undefined && value !== '') {
          const formattedValue = this.formatCellValue(value);

          // ✅ NEW: Mark entities with special labels for better RAG retrieval
          if (entityColumnIndices.includes(j) && typeof value === 'string' && value.trim().length > 0) {
            rowItems.push(`**${header}**: ${formattedValue}`);
            // Only add meaningful entity names (not numbers, not too short)
            const trimmedValue = String(value).trim();
            if (trimmedValue.length >= 3 && !/^[\d.,\-$%]+$/.test(trimmedValue)) {
              entities.push(trimmedValue);
            }
          } else {
            rowItems.push(`${header}: ${formattedValue}`);
          }
        }
      }

      if (rowItems.length > 0) {
        const semanticText = rowItems.join(', ');

        // ✅ NEW: Add entity prefix for better retrieval of property/investment names
        const entityPrefix = entities.length > 0
          ? `[Entities: ${entities.join(', ')}] `
          : '';

        chunks.push({
          content: `${entityPrefix}Sheet ${sheetNumber} '${sheetName}' table data: ${semanticText}`,
          metadata: {
            sheetName,
            sheetNumber,
            rowNumber: i + 1,
            cells: [],
            chunkIndex: chunkIndex++,
            sourceType: 'excel_table',
            tableHeaders: headers.filter(h => h.length > 0),
            // ✅ NEW: Store entities in metadata for filtering
            ...(entities.length > 0 && { entities }),
          }
        });
      }
    }

    return chunks;
  }

  /**
   * ✅ NEW: Fill merged cell values into a sheet copy
   * Creates a new sheet object with merged cell values propagated to all cells in each merge range
   * This ensures sheet_to_json extracts complete data from merged cells
   */
  private fillMergedCellValues(
    sheet: XLSX.WorkSheet,
    mergedCells: Map<string, MergedCellInfo>
  ): XLSX.WorkSheet {
    // If no merged cells, return original sheet
    if (mergedCells.size === 0) {
      return sheet;
    }

    // Create a shallow copy of the sheet
    const enhancedSheet: XLSX.WorkSheet = { ...sheet };

    // Fill in merged cell values
    for (const [cellAddress, mergeInfo] of mergedCells) {
      // Only fill secondary cells (master cell already has the value)
      if (cellAddress !== mergeInfo.masterCell && mergeInfo.value) {
        // Create or update the cell with the merged value
        enhancedSheet[cellAddress] = {
          t: 's',  // String type
          v: mergeInfo.value,
          w: mergeInfo.value
        };
      }
    }

    return enhancedSheet;
  }

  /**
   * ✅ NEW: Detect columns that likely contain entity names
   * (property names, investment names, company names, etc.)
   */
  private detectEntityColumns(headers: string[]): number[] {
    const entityKeywords = [
      'name', 'property', 'investment', 'company', 'fund', 'asset',
      'project', 'portfolio', 'entity', 'client', 'customer', 'vendor',
      'hotel', 'ranch', 'building', 'facility', 'location', 'site',
      'description', 'title', 'label', 'category', 'type'
    ];

    const entityIndices: number[] = [];

    headers.forEach((header, index) => {
      const lowerHeader = header.toLowerCase();

      // Check if header contains entity keywords
      const isEntity = entityKeywords.some(keyword =>
        lowerHeader.includes(keyword)
      );

      // Also check if it's the first column with text (often contains names)
      const isFirstTextColumn = index === 0 && header.length > 0;

      if (isEntity || isFirstTextColumn) {
        entityIndices.push(index);
      }
    });

    return entityIndices;
  }

  /**
   * Format cell value for display
   * ✅ FIX: Improved date serial detection using shared utility
   * ✅ FIX: Uses formatNumber for proper decimal precision preservation
   *
   * @param value - The cell value
   * @param numFmt - Optional Excel number format string
   */
  private formatCellValue(value: any, numFmt?: string): string {
    if (value === null || value === undefined || value === '') {
      return '[empty]';
    }

    if (typeof value === 'number') {
      // ✅ FIX: Use shared date utility for proper detection
      if (isExcelDateSerial(value, numFmt)) {
        return formatExcelDate(value, { locale: 'en-US' });
      }
      // ✅ FIX: Use formatNumber to preserve decimal precision for financial data
      return formatNumber(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (value instanceof Date) {
      return value.toLocaleDateString('en-US');
    }

    // Truncate very long strings
    const str = String(value);
    return str.length > 500 ? str.substring(0, 500) + '...' : str;
  }
}

export default new ExcelProcessorService();
