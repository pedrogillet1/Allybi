import { SheetsClientError, SheetsClientService, type SheetsRequestContext } from './sheetsClient.service';

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

export interface ChartSeriesSelector {
  barSeries?: Array<string | number>;
  lineSeries?: Array<string | number>;
}

export interface BubbleSelector {
  xColumn?: string | number;
  yColumn?: string | number;
  sizeColumn?: string | number;
}

export interface HistogramSelector {
  valueColumn?: string | number;
  bucketSize?: number;
}

export interface ChartShapeValidationSpec {
  type: SheetsChartType;
  range: string;
  headerCount?: number;
  series?: Array<string | number>;
  comboSeries?: ChartSeriesSelector;
  bubble?: BubbleSelector;
  histogram?: HistogramSelector;
}

export interface ParsedRange {
  startColumnIndex: number;
  endColumnIndexExclusive: number;
  startRowIndex: number;
  endRowIndexExclusive: number;
}

export interface ChartShapePlan {
  kind: 'basic' | 'pie' | 'bubble' | 'histogram';
  basicChartType?: 'COLUMN' | 'BAR' | 'LINE' | 'AREA' | 'SCATTER' | 'COMBO';
  headerCount: number;
  domainColumnIndex?: number;
  seriesColumnIndexes?: number[];
  stacked?: boolean;
  comboLineSeriesColumnIndexes?: number[];
  bubble?: {
    labelColumnIndex?: number;
    xColumnIndex: number;
    yColumnIndex: number;
    sizeColumnIndex?: number;
  };
  histogram?: {
    valueColumnIndex: number;
    bucketSize?: number;
  };
}

interface ColumnStats {
  numericCount: number;
  nonEmptyCount: number;
  textLikeCount: number;
}

interface SampleProfile {
  rangeStartColumnIndex: number;
  columnCount: number;
  headers: string[];
  rows: unknown[][];
  headerCount: number;
  numericColumns: number[];
  labelCandidateColumns: number[];
  statsByColumn: ColumnStats[];
}

const SUPPORTED_BY_ENGINE_HINT = 'Try LINE, BAR, COLUMN, AREA, PIE, SCATTER, COMBO, BUBBLE, or HISTOGRAM.';

export class ChartShapeValidatorService {
  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {}

  async validate(
    spreadsheetId: string,
    range: ParsedRange,
    spec: ChartShapeValidationSpec,
    ctx?: SheetsRequestContext,
  ): Promise<ChartShapePlan> {
    const profile = await this.loadProfile(spreadsheetId, spec, range, ctx);
    const type = String(spec.type || '').trim().toUpperCase() as SheetsChartType;

    if (type === 'RADAR') {
      this.requireAtLeastNumericSeries(profile, 2, 'CHART_INCOMPATIBLE_SHAPE_RADAR', 'Radar needs at least two numeric series columns.');
      throw new SheetsClientError(
        `Radar charts are not supported by this chart engine. ${SUPPORTED_BY_ENGINE_HINT}`,
        { code: 'CHART_TYPE_NOT_SUPPORTED', retryable: false },
      );
    }

    if (type === 'HISTOGRAM') {
      return this.planHistogram(profile, spec);
    }
    if (type === 'BUBBLE') {
      return this.planBubble(profile, spec);
    }
    if (type === 'PIE') {
      return this.planPie(profile, spec);
    }
    if (type === 'COMBO') {
      return this.planCombo(profile, spec);
    }
    if (type === 'STACKED_BAR' || type === 'STACKED_COLUMN') {
      return this.planStacked(profile, spec, type);
    }
    if (type === 'SCATTER') {
      return this.planScatter(profile, spec);
    }

    return this.planBasic(profile, spec, type);
  }

