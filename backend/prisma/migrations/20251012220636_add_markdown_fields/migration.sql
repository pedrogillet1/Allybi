-- AlterTable
ALTER TABLE "document_metadata" ADD COLUMN "markdownContent" TEXT;
ALTER TABLE "document_metadata" ADD COLUMN "markdownStructure" TEXT;
ALTER TABLE "document_metadata" ADD COLUMN "markdownUrl" TEXT;
ALTER TABLE "document_metadata" ADD COLUMN "sheetCount" INTEGER;
ALTER TABLE "document_metadata" ADD COLUMN "slideCount" INTEGER;
