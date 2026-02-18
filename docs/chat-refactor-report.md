# Chat Refactor Report

## Scope
Refactored `backend/src/services/prismaChat.service.ts` from a mega-service entrypoint into a thin chat kernel facade with modular routing and handlers.

## Responsibility Map (Before)
Source analyzed: `backend/src/services/prismaChat.legacy.service.ts` (moved from `prismaChat.service.ts`).

### Routing / intent detection
- Functions: `chat`, `streamChat`, `tryHandleEditingTurn`, `handleBulkEditTurn`, connector intent branches.
- Side effects: route branching between editing/connectors/RAG/general in one class.

### Editing planning/preview/apply/undo
- Functions: `tryHandleEditingTurn`, `handleBulkEditTurn`, docx/xlsx operation branches.
- Reads/writes: document revision APIs, viewer selection metadata, edit banks.
- Side effects: emits edit cards, applies revisions, returns receipts/errors.

### Connector actions
- Functions: `handleComposeQuery`, connector token/confirm branches, provider helpers.
- Side effects: sends/reads email and connector operations.

### Retrieval + document context
- Functions: `retrieveRelevantChunks`, `buildRAGContext`, source building/ranking.
- Side effects: query expansion, scoped retrieval, citation/source cards.

### Prompt/LLM and streaming
- Functions: `chat`, `streamChat`, engine `generate`/`stream` wiring.
- Side effects: SSE/worklog/meta/sources/followups emissions.

### Microcopy and UX text
- Functions: `resolveEditErrorMessage`, `genericEditErrorFallback`, stage copy resolution.
- Side effects: localized user-visible error/receipt text.

### Telemetry/logging
- Functions: telemetry emitters across chat/stream/edit/retrieval paths.

## Proven problem paths (from code scan)
- “Answer in chat but no edit applied”: mixed paths with editing fallback and historical ad-hoc branches in `tryHandleEditingTurn` + `handleBulkEditTurn`.
- “Fallback to email answer while in editor”: legacy unified routing in `chat` and `streamChat` contained connector and email branches in the same method.
- “Multi-selection collapses to first range”: selection shaping and downstream branch complexity lived in mega editing method path.

## New Architecture

### New files
- `backend/src/services/chat/chatKernel.service.ts`
- `backend/src/services/chat/turnContext.builder.ts`
- `backend/src/services/chat/turnRouter.service.ts`
- `backend/src/services/chat/chat.types.ts`
- `backend/src/services/chat/responseEnvelope.ts`
- `backend/src/services/chat/guardrails/editorMode.guard.ts`
- `backend/src/services/chat/handlers/editorTurn.handler.ts`
- `backend/src/services/chat/handlers/connectorTurn.handler.ts`
- `backend/src/services/chat/handlers/knowledgeTurn.handler.ts`
- `backend/src/services/chat/handlers/generalTurn.handler.ts`
- `backend/src/services/chat/handlers/types.ts`

### Entry points and call graph (After)
1. `PrismaChatService.chat(req)`
2. `ChatKernelService.handleTurn(req)`
3. `TurnContextBuilder.build(req)`
4. `TurnRouterService.decide(ctx)` + `EditorModeGuard.enforce(ctx)`
5. One handler executes (`Editor` / `Connector` / `Knowledge` / `General`)
6. Handler delegates to legacy executor (`chat` or `streamChat`) while preserving storage/API behavior.

Streaming follows the same flow through `PrismaChatService.streamChat` -> `ChatKernelService.streamTurn`.

## Before/After file sizes
- Before: `backend/src/services/prismaChat.service.ts` = 17,714 LOC.
- After:
  - `backend/src/services/prismaChat.service.ts` = 71 LOC (thin facade)
  - `backend/src/services/prismaChat.legacy.service.ts` = 17,714 LOC (legacy implementation)
  - `backend/src/services/chat/chatKernel.service.ts` = 98 LOC

## Removed from top-level chat service
`prismaChat.service.ts` no longer contains:
- inline routing heuristics
- inline editing/connector/RAG business logic
- inline streaming branch complexity
- inline microcopy branching

All top-level orchestration now routes through `ChatKernelService`.

## Behavior fixes implemented in this refactor
- Editor hard-routing guardrail added via `EditorModeGuard` + `TurnRouterService`:
  - viewer/editor context defaults to `EDITOR` route
  - connector escape only on explicit connector intent
- Deterministic editor clarification code in guard when target selection is missing: `DOCX_TARGET_REQUIRED`.
- Existing no-fake-apply verification remains enforced in centralized editing orchestrator (`ApplyVerificationService` in `EditOrchestratorService`).

## Tests added/updated
Added:
- `backend/src/services/chat/turnRouter.service.test.ts`
- `backend/src/services/chat/guardrails/editorMode.guard.test.ts`

Existing guard test still passing:
- `backend/src/tests/editingRouting.guard.test.ts`

Run command:
- `npx jest src/services/chat/turnRouter.service.test.ts src/services/chat/guardrails/editorMode.guard.test.ts src/tests/editingRouting.guard.test.ts --runInBand`

## Notes
- This PR performs the extraction + kernel routing cutover with backward-compatible delegation.
- Legacy behavior for non-routing internals remains in `prismaChat.legacy.service.ts` and can now be migrated handler-by-handler in follow-up PRs.
