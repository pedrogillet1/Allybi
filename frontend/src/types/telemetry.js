/**
 * @typedef {Object} TelemetryEvent
 * @property {string} eventId
 * @property {string} timestamp
 * @property {'local' | 'staging' | 'prod'} env
 * @property {string} userId
 * @property {string} conversationId
 * @property {string} messageId
 * @property {string} [sessionId]
 * @property {string} queryText
 * @property {string} language
 * @property {string} [clientTimezone]
 * @property {string} [clientLocation]
 * @property {string} frontendRoute
 * @property {string} intent
 * @property {string} [subIntent]
 * @property {string[]} facets
 * @property {number} confidence
 * @property {string} routerVersion
 * @property {string} intentPatternVersion
 * @property {boolean} fallbackTriggered
 * @property {string} [fallbackReason]
 * @property {boolean} multiIntentDetected
 * @property {string[]} intentsDetected
 * @property {number} docWorkspaceCount
 * @property {string[]} docIdsInScope
 * @property {number} [contextTokensEstimated]
 * @property {'cache' | 'db' | 'recomputed'} contextLoadSource
 * @property {boolean} contextLostDetected
 * @property {any[]} resolvedEntities
 * @property {'none' | 'metadata' | 'vector' | 'hybrid'} retrievalMode
 * @property {number} retrievalTimeMs
 * @property {number} chunksRetrieved
 * @property {number} topK
 * @property {number[]} topChunkScores
 * @property {Array<{docId: string, avgScore: number}>} docsRetrieved
 * @property {string[]} retrievalErrors
 * @property {string} modelProvider
 * @property {string} modelName
 * @property {number} promptBuildTimeMs
 * @property {number} generationTimeMs
 * @property {number} [tokensIn]
 * @property {number} [tokensOut]
 * @property {number} answerLengthChars
 * @property {{qualityPass: boolean, failedChecks: string[], qualityScore: number}} qualityChecks
 * @property {boolean} streamingEnabled
 * @property {number} ttftMs
 * @property {number} totalLatencyMs
 * @property {number} renderedActionsCount
 * @property {number} docButtonsExpected
 * @property {number} docButtonsRendered
 * @property {any} formattingExpected
 * @property {boolean} formattingPass
 * @property {string[]} uiWarnings
 * @property {string} [errorCode]
 * @property {string} [errorMessage]
 * @property {string} [errorService]
 * @property {number} [httpStatus]
 */

/**
 * @typedef {Object} OverviewData
 * @property {{status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE', uptime: number}} systemHealth
 * @property {{current: number, change: number}} activeUsers
 * @property {{current: number}} requestsPerMin
 * @property {{current: number, change: number}} avgResponseTime
 * @property {Array<{time: string, count: number}>} requestVolume
 * @property {Array<{name: string, value: number}>} intentDistribution
 * @property {Array<{name: string, status: 'Healthy' | 'Unhealthy'}>} serviceStatus
 */

/**
 * @typedef {Object} IntentAnalysisData
 * @property {{current: number, change: number}} accuracy
 * @property {number} avgConfidence
 * @property {{current: number, change: number}} fallbackRate
 * @property {{count: number, percentage: number}} multiIntentQueries
 * @property {Array<{date: string, [key: string]: any}>} classificationOverTime
 * @property {Array<{query: string, expected: string, actual: string, confidence: number}>} topMisclassifications
 * @property {Array<{range: string, count: number}>} confidenceDistribution
 * @property {Array<{name: string, count: number}>} overrideTriggers
 */

/**
 * @typedef {Object} RetrievalData
 * @property {{current: number, change: number}} avgRetrievalTime
 * @property {number} avgChunksRetrieved
 * @property {{current: number, change: number}} vectorSearchAccuracy
 * @property {{total: number, pending: number}} documentsIndexed
 * @property {Array<{time: string, retrievalTime: number, chunksRetrieved: number}>} retrievalPerformance
 * @property {number[]} chunkRelevanceDistribution
 * @property {Array<{name: string, count: number, avgScore: number}>} topRetrievedDocs
 * @property {{vector: number, keyword: number, combined: number}} hybridSearchPerformance
 * @property {Array<{status: string, count: number}>} embeddingStatus
 */

/**
 * @typedef {Object} ErrorsData
 * @property {{current: number, change: number}} errorRate
 * @property {{current: number, previous: number}} totalErrors
 * @property {number} criticalErrors
 * @property {{current: number, change: number}} avgResolutionTime
 * @property {Array<{date: string, total: number, critical: number}>} errorTrends
 * @property {Array<{time: string, service: string, error: string, status: string}>} recentErrors
 * @property {Array<{name: string, count: number}>} errorsByService
 * @property {Array<{name: string, count: number}>} fallbackTriggers
 */

/**
 * @typedef {Object} UsersData
 * @property {{current: number, change: number}} activeUsers
 * @property {{count: number, perUserAvg: number}} totalQueries
 * @property {{count: number, change: number}} newUsers
 * @property {{current: number, change: number}} avgSessionDuration
 * @property {Array<{date: string, active: number, new: number}>} userActivity
 * @property {Array<{hour: number, count: number}>} queryVolumeByHour
 * @property {Array<{user: string, queries: number, docsUploaded: number}>} topUsers
 * @property {Array<{name: string, count: number}>} featureUsage
 * @property {Array<{name: string, value: string | number}>} engagementMetrics
 */

/**
 * @typedef {Object} DatabaseData
 * @property {number} totalRecords
 * @property {string} encryptionStatus
 * @property {{value: number, unit: string, quotaPercentage: number}} storageUsed
 * @property {number} clientKeysActive
 * @property {Array<{id: string, userId: string, title: string, content: string, status: string, createdAt: string}>} documents
 * @property {Array<{check: string, status: string}>} zkVerification
 * @property {Array<{metric: string, value: string}>} dbPerformance
 * @property {Array<{operation: string, time: string}>} recentDbOperations
 */

export {};
