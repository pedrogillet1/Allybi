import type { LanguageCode } from "../../types/common.types";
import type { EditAction, EditReceipt } from "./editing.types";

export interface EditReceiptInput {
  stage: EditReceipt["stage"];
  language?: LanguageCode;
  documentId: string;
  targetId?: string;
  locationLabel?: string;
  note?: string;
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
        note: input.note || "Preview generated. No document content changed yet.",
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
        note: input.note || "Edit was committed as a new revision.",
      };
    }

    return {
      stage: "blocked",
      actions: [
        this.action("confirm", lang),
        this.action("cancel", lang),
        this.action("pick_target", lang, { documentId: input.documentId }),
      ],
      note: input.note || "Edit is blocked pending explicit confirmation.",
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

