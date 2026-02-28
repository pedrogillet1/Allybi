import { describe, expect, test, jest } from "@jest/globals";
import { EncryptedChatContextService } from "./encryptedChatContext.service";

describe("EncryptedChatContextService", () => {
  test("requests latest messages window for LLM context", async () => {
    const repo = {
      listMessagesDecrypted: jest.fn().mockResolvedValue([
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
      ]),
    };
    const service = new EncryptedChatContextService(repo as any);

    const context = await service.buildLLMContext("user-1", "conv-1", 12, true);

    expect(repo.listMessagesDecrypted).toHaveBeenCalledWith(
      "user-1",
      "conv-1",
      12,
      true,
    );
    expect(context).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ]);
  });

  test("defaults to non-latest ordering when the flag parameter is omitted", async () => {
    const repo = {
      listMessagesDecrypted: jest.fn().mockResolvedValue([]),
    };
    const service = new EncryptedChatContextService(repo as any);
    await service.buildLLMContext("user-2", "conv-2", 5);
    expect(repo.listMessagesDecrypted).toHaveBeenCalledWith(
      "user-2",
      "conv-2",
      5,
      false,
    );
  });
});
