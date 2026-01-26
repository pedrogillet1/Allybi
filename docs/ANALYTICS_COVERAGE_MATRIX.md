# Koda Analytics Dashboard - Coverage Matrix

This document provides a complete mapping of every system event/metric to its data source, database model, API endpoint, and dashboard widget.

**VERSION**: 1.0.0
**LAST UPDATED**: 2026-01-15

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RAG PIPELINE REQUEST                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  TELEMETRY CAPTURE POINTS                                                │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐          │
│  │ Routing │→│ Retrieval│→│ Evidence│→│Formatting│→│   SSE   │          │
│  │ Service │ │  Engine  │ │  Gates  │ │ Pipeline │ │Streaming│          │
│  └────┬────┘ └────┬─────┘ └────┬────┘ └────┬─────┘ └────┬────┘          │
└───────┼───────────┼────────────┼───────────┼────────────┼───────────────┘
        │           │            │           │            │
        └───────────┴────────────┴───────────┴────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  QueryTelemetryService.save(telemetry)                                   │
│  └── TelemetryBuilder.build() → QueryTelemetry → Prisma → PostgreSQL    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGGREGATION LAYER                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ QueryTelemetryService.get*Analytics()                              │ │
│  │ - getIntentAnalytics()     - getRetrievalAnalytics()               │ │
│  │ - getQualityAnalytics()    - getLanguageAnalytics()                │ │
│  │ - getPerformanceAnalytics() - getCostAnalytics()                   │ │
│  │ - getQueryList()           - getQueryDetail()                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ADMIN API ENDPOINTS (/api/dashboard/analytics/*)                        │
│  GET /intents     GET /retrieval    GET /quality    GET /language       │
│  GET /performance GET /telemetry-costs GET /queries GET /queries/:id    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND DASHBOARD                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │   Overview   │ │    Queries   │ │   Quality    │ │ Performance  │   │
│  │    Page      │ │     Page     │ │     Page     │ │    Page      │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Coverage Matrix

### 1. INTENT CLASSIFICATION METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Intent Type | `kodaIntentEngineV3.service.ts` | `QueryTelemetry.intent` | `/intents` → `byIntent` | Intent Distribution Chart |
| Confidence Score | `kodaIntentEngineV3.service.ts` | `QueryTelemetry.intentConfidence` | `/intents` → `avgConfidence` | Confidence Gauge |
| Question Type | `patternClassifierV3.service.ts` | `QueryTelemetry.questionType` | `/intents` → `byQuestionType` | Question Type Breakdown |
| Query Scope | `patternClassifierV3.service.ts` | `QueryTelemetry.queryScope` | `/intents` → (available via query list) | Scope Filter |
| Domain | `kodaIntentEngineV3.service.ts` | `QueryTelemetry.domain` | `/intents` → `byDomain` | Domain Breakdown Chart |
| Depth Level (D1-D5) | `kodaIntentEngineV3.service.ts` | `QueryTelemetry.depth` | `/intents` → `byDepth` | Depth Histogram |
| Intent Family | `routingPriority.service.ts` | `QueryTelemetry.family` | `/intents` → (via query detail) | Family Filter |
| Multi-Intent Flag | `multiIntent.service.ts` | `QueryTelemetry.isMultiIntent` | `/intents` → `multiIntentRate` | Multi-Intent Rate Card |
| Segment Count | `multiIntent.service.ts` | `QueryTelemetry.segmentCount` | `/queries/:id` → detail | Query Detail View |
| Matched Patterns | `patternClassifierV3.service.ts` | `QueryTelemetry.matchedPatterns` | `/intents` → `topPatterns` | Top Patterns Table |
| Matched Keywords | `patternClassifierV3.service.ts` | `QueryTelemetry.matchedKeywords` | `/intents` → `topKeywords` | Top Keywords Table |
| Blocked by Negatives | `patternClassifierV3.service.ts` | `QueryTelemetry.blockedByNegatives` | `/queries/:id` | Query Detail View |
| Override Reason | `kodaIntentEngineV3.service.ts` | `QueryTelemetry.overrideReason` | `/intents` → `overrideRate` | Override Rate Card |
| Classification Time (ms) | `kodaIntentEngineV3.service.ts` | `QueryTelemetry.classificationTimeMs` | `/intents` → `avgClassificationTimeMs` | Avg Classification Time Card |

### 2. RETRIEVAL METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Chunks Returned | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.chunksReturned` | `/retrieval` → `avgChunksReturned` | Chunks Returned Distribution |
| BM25 Results | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.bm25Results` | `/retrieval` → (in detail) | Retrieval Method Breakdown |
| Vector Results | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.vectorResults` | `/retrieval` → (in detail) | Retrieval Method Breakdown |
| Distinct Documents | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.distinctDocs` | `/retrieval` → `avgDistinctDocs` | Avg Distinct Docs Card |
| Document IDs | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.documentIds` | `/queries/:id` | Query Detail View |
| Top Relevance Score | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.topRelevanceScore` | `/retrieval` → `avgTopScore` | Top Score Gauge |
| Avg Relevance Score | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.avgRelevanceScore` | `/retrieval` → `avgRelevanceScore` | Relevance Gauge |
| Min Relevance Score | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.minRelevanceScore` | `/queries/:id` | Query Detail View |
| Total Snippet Chars | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.totalSnippetChars` | `/queries/:id` | Query Detail View |
| Retrieval Adequate | `retrievalBudget.service.ts` | `QueryTelemetry.retrievalAdequate` | `/retrieval` → `adequacyRate` | Adequacy Rate Card |
| Retrieval Method | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.retrievalMethod` | `/retrieval` → `byMethod` | Method Breakdown Chart |
| Merge Strategy | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.mergeStrategy` | `/queries/:id` | Query Detail View |
| Expansion Attempts | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.expansionAttempts` | `/queries/:id` | Query Detail View |
| Meets All Floors | `retrievalBudget.service.ts` | `QueryTelemetry.meetsAllFloors` | `/queries/:id` | Query Detail View |
| Retrieval Budgets | `retrievalBudget.service.ts` | `QueryTelemetry.retrievalBudgets` | `/queries/:id` | Query Detail View |

### 3. EVIDENCE GATE METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Evidence Gate Action | `notFoundWithEvidence.guard.ts` | `QueryTelemetry.evidenceGateAction` | `/retrieval` → `evidenceGateActions` | Evidence Gate Actions Chart |
| Evidence Gate Message | `notFoundWithEvidence.guard.ts` | `QueryTelemetry.evidenceGateMessage` | `/queries/:id` | Query Detail View |
| Should Proceed | `notFoundWithEvidence.guard.ts` | `QueryTelemetry.evidenceShouldProceed` | `/queries/:id` | Query Detail View |

### 4. FORMATTING PIPELINE METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Format Mode | `kodaFormattingPipelineV3.service.ts` | `QueryTelemetry.formatMode` | `/queries/:id` | Query Detail View |
| Formatting Passed | `responseContractEnforcer.service.ts` | `QueryTelemetry.formattingPassed` | `/quality` → (via failures) | Formatting Pass Rate |
| Formatting Violations | `responseContractEnforcer.service.ts` | `QueryTelemetry.formattingViolations` | `/queries/:id` | Query Detail View |
| Bullet Policy | `responseContractEnforcer.service.ts` | `QueryTelemetry.bulletPolicy` | `/queries/:id` | Query Detail View |
| Constraints | `responseContractEnforcer.service.ts` | `QueryTelemetry.constraints` | `/queries/:id` | Query Detail View |

### 5. LANGUAGE RESOLUTION METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Resolved Language | `languageResolver.service.ts` | `QueryTelemetry.resolvedLang` | `/language` → `byLanguage` | Language Breakdown Chart |
| Language Source | `languageResolver.service.ts` | `QueryTelemetry.languageSource` | `/language` → `bySource` | Source Breakdown Chart |
| Detected Language | `languageResolver.service.ts` | `QueryTelemetry.detectedLang` | `/queries/:id` | Query Detail View |
| Language Mismatch | `languageGate.service.ts` | `QueryTelemetry.languageMismatch` | `/language` → `mismatchRate` | Mismatch Rate Card |
| Enforcement Applied | `languageGate.service.ts` | `QueryTelemetry.enforcementApplied` | `/language` → `enforcementRate` | Enforcement Rate Card |
| Banned Phrases Found | `languageGate.service.ts` | `QueryTelemetry.bannedPhrasesFound` | `/language` → `topBannedPhrases` | Top Banned Phrases Table |

### 6. QUALITY & GROUNDING METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Is Useful | Evaluator/Telemetry | `QueryTelemetry.isUseful` | `/quality` → `usefulRate` | Useful Answer Rate Card |
| Failure Category | Evaluator/Telemetry | `QueryTelemetry.failureCategory` | `/quality` → `byFailureCategory` | Failure Category Chart |
| Had Fallback | `kodaFallbackEngineV3.service.ts` | `QueryTelemetry.hadFallback` | `/quality` → `uselessFallbackRate` | Fallback Rate Card |
| Fallback Scenario | `kodaFallbackEngineV3.service.ts` | `QueryTelemetry.fallbackScenario` | `/quality` → `byFallbackScenario` | Fallback Scenarios Table |
| Citation Count | `answerAssemblyControllerV1.service.ts` | `QueryTelemetry.citationCount` | `/quality` → `avgCitationCount` | Avg Citations Card |
| Sources Missing | `answerAssemblyControllerV1.service.ts` | `QueryTelemetry.sourcesMissing` | `/quality` → `sourcesMissingRate` | Sources Missing Rate Card |
| Answer Length | `answerAssemblyControllerV1.service.ts` | `QueryTelemetry.answerLength` | `/queries/:id` | Query Detail View |
| Ungrounded Claims | Evaluator/Telemetry | `QueryTelemetry.ungroundedClaims` | `/quality` → `ungroundedClaimsRate` | Ungrounded Claims Rate Card |
| Underinformative | Evaluator/Telemetry | `QueryTelemetry.underinformative` | `/quality` → `underinformativeRate` | Underinformative Rate Card |
| Metadata Only | Evaluator/Telemetry | `QueryTelemetry.metadataOnly` | `/quality` → (via failures) | Failure Category Chart |
| Thin Retrieval | Evaluator/Telemetry | `QueryTelemetry.thinRetrieval` | `/retrieval` → `thinRetrievalRate` | Thin Retrieval Rate Card |
| Incomplete Summary | Evaluator/Telemetry | `QueryTelemetry.incompleteSummary` | `/quality` → (via failures) | Failure Category Chart |
| Compare Single Doc | Evaluator/Telemetry | `QueryTelemetry.compareSingleDoc` | `/quality` → (via failures) | Failure Category Chart |
| Was Truncated | `answerAssemblyControllerV1.service.ts` | `QueryTelemetry.wasTruncated` | `/queries/:id` | Query Detail View |

### 7. LATENCY METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| TTFT (Time to First Token) | SSE Controller | `QueryTelemetry.ttft` | `/performance` → `ttftPercentiles` | TTFT Percentiles Card |
| Retrieval Time (ms) | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.retrievalMs` | `/performance` → `avgLatencyByStage.retrieval` | Latency by Stage Chart |
| LLM Latency (ms) | `kodaAnswerEngineV3.service.ts` | `QueryTelemetry.llmMs` | `/performance` → `avgLatencyByStage.llm` | Latency by Stage Chart |
| Embedding Latency (ms) | Embedding Service | `QueryTelemetry.embeddingMs` | `/performance` → `avgLatencyByStage.embedding` | Latency by Stage Chart |
| Pinecone Latency (ms) | Pinecone Client | `QueryTelemetry.pineconeMs` | `/performance` → `avgLatencyByStage.pinecone` | Latency by Stage Chart |
| BM25 Latency (ms) | BM25 Service | `QueryTelemetry.bm25Ms` | `/queries/:id` | Query Detail View |
| Formatting Time (ms) | `kodaFormattingPipelineV3.service.ts` | `QueryTelemetry.formattingMs` | `/performance` → `avgLatencyByStage.formatting` | Latency by Stage Chart |
| Total Time (ms) | Pipeline End | `QueryTelemetry.totalMs` | `/performance` → `latencyPercentiles` | Latency Percentiles Card |

### 8. TOKEN & COST METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Model | `kodaAnswerEngineV3.service.ts` | `QueryTelemetry.model` | `/telemetry-costs` → `byModel` | Cost by Model Chart |
| Input Tokens | `kodaAnswerEngineV3.service.ts` | `QueryTelemetry.inputTokens` | `/telemetry-costs` → `tokens.totalInput` | Token Usage Card |
| Output Tokens | `kodaAnswerEngineV3.service.ts` | `QueryTelemetry.outputTokens` | `/telemetry-costs` → `tokens.totalOutput` | Token Usage Card |
| Total Tokens | Computed | `QueryTelemetry.totalTokens` | `/telemetry-costs` → `tokens.avgPerQuery` | Avg Tokens/Query Card |
| Estimated Cost (USD) | Computed | `QueryTelemetry.estimatedCostUsd` | `/telemetry-costs` → `totalCost` | Total Cost Card |
| Context Used | `kodaAnswerEngineV3.service.ts` | `QueryTelemetry.contextUsed` | `/queries/:id` | Query Detail View |
| Context Max | `kodaAnswerEngineV3.service.ts` | `QueryTelemetry.contextMax` | `/queries/:id` | Query Detail View |

### 9. SSE STREAMING METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Stream Started | SSE Controller | `QueryTelemetry.streamStarted` | `/queries/:id` | Query Detail View |
| First Token Received | SSE Controller | `QueryTelemetry.firstTokenReceived` | `/queries/:id` | Query Detail View |
| Stream Ended | SSE Controller | `QueryTelemetry.streamEnded` | `/performance` → `sseHealth.successRate` | SSE Success Rate Card |
| Client Disconnected | SSE Controller | `QueryTelemetry.clientDisconnected` | `/queries/:id` | Query Detail View |
| SSE Errors | SSE Controller | `QueryTelemetry.sseErrors` | `/queries/:id` | Query Detail View |
| Chunks Sent | SSE Controller | `QueryTelemetry.chunksSent` | `/performance` → `sseHealth.avgChunksSent` | Avg Chunks Card |
| Stream Duration (ms) | SSE Controller | `QueryTelemetry.streamDurationMs` | `/performance` → `sseHealth.avgStreamDuration` | Avg Stream Duration Card |
| Was Aborted | SSE Controller | `QueryTelemetry.wasAborted` | `/performance` → `sseHealth.abortRate` | Abort Rate Card |

### 10. PIPELINE METADATA

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Pipeline Signature | `kodaOrchestratorV3.service.ts` | `QueryTelemetry.pipelineSignature` | `/queries/:id` | Query Detail View |
| Handler | `routingPriority.service.ts` | `QueryTelemetry.handler` | `/queries/:id` | Query Detail View |
| Pipeline Family | `routingPriority.service.ts` | `QueryTelemetry.pipelineFamily` | `/queries/:id` | Query Detail View |
| RAG Enabled | `kodaOrchestratorV3.service.ts` | `QueryTelemetry.ragEnabled` | `/queries/:id` | Query Detail View |
| Hybrid Search Used | `kodaRetrievalEngineV3.service.ts` | `QueryTelemetry.hybridSearchUsed` | `/queries/:id` | Query Detail View |
| Product Help Used | `kodaProductHelpV3.service.ts` | `QueryTelemetry.productHelpUsed` | `/queries/:id` | Query Detail View |
| Math Used | `mathOrchestrator.service.ts` | `QueryTelemetry.mathUsed` | `/queries/:id` | Query Detail View |
| Routing Reason | `routingPriority.service.ts` | `QueryTelemetry.routingReason` | `/queries/:id` | Query Detail View |

### 11. ERROR & WARNING METRICS

| Metric | Source | DB Column | Endpoint | Dashboard Widget |
|--------|--------|-----------|----------|------------------|
| Errors Array | Various Services | `QueryTelemetry.errors` | `/queries/:id` | Query Detail View |
| Warnings Array | Various Services | `QueryTelemetry.warnings` | `/queries/:id` | Query Detail View |
| Has Errors Flag | Computed | `QueryTelemetry.hasErrors` | `/queries` → filter | Error Filter |

---

## Dashboard Widgets Summary

### Overview Page
- Total Queries Card
- Useful Answer Rate Card
- Avg Latency Card (P50/P95/P99)
- TTFT Card
- Intent Distribution (Pie Chart)
- Quality Summary (Stacked Bar)
- Retrieval Health (Gauge)
- Language Breakdown (Pie Chart)

### Queries Page
- Query List Table (filterable by intent, language, failure, date range)
- Query Detail Modal (full telemetry breakdown)
- Export to CSV

### Quality Page
- Useful Rate Gauge
- Failure Categories Chart
- Fallback Rate Card
- Sources Missing Rate
- Ungrounded Claims Rate
- Quality Trend (Line Chart)

### Performance Page
- Latency Percentiles (P50, P75, P90, P95, P99)
- TTFT Percentiles
- Latency by Stage (Stacked Bar)
- SSE Health Cards
- Latency Trend (24h Line Chart)

### Costs Page
- Total Cost Card
- Cost Per Query Card
- Cost by Model (Bar Chart)
- Token Usage Cards
- Daily Cost Trend (Line Chart)
- Top Spenders Table

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| QueryTelemetry Prisma Model | ✅ Complete | `backend/prisma/schema.prisma` |
| QueryTelemetry TS Types | ✅ Complete | `backend/src/types/queryTelemetry.types.ts` |
| QueryTelemetryService | ✅ Complete | `backend/src/services/analytics/queryTelemetry.service.ts` |
| TelemetryBuilder | ✅ Complete | In QueryTelemetryService |
| Backend Endpoints | ✅ Complete | `backend/src/routes/dashboard.routes.ts` |
| Frontend API Client | ✅ Complete | `koda-analytics-dashboard/client/src/lib/analytics-api.ts` |
| Frontend Context | ✅ Complete | `koda-analytics-dashboard/client/src/contexts/AnalyticsContext.tsx` |
| Pipeline Instrumentation | 🔄 Pending | Need to add telemetry capture in orchestrator |
| Frontend Dashboard Pages | 🔄 Pending | Need to add control plane widgets |

---

## Next Steps

1. **Add Telemetry Capture to Orchestrator**
   - Create TelemetryBuilder at start of request
   - Call setIntent/setRetrieval/etc at each stage
   - Save telemetry at end of request

2. **Run Prisma Migration**
   ```bash
   npx prisma migrate dev --name add_query_telemetry
   ```

3. **Update Dashboard Pages**
   - Add control plane widgets to Overview
   - Create Queries page with table and detail view
   - Add Quality, Performance sections

4. **Test End-to-End**
   - Make test queries
   - Verify telemetry is captured
   - Verify dashboard shows data
