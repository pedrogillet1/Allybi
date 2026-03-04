ALTER TABLE "document_chunks"
  ADD COLUMN "section_name" TEXT,
  ADD COLUMN "sheet_name" TEXT,
  ADD COLUMN "table_chunk_form" TEXT,
  ADD COLUMN "table_id" TEXT,
  ADD COLUMN "row_index" INTEGER,
  ADD COLUMN "column_index" INTEGER,
  ADD COLUMN "row_label" TEXT,
  ADD COLUMN "col_header" TEXT,
  ADD COLUMN "value_raw" TEXT,
  ADD COLUMN "unit_raw" TEXT,
  ADD COLUMN "unit_normalized" TEXT,
  ADD COLUMN "numeric_value" DOUBLE PRECISION,
  ADD COLUMN "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "document_chunks_document_id_section_name_idx"
  ON "document_chunks"("documentId", "section_name");

CREATE INDEX IF NOT EXISTS "document_chunks_document_id_sheet_name_idx"
  ON "document_chunks"("documentId", "sheet_name");

CREATE INDEX IF NOT EXISTS "document_chunks_document_id_table_chunk_form_idx"
  ON "document_chunks"("documentId", "table_chunk_form");

CREATE INDEX IF NOT EXISTS "document_chunks_document_id_row_label_col_header_idx"
  ON "document_chunks"("documentId", "row_label", "col_header");
