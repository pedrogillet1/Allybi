import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

describe("PrismaChatService public contract", () => {
  test("exposes all methods required by chat routes/controllers", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/services/prismaChat.service.ts"),
      "utf8",
    );

    const requiredMethods = [
      "chat",
      "streamChat",
      "createConversation",
      "listConversations",
      "getConversation",
      "getConversationWithMessages",
      "updateTitle",
      "deleteConversation",
      "deleteAllConversations",
      "listMessages",
      "createMessage",
    ] as const;

    for (const method of requiredMethods) {
      expect(src).toMatch(new RegExp(`\\basync\\s+${method}\\s*\\(`));
    }
  });
});

