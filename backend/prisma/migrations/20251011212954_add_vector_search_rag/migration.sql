-- CreateTable
CREATE TABLE "document_embeddings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "terminology_maps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "terminology_maps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chat_contexts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "sourceDocuments" TEXT NOT NULL,
    "webSources" TEXT,
    "searchQuery" TEXT,
    "expandedTerms" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_contexts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "document_embeddings_documentId_idx" ON "document_embeddings"("documentId");

-- CreateIndex
CREATE INDEX "document_embeddings_documentId_chunkIndex_idx" ON "document_embeddings"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "terminology_maps_userId_idx" ON "terminology_maps"("userId");

-- CreateIndex
CREATE INDEX "terminology_maps_term_idx" ON "terminology_maps"("term");

-- CreateIndex
CREATE INDEX "terminology_maps_domain_idx" ON "terminology_maps"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "terminology_maps_userId_term_domain_key" ON "terminology_maps"("userId", "term", "domain");

-- CreateIndex
CREATE INDEX "chat_contexts_conversationId_idx" ON "chat_contexts"("conversationId");

-- CreateIndex
CREATE INDEX "chat_contexts_messageId_idx" ON "chat_contexts"("messageId");
