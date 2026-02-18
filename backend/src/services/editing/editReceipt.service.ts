import type { LanguageCode } from "../../types/common.types";
import type { EditAction, EditReceipt } from "./editing.types";
import { getOptionalBank } from "../core/banks/bankLoader.service";

export interface EditReceiptInput {
  stage: EditReceipt["stage"] | "noop";
  language?: LanguageCode;
  documentId: string;
  targetId?: string;
  locationLabel?: string;
  note?: string;
  operator?: string;
  domain?: string;
}

const LABELS: Record<LanguageCode, Record<EditAction["kind"], string>> = {
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

export class EditReceiptService {
  private resolveOperatorStageNote(
    stage: "preview" | "applied" | "blocked",
    language: LanguageCode,
    operator?: string,
  ): string {
    const bank = getOptionalBank<any>("editing_microcopy");
    const loc = String(language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
    const fallbackLang = String(bank?.config?.fallbackLanguage || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
    const op = String(operator || "").trim().toUpperCase();
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

  private resolveStageNote(stage: "preview" | "applied" | "blocked", language: LanguageCode): string {
    const bank = getOptionalBank<any>("editing_microcopy");
    const copy = bank?.copy?.[stage];
    const fallbackLang = String(bank?.config?.fallbackLanguage || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
    const loc = String(language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
    const fromLocalized = String(copy?.[loc]?.body || "").trim();
    if (fromLocalized) return fromLocalized;
    const fromFallback = String(copy?.[fallbackLang]?.body || "").trim();
    if (fromFallback) return fromFallback;
    return "";
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
        note:
          input.note ||
          this.resolveOperatorStageNote("preview", lang, input.operator) ||
          this.resolveStageNote("preview", lang),
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
        note:
          input.note ||
          this.resolveOperatorStageNote("applied", lang, input.operator) ||
          this.resolveStageNote("applied", lang),
      };
    }

    if (input.stage === "noop") {
      return {
        stage: "noop",
        actions: [
          this.action("open_doc", lang, { documentId: input.documentId }),
        ],
        note: input.note || this.resolveStageNote("applied", lang),
      };
    }

    return {
      stage: "blocked",
      actions: [
        this.action("confirm", lang),
        this.action("cancel", lang),
        this.action("pick_target", lang, { documentId: input.documentId }),
      ],
      note:
        input.note ||
        this.resolveOperatorStageNote("blocked", lang, input.operator) ||
        this.resolveStageNote("blocked", lang),
    };
  }

  private action(
    kind: EditAction["kind"],
    language: LanguageCode,
    payload?: Record<string, unknown>,
  ): EditAction {
    return {
      kind,
      label: LABELS[language]?.[kind] || LABELS.en[kind],
      payload,
    };
  }
}
