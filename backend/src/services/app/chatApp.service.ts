/**
 * ChatAppService - Controller-facing facade for chat functionality
 * Single entrypoint for all chat operations - delegates to core/kodaOrchestrator
 */

import { injectable, inject } from 'tsyringe';

export interface ChatRequest {
  userId: string;
  conversationId?: string;
  message: string;
  language?: string;
  scopedDocumentIds?: string[];
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  answer: string;
  sources?: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    snippet?: string;
  }>;
  followupSuggestions?: string[];
}

@injectable()
export class ChatAppService {
  /**
   * Process a chat message through the Koda orchestrator
   * This is the ONLY entrypoint for chat - controllers should not call orchestrator directly
   */
  async processMessage(request: ChatRequest): Promise<ChatResponse> {
    // TODO: Delegate to core/kodaOrchestrator.service.ts
    throw new Error('ChatAppService.processMessage not implemented');
  }

  /**
   * Stream a chat response (SSE)
   */
  async *streamMessage(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    // TODO: Implement streaming via orchestrator
    throw new Error('ChatAppService.streamMessage not implemented');
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(userId: string, conversationId: string): Promise<Array<{ role: string; content: string }>> {
    // TODO: Delegate to memory/conversationMemory
    throw new Error('ChatAppService.getConversationHistory not implemented');
  }

  /**
   * Clear conversation context
   */
  async clearConversation(userId: string, conversationId: string): Promise<void> {
    // TODO: Delegate to memory/conversationContext
    throw new Error('ChatAppService.clearConversation not implemented');
  }
}
