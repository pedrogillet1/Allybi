-- CreateEnum
CREATE TYPE "MemorySection" AS ENUM ('USER_PREFERENCES', 'WORK_CONTEXT', 'PERSONAL_FACTS', 'GOALS', 'COMMUNICATION_STYLE', 'RELATIONSHIPS');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'available', 'enriching', 'ready', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recoveryKeyHash" TEXT,
    "masterKeyEncrypted" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "lastIpAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "deviceType" TEXT,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "suspicionReason" TEXT,
    "country" TEXT,
    "city" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "color" TEXT,
    "parentFolderId" TEXT,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nameEncrypted" TEXT,
    "encryptionSalt" TEXT,
    "encryptionIV" TEXT,
    "encryptionAuthTag" TEXT,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_categories" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "filename" TEXT NOT NULL,
    "encryptedFilename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "parentVersionId" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "encryptionSalt" TEXT,
    "encryptionIV" TEXT,
    "encryptionAuthTag" TEXT,
    "filenameEncrypted" TEXT,
    "extractedTextEncrypted" TEXT,
    "renderableContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "chunksCount" INTEGER DEFAULT 0,
    "embeddingsGenerated" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "displayTitle" TEXT,
    "rawText" TEXT,
    "previewText" TEXT,
    "uploadSessionId" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_metadata" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractedText" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "pageCount" INTEGER,
    "wordCount" INTEGER,
    "characterCount" INTEGER,
    "thumbnailUrl" TEXT,
    "entities" TEXT,
    "classification" TEXT,
    "summary" TEXT,
    "author" TEXT,
    "creationDate" TIMESTAMP(3),
    "modificationDate" TIMESTAMP(3),
    "language" TEXT,
    "topics" TEXT,
    "keyEntities" TEXT,
    "hasSignature" BOOLEAN NOT NULL DEFAULT false,
    "hasTables" BOOLEAN NOT NULL DEFAULT false,
    "hasImages" BOOLEAN NOT NULL DEFAULT false,
    "markdownContent" TEXT,
    "markdownUrl" TEXT,
    "markdownStructure" TEXT,
    "sheetCount" INTEGER,
    "slideCount" INTEGER,
    "slidesData" TEXT,
    "pptxMetadata" TEXT,
    "slideGenerationStatus" TEXT DEFAULT 'pending',
    "slideGenerationError" TEXT,
    "previewPdfStatus" TEXT DEFAULT 'pending',
    "previewPdfKey" TEXT,
    "previewPdfError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "classificationConfidence" DOUBLE PRECISION,
    "domain" TEXT,
    "domainConfidence" DOUBLE PRECISION,

    CONSTRAINT "document_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "page" INTEGER,
    "startChar" INTEGER,
    "endChar" INTEGER,
    "embedding" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tags" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "emailCode" TEXT,
    "phoneCode" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveryKeyHash" TEXT,
    "masterKeyEncrypted" TEXT,

    CONSTRAINT "pending_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "titleEncrypted" TEXT,
    "encryptionSalt" TEXT,
    "encryptionIV" TEXT,
    "encryptionAuthTag" TEXT,
    "contextType" TEXT,
    "contextId" TEXT,
    "contextName" TEXT,
    "contextMeta" JSONB,
    "scopeDescription" TEXT,
    "scopeDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "documentList" JSONB,
    "lastDocumentId" TEXT,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "encryptionSalt" TEXT,
    "encryptionIV" TEXT,
    "encryptionAuthTag" TEXT,
    "isDocument" BOOLEAN NOT NULL DEFAULT false,
    "documentTitle" TEXT,
    "documentFormat" TEXT,
    "markdownContent" TEXT,
    "calculationResult" JSONB,
    "contextEntities" JSONB,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_summaries" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "summaryType" TEXT NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotificationTypes" TEXT,
    "notificationFrequency" TEXT NOT NULL DEFAULT 'immediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_entities" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "textIndex" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "document_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_keywords" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDomainSpecific" BOOLEAN NOT NULL DEFAULT false,
    "tfIdf" DOUBLE PRECISION,

    CONSTRAINT "document_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_embeddings" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentTsv" tsvector,
    "user_id" TEXT,
    "page_number" INTEGER,
    "section_name" TEXT,
    "chunk_text" TEXT,
    "micro_summary" TEXT,
    "chunk_type" TEXT,
    "pinecone_namespace" TEXT,
    "embedding_model" TEXT,
    "search_vector" tsvector,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminology_maps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminology_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_contexts" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "sourceDocuments" TEXT NOT NULL,
    "webSources" TEXT,
    "searchQuery" TEXT,
    "expandedTerms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_shares" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permissionLevel" TEXT NOT NULL DEFAULT 'viewer',
    "canDownload" BOOLEAN NOT NULL DEFAULT true,
    "canShare" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "geminiTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "embeddingRequests" INTEGER NOT NULL DEFAULT 0,
    "chatRequests" INTEGER NOT NULL DEFAULT 0,
    "costUSD" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPreview" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipWhitelist" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "generationType" TEXT NOT NULL,
    "conversationId" TEXT,
    "isTemporary" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "sourceDocumentIds" TEXT NOT NULL,
    "generationPrompt" TEXT,
    "renderableContent" TEXT NOT NULL,
    "metadata" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedAt" TIMESTAMP(3),

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excel_sheets" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "metadata" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excel_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excel_cells" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "colIndex" INTEGER NOT NULL,
    "value" TEXT,
    "formula" TEXT,
    "dataType" TEXT NOT NULL,
    "style" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excel_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "previousPath" TEXT,
    "fileContent" TEXT,
    "fileType" TEXT,
    "canUndo" BOOLEAN NOT NULL DEFAULT true,
    "canRedo" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "organization" TEXT,
    "expertiseLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences_memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferenceType" TEXT NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_topics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicSummary" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "conversation_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "MemorySection" NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "metadata" JSONB,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "methodology_knowledge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT,
    "definition" TEXT,
    "howItWorks" TEXT,
    "whyUsed" TEXT,
    "limitations" TEXT,
    "useCases" TEXT,
    "examples" TEXT,
    "relatedMethods" TEXT,
    "parentMethod" TEXT,
    "childMethods" TEXT,
    "sourceDocumentIds" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 1,
    "extractedFrom" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "methodology_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_knowledge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "definition" TEXT,
    "formula" TEXT,
    "interpretation" TEXT,
    "usageContext" TEXT,
    "examples" TEXT,
    "relatedTerms" TEXT,
    "parentTerm" TEXT,
    "childTerms" TEXT,
    "synonyms" TEXT,
    "sourceDocumentIds" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 1,
    "extractedContext" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "domain_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_relationships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromConceptId" TEXT NOT NULL,
    "toConceptId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "description" TEXT,
    "sourceDocumentIds" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causal_relationships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "causes" TEXT NOT NULL,
    "evidence" TEXT,
    "context" TEXT,
    "mechanism" TEXT,
    "domain" TEXT,
    "causalType" TEXT,
    "sourceDocumentIds" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 1,
    "extractedPatterns" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "causal_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparative_data" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptA" TEXT NOT NULL,
    "conceptB" TEXT NOT NULL,
    "attributes" TEXT NOT NULL,
    "comparativeStatements" TEXT,
    "keyInsight" TEXT,
    "similarities" TEXT,
    "differences" TEXT,
    "sourceDocumentIds" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comparative_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "colorPalette" TEXT,
    "typography" TEXT,
    "aestheticDirection" TEXT,
    "totalSlides" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slides" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "slideNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "htmlContent" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "renderTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_chunks" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startMessageId" TEXT NOT NULL,
    "endMessageId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "topics" TEXT[],
    "entities" TEXT[],
    "keywords" TEXT[],
    "vectorId" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-004',
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "coherence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_indexes" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "mainTopics" TEXT[],
    "keyEntities" TEXT[],
    "keywords" TEXT[],
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "userMessageCount" INTEGER NOT NULL DEFAULT 0,
    "assistantMessageCount" INTEGER NOT NULL DEFAULT 0,
    "vectorId" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-004',
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_context_states" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recentMessageIds" TEXT[],
    "retrievedChunkIds" TEXT[],
    "memoryIds" TEXT[],
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "recentMessagesTokens" INTEGER NOT NULL DEFAULT 0,
    "chunksTokens" INTEGER NOT NULL DEFAULT 0,
    "memoriesTokens" INTEGER NOT NULL DEFAULT 0,
    "documentsTokens" INTEGER NOT NULL DEFAULT 0,
    "isCompressed" BOOLEAN NOT NULL DEFAULT false,
    "compressionLevel" INTEGER NOT NULL DEFAULT 0,
    "lastCompressedAt" TIMESTAMP(3),
    "lastQuery" TEXT,
    "lastQueryEmbedding" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentTopic" TEXT,
    "keyEntities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastMessageCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "summary" TEXT,

    CONSTRAINT "conversation_context_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily_stats" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "newConversations" INTEGER NOT NULL DEFAULT 0,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "userMessages" INTEGER NOT NULL DEFAULT 0,
    "assistantMessages" INTEGER NOT NULL DEFAULT 0,
    "totalDocuments" INTEGER NOT NULL DEFAULT 0,
    "newDocuments" INTEGER NOT NULL DEFAULT 0,
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTimeMs" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geminiApiCalls" INTEGER NOT NULL DEFAULT 0,
    "embeddingCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_user_activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "documentsUploaded" INTEGER NOT NULL DEFAULT 0,
    "conversationsCreated" INTEGER NOT NULL DEFAULT 0,
    "ragQueriesCount" INTEGER NOT NULL DEFAULT 0,
    "totalActiveMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "featuresUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_user_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_system_health" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "databaseConnections" INTEGER NOT NULL DEFAULT 0,
    "databaseSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "slowQueryCount" INTEGER NOT NULL DEFAULT 0,
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTimeMs" INTEGER NOT NULL DEFAULT 0,
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpuUsagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryUsagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diskUsagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pineconeLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "geminiLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "s3LatencyMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_system_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_errors" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorType" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "requestBody" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "fingerprint" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstOccurrence" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurrence" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "actionsCount" INTEGER NOT NULL DEFAULT 0,
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "converted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "category" TEXT,
    "properties" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_feedback" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "rating" INTEGER,
    "sentiment" TEXT,
    "comment" TEXT,
    "categories" TEXT[],
    "wasHelpful" BOOLEAN,
    "hadSources" BOOLEAN NOT NULL DEFAULT false,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_metrics" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "userMessages" INTEGER NOT NULL DEFAULT 0,
    "assistantMessages" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "hadFallback" BOOLEAN NOT NULL DEFAULT false,
    "fallbackCount" INTEGER NOT NULL DEFAULT 0,
    "ragQueriesCount" INTEGER NOT NULL DEFAULT 0,
    "sourcesUsedCount" INTEGER NOT NULL DEFAULT 0,
    "avgRelevanceScore" DOUBLE PRECISION,
    "userRating" INTEGER,
    "userFeedback" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_processing_metrics" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "uploadStartedAt" TIMESTAMP(3) NOT NULL,
    "uploadCompletedAt" TIMESTAMP(3),
    "uploadDuration" INTEGER,
    "uploadFailed" BOOLEAN NOT NULL DEFAULT false,
    "uploadError" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "processingDuration" INTEGER,
    "processingFailed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "textExtractionMethod" TEXT,
    "textExtractionSuccess" BOOLEAN NOT NULL DEFAULT false,
    "textExtractionTime" INTEGER,
    "textLength" INTEGER,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "ocrSuccess" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" DOUBLE PRECISION,
    "ocrTime" INTEGER,
    "embeddingStartedAt" TIMESTAMP(3),
    "embeddingCompletedAt" TIMESTAMP(3),
    "embeddingDuration" INTEGER,
    "embeddingsCreated" INTEGER NOT NULL DEFAULT 0,
    "chunksCreated" INTEGER NOT NULL DEFAULT 0,
    "timesQueried" INTEGER NOT NULL DEFAULT 0,
    "lastQueriedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_processing_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_query_metrics" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryLanguage" TEXT,
    "retrievalMethod" TEXT NOT NULL,
    "usedBM25" BOOLEAN NOT NULL DEFAULT false,
    "usedPinecone" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalLatency" INTEGER,
    "embeddingLatency" INTEGER,
    "bm25Latency" INTEGER,
    "pineconeLatency" INTEGER,
    "llmLatency" INTEGER,
    "chunksRetrieved" INTEGER NOT NULL DEFAULT 0,
    "bm25Results" INTEGER NOT NULL DEFAULT 0,
    "pineconeResults" INTEGER NOT NULL DEFAULT 0,
    "documentsUsed" INTEGER NOT NULL DEFAULT 0,
    "topScore" DOUBLE PRECISION,
    "avgScore" DOUBLE PRECISION,
    "minRelevanceScore" DOUBLE PRECISION,
    "passedThreshold" BOOLEAN NOT NULL DEFAULT false,
    "needsRefinement" BOOLEAN NOT NULL DEFAULT false,
    "refinementReason" TEXT,
    "hadFallback" BOOLEAN NOT NULL DEFAULT false,
    "responseGenerated" BOOLEAN NOT NULL DEFAULT false,
    "uniqueDocuments" INTEGER NOT NULL DEFAULT 0,
    "sourceCoverage" DOUBLE PRECISION,

    CONSTRAINT "rag_query_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_performance_logs" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestSize" INTEGER,
    "requestData" JSONB,
    "responseSize" INTEGER,
    "statusCode" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "latency" INTEGER,
    "rateLimitHit" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "userId" TEXT,
    "conversationId" TEXT,

    CONSTRAINT "api_performance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_snapshots" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onlineUsers" INTEGER NOT NULL DEFAULT 0,
    "activeConversations" INTEGER NOT NULL DEFAULT 0,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "diskUsage" DOUBLE PRECISION,
    "apiRequestsPerSec" DOUBLE PRECISION,
    "avgResponseTime" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "dbConnections" INTEGER,
    "dbQueryTime" DOUBLE PRECISION,
    "queuedJobs" INTEGER NOT NULL DEFAULT 0,
    "processingJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_lifetime_value" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "totalDocuments" INTEGER NOT NULL DEFAULT 0,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "totalTimeSpent" INTEGER NOT NULL DEFAULT 0,
    "avgSessionDuration" DOUBLE PRECISION,
    "daysSinceSignup" INTEGER,
    "lastActiveAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isChurned" BOOLEAN NOT NULL DEFAULT false,
    "churnedAt" TIMESTAMP(3),
    "churnReason" TEXT,
    "subscriptionTier" TEXT,
    "lifetimeRevenue" DOUBLE PRECISION DEFAULT 0,
    "estimatedValue" DOUBLE PRECISION,
    "featuresUsed" TEXT[],
    "featureAdoptionRate" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_lifetime_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "featureCategory" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "sessionId" TEXT,
    "conversationId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "feature_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "inputCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestType" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "wasCached" BOOLEAN NOT NULL DEFAULT false,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_analytics_aggregates" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "returningUsers" INTEGER NOT NULL DEFAULT 0,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "avgSessionDuration" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "newConversations" INTEGER NOT NULL DEFAULT 0,
    "avgMessagesPerConversation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "userMessages" INTEGER NOT NULL DEFAULT 0,
    "assistantMessages" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" INTEGER NOT NULL DEFAULT 0,
    "totalDocuments" INTEGER NOT NULL DEFAULT 0,
    "newDocuments" INTEGER NOT NULL DEFAULT 0,
    "documentsProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalStorageBytes" BIGINT NOT NULL DEFAULT 0,
    "totalRagQueries" INTEGER NOT NULL DEFAULT 0,
    "avgRagLatency" INTEGER NOT NULL DEFAULT 0,
    "ragSuccessRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fallbackRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokenCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geminiCalls" INTEGER NOT NULL DEFAULT 0,
    "embeddingCalls" INTEGER NOT NULL DEFAULT 0,
    "totalErrors" INTEGER NOT NULL DEFAULT 0,
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topFeatures" JSONB,
    "positiveRatings" INTEGER NOT NULL DEFAULT 0,
    "negativeRatings" INTEGER NOT NULL DEFAULT 0,
    "satisfactionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_analytics_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_states" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userGoal" TEXT NOT NULL DEFAULT 'Exploring documents',
    "currentDocument" TEXT,
    "currentTopic" TEXT NOT NULL DEFAULT 'General inquiry',
    "knownSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knownDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL DEFAULT 'Conversation just started.',
    "lastSummaryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnsSinceLastSummary" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',

    CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intent_classification_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "userQuery" TEXT NOT NULL,
    "detectedIntent" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "fallbackTriggered" BOOLEAN NOT NULL DEFAULT false,
    "multiIntent" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "responseTime" INTEGER,
    "wasCorrect" BOOLEAN,
    "userFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intent_classification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "service" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "errorStack" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "conversationId" TEXT,
    "requestPath" TEXT,
    "httpMethod" TEXT,
    "statusCode" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_metrics" (
    "id" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "threshold" DOUBLE PRECISION,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_deviceId_idx" ON "sessions"("deviceId");

