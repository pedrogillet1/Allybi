-- CreateTable
CREATE TABLE "document_entities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "textIndex" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "document_keywords" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "document_entities_documentId_entityType_idx" ON "document_entities"("documentId", "entityType");

-- CreateIndex
CREATE INDEX "document_entities_documentId_idx" ON "document_entities"("documentId");

-- CreateIndex
CREATE INDEX "document_entities_entityType_idx" ON "document_entities"("entityType");

-- CreateIndex
CREATE INDEX "document_entities_value_idx" ON "document_entities"("value");

-- CreateIndex
CREATE INDEX "document_entities_normalizedValue_idx" ON "document_entities"("normalizedValue");

-- CreateIndex
CREATE INDEX "document_keywords_documentId_idx" ON "document_keywords"("documentId");

-- CreateIndex
CREATE INDEX "document_keywords_word_idx" ON "document_keywords"("word");
