import type { sheets_v4 } from 'googleapis';
import {
  SheetsClientError,
  SheetsClientService,
  type SheetsRequestContext,
} from './sheetsClient.service';
import { SheetsValidatorsService } from './sheetsValidators.service';

export type SheetsChartType = 'COLUMN' | 'BAR' | 'LINE' | 'AREA' | 'PIE';

export interface SheetsChartSpec {
  type: SheetsChartType;
  range: string;
  series?: string[];
  title?: string;
  placement?: {
    offsetXPixels?: number;
    offsetYPixels?: number;
  };
}

export interface CreateChartResult {
  chartId: number;
}

interface ParsedRange {
  sheetName: string;
  startColumnIndex: number;
  endColumnIndexExclusive: number;
  startRowIndex: number;
  endRowIndexExclusive: number;
}

/**
 * Creates and updates charts with strict range validation.
 */
export class SheetsChartService {
  private readonly validators: SheetsValidatorsService;

  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {
    this.validators = new SheetsValidatorsService(this.sheetsClient);
  }

  async createChart(
    spreadsheetId: string,
    sheetId: number,
    spec: SheetsChartSpec,
    ctx?: SheetsRequestContext,
  ): Promise<CreateChartResult> {
    this.assertChartSpec(spec);

    const parsed = this.parseRange(spec.range);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, spec.range, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? 'Chart range out of bounds.', {
        code: 'CHART_RANGE_OUT_OF_BOUNDS',
        retryable: false,
      });
    }

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const resolvedSheetId = this.resolveSheetId(spreadsheet, parsed.sheetName, sheetId);

    const request: sheets_v4.Schema$Request = {
      addChart: {
        chart: {
          spec: this.buildChartSpec(resolvedSheetId, parsed, spec),
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: resolvedSheetId,
                rowIndex: parsed.startRowIndex,
                columnIndex: parsed.endColumnIndexExclusive + 1,
              },
              offsetXPixels: spec.placement?.offsetXPixels ?? 12,
              offsetYPixels: spec.placement?.offsetYPixels ?? 12,
            },
          },
        },
      },
    };

    const response = await this.sheetsClient.batchUpdate(spreadsheetId, [request], ctx);
    const chartId = response.replies?.[0]?.addChart?.chart?.chartId;

    if (typeof chartId !== 'number') {
      throw new SheetsClientError('Chart created but no chartId returned.', {
        code: 'MISSING_CHART_ID',
        retryable: false,
      });
    }

    return { chartId };
  }

  async updateChart(
    spreadsheetId: string,
    chartId: number,
    spec: SheetsChartSpec,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    if (!Number.isInteger(chartId) || chartId <= 0) {
      throw new SheetsClientError('chartId must be a positive integer.', {
        code: 'INVALID_CHART_ID',
        retryable: false,
      });
    }

    this.assertChartSpec(spec);

    const parsed = this.parseRange(spec.range);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, spec.range, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? 'Chart range out of bounds.', {
        code: 'CHART_RANGE_OUT_OF_BOUNDS',
        retryable: false,
      });
    }

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const resolvedSheetId = this.resolveSheetId(spreadsheet, parsed.sheetName);

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          updateChartSpec: {
            chartId,
            spec: this.buildChartSpec(resolvedSheetId, parsed, spec),
          },
        },
      ],
      ctx,
    );
  }

  private buildChartSpec(
    sheetId: number,
    range: ParsedRange,
    spec: SheetsChartSpec,
  ): sheets_v4.Schema$ChartSpec {
    const domainSource: sheets_v4.Schema$GridRange = {
      sheetId,
      startRowIndex: range.startRowIndex,
      endRowIndex: range.endRowIndexExclusive,
      startColumnIndex: range.startColumnIndex,
      endColumnIndex: range.startColumnIndex + 1,
    };

    const firstSeriesStart = range.startColumnIndex + 1;
    if (firstSeriesStart >= range.endColumnIndexExclusive) {
      throw new SheetsClientError('Chart range must include at least one numeric series column.', {
        code: 'INVALID_CHART_SERIES_RANGE',
        retryable: false,
      });
    }

    const seriesEntries: sheets_v4.Schema$BasicChartSeries[] = [];
    for (let col = firstSeriesStart; col < range.endColumnIndexExclusive; col += 1) {
      seriesEntries.push({
        series: {
          sourceRange: {
            sources: [
              {
                sheetId,
                startRowIndex: range.startRowIndex,
                endRowIndex: range.endRowIndexExclusive,
                startColumnIndex: col,
                endColumnIndex: col + 1,
              },
            ],
          },
        },
      });
    }

    return {
      title: spec.title?.trim() || undefined,
      basicChart: {
        chartType: spec.type,
        legendPosition: 'BOTTOM_LEGEND',
        headerCount: 1,
        domains: [
          {
            domain: {
              sourceRange: {
                sources: [domainSource],
              },
            },
          },
        ],
        series: seriesEntries,
      },
    };
  }

  private resolveSheetId(
    spreadsheet: sheets_v4.Schema$Spreadsheet,
    sheetName: string,
    fallbackSheetId?: number,
  ): number {
    const match = spreadsheet.sheets?.find((sheet) => sheet.properties?.title === sheetName);
    const foundId = match?.properties?.sheetId;

    if (typeof foundId === 'number') return foundId;
    if (typeof fallbackSheetId === 'number') return fallbackSheetId;

    throw new SheetsClientError(`Sheet "${sheetName}" not found in spreadsheet.`, {
      code: 'SHEET_NOT_FOUND',
      retryable: false,
    });
  }

  private parseRange(rangeA1: string): ParsedRange {
    const [sheetPartRaw, cellPartRaw] = rangeA1.includes('!') ? rangeA1.split('!') : ['Sheet1', rangeA1];

    const sheetName = sheetPartRaw.replace(/^'/, '').replace(/'$/, '').trim();
    if (!sheetName) {
      throw new SheetsClientError('Chart range must include a sheet name.', {
        code: 'INVALID_CHART_RANGE',
        retryable: false,
      });
    }

    const [startCellRaw, endCellRaw] = cellPartRaw.includes(':')
      ? cellPartRaw.split(':')
      : [cellPartRaw, cellPartRaw];

    const start = this.parseCell(startCellRaw);
    const end = this.parseCell(endCellRaw);

    const startColumnIndex = Math.min(start.columnIndex, end.columnIndex);
    const endColumnIndexExclusive = Math.max(start.columnIndex, end.columnIndex) + 1;
    const startRowIndex = Math.min(start.rowIndex, end.rowIndex);
    const endRowIndexExclusive = Math.max(start.rowIndex, end.rowIndex) + 1;

    return {
      sheetName,
      startColumnIndex,
      endColumnIndexExclusive,
      startRowIndex,
      endRowIndexExclusive,
    };
  }

  private parseCell(cell: string): { rowIndex: number; columnIndex: number } {
    const normalized = cell.replace(/\$/g, '').toUpperCase().trim();
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new SheetsClientError(`Invalid A1 cell reference: ${cell}`, {
        code: 'INVALID_A1_CELL',
        retryable: false,
      });
    }

    return {
      rowIndex: Number(match[2]) - 1,
      columnIndex: this.columnLettersToIndex(match[1]),
    };
  }

  private columnLettersToIndex(columnLetters: string): number {
    let result = 0;
    for (const char of columnLetters) {
      result = result * 26 + (char.charCodeAt(0) - 64);
    }
    return result - 1;
  }

  private assertChartSpec(spec: SheetsChartSpec): void {
    if (!spec || !spec.range || !spec.type) {
      throw new SheetsClientError('Chart spec must include type and range.', {
        code: 'INVALID_CHART_SPEC',
        retryable: false,
      });
    }

    const validTypes: SheetsChartType[] = ['COLUMN', 'BAR', 'LINE', 'AREA', 'PIE'];
    if (!validTypes.includes(spec.type)) {
      throw new SheetsClientError(`Unsupported chart type: ${spec.type}`, {
        code: 'INVALID_CHART_TYPE',
        retryable: false,
      });
    }
  }
}

export default SheetsChartService;
