-- AlterTable
ALTER TABLE "documents" ADD COLUMN "sweep_reset_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "documents_sweep_reset_count_idx" ON "documents"("sweep_reset_count");
