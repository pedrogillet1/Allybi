-- CreateTable: TraceSpan for pipeline step-by-step waterfall
CREATE TABLE "trace_spans" (
    "id" TEXT NOT NULL,
    "traceId" VARCHAR(64) NOT NULL,
    "stepName" VARCHAR(50) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "status" VARCHAR(20) NOT NULL,
    "errorCode" VARCHAR(50),
    "metadata" JSONB,

    CONSTRAINT "trace_spans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BankUsageEvent for tracking which data banks influenced answers
CREATE TABLE "bank_usage_events" (
    "id" TEXT NOT NULL,
    "traceId" VARCHAR(64) NOT NULL,
    "bankType" VARCHAR(30) NOT NULL,
    "bankId" VARCHAR(100) NOT NULL,
    "bankVersion" VARCHAR(64),
    "stageUsed" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QueryKeyword for extracted keywords
CREATE TABLE "query_keywords" (
    "id" TEXT NOT NULL,
    "traceId" VARCHAR(64) NOT NULL,
    "keyword" VARCHAR(100) NOT NULL,
    "weight" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QueryEntity for extracted entities
CREATE TABLE "query_entities" (
    "id" TEXT NOT NULL,
    "traceId" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SocialSnapshot for social media follower tracking
CREATE TABLE "social_snapshots" (
    "id" TEXT NOT NULL,
    "platform" VARCHAR(30) NOT NULL,
    "followers" INTEGER NOT NULL,
    "posts" INTEGER,
    "engagement" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: TraceSpan indexes
CREATE INDEX "trace_spans_traceId_idx" ON "trace_spans"("traceId");
CREATE INDEX "trace_spans_startedAt_idx" ON "trace_spans"("startedAt");
CREATE INDEX "trace_spans_stepName_idx" ON "trace_spans"("stepName");

-- CreateIndex: BankUsageEvent indexes
CREATE INDEX "bank_usage_events_traceId_idx" ON "bank_usage_events"("traceId");
CREATE INDEX "bank_usage_events_bankId_idx" ON "bank_usage_events"("bankId");
CREATE INDEX "bank_usage_events_bankType_idx" ON "bank_usage_events"("bankType");

-- CreateIndex: QueryKeyword indexes
CREATE INDEX "query_keywords_traceId_idx" ON "query_keywords"("traceId");
CREATE INDEX "query_keywords_keyword_idx" ON "query_keywords"("keyword");

-- CreateIndex: QueryEntity indexes
CREATE INDEX "query_entities_traceId_idx" ON "query_entities"("traceId");
CREATE INDEX "query_entities_entityType_idx" ON "query_entities"("entityType");

-- CreateIndex: SocialSnapshot indexes
CREATE INDEX "social_snapshots_platform_capturedAt_idx" ON "social_snapshots"("platform", "capturedAt");
