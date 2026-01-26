# KODA V3 System Map - Cleanroom Hardening

## Entrypoints

### Server Bootstrap
- **File**: `src/server.ts:156` - `startServer()` function
- **HTTP Server**: Created via `src/config/ssl.config.ts:110` using `createSecureServer()`
- **Port**: Configured via `getPortConfig()` (typically 5000 for dev)

### DI Container
- **File**: `src/bootstrap/container.ts:118` - `KodaV3Container` class
- **Initialization**: `initializeContainer()` called at `server.ts:190`
- **Key Services Wired**:
  - `orchestrator` → `KodaOrchestratorV3`
  - `intentEngine` → `KodaIntentEngineV3`
  - `retrievalEngine` → `KodaRetrievalEngineV3`
  - `answerEngine` → `KodaAnswerEngineV3`
  - `formattingPipeline` → `KodaFormattingPipelineV3Service`

### Route Registration
- **File**: `src/app.ts:221-257` - All routes registered via `app.use()`
- **Primary RAG Route**: `src/routes/rag.routes.ts:12` → `/api/rag/query/stream`

---

## Request Flow (AI Pipeline)

```
HTTP Request
    ↓
1. [src/routes/rag.routes.ts:12] POST /api/rag/query/stream
    ↓
2. [src/controllers/rag.controller.ts:308] queryWithRAGStreaming()
    ↓
3. [src/controllers/rag.controller.ts:382] getOrchestrator().orchestrateStream()
    ↓
4. [src/services/core/kodaOrchestratorV3.service.ts] orchestrateStream()
    │
    ├── [LINE ~450-600] Detect language via DefaultLanguageDetector
    ├── [LINE ~700-900] Classify intent via KodaIntentEngineV3.predict()
    ├── [LINE ~1000-1500] Route via decide() from decisionTree.service.ts
    ├── [LINE ~1700-2500] Execute handler based on intent family:
    │   ├── FILE_ACTIONS → handleFileAction()
    │   ├── DOCUMENTS → handleDocumentsIntent()
    │   ├── HELP → handleProductHelp()
    │   └── etc.
    │
    ├── [LINE ~2800-3500] Retrieve via KodaRetrievalEngineV3
    ├── [LINE ~4000-6000] Generate via KodaAnswerEngineV3
    └── [LINE ~7000-9000] Format via KodaFormattingPipelineV3Service
    ↓
5. [src/controllers/rag.controller.ts:410-448] Process done event
    ↓
6. [src/controllers/rag.controller.ts:534-578] Emit final SSE done event
```

---

## Done Event Emission Points (CRITICAL - BYPASS ANALYSIS)

### AUTHORIZED Done Emitter
- **AnswerComposerV1**: `src/services/core/answerComposer.service.ts`
  - All done events should include `composedBy: 'AnswerComposerV1'`

### CURRENT Done Emission Points (MANY BYPASSES EXIST)

| File | Line | Context |
|------|------|---------|
| `kodaAnswerEngineV3.service.ts` | 557 | Answer generation done |
| `kodaAnswerEngineV3.service.ts` | 585 | NOT_FOUND fallback |
| `kodaAnswerEngineV3.service.ts` | 622 | Error fallback |
| `kodaAnswerEngineV3.service.ts` | 755 | Generation done |
| `kodaOrchestratorV3.service.ts` | 1323 | Help intent done |
| `kodaOrchestratorV3.service.ts` | 1742 | Chitchat done |
| `kodaOrchestratorV3.service.ts` | 1862 | Feedback done |
| `kodaOrchestratorV3.service.ts` | 1970 | Memory done |
| `kodaOrchestratorV3.service.ts` | 2110 | Out of scope done |
| `kodaOrchestratorV3.service.ts` | 2186 | No docs fallback |
| `kodaOrchestratorV3.service.ts` | 2219 | Generic fallback |
| `kodaOrchestratorV3.service.ts` | 2244 | Apology fallback |
| `kodaOrchestratorV3.service.ts` | 2389 | No docs message |
| `kodaOrchestratorV3.service.ts` | 2436 | Apology message |
| `kodaOrchestratorV3.service.ts` | 2912 | File action done |
| `kodaOrchestratorV3.service.ts` | 8593 | File list done |
| `rag.controller.ts` | 537 | Controller re-wraps done |

