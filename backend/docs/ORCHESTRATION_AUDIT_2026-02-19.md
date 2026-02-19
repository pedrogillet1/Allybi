# Orchestration Audit — 2026-02-19

## Scope
Audited orchestration-related services and runtime wiring:
- `src/services/core/orchestration/kodaOrchestrator.service.ts`
- `src/services/core/orchestration/orchestratorFactory.ts`
- `src/services/chat/runtime/ChatRuntimeOrchestrator.ts`
- `src/services/chat/chatKernel.service.ts`
- `src/services/chat/turnRouter.service.ts`
- `src/services/editing/editOrchestrator.service.ts`
- `src/services/creative/creativeOrchestrator.service.ts`
- `src/services/app/chatApp.service.ts`
- `src/services/app/ragApp.service.ts`
- `src/services/prismaChat.service.ts`
- `src/services/chatRuntime.service.ts`
- `src/server.ts`
- `src/routes/chat.routes.ts`
- `src/bootstrap/container.ts`

## Executive Grade
Overall orchestration health: **5.4 / 10**

Current state is not centralized end-to-end. There is strong structure in some orchestrators, but production chat runtime still flows through legacy paths, and the "new" core orchestrator factory is mostly stubbed.

## Severity-Ranked Findings

### Critical
1. **Primary production chat path bypasses `KodaOrchestratorV3Service`.**
- Runtime wiring uses `PrismaChatService -> ChatRuntimeService -> LegacyChatRuntimeService`, not `app.locals.services.core.orchestrator`.
- Evidence:
  - `src/server.ts:136`
  - `src/server.ts:214`
  - `src/routes/chat.routes.ts:753`
  - `src/services/prismaChat.service.ts:64`
  - `src/services/chatRuntime.service.ts:23`
  - `src/services/chatRuntime.service.ts:62`
- Impact: the architecture claims a centralized V3 orchestrator, but user-facing chat behavior is still governed by legacy runtime.

2. **`orchestratorFactory` is largely non-production stubs.**
- Retrieval, ranking, query rewrite, scope, grounding, quality gates, state update are explicitly stubbed.
- Evidence:
  - `src/services/core/orchestration/orchestratorFactory.ts:43`
  - `src/services/core/orchestration/orchestratorFactory.ts:75`
  - `src/services/core/orchestration/orchestratorFactory.ts:96`
  - `src/services/core/orchestration/orchestratorFactory.ts:119`
  - `src/services/core/orchestration/orchestratorFactory.ts:208`
  - `src/services/core/orchestration/orchestratorFactory.ts:233`
  - `src/services/core/orchestration/orchestratorFactory.ts:246`
  - `src/services/core/orchestration/orchestratorFactory.ts:299`
- Impact: if this orchestrator is switched on, behavior quality and grounding will collapse.

3. **Dead/unwired app facades with null dependencies and unsafe `any`.**
- `ChatAppService` and `RagAppService` have `orchestrator` and other deps hardcoded as `null` and call methods that are not part of `KodaOrchestratorV3Service`.
- Evidence:
  - `src/services/app/chatApp.service.ts:110`
  - `src/services/app/chatApp.service.ts:151`
  - `src/services/app/chatApp.service.ts:238`
  - `src/services/app/ragApp.service.ts:116`
  - `src/services/app/ragApp.service.ts:162`
  - `src/services/app/ragApp.service.ts:236`
  - `src/services/core/orchestration/kodaOrchestrator.service.ts:553`
- Impact: broken integration surface, hidden by `any`; increases future migration risk and confusion.

### High
4. **Routing/scope behavior is partly hardcoded regex and not bank-driven.**
- Connector routing and scope clear commands are regex literals in runtime services.
- Evidence:
  - `src/services/chat/turnRouter.service.ts:4`
  - `src/services/chat/turnRouter.service.ts:18`
  - `src/services/chat/runtime/ScopeService.ts:56`
  - `src/services/chat/runtime/ScopeService.ts:62`
