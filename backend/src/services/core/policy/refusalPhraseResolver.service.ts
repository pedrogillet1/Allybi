import { getOptionalBank } from "../banks/bankLoader.service";
import type { RefusalPolicyDecision } from "./refusalPolicy.service";

type RefusalPhrasesBank = {
  config?: {
    actionsContract?: {
      thresholds?: {
        maxRefusalChars?: number;
      };
    };
  };
};

function normalizeLanguage(language?: string): "en" | "pt" | "es" {
  const raw = String(language || "").trim().toLowerCase();
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  return "en";
}

function limitCopy(text: string, maxChars: number | null): string {
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export class RefusalPhraseResolverService {
  buildUserFacingText(input: {
    decision: RefusalPolicyDecision;
    preferredLanguage?: string;
  }): string {
    const lang = normalizeLanguage(input.preferredLanguage);
    const category = String(input.decision.category || "other").trim();
    const hasAlternative =
      Array.isArray(input.decision.safeAlternatives) &&
      input.decision.safeAlternatives.length > 0;
    const bank = getOptionalBank<RefusalPhrasesBank>("refusal_phrases");
    const maxChars = Number(
      bank?.config?.actionsContract?.thresholds?.maxRefusalChars,
    );

    let text: string;
    if (lang === "pt") {
      const base =
        category === "self_harm"
          ? "Nao posso ajudar com isso."
          : "Nao posso ajudar com esse pedido.";
      text = hasAlternative
        ? `${base} Posso ajudar com uma alternativa segura se quiser.`
        : base;
      return limitCopy(text, Number.isFinite(maxChars) ? maxChars : null);
    }

    if (lang === "es") {
      const base =
        category === "self_harm"
          ? "No puedo ayudar con eso."
          : "No puedo ayudar con esa solicitud.";
      text = hasAlternative
        ? `${base} Si quieres, te ayudo con una alternativa segura.`
        : base;
      return limitCopy(text, Number.isFinite(maxChars) ? maxChars : null);
    }

    const base =
      category === "self_harm"
        ? "I can’t help with that."
        : "I can’t help with that request.";
    text = hasAlternative
      ? `${base} I can help with a safer alternative.`
      : base;
    return limitCopy(text, Number.isFinite(maxChars) ? maxChars : null);
  }
}
