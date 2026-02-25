// Prisma retrieval adapters — concrete implementations of DocStore, SemanticIndex, etc.
export type { PrismaRetrievalEngineDependencies } from "../../../services/core/retrieval/prismaRetrievalAdapters.service";
export { PrismaRetrievalAdapterFactory } from "../../../services/core/retrieval/prismaRetrievalAdapters.service";

// Embedding service — generates vector embeddings
export type {
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingOptions,
} from "../../../services/retrieval/embedding.service";
export { EmbeddingsService } from "../../../services/retrieval/embedding.service";

// Pinecone — vector database integration
export type {
  DocumentMetadataForPinecone,
  ChunkForPineconeUpsert,
  PineconeSearchHit,
  PineconeQueryOptions,
} from "../../../services/retrieval/pinecone.service";
export { PineconeService } from "../../../services/retrieval/pinecone.service";

// Vector embedding — high-level embedding store operations
export type {
  InputChunk,
  StoreEmbeddingsOptions,
} from "../../../services/retrieval/vectorEmbedding.service";
export {
  generateEmbedding,
  storeDocumentEmbeddings,
  deleteDocumentEmbeddings,
  deleteChunkEmbeddings,
  vectorEmbeddingService,
} from "../../../services/retrieval/vectorEmbedding.service";

// Chunk encryption
export { ChunkCryptoService } from "../../../services/retrieval/chunkCrypto.service";

// GCS storage
export type { GcsStorageConfig } from "../../../services/retrieval/gcsStorage.service";
export {
  GcsStorageService,
  GcsStorageError,
} from "../../../services/retrieval/gcsStorage.service";
