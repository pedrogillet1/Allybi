/**
 * Test Helpers
 * Common utilities for testing
 */

export function createMockUser(overrides = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  };
}

export function createMockDocument(overrides = {}) {
  return {
    id: 'test-doc-id',
    name: 'test-document.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    userId: 'test-user-id',
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockConversation(overrides = {}) {
  return {
    id: 'test-conversation-id',
    userId: 'test-user-id',
    title: 'Test Conversation',
    createdAt: new Date(),
    messages: [],
    ...overrides,
  };
}

export async function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