  private async loadProfile(
    spreadsheetId: string,
    spec: ChartShapeValidationSpec,
    range: ParsedRange,
    ctx?: SheetsRequestContext,
  ): Promise<SampleProfile> {
    const resp = await this.sheetsClient.getValues(spreadsheetId, spec.range, ctx);
    const rawRows = Array.isArray(resp.values) ? resp.values : [];
    const columnCount = Math.max(1, range.endColumnIndexExclusive - range.startColumnIndex);
    const normalizedRows: unknown[][] = rawRows.map((row) => {
      const src = Array.isArray(row) ? row : [];
      const out = new Array(columnCount).fill('');
      for (let i = 0; i < Math.min(columnCount, src.length); i += 1) out[i] = src[i];
      return out;
    });

    if (!normalizedRows.length) {
      throw new SheetsClientError(
        'The selected range has no data. Select a populated range and try again.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_EMPTY', retryable: false },
      );
    }

    const headerCount = this.resolveHeaderCount(spec.headerCount, normalizedRows);
    const headers = headerCount > 0 ? normalizedRows[0].map((v) => String(v ?? '').trim()) : [];
    const rows = normalizedRows
      .slice(headerCount)
      .filter((row) => row.some((v) => String(v ?? '').trim().length > 0));

    if (!rows.length) {
      throw new SheetsClientError(
        'The selected range does not contain data rows after the header.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_EMPTY', retryable: false },
      );
    }

    const statsByColumn: ColumnStats[] = new Array(columnCount).fill(null).map(() => ({
      numericCount: 0,
      nonEmptyCount: 0,
      textLikeCount: 0,
    }));
    for (const row of rows) {
      for (let c = 0; c < columnCount; c += 1) {
        const raw = row[c];
        const text = String(raw ?? '').trim();
        if (!text) continue;
        statsByColumn[c].nonEmptyCount += 1;
        const n = this.parseNumeric(raw);
        if (Number.isFinite(n)) statsByColumn[c].numericCount += 1;
        else statsByColumn[c].textLikeCount += 1;
      }
    }

    const numericColumns: number[] = [];
    const labelCandidateColumns: number[] = [];
    for (let c = 0; c < columnCount; c += 1) {
      const stats = statsByColumn[c];
      if (stats.numericCount > 0) numericColumns.push(c);
      if (stats.textLikeCount > 0) labelCandidateColumns.push(c);
    }

    return {
      rangeStartColumnIndex: range.startColumnIndex,
      columnCount,
      headers,
      rows,
      headerCount,
      numericColumns,
      labelCandidateColumns,
      statsByColumn,
    };
  }

  private resolveHeaderCount(raw: unknown, rows: unknown[][]): number {
    if (Number.isInteger(raw)) {
      const n = Number(raw);
      if (n >= 0 && n <= 1) return n;
    }
    if (rows.length < 2) return 0;
    const first = rows[0] || [];
    const second = rows[1] || [];
    const firstHasText = first.some((v) => {
      const s = String(v ?? '').trim();
      return Boolean(s) && !Number.isFinite(this.parseNumeric(s));
    });
    const secondHasNumeric = second.some((v) => Number.isFinite(this.parseNumeric(v)));
    return firstHasText && secondHasNumeric ? 1 : 0;
  }

  private planBasic(profile: SampleProfile, spec: ChartShapeValidationSpec, type: SheetsChartType): ChartShapePlan {
    const basicType = this.mapToBasic(type);
    if (!basicType) {
      throw new SheetsClientError(`Unsupported chart type: ${type}`, {
        code: 'INVALID_CHART_TYPE',
        retryable: false,
      });
    }
    if (profile.columnCount < 2) {
      throw new SheetsClientError(
        'This chart needs at least two columns (one label/domain and one numeric series).',
        { code: 'CHART_INCOMPATIBLE_SHAPE_SERIES', retryable: false },
      );
    }

    const domainColumnIndex = this.pickDomainColumn(profile);
    const requestedSeries = this.resolveRequestedSeriesColumns(
      profile,
      spec.series,
      {
        exclude: [domainColumnIndex],
        requireNumeric: true,
        code: 'CHART_INCOMPATIBLE_SHAPE_SERIES',
        message: 'The requested series columns are outside this range or are not numeric.',
      },
    );
    const defaultSeries = profile.numericColumns.filter((c) => c !== domainColumnIndex);
    const seriesColumnIndexes = requestedSeries.length ? requestedSeries : defaultSeries;
    if (!seriesColumnIndexes.length) {
      throw new SheetsClientError(
        'No numeric series column was found. Select at least one numeric column for values.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_SERIES', retryable: false },
      );
    }

    return {
      kind: 'basic',
      basicChartType: basicType,
      headerCount: profile.headerCount,
      domainColumnIndex,
      seriesColumnIndexes,
    };
  }

  private planScatter(profile: SampleProfile, spec: ChartShapeValidationSpec): ChartShapePlan {
    const requestedSeries = this.resolveRequestedSeriesColumns(
      profile,
      spec.series,
      {
        requireNumeric: true,
        code: 'CHART_INCOMPATIBLE_SHAPE_SCATTER',
        message: 'Scatter needs valid numeric X and Y columns. Select two numeric columns or specify them explicitly.',
      },
    );
    const numericColumns = requestedSeries.length ? requestedSeries : profile.numericColumns;
    if (numericColumns.length < 2) {
      throw new SheetsClientError(
        'Scatter needs two numeric columns (X and Y). Select a range with at least two numeric columns.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_SCATTER', retryable: false },
      );
    }
    return {
      kind: 'basic',
      basicChartType: 'SCATTER',
      headerCount: profile.headerCount,
      domainColumnIndex: numericColumns[0],
      seriesColumnIndexes: numericColumns.slice(1),
    };
  }

  private planStacked(profile: SampleProfile, spec: ChartShapeValidationSpec, type: 'STACKED_BAR' | 'STACKED_COLUMN'): ChartShapePlan {
    const domainColumnIndex = this.pickDomainColumn(profile);
    const requestedSeries = this.resolveRequestedSeriesColumns(
      profile,
      spec.series,
      {
        exclude: [domainColumnIndex],
        requireNumeric: true,
        code: 'CHART_INCOMPATIBLE_SHAPE_STACKED',
        message: 'Stacked charts need valid numeric series columns. Select at least two numeric columns for stacked values.',
      },
    );
    const defaultSeries = profile.numericColumns.filter((c) => c !== domainColumnIndex);
    const seriesColumnIndexes = requestedSeries.length ? requestedSeries : defaultSeries;
    if (seriesColumnIndexes.length < 2) {
      throw new SheetsClientError(
        'Stacked charts need one label column and at least two numeric series columns.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_STACKED', retryable: false },
      );
    }
    return {
      kind: 'basic',
      basicChartType: type === 'STACKED_BAR' ? 'BAR' : 'COLUMN',
      headerCount: profile.headerCount,
      domainColumnIndex,
      seriesColumnIndexes,
      stacked: true,
    };
  }

  private planCombo(profile: SampleProfile, spec: ChartShapeValidationSpec): ChartShapePlan {
    const domainColumnIndex = this.pickDomainColumn(profile);
    const explicitBarSeries = Array.isArray(spec.comboSeries?.barSeries) ? spec.comboSeries?.barSeries : [];
    const explicitLineSeries = Array.isArray(spec.comboSeries?.lineSeries) ? spec.comboSeries?.lineSeries : [];
    const explicitSeriesBase = [
      ...(Array.isArray(spec.series) ? spec.series : []),
      ...explicitBarSeries,
    ];
    const explicitSeriesForRange = explicitSeriesBase.length
      ? [...explicitSeriesBase, ...explicitLineSeries]
      : [];
    const requestedSeries = this.resolveRequestedSeriesColumns(
      profile,
      explicitSeriesForRange,
      {
        exclude: [domainColumnIndex],
        requireNumeric: true,
        code: 'CHART_INCOMPATIBLE_SHAPE_COMBO',
        message: 'Combo charts need valid numeric bar/line series columns inside the selected range.',
      },
    );
    const numericSeries = requestedSeries.length
      ? requestedSeries
      : profile.numericColumns.filter((c) => c !== domainColumnIndex);
    if (numericSeries.length < 2) {
      throw new SheetsClientError(
        'Combo charts need one label/domain column plus at least two numeric series columns.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_COMBO', retryable: false },
      );
    }

    const lineSeriesRequested = this.resolveRequestedSeriesColumns(
      profile,
      explicitLineSeries,
      {
        exclude: [domainColumnIndex],
        requireNumeric: true,
        code: 'CHART_INCOMPATIBLE_SHAPE_COMBO',
        message: 'Combo line-series columns must be numeric and inside the selected range.',
      },
    ).filter((idx) => numericSeries.includes(idx));
    const barSeriesRequested = this.resolveRequestedSeriesColumns(
      profile,
      explicitBarSeries,
      {
        exclude: [domainColumnIndex],
        requireNumeric: true,
        code: 'CHART_INCOMPATIBLE_SHAPE_COMBO',
        message: 'Combo bar-series columns must be numeric and inside the selected range.',
      },
    ).filter((idx) => numericSeries.includes(idx));

    const defaultLineSeries =
      numericSeries.find((idx) => !barSeriesRequested.includes(idx)) ??
      numericSeries[numericSeries.length - 1];
    let lineSeries = lineSeriesRequested.length ? lineSeriesRequested : [defaultLineSeries];
    lineSeries = Array.from(new Set(lineSeries));
    if (lineSeries.length === numericSeries.length && numericSeries.length > 1) {
      lineSeries = [lineSeries[lineSeries.length - 1]];
    }

    return {
      kind: 'basic',
      basicChartType: 'COMBO',
      headerCount: profile.headerCount,
      domainColumnIndex,
      seriesColumnIndexes: numericSeries,
      comboLineSeriesColumnIndexes: lineSeries,
    };
  }

  private planBubble(profile: SampleProfile, spec: ChartShapeValidationSpec): ChartShapePlan {
    if (profile.numericColumns.length < 2) {
      throw new SheetsClientError(
        'Bubble charts need at least two numeric columns for X and Y (third numeric column optional for bubble size).',
        { code: 'CHART_INCOMPATIBLE_SHAPE_BUBBLE', retryable: false },
      );
    }

    const headers = this.safeHeaders(profile);
    const xCol = this.resolveColumnSpecifier(spec.bubble?.xColumn, headers, profile.columnCount, profile.rangeStartColumnIndex);
    const yCol = this.resolveColumnSpecifier(spec.bubble?.yColumn, headers, profile.columnCount, profile.rangeStartColumnIndex);
    const sizeCol = this.resolveColumnSpecifier(spec.bubble?.sizeColumn, headers, profile.columnCount, profile.rangeStartColumnIndex);

    const xColumnIndex = this.pickNumericColumn(profile.numericColumns, xCol);
    const yColumnIndex = this.pickNumericColumn(profile.numericColumns.filter((c) => c !== xColumnIndex), yCol);
    if (xColumnIndex == null || yColumnIndex == null) {
      throw new SheetsClientError(
        'Bubble charts need valid numeric X and Y columns. Select 2-3 numeric columns or specify the numeric columns explicitly.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_BUBBLE', retryable: false },
      );
    }

    const sizeColumnIndex = this.pickNumericColumn(
      profile.numericColumns.filter((c) => c !== xColumnIndex && c !== yColumnIndex),
      sizeCol,
      true,
    );

    const labelColumnIndex =
      profile.labelCandidateColumns.find((c) => c !== xColumnIndex && c !== yColumnIndex) ??
      undefined;

    return {
      kind: 'bubble',
      headerCount: profile.headerCount,
      bubble: {
        labelColumnIndex,
        xColumnIndex,
        yColumnIndex,
        ...(sizeColumnIndex != null ? { sizeColumnIndex } : {}),
      },
    };
  }

  private planHistogram(profile: SampleProfile, spec: ChartShapeValidationSpec): ChartShapePlan {
    const headers = this.safeHeaders(profile);
    const requestedValue = this.resolveColumnSpecifier(
      spec.histogram?.valueColumn,
      headers,
      profile.columnCount,
      profile.rangeStartColumnIndex,
    );
    const valueColumnIndex = this.pickNumericColumn(profile.numericColumns, requestedValue);

    if (valueColumnIndex == null) {
      throw new SheetsClientError(
        'Histogram needs exactly one numeric value column. Select one numeric column for distribution.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_HISTOGRAM', retryable: false },
      );
    }

    const distinctNumericCols = profile.numericColumns.filter((c) => c !== valueColumnIndex);
    if (distinctNumericCols.length > 0 && requestedValue == null) {
      throw new SheetsClientError(
        'Histogram works with one numeric series. Select only one numeric column or specify which numeric column to use.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_HISTOGRAM', retryable: false },
      );
    }

    const bucketSize = Number(spec.histogram?.bucketSize);
    return {
      kind: 'histogram',
      headerCount: profile.headerCount,
      histogram: {
        valueColumnIndex,
        ...(Number.isFinite(bucketSize) && bucketSize > 0 ? { bucketSize } : {}),
      },
    };
  }

  private planPie(profile: SampleProfile, spec: ChartShapeValidationSpec): ChartShapePlan {
    const domainColumnIndex = this.pickDomainColumn(profile);
    const headers = this.safeHeaders(profile);
    const requestedSeries = Array.isArray(spec.series) ? spec.series : [];
    const preferred = requestedSeries
      .map((item) => this.resolveColumnSpecifier(item, headers, profile.columnCount, profile.rangeStartColumnIndex))
      .find((idx): idx is number => idx != null);
    const valueColumnIndex = this.pickNumericColumn(
      profile.numericColumns.filter((c) => c !== domainColumnIndex),
      preferred,
    );

    if (valueColumnIndex == null) {
      throw new SheetsClientError(
        'Pie charts need one label column and one numeric values column.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_PIE', retryable: false },
      );
    }

    const hasNegative = profile.rows.some((row) => {
      const v = this.parseNumeric(row[valueColumnIndex]);
      return typeof v === 'number' && Number.isFinite(v) && v < 0;
    });
    if (hasNegative) {
      throw new SheetsClientError(
        'Pie charts cannot use negative values. Select a non-negative values column.',
        { code: 'CHART_INCOMPATIBLE_SHAPE_PIE', retryable: false },
      );
    }

    return {
      kind: 'pie',
      headerCount: profile.headerCount,
      domainColumnIndex,
      seriesColumnIndexes: [valueColumnIndex],
    };
  }

  private requireAtLeastNumericSeries(
    profile: SampleProfile,
    minCount: number,
    code: string,
    message: string,
  ): void {
    const domainColumnIndex = this.pickDomainColumn(profile);
    const seriesCount = profile.numericColumns.filter((c) => c !== domainColumnIndex).length;
    if (seriesCount >= minCount) return;
    throw new SheetsClientError(message, { code, retryable: false });
  }

  private pickDomainColumn(profile: SampleProfile): number {
    if (profile.labelCandidateColumns.length) {
      const ranked = [...profile.labelCandidateColumns].sort((a, b) => {
        const sa = profile.statsByColumn[a] || { textLikeCount: 0, nonEmptyCount: 0, numericCount: 0 };
        const sb = profile.statsByColumn[b] || { textLikeCount: 0, nonEmptyCount: 0, numericCount: 0 };
        const scoreA = (sa.textLikeCount * 2) + sa.nonEmptyCount - (sa.numericCount * 0.25);
        const scoreB = (sb.textLikeCount * 2) + sb.nonEmptyCount - (sb.numericCount * 0.25);
        return scoreB - scoreA;
      });
      return ranked[0];
    }
    for (let c = 0; c < profile.columnCount; c += 1) {
      if (!profile.numericColumns.includes(c)) return c;
    }
    return 0;
  }

  private safeHeaders(profile: SampleProfile): string[] {
    if (profile.headers.length) return profile.headers;
    return new Array(profile.columnCount).fill(null).map((_, idx) => `Column ${idx + 1}`);
  }

  private mapToBasic(type: SheetsChartType): ChartShapePlan['basicChartType'] {
    if (type === 'COLUMN' || type === 'BAR' || type === 'LINE' || type === 'AREA' || type === 'SCATTER' || type === 'COMBO') {
      return type;
    }
    return undefined;
  }

  private resolveColumnSpecifier(
    specifier: string | number | undefined,
    headers: string[],
    columnCount: number,
    rangeStartColumnIndex = 0,
  ): number | null {
    if (specifier == null) return null;
    if (typeof specifier === 'number' && Number.isInteger(specifier)) {
      const idx = specifier > 0 ? specifier - 1 : specifier;
      return idx >= 0 && idx < columnCount ? idx : null;
    }
    const raw = String(specifier).trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      const idx = n > 0 ? n - 1 : n;
      return idx >= 0 && idx < columnCount ? idx : null;
    }
    if (/^[A-Z]{1,3}$/i.test(raw)) {
      const absIdx = this.columnLettersToIndex(raw.toUpperCase());
      const localIdx = absIdx - rangeStartColumnIndex;
      if (localIdx >= 0 && localIdx < columnCount) return localIdx;
      if (absIdx >= 0 && absIdx < columnCount) return absIdx;
      // Do not return early here: short alphabetic tokens may also be
      // semantic header hints (e.g. "NOI"), so allow fuzzy header matching below.
    }
    const norm = this.normalize(raw);
    for (let i = 0; i < headers.length; i += 1) {
      if (this.normalize(headers[i]) === norm) return i;
    }
    // Fuzzy fallback for natural-language selectors ("NOI" -> "NOI Improvement").
    // Keep this conservative to avoid surprising column picks.
    let bestIdx = -1;
    let bestScore = 0;
    const wantedTokens = norm.split(' ').map((t) => t.trim()).filter((t) => t.length >= 2);
    for (let i = 0; i < headers.length; i += 1) {
      const headerNorm = this.normalize(headers[i]);
      if (!headerNorm) continue;
      let score = 0;
      if (headerNorm.includes(norm) || norm.includes(headerNorm)) {
        const lenRatio = Math.min(headerNorm.length, norm.length) / Math.max(headerNorm.length, norm.length);
        score = 3 + lenRatio;
      } else if (wantedTokens.length) {
        const headerTokens = new Set(headerNorm.split(' ').map((t) => t.trim()).filter((t) => t.length >= 2));
        if (headerTokens.size) {
          let hits = 0;
          for (const token of wantedTokens) if (headerTokens.has(token)) hits += 1;
          if (hits > 0) score = hits / Math.max(1, wantedTokens.length);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= 0.6) return bestIdx;
    return null;
  }

  private pickNumericColumn(candidates: number[], preferred: number | null | undefined, optional = false): number | null {
    if (preferred != null && candidates.includes(preferred)) return preferred;
    if (candidates.length) return candidates[0];
    return optional ? null : null;
  }

  private resolveRequestedSeriesColumns(
    profile: SampleProfile,
    requestedSpecifiers: Array<string | number> | undefined,
    opts: {
      exclude?: number[];
      requireNumeric?: boolean;
      code: string;
      message: string;
    },
  ): number[] {
    const requested = Array.isArray(requestedSpecifiers) ? requestedSpecifiers : [];
    if (!requested.length) return [];
    const headers = this.safeHeaders(profile);
    const excludeSet = new Set(Array.isArray(opts.exclude) ? opts.exclude : []);
    const allowed = (opts.requireNumeric ? profile.numericColumns : new Array(profile.columnCount).fill(null).map((_, idx) => idx))
      .filter((idx) => !excludeSet.has(idx));
    const resolved = requested
      .map((item) => this.resolveColumnSpecifier(item, headers, profile.columnCount, profile.rangeStartColumnIndex))
      .filter((idx): idx is number => idx != null)
      .filter((idx) => allowed.includes(idx));
    const unique = Array.from(new Set(resolved));
    if (!unique.length) {
      throw new SheetsClientError(opts.message, {
        code: opts.code,
        retryable: false,
      });
    }
    return unique;
  }

  private parseNumeric(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const s = String(value ?? '').trim();
    if (!s) return null;
    let t = s.replace(/\s+/g, '');
    const isPct = t.endsWith('%');
    t = t.replace(/%$/, '');
    const isParenNeg = /^\(.*\)$/.test(t);
    t = t.replace(/[()]/g, '');
    t = t.replace(/[^\d,.\-]/g, '');
    if (!t) return null;
    const n = Number(t.replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    const signed = isParenNeg ? -Math.abs(n) : n;
    return isPct ? signed / 100 : signed;
  }

  private normalize(s: string): string {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private columnLettersToIndex(columnLetters: string): number {
    let result = 0;
    for (const char of columnLetters) {
      result = result * 26 + (char.charCodeAt(0) - 64);
    }
    return result - 1;
  }
}

export default ChartShapeValidatorService;
