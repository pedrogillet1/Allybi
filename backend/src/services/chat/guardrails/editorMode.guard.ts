import type { TurnContext } from "../chat.types";
import { TurnRoutePolicyService } from "../turnRoutePolicy.service";

export type EditorGuardResult = {
  routeForcedToEditor: boolean;
  allowConnectorEscape: boolean;
  errorCode?: string;
  message?: string;
};

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
      message: "Select content to edit or specify a concrete target.",
    };
  }
}
