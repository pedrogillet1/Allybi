import { getOptionalBank } from "../banks/bankLoader.service";

type CompliancePhrasesBank = {
  config?: {
    actionsContract?: {
      thresholds?: {
        maxComplianceChars?: number;
      };
    };
  };
  phrases?: {
    default?: Record<string, unknown>;
    byReasonCode?: Record<string, Record<string, unknown>>;
  };
};

function normalizeLanguage(language?: string): "en" | "pt" | "es" {
  const raw = String(language || "").trim().toLowerCase();
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  return "en";
}

function resolveLocalizedText(
  block: Record<string, unknown> | null | undefined,
  language: "en" | "pt" | "es",
): string {
  if (!block || typeof block !== "object") return "";
  const selected =
    block[language] ?? block.any ?? block.en ?? block.pt ?? block.es ?? "";
  return String(selected || "").trim();
}

function limitCopy(text: string, maxChars: number | null): string {
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export class CompliancePhraseResolverService {
  buildUserFacingText(input: {
    reasonCode?: string | null;
    preferredLanguage?: string;
  }): string {
    const bank = getOptionalBank<CompliancePhrasesBank>("compliance_phrases");
    const language = normalizeLanguage(input.preferredLanguage);
    const reasonCode = String(input.reasonCode || "").trim();
    const maxChars = Number(
      bank?.config?.actionsContract?.thresholds?.maxComplianceChars,
    );
    const byReason = bank?.phrases?.byReasonCode || {};
    const localizedReason = reasonCode
      ? resolveLocalizedText(byReason[reasonCode], language)
      : "";
    const localizedDefault = resolveLocalizedText(
      bank?.phrases?.default,
      language,
    );
    const fallback =
      language === "pt"
        ? "Nao posso continuar com esse pedido por causa de um bloqueio de compliance."
        : language === "es"
          ? "No puedo continuar con esta solicitud debido a un bloqueo de cumplimiento."
          : "I can't continue with this request because of a compliance block.";
    return limitCopy(
      localizedReason || localizedDefault || fallback,
      Number.isFinite(maxChars) ? maxChars : null,
    );
  }
}