-- CreateIndex
CREATE INDEX "sessions_isActive_idx" ON "sessions"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_auth_userId_key" ON "two_factor_auth"("userId");

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- CreateIndex
CREATE INDEX "folders_parentFolderId_idx" ON "folders"("parentFolderId");

-- CreateIndex
CREATE INDEX "folders_path_idx" ON "folders"("path");

-- CreateIndex
CREATE INDEX "folders_userId_parentFolderId_idx" ON "folders"("userId", "parentFolderId");

-- CreateIndex
CREATE INDEX "folders_parentFolderId_name_idx" ON "folders"("parentFolderId", "name");

-- CreateIndex
CREATE INDEX "categories_userId_idx" ON "categories"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_userId_name_key" ON "categories"("userId", "name");

-- CreateIndex
CREATE INDEX "document_categories_documentId_idx" ON "document_categories"("documentId");

-- CreateIndex
CREATE INDEX "document_categories_categoryId_idx" ON "document_categories"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_documentId_categoryId_key" ON "document_categories"("documentId", "categoryId");

-- CreateIndex
CREATE INDEX "documents_userId_idx" ON "documents"("userId");

-- CreateIndex
CREATE INDEX "documents_folderId_idx" ON "documents"("folderId");

-- CreateIndex
CREATE INDEX "documents_parentVersionId_idx" ON "documents"("parentVersionId");

