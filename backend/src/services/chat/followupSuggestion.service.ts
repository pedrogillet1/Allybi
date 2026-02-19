import { getOptionalBank } from "../core/banks/bankLoader.service";

type LanguageCode = "en" | "pt" | "es";

export type FollowupSuggestion = { label: string; query: string };

type SourceRef = {
  documentId: string;
  filename: string;
  mimeType: string | null;
  page: number | null;
};

export type FollowupSuggestionInput = {
  lang: LanguageCode;
  answerMode: string;
  answerClass: string;
  intent?: string | null;
  query: string;
  answerText: string;
  sources?: SourceRef[];
  operator?: string | null;
  intentFamily?: string | null;
  isViewerVariant?: boolean;
};

type FollowupRule = {
  when?: {
    all?: Array<{ path: string; op: string; value?: unknown }>;
    any?: Array<{ path: string; op: string; value?: unknown }>;
  };
  suggestions?: Record<string, Array<{ label: string; query: string }>>;
};

type FollowupBank = {
  config?: {
    enabled?: boolean;
    maxFollowups?: number;
    suppressInAnswerModes?: string[];
    requireDocumentEvidence?: boolean;
    allowGenericFallback?: boolean;
  };
  rules?: FollowupRule[];
};

type RuntimeSignals = {
  answerMode: string;
  answerClass: string;
  intent: string;
  operator: string | null;
  intentFamily: string | null;
  isViewerVariant: boolean;
  hasSources: boolean;
  hasMultiSources: boolean;
  docType: "xlsx" | "docx" | "pdf" | "pptx" | "other";
  primaryDocumentTitle: string;
  facet: {
    hasNumbers: boolean;
    hasLocation: boolean;
    hasComparison: boolean;
    hasDefinitions: boolean;
    hasTimeline: boolean;
    hasSummary: boolean;
    hasRisk: boolean;
    hasActionItems: boolean;
  };
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function inferDocType(
  source: SourceRef | null | undefined,
): RuntimeSignals["docType"] {
  if (!source) return "other";
  const mime = normalizeLower(source.mimeType);
  const name = normalizeLower(source.filename);
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";

  if (
    mime.includes("spreadsheet") ||
    mime.includes("spreadsheetml") ||
    mime.includes("excel") ||
    mime.includes("sheet") ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return "xlsx";
  }
  if (
    mime.includes("presentation") ||
    mime.includes("presentationml") ||
    mime.includes("powerpoint") ||
    ext === "pptx" ||
    ext === "ppt"
  ) {
    return "pptx";
  }
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    mime.includes("word") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return "docx";
  }
  return "other";
}

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanDocumentTitle(filename: string): string {
  const raw = normalizeText(filename).split(/[\\/]/).pop() || "this document";
  const noExt = raw.replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, "").trim();
  const out = compactSpaces(noExt || raw);
  return out.length > 56 ? `${out.slice(0, 56).trimEnd()}...` : out;
}

function isTrueLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const low = normalizeLower(value);
  return low === "true" || low === "1" || low === "yes";
}

function asStringSet(values: unknown): Set<string> {
  if (!Array.isArray(values)) return new Set<string>();
  return new Set(values.map((v) => normalizeText(v)).filter(Boolean));
}

export class FollowupSuggestionService {
  constructor(
    private readonly bankLoader: () => FollowupBank | null = () =>
      getOptionalBank<FollowupBank>("followup_suggestions"),
  ) {}

  select(input: FollowupSuggestionInput): FollowupSuggestion[] {
    const bank = this.bankLoader();
    const config = bank?.config || {};
    if (config.enabled === false) return [];

    const suppressModes = asStringSet(config.suppressInAnswerModes);
    if (suppressModes.has(input.answerMode)) return [];

    const max = Math.max(0, Math.min(6, Number(config.maxFollowups ?? 3) || 3));
    if (max <= 0) return [];

    const signals = this.buildSignals(input);
    const requireDocumentEvidence = config.requireDocumentEvidence !== false;
    if (requireDocumentEvidence && !this.isDocumentQuery(signals)) return [];

    const rules = Array.isArray(bank?.rules) ? bank!.rules! : [];
    const langKey: LanguageCode = input.lang || "en";
    const output: FollowupSuggestion[] = [];

    for (const rule of rules) {
      if (!this.matchRule(rule, signals)) continue;
      const suggestions =
        rule.suggestions?.[langKey] ?? rule.suggestions?.en ?? [];
      if (!Array.isArray(suggestions)) continue;

      for (const s of suggestions) {
        const rendered = this.renderSuggestion(s, signals.primaryDocumentTitle);
        if (!rendered) continue;
        output.push(rendered);
      }
    }

    const deduped: FollowupSuggestion[] = [];
    const seen = new Set<string>();
    for (const item of output) {
      const key = normalizeLower(item.query);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= max) break;
    }