**PROBLEM**: Done events emitted from 16+ locations, not all through AnswerComposer.

---

## Service Responsibilities (Current vs Target)

### Current State (DUPLICATES)

| Responsibility | Files Implementing |
|----------------|-------------------|
| File action detection | `kodaOrchestratorV3.service.ts:6714` (detectFileActionQuery), `contentGuard.service.ts:665` (isFileActionQuery), `runtimePatterns.service.ts:293` (isFileActionQuery), `decisionTree.service.ts:233` |
| Language detection | `languageDetector.service.ts`, orchestrator inline checks |
| Pattern matching | `runtimePatterns.service.ts`, `intentConfig.service.ts`, `brainDataLoader.service.ts`, inline regex in orchestrator |
| Done event emission | orchestrator, answerEngine, controller |

### Target State (ONE SERVICE PER THING)

| Responsibility | Canonical Service |
|----------------|------------------|
| File action detection | `contentGuard.service.ts` (queries runtimePatterns) |
| Language detection | `languageDetector.service.ts` |
| Pattern matching | `runtimePatterns.service.ts` ONLY (loads from banks) |
| Intent resolution | `operatorResolver.service.ts` |
| Scope gating | `scopeGate.service.ts` |
| Content vs file routing | `contentGuard.service.ts` |
| Retrieval | `kodaRetrievalEngineV3.service.ts` |
| Answer composition | `answerComposer.service.ts` |
| Done event emission | `answerComposer.service.ts` ONLY |

---

## Pattern Loading Flow

```
Startup (container.ts)
    ↓
1. Load intent_patterns.runtime.json → intentConfig.service.ts
2. Load brain_data.json → brainDataLoader.service.ts
3. Load data_banks/**/*.json → runtimePatterns.service.ts
4. Wire to KodaIntentEngineV3
    ↓
Request Time
    ↓
1. orchestrator calls intentEngine.predict()
2. intentEngine queries intentConfig
3. routingPriority queries runtimePatterns
4. decisionTree uses runtimePatterns overlays
```

---

## Key File Locations

### Core Services
- `src/services/core/kodaOrchestratorV3.service.ts` - Main orchestrator (~9600 lines)
- `src/services/core/kodaIntentEngineV3.service.ts` - Intent classification
- `src/services/core/kodaRetrievalEngineV3.service.ts` - Document retrieval
- `src/services/core/kodaAnswerEngineV3.service.ts` - Answer generation
- `src/services/core/answerComposer.service.ts` - Output formatting
- `src/services/core/runtimePatterns.service.ts` - Pattern loading

### Routing
- `src/services/core/decisionTree.service.ts` - Family/sub-intent routing
- `src/services/core/routingPriority.service.ts` - Priority scoring
- `src/services/core/contentGuard.service.ts` - Content vs file action

### Data Banks
- `src/data_banks/triggers/*.json` - Trigger patterns by language
- `src/data_banks/routing/*.json` - Routing patterns
- `src/data_banks/formatting/*.json` - Preamble/output patterns
- `src/data/intent_patterns.runtime.json` - Compiled runtime patterns

---

## TypeScript Build Status

**Current Errors**: 100 (truncated)

Key issues:
- Duplicate property names in `kodaRetrievalEngineV3.service.ts`
- Type mismatches in `kodaOrchestratorV3.service.ts` (browse, action types)
- Missing properties in streaming types
- Duplicate function implementations in generators

---

## Circular Dependencies

**Status**: NONE FOUND (madge check passed)

---

## Unused Exports (ts-prune)

**Count**: 200+ unused exports found

Key categories:
- Unused slide components (`ChartSlide`, `ComparisonSlide`, etc.)
- Unused config exports (`QUOTA_TIERS`, `formatBytes`)
- Unused analytics controller methods
- Unused middleware helpers

See `ts_prune.txt` for full list.