-- CreateIndex
CREATE INDEX "documents_userId_status_idx" ON "documents"("userId", "status");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_mimeType_idx" ON "documents"("mimeType");

-- CreateIndex
CREATE INDEX "documents_userId_createdAt_idx" ON "documents"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_userId_updatedAt_idx" ON "documents"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "documents_folderId_status_idx" ON "documents"("folderId", "status");

-- CreateIndex
CREATE INDEX "documents_userId_folderId_status_idx" ON "documents"("userId", "folderId", "status");

-- CreateIndex
CREATE INDEX "documents_filename_idx" ON "documents"("filename");

-- CreateIndex
CREATE INDEX "documents_userId_filename_idx" ON "documents"("userId", "filename");

-- CreateIndex
CREATE INDEX "documents_fileHash_idx" ON "documents"("fileHash");

-- CreateIndex
CREATE INDEX "documents_userId_fileHash_filename_idx" ON "documents"("userId", "fileHash", "filename");

-- CreateIndex
CREATE INDEX "documents_language_idx" ON "documents"("language");

-- CreateIndex
CREATE INDEX "documents_userId_language_idx" ON "documents"("userId", "language");

-- CreateIndex
CREATE INDEX "documents_uploadSessionId_idx" ON "documents"("uploadSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "document_metadata_documentId_key" ON "document_metadata"("documentId");

-- CreateIndex
CREATE INDEX "document_chunks_documentId_idx" ON "document_chunks"("documentId");

-- CreateIndex
CREATE INDEX "document_chunks_documentId_chunkIndex_idx" ON "document_chunks"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "document_chunks_documentId_page_idx" ON "document_chunks"("documentId", "page");

-- CreateIndex
CREATE INDEX "tags_userId_idx" ON "tags"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_userId_name_key" ON "tags"("userId", "name");

-- CreateIndex
CREATE INDEX "document_tags_documentId_idx" ON "document_tags"("documentId");

-- CreateIndex
CREATE INDEX "document_tags_tagId_idx" ON "document_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "document_tags_documentId_tagId_key" ON "document_tags"("documentId", "tagId");

-- CreateIndex
CREATE INDEX "verification_codes_userId_idx" ON "verification_codes"("userId");

-- CreateIndex
CREATE INDEX "verification_codes_code_idx" ON "verification_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "pending_users_email_key" ON "pending_users"("email");

-- CreateIndex
CREATE INDEX "pending_users_email_idx" ON "pending_users"("email");

-- CreateIndex
CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");

-- CreateIndex
CREATE INDEX "conversations_contextType_contextId_idx" ON "conversations"("contextType", "contextId");

-- CreateIndex
CREATE INDEX "conversations_userId_updatedAt_idx" ON "conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "conversations_userId_isDeleted_isPinned_updatedAt_idx" ON "conversations"("userId", "isDeleted", "isPinned", "updatedAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX "messages_isDocument_idx" ON "messages"("isDocument");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "reminders_userId_idx" ON "reminders"("userId");

-- CreateIndex
CREATE INDEX "reminders_dueDate_idx" ON "reminders"("dueDate");

-- CreateIndex
CREATE INDEX "document_summaries_documentId_idx" ON "document_summaries"("documentId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "document_entities_documentId_entityType_idx" ON "document_entities"("documentId", "entityType");

-- CreateIndex
CREATE INDEX "document_entities_documentId_idx" ON "document_entities"("documentId");

-- CreateIndex
CREATE INDEX "document_entities_entityType_idx" ON "document_entities"("entityType");

-- CreateIndex
CREATE INDEX "document_entities_value_idx" ON "document_entities"("value");

-- CreateIndex
CREATE INDEX "document_entities_normalizedValue_idx" ON "document_entities"("normalizedValue");

-- CreateIndex
CREATE INDEX "document_entities_confidence_idx" ON "document_entities"("confidence");

-- CreateIndex
CREATE INDEX "document_keywords_documentId_idx" ON "document_keywords"("documentId");

-- CreateIndex
CREATE INDEX "document_keywords_word_idx" ON "document_keywords"("word");

-- CreateIndex
CREATE INDEX "document_keywords_documentId_tfIdf_idx" ON "document_keywords"("documentId", "tfIdf");

-- CreateIndex
CREATE INDEX "document_embeddings_documentId_idx" ON "document_embeddings"("documentId");

-- CreateIndex
CREATE INDEX "document_embeddings_documentId_chunkIndex_idx" ON "document_embeddings"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "document_embeddings_user_id_idx" ON "document_embeddings"("user_id");

-- CreateIndex
CREATE INDEX "document_embeddings_chunk_type_idx" ON "document_embeddings"("chunk_type");

-- CreateIndex
CREATE INDEX "document_embeddings_documentId_section_name_idx" ON "document_embeddings"("documentId", "section_name");

-- CreateIndex
CREATE INDEX "document_embeddings_documentId_page_number_idx" ON "document_embeddings"("documentId", "page_number");

-- CreateIndex
CREATE INDEX "document_embeddings_pinecone_namespace_idx" ON "document_embeddings"("pinecone_namespace");

-- CreateIndex
CREATE INDEX "document_embeddings_user_id_documentId_idx" ON "document_embeddings"("user_id", "documentId");

-- CreateIndex
CREATE INDEX "terminology_maps_userId_idx" ON "terminology_maps"("userId");

-- CreateIndex
CREATE INDEX "terminology_maps_term_idx" ON "terminology_maps"("term");

-- CreateIndex
CREATE INDEX "terminology_maps_domain_idx" ON "terminology_maps"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "terminology_maps_userId_term_domain_key" ON "terminology_maps"("userId", "term", "domain");

-- CreateIndex
CREATE INDEX "chat_contexts_conversationId_idx" ON "chat_contexts"("conversationId");

-- CreateIndex
CREATE INDEX "chat_contexts_messageId_idx" ON "chat_contexts"("messageId");

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

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_documentId_key" ON "generated_documents"("documentId");

-- CreateIndex
CREATE INDEX "generated_documents_userId_idx" ON "generated_documents"("userId");

-- CreateIndex
CREATE INDEX "generated_documents_documentId_idx" ON "generated_documents"("documentId");

-- CreateIndex
CREATE INDEX "generated_documents_generationType_idx" ON "generated_documents"("generationType");

-- CreateIndex
CREATE INDEX "generated_documents_conversationId_idx" ON "generated_documents"("conversationId");

-- CreateIndex
CREATE INDEX "generated_documents_isTemporary_idx" ON "generated_documents"("isTemporary");

-- CreateIndex
CREATE INDEX "generated_documents_expiresAt_idx" ON "generated_documents"("expiresAt");

-- CreateIndex
CREATE INDEX "excel_sheets_documentId_idx" ON "excel_sheets"("documentId");

-- CreateIndex
CREATE INDEX "excel_sheets_expiresAt_idx" ON "excel_sheets"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "excel_sheets_documentId_sheetIndex_key" ON "excel_sheets"("documentId", "sheetIndex");

-- CreateIndex
CREATE INDEX "excel_cells_sheetId_idx" ON "excel_cells"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "excel_cells_sheetId_rowIndex_colIndex_key" ON "excel_cells"("sheetId", "rowIndex", "colIndex");

-- CreateIndex
CREATE INDEX "action_history_userId_idx" ON "action_history"("userId");

-- CreateIndex
CREATE INDEX "action_history_canUndo_idx" ON "action_history"("canUndo");

-- CreateIndex
CREATE INDEX "action_history_canRedo_idx" ON "action_history"("canRedo");

-- CreateIndex
CREATE INDEX "action_history_timestamp_idx" ON "action_history"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE INDEX "user_profiles_userId_idx" ON "user_profiles"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_memory_userId_idx" ON "user_preferences_memory"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_memory_userId_preferenceType_idx" ON "user_preferences_memory"("userId", "preferenceType");

-- CreateIndex
CREATE INDEX "conversation_topics_userId_idx" ON "conversation_topics"("userId");

-- CreateIndex
CREATE INDEX "conversation_topics_userId_lastSeen_idx" ON "conversation_topics"("userId", "lastSeen");

-- CreateIndex
CREATE INDEX "memories_userId_section_idx" ON "memories"("userId", "section");

-- CreateIndex
CREATE INDEX "memories_userId_importance_idx" ON "memories"("userId", "importance");

-- CreateIndex
CREATE INDEX "memories_lastAccessed_idx" ON "memories"("lastAccessed");

-- CreateIndex
CREATE INDEX "methodology_knowledge_userId_idx" ON "methodology_knowledge"("userId");

-- CreateIndex
CREATE INDEX "methodology_knowledge_name_idx" ON "methodology_knowledge"("name");

-- CreateIndex
CREATE INDEX "methodology_knowledge_userId_name_idx" ON "methodology_knowledge"("userId", "name");

-- CreateIndex
CREATE INDEX "methodology_knowledge_confidence_idx" ON "methodology_knowledge"("confidence");

-- CreateIndex
CREATE INDEX "methodology_knowledge_documentCount_idx" ON "methodology_knowledge"("documentCount");

-- CreateIndex
CREATE UNIQUE INDEX "methodology_knowledge_userId_name_key" ON "methodology_knowledge"("userId", "name");

-- CreateIndex
CREATE INDEX "domain_knowledge_userId_idx" ON "domain_knowledge"("userId");

-- CreateIndex
CREATE INDEX "domain_knowledge_term_idx" ON "domain_knowledge"("term");

-- CreateIndex
CREATE INDEX "domain_knowledge_normalizedTerm_idx" ON "domain_knowledge"("normalizedTerm");

-- CreateIndex
CREATE INDEX "domain_knowledge_domain_idx" ON "domain_knowledge"("domain");

-- CreateIndex
CREATE INDEX "domain_knowledge_userId_domain_idx" ON "domain_knowledge"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "domain_knowledge_userId_normalizedTerm_domain_key" ON "domain_knowledge"("userId", "normalizedTerm", "domain");

-- CreateIndex
CREATE INDEX "concept_relationships_userId_idx" ON "concept_relationships"("userId");

-- CreateIndex
CREATE INDEX "concept_relationships_fromConceptId_idx" ON "concept_relationships"("fromConceptId");

-- CreateIndex
CREATE INDEX "concept_relationships_toConceptId_idx" ON "concept_relationships"("toConceptId");

-- CreateIndex
CREATE INDEX "concept_relationships_relationshipType_idx" ON "concept_relationships"("relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "concept_relationships_fromConceptId_toConceptId_relationshi_key" ON "concept_relationships"("fromConceptId", "toConceptId", "relationshipType");

-- CreateIndex
CREATE INDEX "causal_relationships_userId_idx" ON "causal_relationships"("userId");

-- CreateIndex
CREATE INDEX "causal_relationships_userId_domain_idx" ON "causal_relationships"("userId", "domain");

-- CreateIndex
CREATE INDEX "causal_relationships_confidence_idx" ON "causal_relationships"("confidence");

-- CreateIndex
CREATE INDEX "comparative_data_userId_idx" ON "comparative_data"("userId");

-- CreateIndex
CREATE INDEX "comparative_data_conceptA_idx" ON "comparative_data"("conceptA");

-- CreateIndex
CREATE INDEX "comparative_data_conceptB_idx" ON "comparative_data"("conceptB");

-- CreateIndex
CREATE UNIQUE INDEX "comparative_data_userId_conceptA_conceptB_key" ON "comparative_data"("userId", "conceptA", "conceptB");

-- CreateIndex
CREATE INDEX "presentations_userId_idx" ON "presentations"("userId");

-- CreateIndex
CREATE INDEX "presentations_status_idx" ON "presentations"("status");

-- CreateIndex
CREATE INDEX "presentations_createdAt_idx" ON "presentations"("createdAt");

-- CreateIndex
CREATE INDEX "slides_presentationId_idx" ON "slides"("presentationId");

-- CreateIndex
CREATE INDEX "slides_status_idx" ON "slides"("status");

-- CreateIndex
CREATE UNIQUE INDEX "slides_presentationId_slideNumber_key" ON "slides"("presentationId", "slideNumber");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_chunks_vectorId_key" ON "conversation_chunks"("vectorId");

-- CreateIndex
CREATE INDEX "conversation_chunks_conversationId_idx" ON "conversation_chunks"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_chunks_userId_idx" ON "conversation_chunks"("userId");

-- CreateIndex
CREATE INDEX "conversation_chunks_vectorId_idx" ON "conversation_chunks"("vectorId");

-- CreateIndex
CREATE INDEX "conversation_chunks_conversationId_lastMessageAt_idx" ON "conversation_chunks"("conversationId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversation_chunks_userId_lastMessageAt_idx" ON "conversation_chunks"("userId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_indexes_conversationId_key" ON "conversation_indexes"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_indexes_vectorId_key" ON "conversation_indexes"("vectorId");

-- CreateIndex
CREATE INDEX "conversation_indexes_userId_idx" ON "conversation_indexes"("userId");

-- CreateIndex
CREATE INDEX "conversation_indexes_vectorId_idx" ON "conversation_indexes"("vectorId");

-- CreateIndex
CREATE INDEX "conversation_indexes_userId_lastMessageAt_idx" ON "conversation_indexes"("userId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_context_states_conversationId_key" ON "conversation_context_states"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_context_states_conversationId_idx" ON "conversation_context_states"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_context_states_userId_idx" ON "conversation_context_states"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_stats_date_key" ON "analytics_daily_stats"("date");

-- CreateIndex
CREATE INDEX "analytics_daily_stats_date_idx" ON "analytics_daily_stats"("date");

-- CreateIndex
CREATE INDEX "analytics_user_activity_userId_idx" ON "analytics_user_activity"("userId");

-- CreateIndex
CREATE INDEX "analytics_user_activity_date_idx" ON "analytics_user_activity"("date");

-- CreateIndex
CREATE INDEX "analytics_user_activity_userId_date_idx" ON "analytics_user_activity"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_user_activity_userId_date_key" ON "analytics_user_activity"("userId", "date");

-- CreateIndex
CREATE INDEX "analytics_system_health_timestamp_idx" ON "analytics_system_health"("timestamp");

-- CreateIndex
CREATE INDEX "analytics_errors_timestamp_idx" ON "analytics_errors"("timestamp");

-- CreateIndex
CREATE INDEX "analytics_errors_errorType_idx" ON "analytics_errors"("errorType");

-- CreateIndex
CREATE INDEX "analytics_errors_fingerprint_idx" ON "analytics_errors"("fingerprint");

-- CreateIndex
CREATE INDEX "analytics_errors_isResolved_idx" ON "analytics_errors"("isResolved");

-- CreateIndex
CREATE INDEX "analytics_errors_userId_idx" ON "analytics_errors"("userId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminUserId_idx" ON "admin_audit_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_timestamp_idx" ON "admin_audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_startedAt_idx" ON "user_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "analytics_events_userId_idx" ON "analytics_events"("userId");

-- CreateIndex
CREATE INDEX "analytics_events_sessionId_idx" ON "analytics_events"("sessionId");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_idx" ON "analytics_events"("eventType");

-- CreateIndex
CREATE INDEX "analytics_events_timestamp_idx" ON "analytics_events"("timestamp");

-- CreateIndex
CREATE INDEX "conversation_feedback_conversationId_idx" ON "conversation_feedback"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_feedback_userId_idx" ON "conversation_feedback"("userId");

-- CreateIndex
CREATE INDEX "conversation_feedback_feedbackType_idx" ON "conversation_feedback"("feedbackType");

-- CreateIndex
CREATE INDEX "conversation_feedback_createdAt_idx" ON "conversation_feedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_metrics_conversationId_key" ON "conversation_metrics"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_metrics_startedAt_idx" ON "conversation_metrics"("startedAt");

-- CreateIndex
CREATE INDEX "conversation_metrics_completed_idx" ON "conversation_metrics"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "document_processing_metrics_documentId_key" ON "document_processing_metrics"("documentId");

-- CreateIndex
CREATE INDEX "document_processing_metrics_documentId_idx" ON "document_processing_metrics"("documentId");

-- CreateIndex
CREATE INDEX "document_processing_metrics_uploadStartedAt_idx" ON "document_processing_metrics"("uploadStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rag_query_metrics_messageId_key" ON "rag_query_metrics"("messageId");

-- CreateIndex
CREATE INDEX "rag_query_metrics_userId_idx" ON "rag_query_metrics"("userId");

-- CreateIndex
CREATE INDEX "rag_query_metrics_conversationId_idx" ON "rag_query_metrics"("conversationId");

-- CreateIndex
CREATE INDEX "rag_query_metrics_startedAt_idx" ON "rag_query_metrics"("startedAt");

-- CreateIndex
CREATE INDEX "rag_query_metrics_retrievalMethod_idx" ON "rag_query_metrics"("retrievalMethod");

-- CreateIndex
CREATE INDEX "api_performance_logs_service_idx" ON "api_performance_logs"("service");

-- CreateIndex
CREATE INDEX "api_performance_logs_startedAt_idx" ON "api_performance_logs"("startedAt");

-- CreateIndex
CREATE INDEX "api_performance_logs_success_idx" ON "api_performance_logs"("success");

-- CreateIndex
CREATE INDEX "api_performance_logs_rateLimitHit_idx" ON "api_performance_logs"("rateLimitHit");

-- CreateIndex
CREATE INDEX "system_health_snapshots_timestamp_idx" ON "system_health_snapshots"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "user_lifetime_value_userId_key" ON "user_lifetime_value"("userId");

-- CreateIndex
CREATE INDEX "user_lifetime_value_userId_idx" ON "user_lifetime_value"("userId");

-- CreateIndex
CREATE INDEX "user_lifetime_value_isActive_idx" ON "user_lifetime_value"("isActive");

-- CreateIndex
CREATE INDEX "user_lifetime_value_isChurned_idx" ON "user_lifetime_value"("isChurned");

-- CreateIndex
CREATE INDEX "feature_usage_logs_userId_idx" ON "feature_usage_logs"("userId");

-- CreateIndex
CREATE INDEX "feature_usage_logs_featureName_idx" ON "feature_usage_logs"("featureName");

-- CreateIndex
CREATE INDEX "feature_usage_logs_usedAt_idx" ON "feature_usage_logs"("usedAt");

-- CreateIndex
CREATE INDEX "token_usage_userId_idx" ON "token_usage"("userId");

-- CreateIndex
CREATE INDEX "token_usage_conversationId_idx" ON "token_usage"("conversationId");

-- CreateIndex
CREATE INDEX "token_usage_model_idx" ON "token_usage"("model");

-- CreateIndex
CREATE INDEX "token_usage_provider_idx" ON "token_usage"("provider");

-- CreateIndex
CREATE INDEX "token_usage_requestType_idx" ON "token_usage"("requestType");

-- CreateIndex
CREATE INDEX "token_usage_createdAt_idx" ON "token_usage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_analytics_aggregates_date_key" ON "daily_analytics_aggregates"("date");

-- CreateIndex
CREATE INDEX "daily_analytics_aggregates_date_idx" ON "daily_analytics_aggregates"("date");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_states_conversationId_key" ON "conversation_states"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_states_conversationId_idx" ON "conversation_states"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_states_userId_idx" ON "conversation_states"("userId");

-- CreateIndex
CREATE INDEX "conversation_states_turnsSinceLastSummary_idx" ON "conversation_states"("turnsSinceLastSummary");

-- CreateIndex
CREATE INDEX "intent_classification_logs_detectedIntent_idx" ON "intent_classification_logs"("detectedIntent");

-- CreateIndex
CREATE INDEX "intent_classification_logs_userId_idx" ON "intent_classification_logs"("userId");

-- CreateIndex
CREATE INDEX "intent_classification_logs_createdAt_idx" ON "intent_classification_logs"("createdAt");

-- CreateIndex
CREATE INDEX "intent_classification_logs_fallbackTriggered_idx" ON "intent_classification_logs"("fallbackTriggered");

-- CreateIndex
CREATE INDEX "error_logs_service_idx" ON "error_logs"("service");

-- CreateIndex
CREATE INDEX "error_logs_errorType_idx" ON "error_logs"("errorType");

-- CreateIndex
CREATE INDEX "error_logs_severity_idx" ON "error_logs"("severity");

-- CreateIndex
CREATE INDEX "error_logs_resolved_idx" ON "error_logs"("resolved");

-- CreateIndex
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt");

-- CreateIndex
CREATE INDEX "system_health_metrics_metricType_idx" ON "system_health_metrics"("metricType");

-- CreateIndex
CREATE INDEX "system_health_metrics_metricName_idx" ON "system_health_metrics"("metricName");

-- CreateIndex
CREATE INDEX "system_health_metrics_recordedAt_idx" ON "system_health_metrics"("recordedAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_auth" ADD CONSTRAINT "two_factor_auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_metadata" ADD CONSTRAINT "document_metadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_summaries" ADD CONSTRAINT "document_summaries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminology_maps" ADD CONSTRAINT "terminology_maps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_contexts" ADD CONSTRAINT "chat_contexts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_cells" ADD CONSTRAINT "excel_cells_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "excel_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_history" ADD CONSTRAINT "action_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences_memory" ADD CONSTRAINT "user_preferences_memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_topics" ADD CONSTRAINT "conversation_topics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_knowledge" ADD CONSTRAINT "domain_knowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_relationships" ADD CONSTRAINT "concept_relationships_fromConceptId_fkey" FOREIGN KEY ("fromConceptId") REFERENCES "domain_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_relationships" ADD CONSTRAINT "concept_relationships_toConceptId_fkey" FOREIGN KEY ("toConceptId") REFERENCES "domain_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slides" ADD CONSTRAINT "slides_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "presentations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_metrics" ADD CONSTRAINT "conversation_metrics_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_processing_metrics" ADD CONSTRAINT "document_processing_metrics_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_query_metrics" ADD CONSTRAINT "rag_query_metrics_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_query_metrics" ADD CONSTRAINT "rag_query_metrics_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_query_metrics" ADD CONSTRAINT "rag_query_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lifetime_value" ADD CONSTRAINT "user_lifetime_value_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_usage_logs" ADD CONSTRAINT "feature_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

