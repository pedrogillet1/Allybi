/**
 * HistoryAppService - Controller-facing facade for conversation history
 * Handles listing, retrieving, and managing conversation history
 */

import { injectable } from 'tsyringe';

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: Date;
  messageCount: number;
  documentIds?: string[];
}

export interface ConversationDetail {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: Array<{ documentId: string; documentName: string }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

@injectable()
export class HistoryAppService {
  /**
   * List user's conversations
   */
  async listConversations(userId: string, limit?: number, offset?: number): Promise<ConversationSummary[]> {
    // TODO: Delegate to memory/conversationMemory
    throw new Error('HistoryAppService.listConversations not implemented');
  }

  /**
   * Get full conversation detail
   */
  async getConversation(userId: string, conversationId: string): Promise<ConversationDetail> {
    // TODO: Delegate to memory/conversationMemory
    throw new Error('HistoryAppService.getConversation not implemented');
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    // TODO: Delegate to memory/conversationMemory
    throw new Error('HistoryAppService.deleteConversation not implemented');
  }

  /**
   * Rename a conversation
   */
  async renameConversation(userId: string, conversationId: string, newTitle: string): Promise<void> {
    // TODO: Delegate to memory/conversationMemory
    throw new Error('HistoryAppService.renameConversation not implemented');
  }

  /**
   * Search conversation history
   */
  async searchConversations(userId: string, query: string): Promise<ConversationSummary[]> {
    // TODO: Implement search across conversations
    throw new Error('HistoryAppService.searchConversations not implemented');
  }
}
