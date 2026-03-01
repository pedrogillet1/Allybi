import { getOptionalBank } from "../core/banks/bankLoader.service";

type ChatLanguage = "en" | "pt" | "es";

type ProductHelpBank = {
  config?: {
    enabled?: boolean;
    defaultLanguage?: string;
    maxSnippetChars?: number;
  };
  topics?: Array<{
    id?: string;
    priority?: number;
    when?: {
      answerModes?: string[];
      fallbackReasonCodes?: string[];
      operators?: string[];
      intentFamilies?: string[];
      queryAny?: string[];
    };
    snippets?: Record<string, string> | string;
  }>;
};

export interface ProductHelpResolutionInput {
  queryText: string;
  language?: string | null;
  answerMode?: string | null;
  fallbackReasonCode?: string | null;
  operator?: string | null;
  intentFamily?: string | null;
  explicitTopic?: string | null;
}

export interface ProductHelpResolution {
  topic: string;
  snippet: string;
}

type ProductHelpTopicRule = {
  id: string;
  priority: number;
  when: {
    answerModes: string[];
    fallbackReasonCodes: string[];
    operators: string[];
    intentFamilies: string[];
    queryAny: string[];
  };
  snippets: Record<string, string>;
};

const FALLBACK_TOPIC_RULES: ProductHelpTopicRule[] = [
  {
    id: "limitations_memory_scope",
    priority: 120,
    when: {
      answerModes: ["general_answer", "help_steps"],
      fallbackReasonCodes: [
        "scope_hard_constraints_empty",
        "no_docs_indexed",
        "no_relevant_chunks_in_scoped_docs",
      ],
      operators: [],
      intentFamilies: ["documents", "help"],
      queryAny: ["where", "scope", "document", "not found", "missing"],
    },
    snippets: {
      en: "I can only use indexed documents in your current scope. Attach or select the right file, then retry.",
      pt: "Eu so posso usar documentos indexados no escopo atual. Anexe ou selecione o arquivo correto e tente novamente.",
      es: "Solo puedo usar documentos indexados en tu alcance actual. Adjunta o selecciona el archivo correcto e intentalo de nuevo.",
      any: "Use indexed documents in the current scope. Attach/select the correct file and retry.",
    },
  },
  {
    id: "docx_editing",
    priority: 90,
    when: {
      answerModes: ["help_steps"],
      fallbackReasonCodes: [],
      operators: ["help", "edit"],
      intentFamilies: ["help", "file_actions"],
      queryAny: ["docx", "edit", "paragraph", "format", "document"],
    },
    snippets: {
      en: "Editing is target-first: identify the exact paragraph/range, then apply the change with explicit scope.",
      pt: "A edicao comeca pelo alvo: identifique o paragrafo/intervalo exato e depois aplique a mudanca com escopo explicito.",
      es: "La edicion empieza por el objetivo: identifica el parrafo/rango exacto y luego aplica el cambio con alcance explicito.",
      any: "Editing is target-first: identify an exact range before applying changes.",
    },
  },
  {
    id: "xlsx_editing",
    priority: 80,
    when: {
      answerModes: ["help_steps"],
      fallbackReasonCodes: [],
      operators: ["help", "edit"],
      intentFamilies: ["help", "file_actions"],
      queryAny: ["xlsx", "sheet", "cell", "formula", "spreadsheet"],
    },
    snippets: {
      en: "Spreadsheet edits should include sheet and range (for example, Sheet1!A1:C5) to avoid unintended changes.",
      pt: "Edicoes em planilhas devem incluir aba e intervalo (por exemplo, Planilha1!A1:C5) para evitar mudancas indevidas.",
      es: "Las ediciones en hojas deben incluir hoja y rango (por ejemplo, Hoja1!A1:C5) para evitar cambios no deseados.",
      any: "Include sheet + range for spreadsheet edits to keep scope precise.",
    },
  },
];

function normalizeLanguage(value: unknown): ChatLanguage {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "pt" || normalized === "es") return normalized;
  return "en";
}

function normalizeCode(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => normalizeCode(value))
    .filter((value, idx, arr) => value.length > 0 && arr.indexOf(value) === idx);
}

function asSnippetMap(input: unknown): Record<string, string> {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? { any: trimmed } : {};
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = normalizeCode(key);
    const text = String(value || "").trim();
    if (!normalizedKey || !text) continue;
    out[normalizedKey] = text;
  }
  return out;
}

