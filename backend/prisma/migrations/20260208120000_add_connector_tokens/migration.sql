-- CreateTable
CREATE TABLE "connector_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "wrappedRecordKey" TEXT NOT NULL,
    "encryptedPayloadJson" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connector_tokens_userId_provider_key" ON "connector_tokens"("userId", "provider");

-- CreateIndex
CREATE INDEX "connector_tokens_provider_idx" ON "connector_tokens"("provider");

-- AddForeignKey
ALTER TABLE "connector_tokens" ADD CONSTRAINT "connector_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

