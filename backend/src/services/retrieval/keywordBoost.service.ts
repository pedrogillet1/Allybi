/**
 * Keyword Boost Service
 * Detects query keywords and boosts relevant document types for better retrieval
 *
 * COVERAGE:
 * - Finance/metrics → boost XLSX spreadsheets
 * - Presentation keywords → boost PPTX slides
 * - Legal/contract terms → boost PDF contracts
 * - Time/month references → boost spreadsheets with temporal data
 * - Technical terms → boost technical docs
 * - File type mentions → boost matching mimeTypes
 */

export interface KeywordMatch {
  category: string;
  keywords: string[];
  boostMimeTypes: string[];
  boostFactor: number;
}

export interface KeywordBoostResult {
  hasMatch: boolean;
  matches: KeywordMatch[];
  mimeTypeBoosts: Map<string, number>; // mimeType → boost factor
  detectedKeywords: string[];
  shouldPrioritizeSpreadsheet: boolean;
  shouldPrioritizeSlides: boolean;
  shouldPrioritizePDF: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD CATEGORIES - Comprehensive coverage for all query types
// ═══════════════════════════════════════════════════════════════════════════

const KEYWORD_CATEGORIES: Record<
  string,
  {
    keywords: string[];
    boostMimeTypes: string[];
    boostFactor: number;
  }
> = {
  // ─────────────────────────────────────────────────────────────────────────
  // FINANCE & METRICS (→ Spreadsheets)
  // ─────────────────────────────────────────────────────────────────────────
  finance_metrics: {
    keywords: [
      // Core financial metrics
      "ebitda",
      "ebit",
      "revenue",
      "profit",
      "loss",
      "income",
      "expense",
      "margin",
      "roi",
      "roe",
      "roa",
      "roce",
      "cagr",
      "npv",
      "irr",
      // Portuguese
      "receita",
      "lucro",
      "prejuízo",
      "margem",
      "despesa",
      "custo",
      "faturamento",
      "rentabilidade",
      "retorno",
      // Budget/forecast
      "budget",
      "forecast",
      "actual",
      "variance",
      "orçamento",
      "previsão",
      // P&L specific
      "p&l",
      "pnl",
      "balance",
      "balanço",
      "dre",
      "demonstrativo",
    ],
    boostMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    boostFactor: 2.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPORAL/MONTH REFERENCES (→ Spreadsheets)
  // ─────────────────────────────────────────────────────────────────────────
  temporal: {
    keywords: [
      // Months EN
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
      "jan",
      "feb",
      "mar",
      "apr",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
      // Months PT
      "janeiro",
      "fevereiro",
      "março",
      "abril",
      "maio",
      "junho",
      "julho",
      "agosto",
      "setembro",
      "outubro",
      "novembro",
      "dezembro",
      // Quarters
      "q1",
      "q2",
      "q3",
      "q4",
      "quarter",
      "trimestre",
      // Years
      "2024",
      "2025",
      "2023",
      "2022",
      // Time comparisons
      "ytd",
      "mtd",
      "yoy",
      "mom",
      "year-over-year",
      "month-over-month",
      "mensal",
      "anual",
      "trimestral",
      "monthly",
      "yearly",
      "quarterly",
      // Generic temporal PT (for follow-ups like "qual mês", "ano passado")
      "mês",
      "mes",
      "ano",
      "semana",
      "dia",
      "virada",
      "pico",
      "outlier",
      "crescimento",
      "queda",
      "aumento",
      "redução",
      "tendência",
      "tendencia",
    ],
    boostMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    boostFactor: 2.0,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SPREADSHEET OPERATIONS (→ Spreadsheets)
  // ─────────────────────────────────────────────────────────────────────────
  spreadsheet_ops: {
    keywords: [
      // Operations
      "sum",
      "average",
      "total",
      "count",
      "max",
      "min",
      "mean",
      "soma",
      "média",
      "total",
      "contagem",
      "máximo",
      "mínimo",
      // Structure
      "column",
      "row",
      "cell",
      "sheet",
      "tab",
      "table",
      "coluna",
      "linha",
      "célula",
      "aba",
      "planilha",
      "tabela",
      // Comparisons
      "highest",
      "lowest",
      "best",
      "worst",
      "top",
      "bottom",
      "maior",
      "menor",
      "melhor",
      "pior",
      // Spreadsheet file mentions
      "spreadsheet",
      "excel",
      "xlsx",
      "xls",
    ],
    boostMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    boostFactor: 2.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PRESENTATION/SLIDES (→ PowerPoint)
  // ─────────────────────────────────────────────────────────────────────────
  presentation: {
    keywords: [
      "slide",
      "slides",
      "presentation",
      "powerpoint",
      "pptx",
      "ppt",
      "apresentação",
      "apresentacao",
      "lâmina",
      "lamina",
      "deck",
      "pitch",
    ],
    boostMimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ],
    boostFactor: 2.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEGAL/CONTRACTS (→ PDF/DOCX)
  // ─────────────────────────────────────────────────────────────────────────
  legal: {
    keywords: [
      "contract",
      "agreement",
      "clause",
      "term",
      "liability",
      "warranty",
      "contrato",
      "cláusula",
      "termo",
      "garantia",
      "responsabilidade",
      "nda",
      "msa",
      "sla",
      "sow",
      "amendment",
      "addendum",
      "legal",
      "juridico",
      "jurídico",
    ],
    boostMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    boostFactor: 1.8,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DOCUMENT STRUCTURE (→ PDF/DOCX)
  // ─────────────────────────────────────────────────────────────────────────
  document_structure: {
    keywords: [
      "page",
      "chapter",
      "section",
      "paragraph",
      "appendix",
      "annex",
      "página",
      "capítulo",
      "seção",
      "parágrafo",
      "apêndice",
      "anexo",
      "pdf",
      "document",
      "documento",
      "report",
      "relatório",
    ],
    boostMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    boostFactor: 1.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PROJECT MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  project: {
    keywords: [
      "project",
      "projeto",
      "milestone",
      "deadline",
      "timeline",
      "cronograma",
      "stakeholder",
      "risk",
      "risco",
      "scope",
      "escopo",
      "sprint",
      "scrum",
      "agile",
      "kanban",
      "backlog",
      "deliverable",
      "entrega",
      "phase",
      "fase",
    ],
    boostMimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/pdf",
    ],
    boostFactor: 1.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TECHNICAL/INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────
  technical: {
    keywords: [
      "api",
      "integration",
      "integração",
      "endpoint",
      "webhook",
      "authentication",
      "autenticação",
      "oauth",
      "token",
      "configuration",
      "configuração",
      "setup",
      "install",
      "guide",
      "guia",
      "documentation",
      "documentação",
      "manual",
    ],
    boostMimeTypes: [
      "application/pdf",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    boostFactor: 1.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MARKETING/SERVICES
  // ─────────────────────────────────────────────────────────────────────────
  marketing: {
    keywords: [
      "marketing",
      "service",
      "serviço",
      "product",
      "produto",
      "customer",
      "cliente",
      "brand",
      "marca",
      "intangibility",
      "intangibilidade",
      "perishability",
      "perecibilidade",
      "campaign",
      "campanha",
      "strategy",
      "estratégia",
    ],
    boostMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    boostFactor: 1.5,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IMAGE/VISUAL (→ Images)
  // ─────────────────────────────────────────────────────────────────────────
  visual: {
    keywords: [
      "image",
      "imagem",
      "photo",
      "foto",
      "picture",
      "screenshot",
      "diagram",
      "diagrama",
      "chart",
      "gráfico",
      "graph",
      "png",
      "jpg",
      "jpeg",
      "gif",
    ],
    boostMimeTypes: ["image/png", "image/jpeg", "image/gif"],
    boostFactor: 2.0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD BOOST SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class KeywordBoostService {
  /**
   * Analyze query and detect keyword matches for boosting
   */
  public detectKeywords(query: string): KeywordBoostResult {
    const queryLower = query.toLowerCase();
    const matches: KeywordMatch[] = [];
    const detectedKeywords: string[] = [];
    const mimeTypeBoosts = new Map<string, number>();

    // Check each category for keyword matches
    for (const [category, config] of Object.entries(KEYWORD_CATEGORIES)) {
      const matchedKeywords: string[] = [];

      for (const keyword of config.keywords) {
        // Use word boundary matching for accuracy
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, "i");
        if (regex.test(queryLower)) {
          matchedKeywords.push(keyword);
          detectedKeywords.push(keyword);
        }
      }

      if (matchedKeywords.length > 0) {
        matches.push({
          category,
          keywords: matchedKeywords,
          boostMimeTypes: config.boostMimeTypes,
          boostFactor: config.boostFactor,
        });

        // Accumulate mimeType boosts (take max if multiple categories boost same type)
        for (const mimeType of config.boostMimeTypes) {
          const currentBoost = mimeTypeBoosts.get(mimeType) || 1.0;
          mimeTypeBoosts.set(
            mimeType,
            Math.max(currentBoost, config.boostFactor),
          );
        }
      }
    }

    // Determine priority flags
    const xlsxMime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const pptxMime =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const pdfMime = "application/pdf";

    return {
      hasMatch: matches.length > 0,
      matches,
      mimeTypeBoosts,
      detectedKeywords,
      shouldPrioritizeSpreadsheet: (mimeTypeBoosts.get(xlsxMime) || 0) >= 2.0,
      shouldPrioritizeSlides: (mimeTypeBoosts.get(pptxMime) || 0) >= 2.0,
      shouldPrioritizePDF: (mimeTypeBoosts.get(pdfMime) || 0) >= 1.5,
    };
  }

  /**
   * Apply keyword boosts to retrieved chunks based on their document mimeType
   */
  public applyBoosts(
    chunks: Array<{
      documentId: string;
      score: number;
      mimeType?: string;
      metadata?: any;
    }>,
    boostResult: KeywordBoostResult,
  ): Array<{
    documentId: string;
    score: number;
    mimeType?: string;
    metadata?: any;
  }> {
    if (!boostResult.hasMatch) {
      return chunks;
    }

    return chunks.map((chunk) => {
      const mimeType = chunk.mimeType || chunk.metadata?.mimeType || "";
      const boost = boostResult.mimeTypeBoosts.get(mimeType) || 1.0;

      if (boost > 1.0) {
        console.log(
          `[KeywordBoost] Boosting chunk from ${mimeType} by ${boost}x (keywords: ${boostResult.detectedKeywords.slice(0, 3).join(", ")})`,
        );
      }

      return {
        ...chunk,
        score: chunk.score * boost,
      };
    });
  }

  /**
   * Get additional search terms based on detected keywords
   * This helps BM25 search find relevant documents
   */
  public getExpandedSearchTerms(
    query: string,
    boostResult: KeywordBoostResult,
  ): string[] {
    const terms: string[] = [];

    // Add file type hints for spreadsheet queries
    if (boostResult.shouldPrioritizeSpreadsheet) {
      terms.push("Sheet", "Row", "xlsx", "spreadsheet");
    }

    // Add slide hints for presentation queries
    if (boostResult.shouldPrioritizeSlides) {
      terms.push("Slide", "pptx", "presentation");
    }

    return terms;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Export singleton for convenience
export const keywordBoostService = new KeywordBoostService();
export default KeywordBoostService;
