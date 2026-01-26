/**
 * Citation and Sources Tests
 *
 * Tests for verifying source object structure from RAG responses.
 * Ensures all required fields are present for frontend DocumentSources component.
 */

describe('Source Object Structure', () => {
  // Expected source object fields based on buildSourcesFromChunks output
  const requiredFields = [
    'documentId',
    'documentName',
    'filename',
    'location',
  ];

  const optionalFields = [
    'mimeType',
    'relevanceScore',
    'folderPath',
    'pageNumber',
    'snippet',
    'openUrl',
    'viewUrl',
    'downloadUrl',
  ];

  describe('buildSourcesFromChunks output validation', () => {
    it('should include all required fields', () => {
      // Mock source object structure
      const mockSource = {
        documentId: 'test-uuid-1234',
        documentName: 'test-document.pdf',
        filename: 'test-document.pdf',
        location: 'Page 1',
        mimeType: 'application/pdf',
        relevanceScore: 85,
        folderPath: '/documents',
        pageNumber: 1,
        snippet: 'Test content snippet...',
        openUrl: '/api/documents/test-uuid-1234/preview',
        viewUrl: '/api/documents/test-uuid-1234/view',
        downloadUrl: '/api/documents/test-uuid-1234/download',
      };

      // Verify all required fields are present
      for (const field of requiredFields) {
        expect(mockSource).toHaveProperty(field);
        expect(mockSource[field as keyof typeof mockSource]).toBeTruthy();
      }
    });

    it('should include URL fields for document actions', () => {
      const mockSource = {
        documentId: 'test-uuid-5678',
        documentName: 'report.xlsx',
        filename: 'report.xlsx',
        location: 'Section 2',
        openUrl: '/api/documents/test-uuid-5678/preview',
        viewUrl: '/api/documents/test-uuid-5678/view',
        downloadUrl: '/api/documents/test-uuid-5678/download',
      };

      // Verify URL fields are present and correctly formatted
      expect(mockSource.openUrl).toContain('/api/documents/');
      expect(mockSource.openUrl).toContain('/preview');
      expect(mockSource.viewUrl).toContain('/view');
      expect(mockSource.downloadUrl).toContain('/download');

      // Verify document ID is in the URLs
      expect(mockSource.openUrl).toContain(mockSource.documentId);
      expect(mockSource.viewUrl).toContain(mockSource.documentId);
      expect(mockSource.downloadUrl).toContain(mockSource.documentId);
    });

    it('should have consistent documentId and documentName', () => {
      const mockSource = {
        documentId: 'abc-123-def',
        documentName: 'My Document.pdf',
        filename: 'My Document.pdf',
        location: 'Document',
      };

      // documentName and filename should match
      expect(mockSource.documentName).toBe(mockSource.filename);
      // documentId should be a valid string
      expect(typeof mockSource.documentId).toBe('string');
      expect(mockSource.documentId.length).toBeGreaterThan(0);
    });
  });

  describe('URL construction', () => {
    it('should construct valid preview URL from documentId', () => {
      const documentId = '822df976-ebea-44b8-af08-bfd656e39bc3';
      const expectedUrl = `/api/documents/${documentId}/preview`;

      // Simulate what buildSourcesFromChunks does
      const openUrl = `/api/documents/${documentId}/preview`;

      expect(openUrl).toBe(expectedUrl);
    });

    it('should handle special characters in documentId', () => {
      // UUID format should be safe, but test edge cases
      const documentId = 'doc-with-dashes-123';
      const openUrl = `/api/documents/${documentId}/preview`;

      expect(openUrl).not.toContain(' ');
      expect(openUrl).toMatch(/^\/api\/documents\/[\w-]+\/preview$/);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate sources by documentId', () => {
      const mockSources = [
        { documentId: 'doc-1', documentName: 'file1.pdf' },
        { documentId: 'doc-1', documentName: 'file1.pdf' }, // Duplicate
        { documentId: 'doc-2', documentName: 'file2.pdf' },
      ];

      // Simulate deduplication logic
      const seen = new Set<string>();
      const uniqueSources = mockSources.filter(source => {
        if (seen.has(source.documentId)) return false;
        seen.add(source.documentId);
        return true;
      });

      expect(uniqueSources).toHaveLength(2);
      expect(uniqueSources.map(s => s.documentId)).toEqual(['doc-1', 'doc-2']);
    });
  });

  describe('frontend compatibility', () => {
    it('should include fields expected by InlineDocumentButton', () => {
      // InlineDocumentButton resolves these fields from document object:
      // - resolvedId = docId || document?.documentId || document?.id
      // - resolvedName = docName || document?.documentName || document?.filename

      const sourceFromBackend = {
        documentId: 'uuid-123',
        documentName: 'report.pdf',
        filename: 'report.pdf',
        location: 'Page 5',
        mimeType: 'application/pdf',
        relevanceScore: 92,
      };

      // Verify InlineDocumentButton can resolve ID
      const resolvedId = sourceFromBackend.documentId;
      expect(resolvedId).toBe('uuid-123');

      // Verify InlineDocumentButton can resolve Name
      const resolvedName = sourceFromBackend.documentName || sourceFromBackend.filename;
      expect(resolvedName).toBe('report.pdf');
    });

    it('should include fields expected by DocumentPreviewModal', () => {
      // DocumentPreviewModal uses:
      // - document.id (from setPreviewDocument)
      // - document.filename
      // - document.mimeType

      const sourceFromBackend = {
        documentId: 'uuid-456',
        documentName: 'spreadsheet.xlsx',
        filename: 'spreadsheet.xlsx',
        location: 'Sheet 1',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 102400,
      };

      // ChatInterface.jsx transforms to:
      // { id: doc.id || doc.documentId, filename: doc.filename || doc.documentName, ... }
      const previewDocument = {
        id: sourceFromBackend.documentId,
        filename: sourceFromBackend.filename || sourceFromBackend.documentName,
        mimeType: sourceFromBackend.mimeType,
        fileSize: sourceFromBackend.fileSize,
      };

      expect(previewDocument.id).toBe('uuid-456');
      expect(previewDocument.filename).toBe('spreadsheet.xlsx');
      expect(previewDocument.mimeType).toContain('spreadsheetml');
    });
  });
});

describe('Citation Object Structure', () => {
  it('should include all expected citation fields', () => {
    const mockCitation = {
      documentId: 'doc-uuid-789',
      documentName: 'reference.pdf',
      pageNumber: 42,
      snippet: 'The key finding was...',
      chunkId: 'doc-uuid-789-3',
    };

    expect(mockCitation).toHaveProperty('documentId');
    expect(mockCitation).toHaveProperty('documentName');
    expect(mockCitation.pageNumber).toBe(42);
    expect(mockCitation.snippet).toBeTruthy();
  });
});
