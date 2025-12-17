/**
 * Session Controller
 * Handles session-based document analysis endpoints
 *
 * Features:
 * - Create new analysis session
 * - Upload documents to session
 * - Query documents within session
 * - Compare documents in session
 * - Save session documents to library
 * - Discard session
 */

import { Request, Response } from 'express';
// REMOVED: sessionStorageService, metadataExtractionService, documentComparisonService - deleted services
import textExtractionService from '../services/textExtraction.service';
import { getContainer } from '../bootstrap/container';
// embeddingService now accessed via getContainer().getEmbedding()
import prisma from '../config/database';
import crypto from 'crypto';

// Stub services for removed functionality
interface SessionDocument {
  id: string;
  filename: string;
  mimeType: string;
  content: string;
  metadata: {
    author?: string;
    creationDate?: string;
    language?: string;
    fileType?: string;
    [key: string]: any;
  };
}

interface Session {
  id: string;
  userId: string;
  documents: SessionDocument[];
  createdAt: Date;
}

const sessionStorageService = {
  createSession: async (_userId: string): Promise<Session> => {
    return {
      id: crypto.randomUUID(),
      userId: _userId,
      documents: [],
      createdAt: new Date(),
    };
  },
  getSession: async (_sessionId: string): Promise<Session | null> => null,
  getSessionStats: async (_sessionId: string) => ({
    documentCount: 0,
    totalSize: 0,
  }),
  deleteSession: async (_sessionId: string): Promise<void> => {},
  storeDocument: async (_sessionId: string, _doc: any): Promise<SessionDocument> => {
    return { id: '', filename: '', mimeType: '', content: '', metadata: {} };
  },
  addDocument: async (_sessionId: string, _doc: any): Promise<SessionDocument> => {
    return { id: '', filename: '', mimeType: '', content: '', metadata: {} };
  },
  getDocuments: async (_sessionId: string): Promise<SessionDocument[]> => [],
  deleteDocument: async (_sessionId: string, _documentId: string): Promise<void> => {},
  querySession: async (_sessionId: string, _embedding: number[], _topK: number, _threshold: number): Promise<any[]> => [],
  getSessionDocuments: async (_sessionId: string): Promise<any[]> => [],
};

const metadataExtractionService = {
  extractMetadata: async (_buffer: Buffer, _filename: string, _mimeType: string, _text: string) => ({
    author: undefined as string | undefined,
    creationDate: undefined as string | undefined,
    language: undefined as string | undefined,
    fileType: undefined as string | undefined,
  }),
};

const documentComparisonService = {
  compareDocuments: async (_docId1: string, _docId2: string, _userId: string) => ({
    similarities: [] as string[],
    differences: [] as string[],
  }),
};
import multer from 'multer';

// Configure multer for session uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/**
 * Create a new session
 */
export const createSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const session = await sessionStorageService.createSession(userId);

    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Create session error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get session details
 */
