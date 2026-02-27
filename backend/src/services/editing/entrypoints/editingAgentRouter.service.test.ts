import { describe, expect, test } from "@jest/globals";
import { EditingAgentRouterService } from "./editingAgentRouter.service";
import type { EditHandlerRequest } from "../../core/handlers/editHandler.service";

function makeRequest(
  mode: EditHandlerRequest["mode"],
  domain?: "docx" | "sheets" | "slides",
): EditHandlerRequest {
  const baseContext = {
    userId: "user_1",
    conversationId: "editing:test:user_1",
    correlationId: "corr_1",
    clientMessageId: "msg_1",
  };

  if (mode === "undo") {
    return {
      mode,
      context: baseContext,
      undo: {
        documentId: "doc_1",
      },
    };
  }

  return {
    mode,
    context: baseContext,
    planRequest: {
      instruction: "rewrite this",
      operator: "EDIT_PARAGRAPH",
      domain: domain || "docx",
      documentId: "doc_1",
    },
    beforeText: "before",
    proposedText: "after",
  };
}

describe("EditingAgentRouterService", () => {
  test("routes DOCX edit flow to docx agent", async () => {
    const router = new EditingAgentRouterService();
    const execution = await router.execute(makeRequest("plan", "docx"));
    expect(execution.agentId).toBe("edit_agent_docx");
  });

  test("routes sheets edit flow to sheets agent", async () => {
    const router = new EditingAgentRouterService();
    const execution = await router.execute(makeRequest("preview", "sheets"));
    expect(execution.agentId).toBe("edit_agent_sheets");
  });

  test("routes unsupported domain to default agent", async () => {
    const router = new EditingAgentRouterService();
    const execution = await router.execute(makeRequest("apply", "slides"));
    expect(execution.agentId).toBe("edit_agent_default");
  });

  test("routes undo mode to default agent", async () => {
    const router = new EditingAgentRouterService();
    const execution = await router.execute(makeRequest("undo"));
    expect(execution.agentId).toBe("edit_agent_default");
  });
});