    if (deduped.length > 0) return deduped;
    return [];
  }

  private isDocumentQuery(signals: RuntimeSignals): boolean {
    return (
      signals.answerClass === "DOCUMENT" &&
      signals.answerMode.startsWith("doc_grounded") &&
      signals.intent === "RAG_QUERY" &&
      signals.hasSources
    );
  }

  private renderSuggestion(
    suggestion: { label: string; query: string },
    documentTitle: string,
  ): FollowupSuggestion | null {
    const fallbackDoc = documentTitle || "this document";
    const label = compactSpaces(
      normalizeText(suggestion.label).replace(
        /\{\{\s*document\s*\}\}/gi,
        fallbackDoc,
      ),
    );
    const query = compactSpaces(
      normalizeText(suggestion.query).replace(
        /\{\{\s*document\s*\}\}/gi,
        fallbackDoc,
      ),
    );
    if (!label || !query) return null;
    return { label, query };
  }

  private matchRule(rule: FollowupRule, signals: RuntimeSignals): boolean {
    const when = rule?.when;
    if (!when || typeof when !== "object") return false;
    if (Array.isArray(when.all) && when.all.length > 0) {
      return when.all.every((cond) => this.evalCond(cond, signals));
    }
    if (Array.isArray(when.any) && when.any.length > 0) {
      return when.any.some((cond) => this.evalCond(cond, signals));
    }
    return false;
  }

  private evalCond(
    cond: { path: string; op: string; value?: unknown },
    signals: RuntimeSignals,
  ): boolean {
    const actual = this.getPath(signals, normalizeText(cond.path));
    const op = normalizeText(cond.op);
    const expected = cond.value;

    if (op === "eq") {
      if (typeof expected === "boolean") return Boolean(actual) === expected;
      if (typeof expected === "number") return Number(actual) === expected;
      return normalizeText(actual) === normalizeText(expected);
    }
    if (op === "startsWith") {
      return normalizeText(actual).startsWith(normalizeText(expected));
    }
    if (op === "contains") {
      return normalizeText(actual).includes(normalizeText(expected));
    }
    if (op === "truthy") {
      return isTrueLike(actual);
    }
    return false;
  }

  private getPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== "object" || !path) return undefined;
    const parts = path.split(".");
    let cur: any = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[part];
    }
    return cur;
  }

  private buildSignals(input: FollowupSuggestionInput): RuntimeSignals {
    const sources = Array.isArray(input.sources) ? input.sources : [];
    const topSource = sources[0] || null;
    const docType = inferDocType(topSource);
    const primaryDocumentTitle = topSource
      ? cleanDocumentTitle(topSource.filename)
      : "this document";
    const query = normalizeLower(input.query);
    const answer = normalizeLower(input.answerText);
    const combined = `${query}\n${answer}`;

    const hasNumbers =
      /(?:\b\d[\d,.]*\b|%|(?:\$|€|£)\s*\d|usd\b|eur\b|brl\b|r\$)/i.test(
        combined,
      );
    const hasLocation =
      /\b(where|page|section|line|paragraph|clause|article|onde|p[aá]gina|se[cç][aã]o|linha|cl[aá]usula|artigo|d[oó]nde|secci[oó]n|l[ií]nea|art[ií]culo)\b/i.test(
        combined,
      ) || sources.some((s) => typeof s.page === "number" && s.page > 0);
    const hasComparison =
      /\b(compare|comparison|versus|vs\.?|difference|different|contradict|comparar|diferen[cç]a|diferente|comparaci[oó]n|diferencia)\b/i.test(
        combined,
      );
    const hasDefinitions =
      /\b(definition|define|meaning|term|clause|obligation|provision|defini[cç][aã]o|termo|cl[aá]usula|obriga[cç][aã]o|definici[oó]n|t[eé]rmino|obligaci[oó]n|disposici[oó]n)\b/i.test(
        combined,
      );
    const hasTimeline =
      /\b(date|timeline|deadline|milestone|schedule|when|prazo|cronograma|data|marco|fecha|plazo)\b/i.test(
        combined,
      ) ||
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
        combined,
      ) ||
      /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(combined);
    const hasSummary =
      /\b(summary|summari[sz]e|key points|takeaways|overview|resumo|resumir|resumen|resumir|explica|explain)\b/i.test(
        combined,
      );
    const hasRisk =
      /\b(risk|issue|concern|red flag|risco|problema|alerta|riesgo|se[ñn]al)\b/i.test(
        combined,
      );
    const hasActionItems =
      /\b(next step|action items?|todo|what should|pr[oó]ximo passo|a[cç][aã]o|siguiente paso|acci[oó]n)\b/i.test(
        combined,
      );

    const uniqueSourceIds = new Set(
      sources.map((s) => normalizeText(s.documentId)).filter(Boolean),
    );

    return {
      answerMode: normalizeText(input.answerMode),
      answerClass: normalizeText(input.answerClass),
      intent: normalizeText(input.intent || ""),
      operator: input.operator ? normalizeText(input.operator) : null,
      intentFamily: input.intentFamily
        ? normalizeText(input.intentFamily)
        : null,
      isViewerVariant: Boolean(input.isViewerVariant),
      hasSources: sources.length > 0,
      hasMultiSources: uniqueSourceIds.size > 1,
      docType,
      primaryDocumentTitle,
      facet: {
        hasNumbers,
        hasLocation,
        hasComparison,
        hasDefinitions,
        hasTimeline,
        hasSummary,
        hasRisk,
        hasActionItems,
      },
    };
  }
}