export const getSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await sessionStorageService.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    // Get session stats
    const stats = await sessionStorageService.getSessionStats(sessionId);

    res.json({
      success: true,
      session,
      stats,
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Get session error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Upload document to session
 */
export const uploadToSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    console.log(`📤 [SessionController] Uploading ${file.originalname} to session ${sessionId}...`);

    // Verify session belongs to user
    const session = await sessionStorageService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Extract text from document
    const extractionResult = await textExtractionService.extractText(
      file.buffer,
      file.mimetype
    );

    // Extract metadata
    const metadata = await metadataExtractionService.extractMetadata(
      file.buffer,
      file.originalname,
      file.mimetype,
      extractionResult.text
    );

    // Create chunks and embeddings
    const chunks = createChunks(extractionResult.text, 1000);
    const chunkEmbeddings = await getContainer().getEmbedding().generateBatchEmbeddings(
      chunks,
      { taskType: 'RETRIEVAL_DOCUMENT' }
    );

    // Create document ID
    const documentId = crypto.randomUUID();

    // Store in session
    await sessionStorageService.addDocument(sessionId, {
      documentId,
      filename: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      extractedText: extractionResult.text,
      chunks: chunkEmbeddings.embeddings.map((emb, idx) => ({
        chunkIndex: idx,
        content: emb.text,
        embedding: emb.embedding,
        document_metadata: {},
      })),
      document_metadata: {
        pageCount: extractionResult.pageCount,
        wordCount: extractionResult.wordCount,
        author: metadata.author,
        creationDate: metadata.creationDate,
        language: metadata.language,
        fileType: metadata.fileType,
      },
      uploadedAt: new Date(),
    });

    console.log(`✅ [SessionController] Document uploaded to session`);

    res.json({
      success: true,
      documentId,
      filename: file.originalname,
      document_metadata: {
        wordCount: extractionResult.wordCount,
        pageCount: extractionResult.pageCount,
        language: metadata.language,
      },
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Query documents within a session
 */
export const querySession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { query, topK = 5 } = req.body;
    const userId = req.user!.id;

    if (!query) {
      res.status(400).json({
        success: false,
        error: 'Query is required',
      });
      return;
    }

    // Verify session
    const session = await sessionStorageService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Generate query embedding
    const embeddingResult = await getContainer().getEmbedding().generateQueryEmbedding(query);

    // Query session
    const results = await sessionStorageService.querySession(
      sessionId,
      embeddingResult.embedding,
      topK,
      0.3
    );

    // Generate answer using RAG
    const documents = await sessionStorageService.getSessionDocuments(sessionId);
    const context = results.map(r => r.content).join('\n\n');

    const answer = await generateAnswerFromContext(query, context);

    res.json({
      success: true,
      answer,
      results,
      documentCount: documents.length,
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Query error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Compare documents in session
 */
export const compareSessionDocuments = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { documentIds, comparisonType = 'full' } = req.body;
    const userId = req.user!.id;

    if (!documentIds || documentIds.length < 2) {
      res.status(400).json({
        success: false,
        error: 'At least 2 document IDs are required',
      });
      return;
    }

    // Verify session
    const session = await sessionStorageService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Compare documents
    const comparison = await documentComparisonService.compareDocuments(
      documentIds[0],
      documentIds[1],
      userId
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Compare error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Save session documents to library
 */
export const saveSessionToLibrary = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { documentIds, folderId } = req.body; // Optional: specific documents to save
    const userId = req.user!.id;

    // Verify session
    const session = await sessionStorageService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Get session documents
    const sessionDocs = await sessionStorageService.getSessionDocuments(sessionId);

    // Filter if specific documents requested
    const docsToSave = documentIds
      ? sessionDocs.filter(d => documentIds.includes(d.documentId))
      : sessionDocs;

    const savedDocuments = [];

    // Save each document to permanent storage
    for (const doc of docsToSave) {
      // Create document record
      const document = await prisma.document.create({
        data: {
          userId,
          folderId: folderId || null,
          filename: doc.filename,
          encryptedFilename: `${crypto.randomUUID()}_${doc.filename}`,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          fileHash: crypto.createHash('sha256').update(doc.extractedText).digest('hex'),
          status: 'completed',
        },
      });

      // Create metadata record
      await prisma.documentMetadata.create({
        data: {
          documentId: document.id,
          extractedText: doc.extractedText,
          wordCount: doc.document_metadata.wordCount,
          pageCount: doc.document_metadata.pageCount,
          author: doc.document_metadata.author,
          creationDate: doc.document_metadata.creationDate,
          language: doc.document_metadata.language,
        },
      });

      // Store embeddings in Pinecone
      const pineconeService = await import('../services/pinecone.service');
      await pineconeService.default.upsertDocumentEmbeddings(
        document.id,
        userId,
        {
          filename: doc.filename,
          mimeType: doc.mimeType,
          createdAt: document.createdAt,
          status: 'completed',
        },
        doc.chunks
      );

      savedDocuments.push({
        documentId: document.id,
        filename: doc.filename,
      });
    }

    console.log(`✅ [SessionController] Saved ${savedDocuments.length} documents to library`);

    res.json({
      success: true,
      savedDocuments,
      count: savedDocuments.length,
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Save error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Discard session
 */
export const discardSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    // Verify session
    const session = await sessionStorageService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Delete session
    await sessionStorageService.deleteSession(sessionId);

    res.json({
      success: true,
      message: 'Session discarded',
    });
  } catch (error: any) {
    console.error('❌ [SessionController] Discard error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * List session documents
 */
export const listSessionDocuments = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    // Verify session
    const session = await sessionStorageService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Get documents
    const documents = await sessionStorageService.getSessionDocuments(sessionId);

    res.json({
      success: true,
      documents: documents.map(d => ({
        documentId: d.documentId,
        filename: d.filename,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        metadata: d.document_metadata,
        uploadedAt: d.uploadedAt,
      })),
    });
  } catch (error: any) {
    console.error('❌ [SessionController] List documents error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Helper functions

/**
 * Create text chunks
 */
function createChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+\s+/);

  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Generate answer from context
 */
async function generateAnswerFromContext(query: string, context: string): Promise<string> {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Based on the following context, answer the question concisely and accurately.

Context:
${context}

Question: ${query}

Answer:`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export default {
  createSession,
  getSession,
  uploadToSession,
  querySession,
  compareSessionDocuments,
  saveSessionToLibrary,
  discardSession,
  listSessionDocuments,
  upload: upload.single('file'),
};
