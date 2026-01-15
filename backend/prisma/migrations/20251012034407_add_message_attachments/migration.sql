-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attachmentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "previewHtml" TEXT,
    "previewCss" TEXT,
    "sourceDocumentIds" TEXT,
    "analysisType" TEXT,
    "metadata" TEXT,
    "editHistory" TEXT,
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

-- CreateIndex
CREATE INDEX "message_attachments_conversationId_idx" ON "message_attachments"("conversationId");

-- CreateIndex
CREATE INDEX "message_attachments_userId_idx" ON "message_attachments"("userId");

-- CreateIndex
CREATE INDEX "message_attachments_attachmentType_idx" ON "message_attachments"("attachmentType");
