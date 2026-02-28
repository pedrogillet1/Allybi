CREATE TABLE IF NOT EXISTS "connector_identity_maps" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalWorkspaceId" TEXT NOT NULL,
  "externalUserId" TEXT,
  "externalAccountEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_identity_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "connector_identity_maps_provider_externalWorkspaceId_userId_key"
  ON "connector_identity_maps"("provider", "externalWorkspaceId", "userId");

CREATE INDEX IF NOT EXISTS "connector_identity_maps_provider_externalWorkspaceId_idx"
  ON "connector_identity_maps"("provider", "externalWorkspaceId");

CREATE INDEX IF NOT EXISTS "connector_identity_maps_userId_provider_idx"
  ON "connector_identity_maps"("userId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'connector_identity_maps_userId_fkey'
  ) THEN
    ALTER TABLE "connector_identity_maps"
    ADD CONSTRAINT "connector_identity_maps_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

