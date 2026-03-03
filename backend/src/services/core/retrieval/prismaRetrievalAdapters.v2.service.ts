import { logger } from "../../../utils/logger";
import {
  PrismaRetrievalAdapterFactory as PrismaRetrievalAdapterFactoryV1,
  type PrismaRetrievalEngineDependencies,
} from "./prismaRetrievalAdapters.service";
import type {
  ChunkLocation,
  DocStore,
  LexicalIndex,
  SemanticIndex,
  StructuralIndex,
} from "./retrievalEngine.service";

type RetrievalHit = {
  docId: string;
  location: ChunkLocation;
  snippet: string;
  score: number;
  locationKey?: string;
  chunkId?: string;
  title?: string | null;
  filename?: string | null;
};

export class RetrievalAdapterDependencyError extends Error {
  readonly code = "RETRIEVAL_ADAPTER_DEPENDENCY_ERROR";
  readonly operation: string;
  readonly userId: string;

  constructor(params: {
    operation: string;
    userId: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "RetrievalAdapterDependencyError";
    this.operation = params.operation;
    this.userId = params.userId;
    if (params.cause !== undefined) {
      (this as any).cause = params.cause;
    }
  }
}

function sortHitsStable(hits: RetrievalHit[]): RetrievalHit[] {
  return [...hits].sort((a, b) => {
    const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDelta !== 0) return scoreDelta;
    const docDelta = String(a.docId || "").localeCompare(String(b.docId || ""));
    if (docDelta !== 0) return docDelta;
    const locDelta = String(a.locationKey || "").localeCompare(
      String(b.locationKey || ""),
    );
    if (locDelta !== 0) return locDelta;
    return String(a.chunkId || "").localeCompare(String(b.chunkId || ""));
  });
}

class StableSemanticIndex implements SemanticIndex {
  constructor(
    private readonly userId: string,
    private readonly delegate: SemanticIndex,
  ) {}

  async search(opts: {
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<RetrievalHit[]> {
    try {
      const hits = await this.delegate.search(opts);
      return sortHitsStable(hits).slice(0, Math.max(1, opts.k));
    } catch (error: any) {
      logger.warn("[retrieval-adapters-v2] semantic search failed", {
        userId: this.userId,
        error: String(error?.message || error || "unknown_error"),
      });
      throw new RetrievalAdapterDependencyError({
        operation: "semantic_search",
        userId: this.userId,
        message: "Semantic retrieval dependency failed.",
        cause: error,
      });
    }
  }
}

class StableLexicalIndex implements LexicalIndex {
  constructor(
    private readonly userId: string,
    private readonly delegate: LexicalIndex,
  ) {}

  async search(opts: {
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<RetrievalHit[]> {
    try {
      const hits = await this.delegate.search(opts);
      return sortHitsStable(hits).slice(0, Math.max(1, opts.k));
    } catch (error: any) {
      logger.warn("[retrieval-adapters-v2] lexical search failed", {
        userId: this.userId,
        error: String(error?.message || error || "unknown_error"),
      });
      throw new RetrievalAdapterDependencyError({
        operation: "lexical_search",
        userId: this.userId,
        message: "Lexical retrieval dependency failed.",
        cause: error,
      });
    }
  }
}

class StableStructuralIndex implements StructuralIndex {
  constructor(
    private readonly userId: string,
    private readonly delegate: StructuralIndex,
  ) {}

  async search(opts: {
    query: string;
    docIds?: string[];
    k: number;
    anchors: string[];
  }): Promise<RetrievalHit[]> {
    try {
      const hits = await this.delegate.search(opts);
      return sortHitsStable(hits).slice(0, Math.max(1, opts.k));
    } catch (error: any) {
      logger.warn("[retrieval-adapters-v2] structural search failed", {
        userId: this.userId,
        error: String(error?.message || error || "unknown_error"),
      });
      throw new RetrievalAdapterDependencyError({
        operation: "structural_search",
        userId: this.userId,
        message: "Structural retrieval dependency failed.",
        cause: error,
      });
    }
  }
}

class StableDocStore implements DocStore {
  constructor(
    private readonly userId: string,
    private readonly delegate: DocStore,
  ) {}

  async listDocs() {
    try {
      return await this.delegate.listDocs();
    } catch (error: any) {
      logger.warn("[retrieval-adapters-v2] listDocs failed", {
        userId: this.userId,
        error: String(error?.message || error || "unknown_error"),
      });
      throw new RetrievalAdapterDependencyError({
        operation: "docstore_list_docs",
        userId: this.userId,
        message: "Document listing dependency failed.",
        cause: error,
      });
    }
  }

  async getDocMeta(docId: string) {
    try {
      return await this.delegate.getDocMeta(docId);
    } catch (error: any) {
      logger.warn("[retrieval-adapters-v2] getDocMeta failed", {
        userId: this.userId,
        docId,
        error: String(error?.message || error || "unknown_error"),
      });
      throw new RetrievalAdapterDependencyError({
        operation: "docstore_get_doc_meta",
        userId: this.userId,
        message: `Document metadata dependency failed for ${docId}.`,
        cause: error,
      });
    }
  }
}

export class PrismaRetrievalAdapterFactoryV2 {
  private readonly delegate = new PrismaRetrievalAdapterFactoryV1();

  createForUser(userId: string): PrismaRetrievalEngineDependencies {
    const deps = this.delegate.createForUser(userId);
    return {
      docStore: new StableDocStore(userId, deps.docStore),
      semanticIndex: new StableSemanticIndex(userId, deps.semanticIndex),
      lexicalIndex: new StableLexicalIndex(userId, deps.lexicalIndex),
      structuralIndex: new StableStructuralIndex(userId, deps.structuralIndex),
    };
  }
}
