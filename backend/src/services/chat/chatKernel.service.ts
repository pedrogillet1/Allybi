import type {
  LLMStreamingConfig,
  StreamSink,
} from "../llm/types/llmStreaming.types";
import type { TurnExecutor } from "./handlers/types";
import type { ChatRequest, ChatResult, TurnRouteDecision } from "./chat.types";
import { TurnContextBuilder } from "./turnContext.builder";
import { TurnRouterService } from "./turnRouter.service";
import type { IntentDecisionOutput } from "../config/intentConfig.service";
import { normalizeTurnError, normalizeTurnSuccess } from "./responseEnvelope";
import { ConnectorTurnHandler } from "./handlers/connectorTurn.handler";
import { KnowledgeTurnHandler } from "./handlers/knowledgeTurn.handler";
import { GeneralTurnHandler } from "./handlers/generalTurn.handler";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

export class ChatKernelService {
  private readonly contextBuilder = new TurnContextBuilder();
  private readonly routePolicy = new TurnRoutePolicyService();
  private readonly router = new TurnRouterService(this.routePolicy);
  private readonly connectorHandler: ConnectorTurnHandler;
  private readonly knowledgeHandler: KnowledgeTurnHandler;
  private readonly generalHandler: GeneralTurnHandler;

  constructor(private readonly executor: TurnExecutor) {
    this.connectorHandler = new ConnectorTurnHandler(executor);
    this.knowledgeHandler = new KnowledgeTurnHandler(executor);
    this.generalHandler = new GeneralTurnHandler(executor);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private parseRoutingFollowupSource(notes: string[] | undefined): string | null {
    if (!Array.isArray(notes)) return null;
    for (const note of notes) {
      const value = String(note || "").trim();
      if (!value.startsWith("routing:followup_source:")) continue;
      const source = value.slice("routing:followup_source:".length).trim();
      if (source) return source;
    }
    return null;
  }

  private parseRoutingFollowupReasonCodes(notes: string[] | undefined): string[] {
    if (!Array.isArray(notes)) return [];
    const codes = new Set<string>();
    for (const note of notes) {
      const value = String(note || "").trim();
      if (!value.startsWith("routing:followup_reason:")) continue;
      const code = value.slice("routing:followup_reason:".length).trim();
      if (code) codes.add(code);
    }
    return Array.from(codes).slice(0, 6);
  }

  private parseRoutingSingleValueNote(
    notes: string[] | undefined,
    prefix: string,
  ): string | null {
    if (!Array.isArray(notes)) return null;
    for (const note of notes) {
      const value = String(note || "").trim();
      if (!value.startsWith(prefix)) continue;
      const parsed = value.slice(prefix.length).trim();
      if (parsed) return parsed;
    }
    return null;
  }

  private parseRoutingDisambiguation(
    notes: string[] | undefined,
    requiresClarification: boolean,
    clarifyReason: string | null,
  ): string {
    const explicit = this.parseRoutingSingleValueNote(
      notes,
      "routing:disambiguation:",
    );
    if (explicit) return explicit;
    if (requiresClarification) {
      return `required:${clarifyReason || "unspecified"}`;
    }
    return "none";
  }

  private sanitizeRoutingNotes(notes: string[] | undefined): string[] {
    if (!Array.isArray(notes)) return [];
    return notes
      .map((note) => String(note || "").trim())
      .filter((note) => note.length > 0)
      .filter(
        (note) =>
          note.startsWith("routing:") ||
          note.startsWith("followup:") ||
          note.startsWith("override:") ||
          note.startsWith("decision:"),
      )
      .slice(0, 12);
  }

  private withIntentMetadata(
    req: ChatRequest,
    intentDecision: IntentDecisionOutput | null,
    route: TurnRouteDecision,
    locale: "en" | "pt" | "es",
  ): ChatRequest {
    if (!intentDecision) return req;

    const meta = this.asRecord(req.meta);
    const context = this.asRecord(req.context);
    const intentState = this.asRecord((context as any).intentState);
    const requiresClarification = intentDecision.requiresClarification === true;
    const clarifyReason =
      typeof intentDecision.clarifyReason === "string"
        ? intentDecision.clarifyReason
        : null;
    const routingDecision = {
      route,
      locale,
      intentFamily: intentDecision.intentFamily,
      operator: intentDecision.operatorId,
      domainId: intentDecision.domainId,
      confidence: Math.max(0, Math.min(1, Number(intentDecision.confidence || 0))),
      followupSource: this.parseRoutingFollowupSource(intentDecision.decisionNotes),
      followupReasonCodes: this.parseRoutingFollowupReasonCodes(
        intentDecision.decisionNotes,
      ),
      operatorChoice:
        this.parseRoutingSingleValueNote(
          intentDecision.decisionNotes,
          "routing:operator_choice:",
        ) || intentDecision.operatorId,
      scopeDecision:
        this.parseRoutingSingleValueNote(
          intentDecision.decisionNotes,
          "routing:scope_decision:",
        ) || "unknown",
      disambiguation: this.parseRoutingDisambiguation(
        intentDecision.decisionNotes,
        requiresClarification,
        clarifyReason,
      ),
      notes: this.sanitizeRoutingNotes(intentDecision.decisionNotes),
    };

    return {
      ...req,
      meta: {
        ...meta,
        intentFamily: intentDecision.intentFamily,
        operator: intentDecision.operatorId,
        domain: intentDecision.domainId,
        domainId: intentDecision.domainId,
        requiresClarification,
        clarifyReason,
        routingDecision,
      },
      context: {
        ...context,
        intentState: {
          ...intentState,
          lastRoutingDecision: intentDecision.persistable,
          activeDomain: intentDecision.domainId,
        },
      },
    };
  }

  private enforceClarificationResult(result: ChatResult): ChatResult {
    if (result.status === "blocked" || result.status === "failed") {
      return result;
    }
    const fallbackText = "Can you clarify what you want me to do next?";
    const assistantText =
      String(result.assistantText || "").trim() || fallbackText;
    const missingSlots = Array.isArray(result.completion?.missingSlots)
      ? [...result.completion!.missingSlots]
      : [];
    if (!missingSlots.includes("intent")) missingSlots.push("intent");
    return {
      ...result,
      assistantText,
      status: "clarification_required",
      failureCode: result.failureCode || "INTENT_NEEDS_CLARIFICATION",
      completion: {
        answered: false,
        missingSlots,
        nextAction:
          result.completion?.nextAction ||
          "Clarify the document or action you want.",
      },
    };
  }

  async handleTurn(req: ChatRequest): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(req);
    const resolved = this.router.decideWithIntent(ctx);
    const nextReq = this.withIntentMetadata(
      ctx.request,
      resolved.intentDecision,
      resolved.route,
      ctx.locale,
    );
    const nextCtx =
      nextReq === ctx.request ? ctx : { ...ctx, request: nextReq };
    return this.dispatch(resolved.route, { ctx: nextCtx });
  }

