import type { TurnContext, TurnRouteDecision } from "./chat.types";
import { EditorModeGuard } from "./guardrails/editorMode.guard";

const CONNECTOR_PATTERN =
  /\b(email|gmail|outlook|calendar|slack|inbox|send\s+email|message\s+[\w.-]+)\b/i;

export class TurnRouterService {
  private readonly editorGuard = new EditorModeGuard();

  decide(ctx: TurnContext): TurnRouteDecision {
    const guard = this.editorGuard.enforce(ctx);
    // Editor routing is reserved for viewer/editor mode only.
    if (ctx.viewer?.mode) {
      if (guard.routeForcedToEditor) return "EDITOR";
      if (!guard.allowConnectorEscape) return "EDITOR";
    }

    if (CONNECTOR_PATTERN.test(ctx.messageText || "")) return "CONNECTOR";

    if (ctx.attachedDocuments.length > 0 || ctx.activeDocument)
      return "KNOWLEDGE";
    return "GENERAL";
  }
}
