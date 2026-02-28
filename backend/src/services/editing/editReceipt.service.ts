import type { LanguageCode } from "../../types/common.types";
import type { EditAction, EditReceipt } from "./editing.types";
import { getOptionalBank } from "../core/banks/bankLoader.service";

export interface EditReceiptInput {
  stage: EditReceipt["stage"] | "noop" | "undo";
  language?: LanguageCode;
  documentId: string;
  targetId?: string;
  locationLabel?: string;
  note?: string;
  operator?: string;
  canonicalOperator?: string;
  domain?: string;
  templateContext?: Record<string, string>;
}

const LABELS_FALLBACK: Record<string, Record<string, string>> = {
  en: {
    confirm: "Confirm",
    cancel: "Cancel",
    pick_target: "Pick different target",
    undo: "Undo",
    open_doc: "Open doc",
    go_to_location: "Go to location",
    export: "Export",
  },
  pt: {
    confirm: "Confirmar",
    cancel: "Cancelar",
    pick_target: "Escolher outro alvo",
    undo: "Desfazer",
    open_doc: "Abrir documento",
    go_to_location: "Ir para local",
    export: "Exportar",
  },
  es: {
    confirm: "Confirmar",
    cancel: "Cancelar",
    pick_target: "Elegir otro objetivo",
    undo: "Deshacer",
    open_doc: "Abrir documento",
    go_to_location: "Ir a ubicación",
    export: "Exportar",
  },
};

function interpolateTemplate(
  template: string,
  params?: Record<string, string>,
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const val = params[key];
    return val == null ? "" : String(val);
  });
}

