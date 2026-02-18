import type { TurnContext, TurnRouteDecision } from "./chat.types";
import { EditorModeGuard } from "./guardrails/editorMode.guard";

const CONNECTOR_PATTERN = /\b(email|gmail|outlook|calendar|slack|inbox|send\s+email|message\s+[\w.-]+)\b/i;
const EDITOR_INTENT_PATTERN = /\b(edit|format|bold|italic|underline|color|colour|align|heading|bullet|list|table|sheet|cell|formula|rewrite|replace|translate|undo|redo|apply|cancel)\b/i;

export class TurnRouterService {
  private readonly editorGuard = new EditorModeGuard();

  decide(ctx: TurnContext): TurnRouteDecision {
    const guard = this.editorGuard.enforce(ctx);
    if (guard.routeForcedToEditor) return "EDITOR";

    if (ctx.viewer?.mode && !guard.allowConnectorEscape) return "EDITOR";

    if (CONNECTOR_PATTERN.test(ctx.messageText || "")) return "CONNECTOR";
    if (EDITOR_INTENT_PATTERN.test(ctx.messageText || "")) return "EDITOR";

    if (ctx.attachedDocuments.length > 0 || ctx.activeDocument) return "KNOWLEDGE";
    return "GENERAL";
  }
}
