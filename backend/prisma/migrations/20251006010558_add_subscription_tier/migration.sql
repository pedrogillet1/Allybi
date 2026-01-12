-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("appleId", "createdAt", "email", "firstName", "googleId", "id", "isEmailVerified", "isPhoneVerified", "lastName", "passwordHash", "phoneNumber", "profileImage", "salt", "updatedAt") SELECT "appleId", "createdAt", "email", "firstName", "googleId", "id", "isEmailVerified", "isPhoneVerified", "lastName", "passwordHash", "phoneNumber", "profileImage", "salt", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
