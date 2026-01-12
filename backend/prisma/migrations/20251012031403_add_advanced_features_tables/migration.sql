-- AlterTable
ALTER TABLE "documents" ADD COLUMN "renderableContent" TEXT;

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "generationType" TEXT NOT NULL,
    "sourceDocumentIds" TEXT NOT NULL,
    "generationPrompt" TEXT,
    "templateId" TEXT,
    "renderableContent" TEXT NOT NULL,
    "metadata" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "document_edit_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generatedDocumentId" TEXT NOT NULL,
    "editNumber" INTEGER NOT NULL,
    "editType" TEXT NOT NULL,
    "editCommand" TEXT,
    "editDescription" TEXT NOT NULL,
    "contentBefore" TEXT NOT NULL,
    "contentAfter" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_edit_history_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "generated_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "excel_sheets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "metadata" TEXT,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "excel_cells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "colIndex" INTEGER NOT NULL,
    "value" TEXT,
    "formula" TEXT,
    "dataType" TEXT NOT NULL,
    "style" TEXT,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "excel_cells_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "excel_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_documentId_key" ON "generated_documents"("documentId");

-- CreateIndex
CREATE INDEX "generated_documents_userId_idx" ON "generated_documents"("userId");

-- CreateIndex
CREATE INDEX "generated_documents_documentId_idx" ON "generated_documents"("documentId");

-- CreateIndex
CREATE INDEX "generated_documents_generationType_idx" ON "generated_documents"("generationType");

-- CreateIndex
CREATE INDEX "generated_documents_templateId_idx" ON "generated_documents"("templateId");

-- CreateIndex
CREATE INDEX "document_templates_userId_idx" ON "document_templates"("userId");

-- CreateIndex
CREATE INDEX "document_templates_category_idx" ON "document_templates"("category");

-- CreateIndex
CREATE INDEX "document_templates_isSystem_idx" ON "document_templates"("isSystem");

-- CreateIndex
CREATE INDEX "document_edit_history_generatedDocumentId_idx" ON "document_edit_history"("generatedDocumentId");

-- CreateIndex
CREATE INDEX "document_edit_history_editNumber_idx" ON "document_edit_history"("editNumber");

-- CreateIndex
CREATE INDEX "document_edit_history_editedBy_idx" ON "document_edit_history"("editedBy");

-- CreateIndex
CREATE INDEX "excel_sheets_documentId_idx" ON "excel_sheets"("documentId");

-- CreateIndex
CREATE INDEX "excel_sheets_expiresAt_idx" ON "excel_sheets"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "excel_sheets_documentId_sheetIndex_key" ON "excel_sheets"("documentId", "sheetIndex");

-- CreateIndex
CREATE INDEX "excel_cells_sheetId_idx" ON "excel_cells"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "excel_cells_sheetId_rowIndex_colIndex_key" ON "excel_cells"("sheetId", "rowIndex", "colIndex");