- Impact: inconsistent behavior vs centralized banks/policies and fragile multilingual coverage.

5. **Fallback and connector/email user copy is hardcoded in orchestrator layers.**
- Multiple fixed strings bypass centralized microcopy banks.
- Evidence:
  - `src/services/core/orchestration/orchestratorFactory.ts:270`
  - `src/services/core/orchestration/orchestratorFactory.ts:356`
  - `src/services/core/orchestration/kodaOrchestrator.service.ts:735`
  - `src/services/core/orchestration/kodaOrchestrator.service.ts:758`
- Impact: translation drift, inconsistent UX, and duplicated policy text.

6. **Telemetry side-effect in orchestrator creates noisy async failures in tests and couples orchestrator to Prisma.**
- Fire-and-forget `queryTelemetry.create()` inside orchestrator introduces asynchronous DB logging noise.
- Evidence:
  - `src/services/core/orchestration/kodaOrchestrator.service.ts:514`
  - `src/services/core/orchestration/kodaOrchestrator.service.ts:1280`
- Impact: test instability and tighter coupling between orchestration and storage concerns.

### Medium
7. **Type-safety erosion in orchestration boundaries (`any`, `as any`) hides contract drift.**
- Present in factory adapters and app facades.
- Evidence:
  - `src/services/core/orchestration/orchestratorFactory.ts:202`
  - `src/services/core/orchestration/orchestratorFactory.ts:381`
  - `src/services/app/chatApp.service.ts:110`
  - `src/services/app/ragApp.service.ts:116`

8. **Factory creates new intent engine per resolve call instead of one managed singleton.**
- Evidence:
  - `src/services/core/orchestration/orchestratorFactory.ts:381`
- Impact: unnecessary object churn and potentially inconsistent caching behavior.

## Positive Findings
1. **Edit orchestration quality is materially stronger and enforces no-fake-success semantics.**
- Explicit NOOP path when no mutation proof exists.
- Explicit `OPERATOR_NOT_IMPLEMENTED` handling.
- Evidence:
  - `src/services/editing/editOrchestrator.service.ts:489`
  - `src/services/editing/editOrchestrator.service.ts:591`

2. **Chat runtime post-processing has coherent normalization + scoped evidence enforcement.**
- Evidence:
  - `src/services/chat/runtime/ChatRuntimeOrchestrator.ts:151`
  - `src/services/chat/runtime/ChatRuntimeOrchestrator.ts:182`

3. **Creative orchestration is cleanly pipelined and dependency-injected.**
- Evidence:
  - `src/services/creative/creativeOrchestrator.service.ts:58`

## Component Grades
- `KodaOrchestratorV3Service`: **6.2 / 10**
- `orchestratorFactory`: **2.1 / 10**
- `ChatRuntimeOrchestrator`: **7.0 / 10**
- `ChatKernelService + TurnRouterService`: **5.8 / 10**
- `EditOrchestratorService`: **8.6 / 10**
- `CreativeOrchestratorService`: **8.3 / 10**
- `ChatAppService`: **1.9 / 10**
- `RagAppService`: **2.2 / 10**

## Required Remediation to Reach 10/10 Centralization
1. Route all user-facing chat turns through one orchestrator runtime path only.
2. Replace every STUB in `orchestratorFactory` with concrete implementations or fail closed.
3. Remove or fully wire `ChatAppService` and `RagAppService`; no `null` dependency placeholders.
4. Move connector/scope regex and hardcoded microcopy into banks + typed policy services.
5. Replace orchestration `any` contracts with strict interfaces; ban `any` on orchestration boundaries.
6. Move telemetry persistence out of orchestrator core into injected telemetry adapter/queue.
7. Add CI gate: fail if runtime chat path bypasses configured orchestrator path.

## Verification Notes
- `npm run -s koda:audit` passes (bank/routing checks).
- `npm run -s test:runtime-wiring` passes.
- `editingDispatch` tests pass, but direct run surfaces async Prisma telemetry logs after test completion, consistent with the telemetry coupling finding.
