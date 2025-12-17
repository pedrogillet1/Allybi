/**
 * UX Transformation Test Suite
 *
 * Tests all UX improvements from the transformation guide
 */

import fastPathDetector, { FastPathType } from '../services/fastPathDetector.service';
import postProcessor from '../services/postProcessor.service';
import { fileValidator, ValidationErrorCode } from '../services/ingestion';
import cacheService from '../services/cache.service';
import statusEmitter, { ProcessingStage } from '../services/statusEmitter.service';

describe('UX Transformation Tests', () => {
  // ========================================================================
  // ISSUE #1: FAST PATH DETECTION
  // ========================================================================

  describe('Fast Path Detection', () => {
    it('should detect simple greetings', async () => {
      const result = await fastPathDetector.detect('hello');
      expect(result.isFastPath).toBe(true);
      expect(result.type).toBe(FastPathType.GREETING);
      expect(result.response).toBeDefined();
      expect(result.response?.length).toBeGreaterThan(0);
    });

    it('should detect variations of greetings', async () => {
      const greetings = ['hi', 'hey', 'hello there', 'good morning'];

      for (const greeting of greetings) {
        const result = await fastPathDetector.detect(greeting);
        expect(result.isFastPath).toBe(true);
        expect(result.type).toBe(FastPathType.GREETING);
      }
    });

    it('should detect help requests', async () => {
      const result = await fastPathDetector.detect('what can you do');
      expect(result.isFastPath).toBe(true);
      expect(result.type).toBe(FastPathType.HELP);
      expect(result.response).toContain('help');
    });

    it('should NOT fast path document queries', async () => {
      const result = await fastPathDetector.detect('what does the business plan say');
      expect(result.isFastPath).toBe(false);
      expect(result.type).toBe(FastPathType.NONE);
    });

    it('should NOT fast path comparison queries', async () => {
      const result = await fastPathDetector.detect('compare document A with document B');
      expect(result.isFastPath).toBe(false);
      expect(result.type).toBe(FastPathType.NONE);
    });
  });

  // ========================================================================
  // ISSUE #2: STATUS EMITTER
  // ========================================================================

  describe('Status Emitter', () => {
    it('should emit analyzing stage', () => {
      const callback = jest.fn();
      statusEmitter.emit(callback, ProcessingStage.ANALYZING);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ProcessingStage.ANALYZING,
          message: 'Understanding your question...',
          progress: 10
        })
      );
    });

    it('should emit searching stage', () => {
      const callback = jest.fn();
      statusEmitter.emit(callback, ProcessingStage.SEARCHING);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ProcessingStage.SEARCHING,
          message: 'Searching your documents...',
          progress: 30
        })
      );
    });

    it('should emit retrieving stage with chunk count', () => {
      const callback = jest.fn();
      statusEmitter.emit(callback, ProcessingStage.RETRIEVING, { chunkCount: 5 });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ProcessingStage.RETRIEVING,
          message: 'Found 5 relevant sections...',
          progress: 60
        })
      );
    });

    it('should emit generating stage', () => {
      const callback = jest.fn();
      statusEmitter.emit(callback, ProcessingStage.GENERATING);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ProcessingStage.GENERATING,
          message: 'Crafting your answer...',
          progress: 80
        })
      );
    });

    it('should emit complete stage', () => {
      const callback = jest.fn();
      statusEmitter.emit(callback, ProcessingStage.COMPLETE);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ProcessingStage.COMPLETE,
          message: 'Done!',
          progress: 100
        })
      );
    });

    it('should not crash when callback is undefined', () => {
      expect(() => {
        statusEmitter.emit(undefined, ProcessingStage.ANALYZING);
      }).not.toThrow();
    });
  });

  // ========================================================================
  // ISSUE #3: POST-PROCESSING CLEANUP
  // ========================================================================

  describe('Post-Processing Cleanup', () => {
    describe('Remove inline page citations', () => {
      it('should remove [p.X] pattern', () => {
        const input = 'The revenue is $2.5M [p.1]. Growth is 257% [p.4].';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('[p.1]');
        expect(output).not.toContain('[p.4]');
        expect(output).toContain('The revenue is $2.5M');
        expect(output).toContain('Growth is 257%');
      });

      it('should remove [page X] pattern', () => {
        const input = 'Data from [page 5] shows trends.';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('[page 5]');
        expect(output).toContain('Data from shows trends');
      });

      it('should remove multiple citations in a row', () => {
        const input = 'The data [p.1][p.4][p.5] confirms this.';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('[p.1]');
        expect(output).not.toContain('[p.4]');
        expect(output).not.toContain('[p.5]');
      });
    });

    describe('Remove document name citations', () => {
      it('should remove document citations', () => {
        const input = 'According to [Koda Business Plan.pdf], revenue is $2.5M.';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('[Koda Business Plan.pdf]');
        expect(output).toContain('revenue is $2.5M');
      });

      it('should remove various file extensions', () => {
        const extensions = ['pdf', 'docx', 'xlsx', 'pptx', 'txt'];

        extensions.forEach(ext => {
          const input = `Data from [document.${ext}] shows trends.`;
          const output = postProcessor.process(input, []);
          expect(output).not.toContain(`[document.${ext}]`);
        });
      });

      it('should remove citations with special characters', () => {
        const input = 'From [Koda blueprint (1).docx] we see...';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('[Koda blueprint (1).docx]');
      });
    });

    describe('Normalize spacing', () => {
      it('should limit to 2 consecutive line breaks', () => {
        const input = 'Paragraph 1.\n\n\n\n\nParagraph 2.';
        const output = postProcessor.process(input, []);

        expect(output).toBe('Paragraph 1.\n\nParagraph 2.');
      });

      it('should remove trailing whitespace from lines', () => {
        const input = 'Line 1   \nLine 2  ';
        const output = postProcessor.process(input, []);

        expect(output).toBe('Line 1\nLine 2');
      });

      it('should remove space before punctuation', () => {
        const input = 'Hello , world !';
        const output = postProcessor.process(input, []);

        expect(output).toBe('Hello, world!');
      });
    });

    describe('Remove emoji', () => {
      it('should remove common emoji', () => {
        const input = 'Stopped Searching ⏸️';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('⏸️');
        expect(output).toContain('Stopped Searching');
      });

      it('should remove various emoji types', () => {
        const input = '🔍 Searching 📄 Documents ✅ Complete ⚠️ Warning';
        const output = postProcessor.process(input, []);

        expect(output).not.toContain('🔍');
        expect(output).not.toContain('📄');
        expect(output).not.toContain('✅');
        expect(output).not.toContain('⚠️');
      });
    });

    describe('Add sources section', () => {
      it('should add sources section at bottom', () => {
        const sources = [
          { documentId: '1', documentName: 'Business Plan.pdf', pageNumber: 1 },
          { documentId: '2', documentName: 'Financial Report.xlsx' }
        ];
        const output = postProcessor.process('Some content', sources);

        expect(output).toContain('---');
        expect(output).toContain('**Sources:**');
        expect(output).toContain('Business Plan.pdf');
        expect(output).toContain('Financial Report.xlsx');
      });

      it('should group sources by document', () => {
        const sources = [
          { documentId: '1', documentName: 'Plan.pdf', pageNumber: 1 },
          { documentId: '1', documentName: 'Plan.pdf', pageNumber: 4 },
          { documentId: '1', documentName: 'Plan.pdf', pageNumber: 5 }
        ];
        const output = postProcessor.process('Content', sources);

        expect(output).toContain('Plan.pdf (page 1, page 4, page 5)');
      });
    });
  });

  // ========================================================================
  // ISSUE #4: FILE VALIDATION
  // ========================================================================

  describe('File Validation', () => {
    describe('Client-side validation', () => {
      it('should reject unsupported file types', () => {
        const file = {
          type: 'application/exe',
          size: 1024,
          name: 'test.exe'
        };
        const result = fileValidator.validateClientSide(file);

        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe(ValidationErrorCode.UNSUPPORTED_TYPE);
        expect(result.suggestion).toContain('convert');
      });

      it('should reject files over 50MB', () => {
        const file = {
          type: 'application/pdf',
          size: 51 * 1024 * 1024, // 51MB
          name: 'large.pdf'
        };
        const result = fileValidator.validateClientSide(file);

        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe(ValidationErrorCode.FILE_TOO_LARGE);
        expect(result.error).toContain('51.00MB');
      });

      it('should accept valid PDFs under 50MB', () => {
        const file = {
          type: 'application/pdf',
          size: 1024 * 1024, // 1MB
          name: 'test.pdf'
        };
        const result = fileValidator.validateClientSide(file);

        expect(result.isValid).toBe(true);
      });

      it('should accept all supported file types', () => {
        const supportedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
          'image/jpeg',
          'image/png'
        ];

        supportedTypes.forEach(type => {
          const file = { type, size: 1024, name: 'test' };
          const result = fileValidator.validateClientSide(file);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('Server-side validation', () => {
      it('should validate file type on server', async () => {
        const buffer = Buffer.from('test content');
        const result = await fileValidator.validateServerSide(
          buffer,
          'application/exe',
          'test.exe'
        );

        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe(ValidationErrorCode.UNSUPPORTED_TYPE);
      });

      it('should check file size on server', async () => {
        const buffer = Buffer.alloc(51 * 1024 * 1024); // 51MB
        const result = await fileValidator.validateServerSide(
          buffer,
          'application/pdf',
          'large.pdf'
        );

        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe(ValidationErrorCode.FILE_TOO_LARGE);
      });
    });
  });

  // ========================================================================
  // ISSUE #5: CACHING (using existing cache.service.ts)
  // ========================================================================

  describe('Caching Service', () => {
    beforeEach(async () => {
      // Clear cache before each test
      await cacheService.clearAll();
    });

    it('should cache and retrieve values', async () => {
      const key = 'test_key_123';
      const value = { name: 'Test User', email: 'test@example.com' };

      await cacheService.set(key, value, { ttl: 60 });
      const cached = await cacheService.get(key);

      expect(cached).toEqual(value);
    });

    it('should return null for cache miss', async () => {
      const cached = await cacheService.get('non_existent_key');
      expect(cached).toBeNull();
    });

    it('should cache embeddings', async () => {
      const text = 'test text for embedding';
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

      await cacheService.cacheEmbedding(text, embedding);
      const cached = await cacheService.getCachedEmbedding(text);

      expect(cached).toEqual(embedding);
    });

    it('should cache search results', async () => {
      const userId = 'user123';
      const query = 'test query';
      const results = [{ id: '1', score: 0.95 }];

      await cacheService.cacheSearchResults(userId, query, results);
      const cached = await cacheService.getCachedSearchResults(userId, query);

      expect(cached).toEqual(results);
    });

    it('should invalidate user cache', async () => {
      const userId = 'user456';
      const key = `documents_list:${userId}`;
      const documents = [{ id: '1', name: 'test.pdf' }];

      await cacheService.set(key, documents, { ttl: 60 });
      await cacheService.invalidateDocumentListCache(userId);

      const cached = await cacheService.get(key);
      expect(cached).toBeNull();
    });

    it('should cache document buffers', async () => {
      const documentId = 'doc123';
      const buffer = Buffer.from('test document content');

      await cacheService.cacheDocumentBuffer(documentId, buffer);
      const cached = await cacheService.getCachedDocumentBuffer(documentId);

      expect(cached).toEqual(buffer);
    });

    it('should generate consistent cache keys', () => {
      const key1 = cacheService.generateKey('prefix', 'arg1', 'arg2');
      const key2 = cacheService.generateKey('prefix', 'arg1', 'arg2');
      const key3 = cacheService.generateKey('prefix', 'arg1', 'different');

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  // ========================================================================
  // INTEGRATION TEST: Full UX Flow
  // ========================================================================

  describe('Integration: Full UX Flow', () => {
    it('should process greeting through fast path', async () => {
      const query = 'hello';

      // Step 1: Fast path detection
      const fastPath = await fastPathDetector.detect(query);
      expect(fastPath.isFastPath).toBe(true);
      expect(fastPath.response).toBeDefined();

      // Response should be instant (< 100ms)
      const startTime = Date.now();
      await fastPathDetector.detect(query);
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    it('should validate and process file upload', async () => {
      const file = {
        type: 'application/pdf',
        size: 1024 * 1024, // 1MB
        name: 'test.pdf'
      };

      // Step 1: Client-side validation
      const clientValidation = fileValidator.validateClientSide(file);
      expect(clientValidation.isValid).toBe(true);

      // Step 2: Server-side validation
      const buffer = Buffer.from('mock pdf content');
      const serverValidation = await fileValidator.validateServerSide(
        buffer,
        file.type,
        file.name
      );
      expect(serverValidation.isValid).toBe(true);
    });

    it('should process RAG response with post-processing', () => {
      const rawResponse = 'Revenue is $2.5M [p.1]. From [Business Plan.pdf] we see growth 🚀.';
      const sources = [
        { documentId: '1', documentName: 'Business Plan.pdf', pageNumber: 1 }
      ];

      // Post-process response
      const cleaned = postProcessor.process(rawResponse, sources);

      // Verify cleanup
      expect(cleaned).not.toContain('[p.1]');
      expect(cleaned).not.toContain('[Business Plan.pdf]');
      expect(cleaned).not.toContain('🚀');

      // Verify sources section added
      expect(cleaned).toContain('---');
      expect(cleaned).toContain('**Sources:**');
      expect(cleaned).toContain('Business Plan.pdf');
    });
  });

  // ========================================================================
  // PERFORMANCE TESTS
  // ========================================================================

  describe('Performance', () => {
    it('fast path should be < 100ms', async () => {
      const startTime = Date.now();
      await fastPathDetector.detect('hello');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('post-processing should be < 10ms', () => {
      const longText = 'Lorem ipsum '.repeat(1000) + '[p.1] [Document.pdf]';

      const startTime = Date.now();
      postProcessor.process(longText, []);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10);
    });

    it('file validation should be < 5ms', () => {
      const file = {
        type: 'application/pdf',
        size: 1024,
        name: 'test.pdf'
      };

      const startTime = Date.now();
      fileValidator.validateClientSide(file);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5);
    });

    it('cache operations should be < 1ms', async () => {
      const key = 'perf_test';
      const value = { data: 'test' };

      const startTime = Date.now();
      await cacheService.set(key, value, { ttl: 60 });
      await cacheService.get(key);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1);
    });
  });
});
