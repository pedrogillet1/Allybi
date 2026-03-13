import type { TurnContext, TurnRouteDecision } from "../domain/chat.types";

export type FollowupDetectionResult = {
  isFollowup: boolean;
  confidence: number | null;
  source: "context" | "followup_indicators" | "intent_patterns" | "none";
  reasonCodes: string[];
};

export type FileActionDetectionResult =
  | {
      kind: "matched";
      operatorId: string;
      confidence: number;
    }
  | {
      kind: "suppressed";
    }
  | {
      kind: "none";
    };

export type PersistedIntentState = {
  lastRoutingDecision?: {
    intentId?: string;
    operatorId?: string;
    intentFamily?: string;
    domainId?: string;
    confidence?: number;
  };
  activeDomain?: string;
};

export function low(value: string): string {
  return String(value || "").toLowerCase();
}

export function normalizeForMatching(
  value: string,
  opts?: {
    caseInsensitive?: boolean;
    stripDiacritics?: boolean;
    collapseWhitespace?: boolean;
  },
): string {
  let out = String(value || "");
  if (opts?.stripDiacritics) {
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (opts?.collapseWhitespace) {
    out = out.replace(/\s+/g, " ");
  }
  if (opts?.caseInsensitive !== false) {
    out = out.toLowerCase();
  }
  return out.trim();
}

export function hasDocRefSignal(message: string): boolean {
  const input = low(message);
  if (/[a-z0-9_ -]+\.(pdf|docx|xlsx|pptx|txt|csv)\b/.test(input)) {
    return true;
  }

  return /\b(?:document|doc|file|spreadsheet|sheet|slide|presentation|arquivo|documento|planilha|apresentacao|apresentação)\s+(?:named|called|titled|nomeado|chamado|intitulado|denominado)\s+["'`][^"'`]{1,160}["'`]/.test(
    input,
  );
}

export function isDiscoveryQuery(message: string): boolean {
  return /\b(find|locate|search|which|where|encontre|localize|procure|qual|onde)\b/.test(
    low(message),
  );
}

export function isNavQuery(message: string): boolean {
  return /\b(open|show|list|go to|abrir|mostrar|listar|ir para)\b/.test(
    low(message),
  );
}

export function isHowToQuery(message: string): boolean {
  return /\b(how to|how do i|como|cómo|tutorial|passo a passo|step by step)\b/.test(
    low(message),
  );
}

export function mapIntentFamilyToRoute(
  intentFamily: string,
  docsAvailable: boolean,
): TurnRouteDecision {
  const family = low(intentFamily);
  if (family === "connectors" || family === "email") return "CONNECTOR";
  if (
    family === "documents" ||
    family === "editing" ||
    family === "doc_stats" ||
    family === "file_actions"
  ) {
    return "KNOWLEDGE";
  }
  if (family === "help" || family === "conversation" || family === "error") {
    return docsAvailable ? "KNOWLEDGE" : "GENERAL";
  }
  return docsAvailable ? "KNOWLEDGE" : "GENERAL";
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function getContextRecord(ctx: TurnContext): Record<string, unknown> {
  return asRecord(ctx.request.context);
}

export function getContextSignals(ctx: TurnContext): Record<string, unknown> {
  return asRecord(getContextRecord(ctx).signals);
}

export function getPersistedIntentState(
  ctx: TurnContext,
): PersistedIntentState | undefined {
  const state = asRecord(getContextRecord(ctx).intentState);
  if (Object.keys(state).length === 0) return undefined;
  const last = asRecord(state.lastRoutingDecision);
  return {
    lastRoutingDecision:
      Object.keys(last).length > 0
        ? {
            intentId: String(last.intentId || "").trim() || undefined,
            operatorId: String(last.operatorId || "").trim() || undefined,
            intentFamily: String(last.intentFamily || "").trim() || undefined,
            domainId: String(last.domainId || "").trim() || undefined,
            confidence:
              typeof last.confidence === "number"
                ? last.confidence
                : undefined,
          }
        : undefined,
    activeDomain: String(state.activeDomain || "").trim() || undefined,
  };
}
