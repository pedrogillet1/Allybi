import { v4 as uuidv4 } from 'uuid';

export interface OptimisticMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  isOptimistic: true;
  isPending?: boolean;
}

export interface RealMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  isOptimistic?: false;
  sources?: any[];
  metadata?: any;
}

export type Message = OptimisticMessage | RealMessage;

/**
 * Create optimistic user message
 * This appears instantly in UI before backend responds
 */
export function createOptimisticUserMessage(
  conversationId: string,
  content: string
): OptimisticMessage {
  return {
    id: `optimistic-user-${uuidv4()}`,
    conversationId,
    role: 'user',
    content,
    createdAt: new Date(),
    isOptimistic: true
  };
}

/**
 * Create optimistic assistant message placeholder
 * Shows loading state while waiting for streaming
 */
export function createOptimisticAssistantMessage(
  conversationId: string
): OptimisticMessage {
  return {
    id: `optimistic-assistant-${uuidv4()}`,
    conversationId,
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    isOptimistic: true,
    isPending: true
  };
}

/**
 * Replace optimistic message with real message from backend
 */
export function replaceOptimisticMessage(
  messages: Message[],
  optimisticId: string,
  realMessage: RealMessage
): Message[] {
  return messages.map(msg =>
    msg.id === optimisticId ? realMessage : msg
  );
}

/**
 * Update optimistic assistant message with streaming content
 */
export function updateOptimisticMessage(
  messages: Message[],
  optimisticId: string,
  content: string
): Message[] {
  return messages.map(msg =>
    msg.id === optimisticId
      ? { ...msg, content, isPending: false }
      : msg
  );
}
