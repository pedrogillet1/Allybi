import prisma from '../config/database';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
const TEST_USER_ID = 'test-user-backend';
let testConversationId: string;

async function test_createConversation() {
  const start = Date.now();
  try {
    const conversation = await prisma.conversation.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Test Conversation',
      }
    });

    testConversationId = conversation.id;
    const passed = !!conversation.id;
    results.push({
      test: 'createConversation',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'createConversation',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_createMessage() {
  const start = Date.now();
  try {
    const message = await prisma.message.create({
      data: {
        conversationId: testConversationId,
        role: 'user',
        content: 'Test message'
      }
    });

    const passed = !!message.id;
    results.push({
      test: 'createMessage',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'createMessage',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_listConversations() {
  const start = Date.now();
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: TEST_USER_ID },
      take: 10
    });

    const passed = Array.isArray(conversations);
    results.push({
      test: 'listConversations',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'listConversations',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_getMessages() {
  const start = Date.now();
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: testConversationId }
    });

    const passed = Array.isArray(messages) && messages.length > 0;
    results.push({
      test: 'getMessages',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'getMessages',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_deleteConversation() {
  const start = Date.now();
  try {
    await prisma.conversation.delete({
      where: { id: testConversationId }
    });

    results.push({
      test: 'deleteConversation',
      passed: true,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'deleteConversation',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

export async function runTests() {
  await test_createConversation();
  await test_createMessage();
  await test_listConversations();
  await test_getMessages();
  await test_deleteConversation();
  return results;
}
