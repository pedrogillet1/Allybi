import type { sheets_v4 } from 'googleapis';
import {
  SheetsClientError,
  SheetsClientService,
  type SheetsRequestContext,
} from './sheetsClient.service';
import ChartShapeValidatorService, {
  type ChartSeriesSelector,
  type BubbleSelector,
  type HistogramSelector,
  type ChartShapePlan,
} from './chartShapeValidator.service';
import { SheetsValidatorsService } from './sheetsValidators.service';

export type SheetsChartType =
  | 'COLUMN'
  | 'BAR'
  | 'LINE'
  | 'AREA'
  | 'PIE'
  | 'SCATTER'
  | 'STACKED_BAR'
  | 'STACKED_COLUMN'
  | 'COMBO'
  | 'BUBBLE'
  | 'RADAR'
  | 'HISTOGRAM';

export interface SheetsChartSpec {
  type: SheetsChartType;
  range: string;
  series?: Array<string | number>;
  headerCount?: number;
  comboSeries?: ChartSeriesSelector;
  bubble?: BubbleSelector;
  histogram?: HistogramSelector;
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
  private readonly shapeValidator: ChartShapeValidatorService;

  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {
    this.validators = new SheetsValidatorsService(this.sheetsClient);
    this.shapeValidator = new ChartShapeValidatorService(this.sheetsClient);
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

    const chartSpec = await this.buildChartSpec(spreadsheetId, resolvedSheetId, parsed, spec, ctx);
    const request: sheets_v4.Schema$Request = {
      addChart: {
        chart: {
          spec: chartSpec,
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

    const chartSpec = await this.buildChartSpec(spreadsheetId, resolvedSheetId, parsed, spec, ctx);
    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          updateChartSpec: {
            chartId,
            spec: chartSpec,
          },
        },
      ],
      ctx,
    );
  }

  private async buildChartSpec(
    spreadsheetId: string,
    sheetId: number,
    range: ParsedRange,
    spec: SheetsChartSpec,
    ctx?: SheetsRequestContext,
  ): Promise<sheets_v4.Schema$ChartSpec> {
    const shape = await this.shapeValidator.validate(
      spreadsheetId,
      {
        startColumnIndex: range.startColumnIndex,
        endColumnIndexExclusive: range.endColumnIndexExclusive,
        startRowIndex: range.startRowIndex,
        endRowIndexExclusive: range.endRowIndexExclusive,
      },
      spec,
      ctx,
    );

    const dataStartRow = range.startRowIndex + shape.headerCount;
    if (dataStartRow >= range.endRowIndexExclusive) {
      throw new SheetsClientError('The selected range does not contain data rows.', {
        code: 'CHART_INCOMPATIBLE_SHAPE_EMPTY',
        retryable: false,
      });
    }
    const headerAwareStartRow = shape.headerCount > 0 ? range.startRowIndex : dataStartRow;

    const dataSource = (columnIndex: number): sheets_v4.Schema$GridRange => ({
      sheetId,
      startRowIndex: dataStartRow,
      endRowIndex: range.endRowIndexExclusive,
      startColumnIndex: range.startColumnIndex + columnIndex,
      endColumnIndex: range.startColumnIndex + columnIndex + 1,
    });
    const sourceWithHeaders = (columnIndex: number): sheets_v4.Schema$GridRange => ({
      sheetId,
      startRowIndex: headerAwareStartRow,
      endRowIndex: range.endRowIndexExclusive,
      startColumnIndex: range.startColumnIndex + columnIndex,
      endColumnIndex: range.startColumnIndex + columnIndex + 1,
    });

    const title = spec.title?.trim() || undefined;
    if (shape.kind === 'pie') {
      const domainIdx = shape.domainColumnIndex ?? 0;
      const valueIdx = shape.seriesColumnIndexes?.[0];
      if (valueIdx == null) {
        throw new SheetsClientError('Pie chart requires one numeric value series.', {
          code: 'CHART_INCOMPATIBLE_SHAPE_PIE',
          retryable: false,
        });
      }
      return {
        title,
        pieChart: {
          legendPosition: 'RIGHT_LEGEND',
          domain: { sourceRange: { sources: [dataSource(domainIdx)] } },
          series: { sourceRange: { sources: [dataSource(valueIdx)] } },
        } as any,
      } as any;
    }

    if (shape.kind === 'bubble') {
      const b = shape.bubble;
      if (!b) {
        throw new SheetsClientError('Bubble chart configuration is missing.', {
          code: 'CHART_INCOMPATIBLE_SHAPE_BUBBLE',
          retryable: false,
        });
      }
      return {
        title,
        bubbleChart: {
          legendPosition: 'RIGHT_LEGEND',
          ...(b.labelColumnIndex != null ? { bubbleLabels: { sourceRange: { sources: [dataSource(b.labelColumnIndex)] } } } : {}),
          domain: { sourceRange: { sources: [dataSource(b.xColumnIndex)] } },
          series: { sourceRange: { sources: [dataSource(b.yColumnIndex)] } },
          ...(b.sizeColumnIndex != null ? { bubbleSizes: { sourceRange: { sources: [dataSource(b.sizeColumnIndex)] } } } : {}),
        } as any,
      } as any;
    }

    if (shape.kind === 'histogram') {
      const h = shape.histogram;
      if (!h) {
        throw new SheetsClientError('Histogram chart configuration is missing.', {
          code: 'CHART_INCOMPATIBLE_SHAPE_HISTOGRAM',
          retryable: false,
        });
      }
      return {
        title,
        histogramChart: {
          legendPosition: 'NO_LEGEND',
          series: [
            {
              data: { sourceRange: { sources: [dataSource(h.valueColumnIndex)] } },
            },
          ],
          ...(Number.isFinite(h.bucketSize) ? { bucketSize: h.bucketSize } : {}),
        } as any,
      } as any;
    }

    return this.buildBasicChartSpec(title, shape, sourceWithHeaders);
  }