  async streamTurn(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(params.req);
    const resolved = this.router.decideWithIntent(ctx);
    const nextReq = this.withIntentMetadata(
      ctx.request,
      resolved.intentDecision,
      resolved.route,
      ctx.locale,
    );
    const nextCtx =
      nextReq === ctx.request ? ctx : { ...ctx, request: nextReq };
    return this.dispatch(resolved.route, {
      ctx: nextCtx,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
    });
  }

  private async dispatch(
    route: TurnRouteDecision,
    params: {
      ctx: ReturnType<TurnContextBuilder["build"]>;
      sink?: StreamSink;
      streamingConfig?: LLMStreamingConfig;
    },
  ): Promise<ChatResult> {
    const op = (() => {
      switch (route) {
        case "CONNECTOR":
          return this.connectorHandler.handle(params);
        case "KNOWLEDGE":
          return this.knowledgeHandler.handle(params);
        case "GENERAL":
        case "CLARIFY":
        default:
          return this.generalHandler.handle(params);
      }
    })();

    try {
      let result = await op;
      if (route === "CLARIFY") {
        result = this.enforceClarificationResult(result);
      }
      normalizeTurnSuccess(result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat turn failed";
      const envelope = normalizeTurnError("CHAT_TURN_FAILED", message);
      throw new Error(envelope.message || "Chat turn failed");
    }
  }
}
