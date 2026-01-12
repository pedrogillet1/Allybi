-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_generated_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "generationType" TEXT NOT NULL,
    "conversationId" TEXT,
    "isTemporary" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "sourceDocumentIds" TEXT NOT NULL,
    "generationPrompt" TEXT,
    "templateId" TEXT,
    "renderableContent" TEXT NOT NULL,
    "metadata" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedAt" DATETIME,
    CONSTRAINT "generated_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_generated_documents" ("documentId", "generatedAt", "generationPrompt", "generationType", "id", "metadata", "renderableContent", "sourceDocumentIds", "templateId", "userId") SELECT "documentId", "generatedAt", "generationPrompt", "generationType", "id", "metadata", "renderableContent", "sourceDocumentIds", "templateId", "userId" FROM "generated_documents";
DROP TABLE "generated_documents";
ALTER TABLE "new_generated_documents" RENAME TO "generated_documents";
CREATE UNIQUE INDEX "generated_documents_documentId_key" ON "generated_documents"("documentId");
CREATE INDEX "generated_documents_userId_idx" ON "generated_documents"("userId");
CREATE INDEX "generated_documents_documentId_idx" ON "generated_documents"("documentId");
CREATE INDEX "generated_documents_generationType_idx" ON "generated_documents"("generationType");
CREATE INDEX "generated_documents_templateId_idx" ON "generated_documents"("templateId");
CREATE INDEX "generated_documents_conversationId_idx" ON "generated_documents"("conversationId");
CREATE INDEX "generated_documents_isTemporary_idx" ON "generated_documents"("isTemporary");
CREATE INDEX "generated_documents_expiresAt_idx" ON "generated_documents"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