  private buildBasicChartSpec(
    title: string | undefined,
    shape: ChartShapePlan,
    source: (columnIndex: number) => sheets_v4.Schema$GridRange,
  ): sheets_v4.Schema$ChartSpec {
    const domainIdx = shape.domainColumnIndex;
    const series = Array.isArray(shape.seriesColumnIndexes) ? shape.seriesColumnIndexes : [];
    if (domainIdx == null || !series.length || !shape.basicChartType) {
      throw new SheetsClientError('Chart needs one domain column and at least one numeric series.', {
        code: 'CHART_INCOMPATIBLE_SHAPE_SERIES',
        retryable: false,
      });
    }

    const lineSet = new Set(shape.comboLineSeriesColumnIndexes || []);
    const seriesEntries: sheets_v4.Schema$BasicChartSeries[] = series.map((col) => {
      const base: sheets_v4.Schema$BasicChartSeries = {
        series: {
          sourceRange: { sources: [source(col)] },
        },
      };
      if (shape.basicChartType === 'COMBO') {
        (base as any).type = lineSet.has(col) ? 'LINE' : 'COLUMN';
      }
      return base;
    });

    return {
      title,
      basicChart: {
        chartType: shape.basicChartType,
        legendPosition: 'BOTTOM_LEGEND',
        headerCount: shape.headerCount,
        ...(shape.stacked ? { stackedType: 'STACKED' } : {}),
        domains: [
          {
            domain: {
              sourceRange: { sources: [source(domainIdx)] },
            },
          },
        ],
        series: seriesEntries,
      } as any,
    } as any;
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

    const validTypes: SheetsChartType[] = [
      'COLUMN',
      'BAR',
      'LINE',
      'AREA',
      'PIE',
      'SCATTER',
      'STACKED_BAR',
      'STACKED_COLUMN',
      'COMBO',
      'BUBBLE',
      'RADAR',
      'HISTOGRAM',
    ];
    if (!validTypes.includes(spec.type)) {
      throw new SheetsClientError(`Unsupported chart type: ${spec.type}`, {
        code: 'INVALID_CHART_TYPE',
        retryable: false,
      });
    }

    if (spec.headerCount != null && (!Number.isInteger(spec.headerCount) || spec.headerCount < 0 || spec.headerCount > 1)) {
      throw new SheetsClientError('headerCount must be 0 or 1.', {
        code: 'INVALID_CHART_SPEC',
        retryable: false,
      });
    }
  }
}

export default SheetsChartService;
