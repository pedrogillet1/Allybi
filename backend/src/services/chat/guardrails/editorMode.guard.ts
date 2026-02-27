import type { TurnContext } from "../chat.types";
import { resolveEditorTargetRequiredMessage } from "../chatMicrocopy.service";
import { TurnRoutePolicyService } from "../turnRoutePolicy.service";

export type EditorGuardResult = {
  routeForcedToEditor: boolean;
  allowConnectorEscape: boolean;
  errorCode?: string;
  message?: string;
};

/**
 * @deprecated No longer used by ChatKernelService or TurnRouterService.
 * Editor flows are now routed through the dedicated editing agent pipeline
 * via /api/editor-session/assistant/stream. Kept for rollback safety.
 */
export class EditorModeGuard {
  constructor(
    private readonly routePolicy: Pick<
      TurnRoutePolicyService,
      "isConnectorTurn"
    > = new TurnRoutePolicyService(),
  ) {}

  enforce(ctx: TurnContext): EditorGuardResult {
    if (!ctx.viewer?.mode) {
      return { routeForcedToEditor: false, allowConnectorEscape: true };
    }

    const allowConnectorEscape = this.routePolicy.isConnectorTurn(
      ctx.messageText || "",
      ctx.locale,
    );
    if (allowConnectorEscape) {
      return { routeForcedToEditor: false, allowConnectorEscape: true };
    }

    // Selection precedence guardrail: selection present => authoritative.
    if (ctx.viewer.selection?.ranges?.length) {
      return { routeForcedToEditor: true, allowConnectorEscape: false };
    }

    return {
      routeForcedToEditor: true,
      allowConnectorEscape: false,
      errorCode: "DOCX_TARGET_REQUIRED",
      message: resolveEditorTargetRequiredMessage(ctx.locale),
    };
  }
}
