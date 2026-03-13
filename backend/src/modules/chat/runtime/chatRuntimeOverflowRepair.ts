import {
  classifyVisibleTruncation,
  normalizeFinishReason,
} from "./truncationClassifier";
import { normalizeChatLanguage } from "./chatRuntimeLanguage";

export function applySentenceBoundaryRecovery(
  text: string,
  telemetry?: Record<string, unknown> | null,
): string {
  const finishReason = normalizeFinishReason(
    telemetry && typeof telemetry === "object" ? telemetry.finishReason : null,
  );
  const truncatedReasons = new Set(["length", "max_tokens", "max_output_tokens"]);
  if (!truncatedReasons.has(finishReason)) return text;

  const sentences = text.match(/[^.!?。]+[.!?。]/g) || [];
  if (sentences.length >= 2) {
    const trailing = sentences[sentences.length - 1].trim();
    const unmatchedDoubleQuotes = (trailing.match(/"/g) || []).length % 2 !== 0;
    const unmatchedParens =
      (trailing.match(/\(/g) || []).length !== (trailing.match(/\)/g) || []).length;
    if (unmatchedDoubleQuotes || unmatchedParens) {
      return sentences.slice(0, -1).join("").trim();
    }
  }

  const lastBoundary = Math.max(
    text.lastIndexOf("."),
    text.lastIndexOf("!"),
    text.lastIndexOf("?"),
    text.lastIndexOf("。"),
  );
  if (lastBoundary > Math.min(text.length * 0.15, 50)) {
    return text.slice(0, lastBoundary + 1).trim();
  }
  return text;
}

export function repairProviderOverflowStructuredOutput(
  text: string,
  telemetry?: Record<string, unknown> | null,
  preferredLanguage?: string | null,
  enforcementRepairs?: string[] | null,
): string {
  const finishReason = normalizeFinishReason(
    telemetry && typeof telemetry === "object" ? telemetry.finishReason : null,
  );
  const overflow = new Set(["length", "max_tokens", "max_output_tokens"]);
  if (!overflow.has(finishReason)) return text;

  const value = String(text || "").trim();
  if (!value) return text;

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const semantic = classifyVisibleTruncation({
    finalText: value,
    enforcementRepairs: enforcementRepairs ?? [],
    providerTruncation: { occurred: true, reason: finishReason },
  });
  if (!semantic.occurred) return text;

  const tableLines = lines.filter((line) => line.includes("|"));
  if (!tableLines.length) return text;

  const separatorOnly = (line: string): boolean =>
    /^[:\-\|\s]+$/.test(line.replace(/\|/g, ""));
  const contentRows = tableLines.filter((line) => !separatorOnly(line));
  const incompleteTable =
    contentRows.length <= 1 || /\|\s*$/.test(value) || lines.length < 3;
  if (!incompleteTable) return text;

  const language = normalizeChatLanguage(preferredLanguage);
  const narrative = lines
    .filter((line) => !line.includes("|"))
    .join(" ")
    .trim();
  const fallback =
    language === "pt"
      ? "A tabela foi interrompida antes de concluir. Posso reenviar em bullets para evitar corte."
      : language === "es"
        ? "La tabla se interrumpió antes de terminar. Puedo reenviarla en viñetas para evitar cortes."
        : "The table was cut before completion. I can resend it as bullets to avoid truncation.";

  const base = narrative.length >= 60 ? narrative : narrative || fallback;
  const punctuated = /[.!?]$/.test(base) ? base : `${base}.`;
  return punctuated;
}
