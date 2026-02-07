-- CreateTable for action history (undo system)
CREATE TABLE "action_history" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL,
    "operator" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "canUndo" BOOLEAN NOT NULL DEFAULT true,
    "previousState" JSONB NOT NULL,
    "entityIds" JSONB NOT NULL,
    CONSTRAINT "action_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "action_history_userId_idx" ON "action_history"("userId");
CREATE INDEX "action_history_userId_canUndo_idx" ON "action_history"("userId", "canUndo");
CREATE INDEX "action_history_expiresAt_idx" ON "action_history"("expiresAt");
