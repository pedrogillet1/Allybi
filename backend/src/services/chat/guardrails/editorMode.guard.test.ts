import { describe, expect, test } from "@jest/globals";
import { EditorModeGuard } from "./editorMode.guard";
import type { TurnContext } from "../chat.types";

function context(messageText: string, ranges: any[]): TurnContext {
  return {
    userId: "u1",
    conversationId: "c1",
    messageText,
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: { activeConnector: null, connected: {} },
    viewer: {
      mode: "editor",
      documentId: "d1",
      fileType: "docx",
      selection: {
        isFrozen: false,
        ranges,
      },
    },
    request: {
      userId: "u1",
      message: messageText,
      conversationId: "c1",
    },
  };
}

describe("EditorModeGuard", () => {
  test("selection in viewer mode forces editor route", () => {
    const guard = new EditorModeGuard({
      isConnectorTurn: () => false,
    });
    const result = guard.enforce(
      context("make this red", [{ paragraphId: "p1" }]),
    );
    expect(result.routeForcedToEditor).toBe(true);
    expect(result.allowConnectorEscape).toBe(false);
  });

  test("explicit connector intent allows connector escape", () => {
    const guard = new EditorModeGuard({
      isConnectorTurn: () => true,
    });
    const result = guard.enforce(
      context("email pedro", [{ paragraphId: "p1" }]),
    );
    expect(result.routeForcedToEditor).toBe(false);
    expect(result.allowConnectorEscape).toBe(true);
  });

  test("missing selection returns deterministic clarification code", () => {
    const guard = new EditorModeGuard({
      isConnectorTurn: () => false,
    });
    const result = guard.enforce(context("make this red", []));
    expect(result.routeForcedToEditor).toBe(true);
    expect(result.errorCode).toBe("DOCX_TARGET_REQUIRED");
  });
});