function chooseSnippet(
  snippets: Record<string, string>,
  language: ChatLanguage,
): string {
  return (
    snippets[language] ||
    snippets.any ||
    snippets.en ||
    snippets.pt ||
    snippets.es ||
    ""
  );
}

function buildRulesFromBank(bank: ProductHelpBank | null): ProductHelpTopicRule[] {
  if (!bank?.config?.enabled) return [];
  const source = Array.isArray(bank.topics) ? bank.topics : [];
  const out: ProductHelpTopicRule[] = [];

  for (const topic of source) {
    const id = String(topic?.id || "").trim();
    if (!id) continue;

    const snippets = asSnippetMap(topic?.snippets);
    if (!Object.keys(snippets).length) continue;

    out.push({
      id,
      priority: Number.isFinite(Number(topic?.priority))
        ? Number(topic?.priority)
        : 50,
      when: {
        answerModes: normalizeList(topic?.when?.answerModes),
        fallbackReasonCodes: normalizeList(topic?.when?.fallbackReasonCodes),
        operators: normalizeList(topic?.when?.operators),
        intentFamilies: normalizeList(topic?.when?.intentFamilies),
        queryAny: normalizeList(topic?.when?.queryAny),
      },
      snippets,
    });
  }

  return out;
}

function scoreRule(
  rule: ProductHelpTopicRule,
  ctx: {
    answerMode: string;
    fallbackReasonCode: string;
    operator: string;
    intentFamily: string;
    queryText: string;
  },
): number {
  let score = rule.priority;

  if (rule.when.answerModes.length > 0) {
    if (!rule.when.answerModes.includes(ctx.answerMode)) return -1;
    score += 30;
  }

  if (rule.when.fallbackReasonCodes.length > 0) {
    if (!rule.when.fallbackReasonCodes.includes(ctx.fallbackReasonCode)) {
      return -1;
    }
    score += 40;
  }

  if (rule.when.operators.length > 0) {
    if (!rule.when.operators.includes(ctx.operator)) return -1;
    score += 12;
  }

  if (rule.when.intentFamilies.length > 0) {
    if (!rule.when.intentFamilies.includes(ctx.intentFamily)) return -1;
    score += 10;
  }

  if (rule.when.queryAny.length > 0) {
    const hit = rule.when.queryAny.some((term) => ctx.queryText.includes(term));
    if (!hit) return -1;
    score += 8;
  }

  return score;
}

export class ProductHelpService {
  resolve(params: ProductHelpResolutionInput): ProductHelpResolution | null {
    const queryText = normalizeCode(params.queryText);
    const answerMode = normalizeCode(params.answerMode);
    const fallbackReasonCode = normalizeCode(params.fallbackReasonCode);
    const operator = normalizeCode(params.operator);
    const intentFamily = normalizeCode(params.intentFamily);
    const explicitTopic = String(params.explicitTopic || "").trim();

    const bank = getOptionalBank<ProductHelpBank>("koda_product_help");
    const maxChars = Math.max(80, Number(bank?.config?.maxSnippetChars ?? 280));
    const language = normalizeLanguage(
      params.language || bank?.config?.defaultLanguage || "en",
    );

    const allRules = [
      ...buildRulesFromBank(bank),
      ...FALLBACK_TOPIC_RULES,
    ];

    if (explicitTopic) {
      const explicit = allRules.find((rule) => rule.id === explicitTopic);
      if (explicit) {
        const snippet = chooseSnippet(explicit.snippets, language);
        if (snippet) {
          return {
            topic: explicit.id,
            snippet: snippet.slice(0, maxChars).trim(),
          };
        }
      }
    }

    let best: { score: number; rule: ProductHelpTopicRule } | null = null;
    for (const rule of allRules) {
      const score = scoreRule(rule, {
        answerMode,
        fallbackReasonCode,
        operator,
        intentFamily,
        queryText,
      });
      if (score < 0) continue;
      if (!best || score > best.score) {
        best = { score, rule };
      }
    }

    if (!best) return null;

    const snippet = chooseSnippet(best.rule.snippets, language)
      .slice(0, maxChars)
      .trim();
    if (!snippet) return null;

    return {
      topic: best.rule.id,
      snippet,
    };
  }
}

let singleton: ProductHelpService | null = null;

export function getProductHelpService(): ProductHelpService {
  if (!singleton) singleton = new ProductHelpService();
  return singleton;
}
