-- CreateTable
CREATE TABLE "document_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permissionLevel" TEXT NOT NULL DEFAULT 'viewer',
    "canDownload" BOOLEAN NOT NULL DEFAULT true,
    "canShare" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "document_shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_shares_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "geminiTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "embeddingRequests" INTEGER NOT NULL DEFAULT 0,
    "chatRequests" INTEGER NOT NULL DEFAULT 0,
    "costUSD" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_document_embeddings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_embeddings_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_document_embeddings" ("chunkIndex", "content", "createdAt", "documentId", "embedding", "id", "metadata") SELECT "chunkIndex", "content", "createdAt", "documentId", "embedding", "id", "metadata" FROM "document_embeddings";
DROP TABLE "document_embeddings";
ALTER TABLE "new_document_embeddings" RENAME TO "document_embeddings";
CREATE INDEX "document_embeddings_documentId_idx" ON "document_embeddings"("documentId");
CREATE INDEX "document_embeddings_documentId_chunkIndex_idx" ON "document_embeddings"("documentId", "chunkIndex");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "profileImage" TEXT,
    "passwordHash" TEXT,
    "salt" TEXT,
    "googleId" TEXT,
    "appleId" TEXT,
    "phoneNumber" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'free',
    "role" TEXT NOT NULL DEFAULT 'user',
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("appleId", "createdAt", "email", "firstName", "googleId", "id", "isEmailVerified", "isPhoneVerified", "lastName", "passwordHash", "phoneNumber", "profileImage", "salt", "storageUsedBytes", "subscriptionTier", "updatedAt") SELECT "appleId", "createdAt", "email", "firstName", "googleId", "id", "isEmailVerified", "isPhoneVerified", "lastName", "passwordHash", "phoneNumber", "profileImage", "salt", "storageUsedBytes", "subscriptionTier", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "document_shares_documentId_idx" ON "document_shares"("documentId");

-- CreateIndex
CREATE INDEX "document_shares_ownerId_idx" ON "document_shares"("ownerId");

-- CreateIndex
CREATE INDEX "document_shares_sharedWithId_idx" ON "document_shares"("sharedWithId");

-- CreateIndex
CREATE UNIQUE INDEX "document_shares_documentId_sharedWithId_key" ON "document_shares"("documentId", "sharedWithId");

-- CreateIndex
CREATE INDEX "api_usage_userId_idx" ON "api_usage"("userId");

-- CreateIndex
CREATE INDEX "api_usage_month_idx" ON "api_usage"("month");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_userId_month_key" ON "api_usage"("userId", "month");
