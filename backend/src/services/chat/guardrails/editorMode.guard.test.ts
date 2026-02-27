import { describe, test, expect, jest, beforeEach } from "@jest/globals";

// Mock the chatMicrocopy.service before importing the guard so the
// module-level import inside the guard resolves to our controlled stub.
jest.mock("../chatMicrocopy.service", () => ({
  resolveEditorTargetRequiredMessage: jest.fn(() => "Please select a target."),
}));

import { EditorModeGuard } from "./editorMode.guard";
import type { TurnContext } from "../chat.types";
import { resolveEditorTargetRequiredMessage } from "../chatMicrocopy.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "user-1",
    messageText: "hello",
    locale: "en",
    now: new Date("2026-02-26T00:00:00Z"),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "user-1",
      message: "hello",
    },
    ...overrides,
  };
}

function makePolicy(returnValue = false) {
  return {
    isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(returnValue),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * @deprecated EditorModeGuard is no longer imported by ChatKernelService or
 * TurnRouterService. These tests are retained for rollback safety.
 */
describe("EditorModeGuard.enforce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Branch 1 — no viewer mode present
  test("returns allowConnectorEscape=true when viewer is absent", () => {
    const guard = new EditorModeGuard(makePolicy());
    const result = guard.enforce(makeCtx({ viewer: undefined }));

    expect(result).toEqual({
      routeForcedToEditor: false,
      allowConnectorEscape: true,
    });
  });

  test("returns allowConnectorEscape=true when viewer.mode is falsy (empty string)", () => {
    const guard = new EditorModeGuard(makePolicy());
    // Cast needed to exercise the falsy-mode code path.
    const ctx = makeCtx({
      viewer: { mode: "" as "editor", documentId: "doc-1", fileType: "docx" },
    });
    const result = guard.enforce(ctx);

    expect(result).toEqual({
      routeForcedToEditor: false,
      allowConnectorEscape: true,
    });
  });

  // Branch 2 — routePolicy grants connector escape
  test("returns allowConnectorEscape=true when isConnectorTurn returns true", () => {
    const policy = makePolicy(true);
    const guard = new EditorModeGuard(policy);
    const ctx = makeCtx({
      viewer: { mode: "editor", documentId: "doc-1", fileType: "docx" },
      messageText: "send email to Alice",
    });
    const result = guard.enforce(ctx);

    expect(result).toEqual({
      routeForcedToEditor: false,
      allowConnectorEscape: true,
    });
    expect(policy.isConnectorTurn).toHaveBeenCalledWith(
      "send email to Alice",
      "en",
    );
  });

  // Branch 3 — selection present, connector escape denied
  test("returns routeForcedToEditor=true without errorCode when selection ranges are present", () => {
    const policy = makePolicy(false);
    const guard = new EditorModeGuard(policy);
    const ctx = makeCtx({
      viewer: {
        mode: "editor",
        documentId: "doc-1",
        fileType: "docx",
        selection: {
          isFrozen: false,
          ranges: [{ paragraphId: "p-1" }],
        },
      },
    });
    const result = guard.enforce(ctx);

    expect(result).toEqual({
      routeForcedToEditor: true,
      allowConnectorEscape: false,
    });
    expect(result.errorCode).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  // Branch 4 — fallback: no selection, connector escape denied
  test("returns DOCX_TARGET_REQUIRED errorCode when no selection and connector escape denied", () => {
    const policy = makePolicy(false);
    const guard = new EditorModeGuard(policy);
    const ctx = makeCtx({
      viewer: {
        mode: "editor",
        documentId: "doc-1",
        fileType: "docx",
        selection: { isFrozen: false, ranges: [] },
      },
    });
    const result = guard.enforce(ctx);

    expect(result.routeForcedToEditor).toBe(true);
    expect(result.allowConnectorEscape).toBe(false);
    expect(result.errorCode).toBe("DOCX_TARGET_REQUIRED");
    expect(result.message).toBe("Please select a target.");
    expect(resolveEditorTargetRequiredMessage).toHaveBeenCalledWith("en");
  });

  test("fallback passes locale to resolveEditorTargetRequiredMessage", () => {
    const policy = makePolicy(false);
    const guard = new EditorModeGuard(policy);
    const ctx = makeCtx({
      locale: "pt",
      viewer: {
        mode: "editor",
        documentId: "doc-2",
        fileType: "xlsx",
      },
    });
    guard.enforce(ctx);

    expect(resolveEditorTargetRequiredMessage).toHaveBeenCalledWith("pt");
  });

  // isConnectorTurn receives empty string when messageText is absent
  test("passes empty string to isConnectorTurn when messageText is undefined", () => {
    const policy = makePolicy(false);
    const guard = new EditorModeGuard(policy);
    const ctx = makeCtx({
      messageText: undefined as unknown as string,
      viewer: { mode: "editor", documentId: "doc-1", fileType: "docx" },
    });
    guard.enforce(ctx);

    expect(policy.isConnectorTurn).toHaveBeenCalledWith("", "en");
  });
});
