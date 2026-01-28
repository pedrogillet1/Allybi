import { EncryptedChatRepo } from "./encryptedChatRepo.service";

type ChatRole = "user" | "assistant" | "system";

/**
 * Use this anywhere you need chat history as plaintext (for the LLM),
 * while still storing it encrypted at rest.
 */
export class EncryptedChatContextService {
  constructor(private chatRepo: EncryptedChatRepo) {}

  async buildLLMContext(userId: string, conversationId: string, limit = 20): Promise<Array<{ role: ChatRole; content: string }>> {
    const msgs = await this.chatRepo.listMessagesDecrypted(userId, conversationId, limit);
    return msgs.map((m) => ({ role: m.role as ChatRole, content: m.content }));
  }
}
