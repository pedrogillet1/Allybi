/**
 * Conversation Utility - Manages chat conversations for E2E tests
 */

import { Page, expect } from '@playwright/test';

export interface ConversationInfo {
  id: string | null;
  title: string;
}

/**
 * Start a new conversation
 */
export async function startNewConversation(page: Page, shardName?: string): Promise<ConversationInfo> {
  console.log(`[Conversation] Starting new conversation${shardName ? ` for ${shardName}` : ''}...`);

  // Click the new chat button
  const newChatButton = page.locator('[data-testid="new-chat"]');

  // Wait for button to be visible and clickable
  await newChatButton.waitFor({ state: 'visible', timeout: 10000 });
  await newChatButton.click();

  // Wait for chat interface to be ready
  await page.locator('[data-testid="chat-input"]').waitFor({ state: 'visible', timeout: 10000 });

  // Small delay to ensure state is ready
  await page.waitForTimeout(500);

  // Get conversation ID from URL if available
  const url = page.url();
  const conversationIdMatch = url.match(/conversation[s]?\/([\w-]+)/);
  const conversationId = conversationIdMatch ? conversationIdMatch[1] : null;

  console.log(`[Conversation] New conversation created: ${conversationId || 'new'}`);

  return {
    id: conversationId,
    title: shardName || 'New Chat'
  };
}

/**
 * Get current conversation ID from URL
 */
export async function getCurrentConversationId(page: Page): Promise<string | null> {
  const url = page.url();
  const match = url.match(/conversation[s]?\/([\w-]+)/);
  return match ? match[1] : null;
}

/**
 * Wait for conversation to be ready (input visible, no loading)
 */
export async function waitForConversationReady(page: Page, timeout: number = 10000): Promise<void> {
  await page.locator('[data-testid="chat-input"]').waitFor({ state: 'visible', timeout });

  // Wait for any loading indicators to disappear
  const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"], [data-loading="true"]');
  await loadingIndicator.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/**
 * Get message count in current conversation
 */
export async function getMessageCount(page: Page): Promise<{ user: number; assistant: number }> {
  const userMessages = await page.locator('[data-testid="msg-user"]').count();
  const assistantMessages = await page.locator('[data-testid="msg-assistant"]').count();

  return { user: userMessages, assistant: assistantMessages };
}

/**
 * Get the last assistant message text
 */
export async function getLastAssistantMessage(page: Page): Promise<string | null> {
  const messages = page.locator('[data-testid="msg-assistant"]');
  const count = await messages.count();

  if (count === 0) return null;

  const lastMessage = messages.nth(count - 1);
  return await lastMessage.textContent();
}

/**
 * Get the last user message text
 */
export async function getLastUserMessage(page: Page): Promise<string | null> {
  const messages = page.locator('[data-testid="msg-user"]');
  const count = await messages.count();

  if (count === 0) return null;

  const lastMessage = messages.nth(count - 1);
  return await lastMessage.textContent();
}

/**
 * Check if streaming is in progress
 */
export async function isStreaming(page: Page): Promise<boolean> {
  const streamingIndicator = page.locator('[data-testid="msg-streaming"], [data-testid="chat-stop"]');
  return await streamingIndicator.isVisible({ timeout: 500 }).catch(() => false);
}

/**
 * Wait for streaming to complete
 */
export async function waitForStreamingComplete(page: Page, timeout: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const streaming = await isStreaming(page);
    if (!streaming) {
      // Give a small buffer after streaming stops
      await page.waitForTimeout(200);
      return;
    }
    await page.waitForTimeout(100);
  }

  throw new Error(`Streaming did not complete within ${timeout}ms`);
}

/**
 * Get HTML snapshot of the last assistant message
 */
export async function getLastAssistantMessageHTML(page: Page): Promise<string | null> {
  const messages = page.locator('[data-testid="msg-assistant"]');
  const count = await messages.count();

  if (count === 0) return null;

  const lastMessage = messages.nth(count - 1);
  return await lastMessage.innerHTML();
}
