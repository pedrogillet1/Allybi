import type { TurnContext, TurnRouteDecision } from "./chat.types";
import { EditorModeGuard } from "./guardrails/editorMode.guard";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

export class TurnRouterService {
  private readonly editorGuard = new EditorModeGuard();
  private readonly routePolicy = new TurnRoutePolicyService();

  decide(ctx: TurnContext): TurnRouteDecision {
    const guard = this.editorGuard.enforce(ctx);
    if (guard.routeForcedToEditor) return "EDITOR";
    const connectorIntent = this.routePolicy.isConnectorTurn(
      ctx.messageText || "",
      ctx.locale,
    );

    if (ctx.viewer?.mode) {
      if (connectorIntent && guard.allowConnectorEscape) return "CONNECTOR";
      return "EDITOR";
    }

    if (connectorIntent) return "CONNECTOR";
    if (ctx.attachedDocuments.length > 0 || ctx.activeDocument)
      return "KNOWLEDGE";
    return "GENERAL";
  }
}
