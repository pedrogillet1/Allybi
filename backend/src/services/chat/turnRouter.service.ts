import type { TurnContext, TurnRouteDecision } from "./chat.types";
import { EditorModeGuard } from "./guardrails/editorMode.guard";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

export class TurnRouterService {
  constructor(
    private readonly routePolicy: Pick<
      TurnRoutePolicyService,
      "isConnectorTurn"
    > = new TurnRoutePolicyService(),
    private readonly editorGuard: Pick<
      EditorModeGuard,
      "enforce"
    > = new EditorModeGuard(routePolicy),
  ) {}

  decide(ctx: TurnContext): TurnRouteDecision {
    const guard = this.editorGuard.enforce(ctx);
    if (guard.routeForcedToEditor) return "EDITOR";
    const connectorIntent = ctx.viewer?.mode
      ? guard.allowConnectorEscape
      : this.routePolicy.isConnectorTurn(ctx.messageText || "", ctx.locale);

    if (ctx.viewer?.mode) {
      if (connectorIntent) return "CONNECTOR";
      return "EDITOR";
    }

    if (connectorIntent) return "CONNECTOR";
    if (ctx.attachedDocuments.length > 0 || ctx.activeDocument)
      return "KNOWLEDGE";
    return "GENERAL";
  }
}
