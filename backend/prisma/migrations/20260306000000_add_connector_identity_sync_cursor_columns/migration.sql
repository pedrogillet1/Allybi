ALTER TABLE "connector_identity_maps"
  ADD COLUMN IF NOT EXISTS "syncCursor" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);

