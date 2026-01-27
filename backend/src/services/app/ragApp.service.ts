// src/services/app/ragApp.service.ts
import type { Request } from 'express';
import type { Attachment } from '../../types/handlerResult.types';

import { KodaOrchestratorV3Service } from '../core/orchestration/kodaOrchestrator.service';
import { FileInventoryService } from '../files/fileInventory.service';

/**
 * RagAppService
 * Controller-facing facade for RAG endpoints (search + grounded chat).
 *
 * Responsibilities:
 * - “RAG search” endpoint: return evidence/snippets + doc list (no answer composition)
 * - “RAG chat” endpoint: delegate to orchestrator and stream via controller/SSE
 * - Keep a stable, ChatGPT-like response contract:
 *    - answer: string
 *    - attachments: Attachment[] (source_buttons, file_list, etc)
 *    - meta: { answerMode, followUpSuggestions, requestId, timings, ... }
 *
 * NOTE: Streaming is handled in controllers (SSE). This service returns non-stream results
 * and supports building the same payload shape.
 */

export interface RagSearchParams {
  query: string;
  limitDocs?: number;
  limitChunks?: number;
  filters?: {
    docIds?: string[];
    docTypes?: string[];
    folderIds?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  mode?: 'hybrid' | 'lexical' | 'semantic';
}

export interface RagChunk {
  docId: string;
  docTitle?: string;
  fileName?: string;
  docType?: string;
  score: number;
  text: string;
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  slideNumber?: number;
  cellRange?: string;
  chunkId?: string;
  tags?: string[];
}

export interface RagSearchResult {
  query: string;
  docs: Array<{
    docId: string;
    title?: string;
    fileName?: string;
    docType?: string;
    score?: number;
  }>;
  chunks: RagChunk[];
  meta: {
    requestId: string;
    usedMode: string;
    scoped: boolean;
    reasonCode?: string;
  };
}

export interface RagAnswerResult {
  answer: string;
  attachments: Attachment[];
  meta: {
    requestId: string;
    answerMode: string | null;
    followUpSuggestions?: string[];
    timings?: Record<string, number>;
    confidence?: number;
    domain?: string | null;
  };
}

function getActor(req: Request): { userId: string } {
  const anyReq: any = req as any;
  const userId =
    anyReq.user?.id ||
    anyReq.user?.userId ||
    anyReq.auth?.userId ||
    anyReq.session?.userId ||
    'guest';
  return { userId: String(userId) };
}

function sanitizeQuery(q: unknown, max = 800): string {
  return String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  const v = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.max(min, Math.min(max, v));
}

export class RagAppService {
  private readonly orchestrator: any = null;
  private readonly inventory: any = null;

  /**
   * Search documents/chunks. This is “retrieval only” and should not generate an answer.
   * Returns: docs + chunks, plus reasonCode when empty in scope.
   */
  async search(req: Request, params: RagSearchParams): Promise<RagSearchResult> {
    const actor = getActor(req);

    const query = sanitizeQuery(params.query);
    if (!query) {
      return {
        query,
        docs: [],
        chunks: [],
        meta: { requestId: this.makeRequestId(), usedMode: params.mode || 'hybrid', scoped: false, reasonCode: 'empty_query' },
      };
    }

    const limitDocs = clampInt(params.limitDocs, 1, 100, 20);
    const limitChunks = clampInt(params.limitChunks, 1, 200, 40);
    const mode = params.mode || 'hybrid';

    // Resolve filters into a stable doc scope (docIds/docTypes/folders).
    const resolvedScope = await this.inventory.resolveScope({
      actor,
      docIds: params.filters?.docIds,
      docTypes: params.filters?.docTypes,
      folderIds: params.filters?.folderIds,
      dateFrom: params.filters?.dateFrom,
      dateTo: params.filters?.dateTo,
      limit: limitDocs,
    });

    const requestId = this.makeRequestId();

    // Delegate to orchestrator retrieval-only path
    const retrieval = await this.orchestrator.retrieveOnly({
      actor,
      requestId,
      query,
      mode,
      scope: resolvedScope,
      limits: { maxDocs: limitDocs, maxChunks: limitChunks },
    });

    return {
      query,
      docs: (retrieval.docs || []).map((d: any) => ({
        docId: d.docId,
        title: d.docTitle,
        fileName: d.fileName,
        docType: d.docType,
        score: d.score,
      })),
      chunks: (retrieval.chunks || []).map((c: any) => ({
        docId: c.docId,
        docTitle: c.docTitle,
        fileName: c.fileName,
        docType: c.docType,
        score: c.score,
        text: c.text,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        sheetName: c.sheetName,
        slideNumber: c.slideNumber,
        cellRange: c.cellRange,
        chunkId: c.chunkId,
        tags: c.tags,
      })),
      meta: {
        requestId,
        usedMode: retrieval.usedMode || mode,
        scoped: !!resolvedScope?.isScoped,
        reasonCode: retrieval.reasonCode,
      },
    };
  }

  /**
   * Non-streaming “answer with sources” endpoint (if you still want it).
   * For streaming chat: controller should call orchestrator.stream().
   */
  async answer(req: Request, input: {
    query: string;
    conversationId?: string | null;
    attachedDocumentId?: string | null;
    regenCount?: number;
    regenerateMessageId?: string | null;
    filters?: RagSearchParams['filters'];
  }): Promise<RagAnswerResult> {
    const actor = getActor(req);

    const query = sanitizeQuery(input.query);
    const requestId = this.makeRequestId();

    const scope = await this.inventory.resolveScope({
      actor,
      docIds: input.filters?.docIds,
      docTypes: input.filters?.docTypes,
      folderIds: input.filters?.folderIds,
      dateFrom: input.filters?.dateFrom,
      dateTo: input.filters?.dateTo,
      limit: 200,
      // attachedDocumentId narrows but doesn’t hard-lock unless orchestrator decides to
      preferredDocId: input.attachedDocumentId || undefined,
    });

    const result = await this.orchestrator.runOnce({
      actor,
      requestId,
      query,
      conversationId: input.conversationId || null,
      attachedDocumentId: input.attachedDocumentId || null,
      regenCount: input.regenCount ?? 0,
      regenerateMessageId: input.regenerateMessageId || null,
      scope,
    });

    return {
      answer: result.content,
      attachments: result.attachments || [],
      meta: {
        requestId,
        answerMode: result.meta?.answerMode || result.meta?.context?.answerMode || null,
        followUpSuggestions: result.meta?.followupSuggestions,
        timings: result.meta?.timings,
        confidence: result.meta?.confidence,
        domain: result.meta?.context?.domain ?? null,
      },
    };
  }

  private makeRequestId(): string {
    // stable enough for UI correlation
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

let _ragApp: RagAppService | null = null;
export function getRagAppService(): RagAppService {
  if (!_ragApp) _ragApp = new RagAppService();
  return _ragApp;
}
