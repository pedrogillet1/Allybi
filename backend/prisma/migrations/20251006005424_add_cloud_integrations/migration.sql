-- CreateTable
CREATE TABLE "cloud_integrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiry" DATETIME,
    "providerUserId" TEXT,
    "providerEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cloud_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cloud_integrations_userId_idx" ON "cloud_integrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_integrations_userId_provider_key" ON "cloud_integrations"("userId", "provider");
