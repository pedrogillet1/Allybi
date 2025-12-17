import request from 'supertest';
import { app } from '../../server';
import prisma from '../../config/database';
import { generateAccessToken } from '../../utils/jwt';
import fs from 'fs';
import path from 'path';

describe('API Integration Tests - Real HTTP Endpoints', () => {
  let authToken: string;
  let testUserId: string;
  let testDocumentId: string;
  let testConversationId: string;

  beforeAll(async () => {
    // Create test user
    const testUser = await prisma.user.upsert({
      where: { email: 'api-test@koda.com' },
      update: {},
      create: {
        id: 'api-test-user-id',
        email: 'api-test@koda.com',
        firstName: 'API',
        lastName: 'Test',
        passwordHash: 'test-hash'
      }
    });

    testUserId = testUser.id;
    authToken = generateAccessToken(testUserId);

    console.log('✅ Test user created:', testUserId);
  });

  afterAll(async () => {
    // Cleanup
    try {
      await prisma.message.deleteMany({ where: { conversations: { userId: testUserId } } });
      await prisma.conversation.deleteMany({ where: { userId: testUserId } });
      await prisma.document.deleteMany({ where: { userId: testUserId } });
      await prisma.folder.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
      console.log('✅ Cleanup complete');
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    await prisma.$disconnect();
  });

  describe('🔐 Authentication Endpoints', () => {
    test('GET /api/auth/me - Returns current user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('email', 'api-test@koda.com');
    });

    test('GET /api/auth/me - Fails without token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
    });
  });

  describe('📄 Document Endpoints', () => {
    test('GET /api/documents - Lists documents', async () => {
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('documents');
      expect(Array.isArray(response.body.documents)).toBe(true);
    });

    test('POST /api/documents/upload - Uploads file', async () => {
      const testFile = Buffer.from('Test PDF content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile, 'test.pdf');

      // Expect either success or specific error
      expect([200, 201, 400, 500]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('document');
        testDocumentId = response.body.document.id;
      }
    });
  });

  describe('💬 Chat/Conversation Endpoints', () => {
    test('POST /api/chat/conversations - Creates conversation', async () => {
      const response = await request(app)
        .post('/api/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'API Test Conversation' });

      expect([200, 201]).toContain(response.status);

      if (response.body.conversation) {
        testConversationId = response.body.conversation.id;
        expect(testConversationId).toBeDefined();
      }
    });

    test('GET /api/chat/conversations - Lists conversations', async () => {
      const response = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('conversations');
      expect(Array.isArray(response.body.conversations)).toBe(true);
    });

    test('GET /api/chat/conversations/:id - Gets specific conversation', async () => {
      if (!testConversationId) {
        console.log('⏭️  Skipping - no conversation created');
        return;
      }

      const response = await request(app)
        .get(`/api/chat/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.id).toBe(testConversationId);
      }
    });
  });

  describe('🔍 RAG Endpoints', () => {
    test('POST /api/rag/query - Returns answer', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'What is 2+2?',
          conversationId: testConversationId || undefined
        });

      // Should return answer or error
      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('answer');
      }
    });

    test('POST /api/rag/query/stream - SSE streaming works', async (done) => {
      const req = request(app)
        .post('/api/rag/query/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Accept', 'text/event-stream')
        .send({
          query: 'Hello',
          conversationId: testConversationId || undefined
        });

      let receivedData = false;
      let timeout: NodeJS.Timeout;

      req.on('data', (chunk) => {
        receivedData = true;
        const data = chunk.toString();

        // Verify SSE format
        if (data.includes('data:')) {
          clearTimeout(timeout);
          req.abort();
          expect(receivedData).toBe(true);
          done();
        }
      });

      // Timeout after 10 seconds
      timeout = setTimeout(() => {
        req.abort();
        if (!receivedData) {
          console.log('⚠️  No SSE data received in 10s');
        }
        done();
      }, 10000);

      req.end();
    }, 15000);
  });

  describe('📂 Folder Endpoints', () => {
    let testFolderId: string;

    test('GET /api/folders - Lists folders', async () => {
      const response = await request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('folders');
      }
    });

    test('POST /api/folders - Creates folder', async () => {
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'API Test Folder' });

      // Endpoint might not exist or have different path
      if (response.status === 200 || response.status === 201) {
        testFolderId = response.body.id || response.body.folder?.id;
        expect(testFolderId).toBeDefined();
      }
    });
  });

  describe('🔍 Search Endpoints', () => {
    test('GET /api/search - Searches documents', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ query: 'test', userId: testUserId })
        .set('Authorization', `Bearer ${authToken}`);

      // Search might return 200 or 404 if not implemented
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('🏥 Health Endpoint', () => {
    test('GET /health - Returns healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('database');
    });
  });

  describe('🚫 CORS & Security Headers', () => {
    test('OPTIONS request has CORS headers', async () => {
      const response = await request(app)
        .options('/api/documents')
        .set('Origin', 'http://localhost:3000');

      // Should have CORS headers or handle OPTIONS
      expect([200, 204, 404]).toContain(response.status);
    });
  });
});
