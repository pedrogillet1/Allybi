-- AddPreviewPdfFields
-- This migration adds the previewPdf fields to document_metadata for PPTX/DOCX/XLSX PDF preview support.
-- Uses IF NOT EXISTS to be idempotent (safe to run multiple times)

-- Add previewPdfStatus column (default 'pending')
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'document_metadata'
                   AND column_name = 'previewPdfStatus') THEN
        ALTER TABLE "document_metadata" ADD COLUMN "previewPdfStatus" TEXT DEFAULT 'pending';
    END IF;
END $$;

-- Add previewPdfKey column (S3 key for converted PDF)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'document_metadata'
                   AND column_name = 'previewPdfKey') THEN
        ALTER TABLE "document_metadata" ADD COLUMN "previewPdfKey" TEXT;
    END IF;
END $$;

-- Add previewPdfError column (error message if conversion failed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'document_metadata'
                   AND column_name = 'previewPdfError') THEN
        ALTER TABLE "document_metadata" ADD COLUMN "previewPdfError" TEXT;
    END IF;
END $$;