function resolveLang(language?: LanguageCode): "en" | "pt" {
  return String(language || "en")
    .toLowerCase()
    .startsWith("pt")
    ? "pt"
    : "en";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTemplateContext(
  plan: { canonicalOperator?: string } & Record<string, any>,
): Record<string, string> {
  const cop = String(plan.canonicalOperator || "").toUpperCase();
  const ctx: Record<string, string> = {};
  const s = (key: string) => {
    const v = plan?.[key] ?? plan?.metadata?.[key];
    return v != null ? String(v) : "";
  };

  switch (cop) {
    case "DOCX_CREATE_TABLE":
      ctx.rowCount = s("rowCount") || s("rows");
      ctx.colCount = s("colCount") || s("cols");
      break;
    case "DOCX_SET_HEADING_LEVEL":
      ctx.headingLevel = s("headingLevel") || s("level");
      break;
    case "DOCX_TRANSLATE_SCOPE":
      ctx.scopeLabel = s("scopeLabel") || s("scope");
      ctx.targetLanguage = s("targetLanguage") || s("language");
      break;
    case "DOCX_SET_RUN_STYLE":
      ctx.styleDetail = s("styleDetail") || s("style");
      break;
    case "XLSX_ADD_SHEET":
    case "XLSX_DELETE_SHEET":
      ctx.sheetName = s("sheetName");
      break;
    case "XLSX_RENAME_SHEET":
      ctx.newSheetName = s("newSheetName") || s("sheetName");
      break;
    case "XLSX_CHART_CREATE":
      ctx.chartType = s("chartType");
      ctx.sourceRange = s("sourceRange") || s("rangeA1");
      break;
    case "XLSX_SORT_RANGE":
      ctx.sortRange = s("sortRange") || s("rangeA1");
      break;
    case "XLSX_FILTER_APPLY":
      ctx.filterRange = s("filterRange") || s("rangeA1");
      break;
    case "XLSX_INSERT_ROWS":
    case "XLSX_DELETE_ROWS":
      ctx.rowCount = s("rowCount") || s("count") || "1";
      break;
  }
  return ctx;
}

export class EditReceiptService {
  private resolveCanonicalOperatorStageNote(
    stage: string,
    language: LanguageCode,
    canonicalOperator?: string,
  ): string {
    if (!canonicalOperator) return "";
    const bank = getOptionalBank<any>("editing_microcopy");
    const loc = resolveLang(language);
    const fallbackLang = resolveLang(bank?.config?.fallbackLanguage);
    const cop = String(canonicalOperator).trim().toUpperCase();
    if (!cop) return "";
    const body = String(
      bank?.copy?.byCanonicalOperator?.[stage]?.[cop]?.[loc]?.body ||
        bank?.copy?.byCanonicalOperator?.[stage]?.[cop]?.[fallbackLang]?.body ||
        "",
    ).trim();
    return body;
  }

  private resolveOperatorStageNote(
    stage: string,
    language: LanguageCode,
    operator?: string,
  ): string {
    const bank = getOptionalBank<any>("editing_microcopy");
    const loc = resolveLang(language);
    const fallbackLang = resolveLang(bank?.config?.fallbackLanguage);
    const op = String(operator || "")
      .trim()
      .toUpperCase();
    if (!op) return "";
    const fromOperator = String(
      bank?.copy?.byOperator?.[stage]?.[op]?.[loc]?.body ||
        bank?.copy?.byOperator?.[stage]?.[op]?.[fallbackLang]?.body ||
        bank?.copy?.byOperator?.[stage]?.["*"]?.[loc]?.body ||
        bank?.copy?.byOperator?.[stage]?.["*"]?.[fallbackLang]?.body ||
        "",
    ).trim();
    return fromOperator;
  }

  private resolveStageNote(stage: string, language: LanguageCode): string {
    const bank = getOptionalBank<any>("editing_microcopy");
    const copy = bank?.copy?.[stage];
    const fallbackLang = resolveLang(bank?.config?.fallbackLanguage);
    const loc = resolveLang(language);
    const fromLocalized = String(copy?.[loc]?.body || "").trim();
    if (fromLocalized) return fromLocalized;
    const fromFallback = String(copy?.[fallbackLang]?.body || "").trim();
    if (fromFallback) return fromFallback;
    return "";
  }

  private resolveNote(input: EditReceiptInput, lang: LanguageCode): string {
    if (input.note)
      return interpolateTemplate(input.note, input.templateContext);
    const stage = input.stage === "undo" ? "undo" : input.stage;
    // 3-tier lookup: canonical → runtime → generic
    const fromCanonical = this.resolveCanonicalOperatorStageNote(
      stage,
      lang,
      input.canonicalOperator,
    );
    if (fromCanonical)
      return interpolateTemplate(fromCanonical, input.templateContext);
    const fromOperator = this.resolveOperatorStageNote(
      stage,
      lang,
      input.operator,
    );
    if (fromOperator)
      return interpolateTemplate(fromOperator, input.templateContext);
    return interpolateTemplate(
      this.resolveStageNote(stage, lang),
      input.templateContext,
    );
  }

  build(input: EditReceiptInput): EditReceipt {
    const lang = input.language || "en";

    if (input.stage === "preview") {
      return {
        stage: "preview",
        actions: [
          this.action("confirm", lang),
          this.action("cancel", lang),
          this.action("pick_target", lang, { documentId: input.documentId }),
        ],
        note: this.resolveNote(input, lang),
      };
    }

    if (input.stage === "applied") {
      return {
        stage: "applied",
        actions: [
          this.action("undo", lang),
          this.action("open_doc", lang, { documentId: input.documentId }),
          this.action("go_to_location", lang, {
            documentId: input.documentId,
            targetId: input.targetId,
            label: input.locationLabel,
          }),
          this.action("export", lang),
        ],
        note: this.resolveNote(input, lang),
      };
    }

    if (input.stage === "noop") {
      return {
        stage: "noop",
        actions: [
          this.action("open_doc", lang, { documentId: input.documentId }),
        ],
        note: this.resolveNote(input, lang),
      };
    }

    if (input.stage === "undo") {
      return {
        stage: "applied",
        actions: [
          this.action("open_doc", lang, { documentId: input.documentId }),
        ],
        note: this.resolveNote(input, lang),
      };
    }

    return {
      stage: "blocked",
      actions: [
        this.action("confirm", lang),
        this.action("cancel", lang),
        this.action("pick_target", lang, { documentId: input.documentId }),
      ],
      note: this.resolveNote(input, lang),
    };
  }

  private action(
    kind: EditAction["kind"],
    language: LanguageCode,
    payload?: Record<string, unknown>,
  ): EditAction {
    const bank = getOptionalBank<any>("editing_microcopy");
    const loc = resolveLang(language);
    const bankLabel = bank?.copy?.actionLabels?.[loc]?.[kind];
    return {
      kind,
      label:
        bankLabel ||
        LABELS_FALLBACK[language]?.[kind] ||
        LABELS_FALLBACK.en[kind],
      payload,
    };
  }
}
