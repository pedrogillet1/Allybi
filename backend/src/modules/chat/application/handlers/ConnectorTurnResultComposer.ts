import type { ChatRequest, ChatResult } from "../../domain/chat.types";
import {
  ALL_PROVIDERS,
  type Provider,
  asRecord,
  asString,
  languageOf,
  providerLabel,
} from "./connectorTurn.shared";

export class ConnectorTurnResultComposer {
  compose(
    base: ChatResult,
    patch: {
      assistantText: string;
      attachments?: unknown[];
      answerMode?: string;
      status?: ChatResult["status"];
      failureCode?: string | null;
      completion?: ChatResult["completion"];
    },
  ): ChatResult {
    const text = String(patch.assistantText || "").trim();
    const next: ChatResult = {
      ...base,
      assistantText: text,
      attachmentsPayload: Array.isArray(patch.attachments) ? patch.attachments : [],
      assistantTelemetry: undefined,
      sources: [],
      followups: [],
      answerMode: (asString(patch.answerMode) ||
        "general_answer") as ChatResult["answerMode"],
      answerClass: "GENERAL",
      navType: null,
      status: patch.status || "success",
      failureCode:
        patch.failureCode === undefined ? null : (patch.failureCode ?? null),
      completion:
        patch.completion ||
        {
          answered: Boolean(text),
          missingSlots: [],
          nextAction: null,
        },
      evidence: {
        required: false,
        provided: false,
        sourceIds: [],
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: null,
      },
    };
    const mutable = next as unknown as Record<string, unknown>;
    delete mutable.fallbackReasonCode;
    delete mutable.fallbackTelemetry;
    delete mutable.fallbackPolicy;
    delete mutable.promptType;
    return next;
  }

  promptForProvider(
    base: ChatResult,
    req: ChatRequest,
    providers: Provider[],
    intent: "read" | "sync" | "connect" | "send" | "disconnect" = "read",
  ): ChatResult {
    const lang = languageOf(req);
    const textByLang = {
      en: "Select a connector to continue.",
      pt: "Selecione um conector para continuar.",
      es: "Selecciona un conector para continuar.",
    } as const;
    const family = intent === "send" ? "email" : "messages";
    return this.compose(base, {
      assistantText: textByLang[lang],
      attachments: [
        {
          type: "connector_prompt",
          title: "Select connector",
          providers,
          family,
          intent,
        },
      ],
      answerMode: "action_receipt",
      status: "clarification_required",
      failureCode: "CONNECTOR_PROVIDER_REQUIRED",
      completion: {
        answered: false,
        missingSlots: ["provider"],
        nextAction: "select_provider",
      },
    });
  }

  buildConnectorAccessFailure(
    base: ChatResult,
    provider: Provider,
    error: unknown,
  ): ChatResult {
    const raw = error instanceof Error ? error.message : String(error || "");
    const needsReconnect =
      /not connected|reconnect|required|401|403|unauthorized|token|invalid_grant/i.test(
        raw,
      );
    const label = providerLabel(provider);
    return this.compose(base, {
      assistantText: needsReconnect
        ? `${label} is not connected. Reconnect it and try again.`
        : `I couldn't access ${label} right now. Try again in a moment.`,
      answerMode: "action_receipt",
      status: "failed",
      failureCode: needsReconnect
        ? "CONNECTOR_NOT_CONNECTED"
        : "CONNECTOR_ACCESS_FAILED",
      attachments: [
        {
          type: "connector_status",
          provider,
          connected: !needsReconnect,
          reason: needsReconnect ? "not_connected" : "access_failed",
        },
      ],
    });
  }

  resolveProvider(
    req: ChatRequest,
    allowed: Provider[],
  ): Provider | null {
    const active = asString(req.connectorContext?.activeProvider).toLowerCase();
    const fromText = inferProviderFromText(req.message || "");
    if (fromText && allowed.includes(fromText)) return fromText;
    if ((active as Provider) && allowed.includes(active as Provider)) {
      return active as Provider;
    }
    const connected = this.connectedMap(req);
    const connectedAllowed = allowed.filter((provider) => connected[provider]);
    if (connectedAllowed.length === 1) return connectedAllowed[0];
    return null;
  }

  private connectedMap(req: ChatRequest): Record<Provider, boolean> {
    return {
      gmail: Boolean(req.connectorContext?.gmail?.connected),
      outlook: Boolean(req.connectorContext?.outlook?.connected),
      slack: Boolean(req.connectorContext?.slack?.connected),
    };
  }
}

function inferProviderFromText(text: string): Provider | null {
  const msg = String(text || "").toLowerCase();
  if (/\b(gmail|google\s*mail)\b/.test(msg)) return "gmail";
  if (/\b(outlook|office\s*365|microsoft\s*outlook)\b/.test(msg)) return "outlook";
  if (/\b(slack|channel|dm|thread)\b/.test(msg)) return "slack";
  return null;
}
