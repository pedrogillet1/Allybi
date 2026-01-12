-- CreateTable
CREATE TABLE "chat_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdownContent" TEXT NOT NULL,
    "documentType" TEXT,
    "sourceDocumentId" TEXT,
    "pdfUrl" TEXT,
    "docxUrl" TEXT,
    "wordCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "chat_documents_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDocument" BOOLEAN NOT NULL DEFAULT false,
    "documentTitle" TEXT,
    "documentFormat" TEXT,
    "markdownContent" TEXT,
    CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_messages" ("content", "conversationId", "createdAt", "id", "metadata", "role") SELECT "content", "conversationId", "createdAt", "id", "metadata", "role" FROM "messages";
DROP TABLE "messages";
ALTER TABLE "new_messages" RENAME TO "messages";
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");
CREATE INDEX "messages_isDocument_idx" ON "messages"("isDocument");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "chat_documents_messageId_idx" ON "chat_documents"("messageId");

-- CreateIndex
CREATE INDEX "chat_documents_conversationId_idx" ON "chat_documents"("conversationId");

-- CreateIndex
CREATE INDEX "chat_documents_userId_idx" ON "chat_documents"("userId");

-- CreateIndex
CREATE INDEX "chat_documents_expiresAt_idx" ON "chat_documents"("expiresAt");
