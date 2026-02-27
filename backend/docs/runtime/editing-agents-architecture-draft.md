# Editing Agents Architecture Draft

Last updated: 2026-02-27
Owner: backend-runtime
Status: Draft for implementation

## 1) Objective

Create separate, production-grade editing agents that are isolated from normal chat:

- `DocxEditAgent` for `.docx` editing
- `SheetsEditAgent` for `.xlsx` editing (with Python compute support)
- Slides continue on fallback/default path for now (no dedicated slides agent in this phase)

The editing agents must be:

- isolated from `/api/chat` normal runtime
- deterministic and auditable
- policy-gated and idempotent
- measurable with clear quality and latency SLOs

## 2) Current Repo Reality (baseline)

Current relevant surfaces:

- Editing APIs:
  - `backend/src/entrypoints/http/routes/editing.routes.ts`
  - `backend/src/entrypoints/http/routes/editor-session.routes.ts`
- Editing controller layer:
  - `backend/src/controllers/editing.controller.ts`
  - `backend/src/controllers/editorSession.controller.ts`
- Editing core:
  - `backend/src/services/core/handlers/editHandler.service.ts`
  - `backend/src/services/editing/editOrchestrator.service.ts`
  - `backend/src/services/editing/documentRevisionStore.service.ts`
- Viewer/editor side-chat currently uses `/api/chat/viewer/stream` and is routed to `EDITOR`:
  - `backend/src/entrypoints/http/routes/chat.routes.ts`
  - `backend/src/services/chat/chatKernel.service.ts`
  - `backend/src/services/chat/turnRouter.service.ts`
  - `backend/src/services/chat/handlers/editorTurn.handler.ts`

Python already exists for spreadsheet execution:

- `python-services/spreadsheet_engine/`
- TS client/service:
  - `backend/src/services/spreadsheetEngine/spreadsheetEngine.client.ts`
  - `backend/src/services/spreadsheetEngine/spreadsheetEngine.service.ts`

## 3) Target Architecture

### 3.1 Editing entrypoints (no normal-chat editing execution)

Keep edits executed only through editing APIs:

- `/api/editing/*`
- `/api/editor-session/*`

Viewer assistant in editor UI may still use chat UX streaming, but execution must delegate to editing agents, not general knowledge chat behavior.

### 3.2 Agent router layer

Create a single router that picks the correct domain agent:

- Input: `EditHandlerRequest`
- Output: `{ agentId, response }`
- Routing key: `planRequest.domain`

Agent mapping:

- `docx -> edit_agent_docx`
- `sheets -> edit_agent_sheets`
- fallback -> `edit_agent_default`

### 3.3 Domain agents

#### DocxEditAgent

Responsibilities:

- operator resolution and plan building for docx intents
- target resolution (paragraph/span/section)
- policy and support-contract checks
- diff, preview, apply, undo
- citation/evidence alignment for doc-derived changes

Tooling:

- TS-native docx pipeline (`documentRevisionStore` + docx helpers)

#### SheetsEditAgent

Responsibilities:

- sheet/range targeting
- operation classification:
  - deterministic local ops (format/set/sort/filter/table)
  - compute/analysis ops (formula synthesis, insight, heavy transforms)
- fallback policy when Python service is degraded

Tooling split:

- TS orchestrator remains the control plane
- Python service remains compute/data plane for advanced spreadsheet ops

## 4) TypeScript vs Python boundary

Use a polyglot boundary, not a rewrite.

### Keep in TypeScript

- API layer
- auth/rbac/rate limit
- orchestration and policy enforcement
- idempotency and optimistic locking
- trace/telemetry emission
- receipts and UI response contracts

### Use Python for Sheets intelligence

- advanced formula generation/repair
- statistical/dataframe-style transforms
- heavy compute and analysis routines
- robust spreadsheet reasoning where Python ecosystem is stronger

### Contract requirements for Python engine

- strict typed request/response contract
- explicit per-op statuses (`applied`, `noop`, `failed`, `blocked`)
- structured warnings and proof payload
- deterministic error codes
- timeout + retryability flags

## 5) Data model additions

Add tables (or equivalent telemetry sink) for agent observability and audit:

1. `EditAgentRun`
- `id`, `agentId`, `domain`, `mode`, `userId`, `documentId`, `conversationId`
- `requestHash`, `idempotencyKey`, `status`, `failureCode`
- timing fields: `queuedMs`, `planningMs`, `previewMs`, `applyMs`, `totalMs`
- `createdAt`

2. `EditAgentStep`
- `runId`, `stepIndex`, `stepName`, `status`, `durationMs`
- `inputSummary`, `outputSummary`, `errorCode`

3. `EditAgentPolicyDecision`
- `runId`, `gateId`, `pass`, `reasonCode`, `reasonMessage`, `detailsJson`

4. `EditAgentArtifact`
- `runId`, `kind` (`diff`, `proof`, `warning`, `patch_plan`), `payloadJson`

If DB expansion is heavy short-term, emit same shape to telemetry first, then persist incrementally.

## 6) API contract updates

### Backward-compatible approach (recommended)

Keep existing endpoints and add agent metadata in responses:

- `agentId`
- `domain`
- `executionPath` (`editing_agent_router`)
- `traceId`

### New endpoints (optional)

- `POST /api/editing/agents/execute` (unified plan/preview/apply)
- `GET /api/editing/agents/runs/:runId` (debug/audit)

## 7) Prompt/policy bank changes

Add explicit domain-agent prompt layers:

- `backend/src/data_banks/prompts/mode_editing_docx.any.json`
- `backend/src/data_banks/prompts/mode_editing_sheets.any.json`

Update prompt registry to select mode by `meta.domain` + `meta.editingAgent`.

Add policy banks:

- `editing_agent_policy.any.json`
  - confirmation rules
  - destructive-op restrictions
  - max cell/paragraph edit scopes
- `editing_agent_safety.any.json`
  - prompt injection handling for untrusted files
  - external data import restrictions

## 8) Security and safety controls

1. Hard isolation from general chat
- no editing execution on normal `/api/chat` path
- no connector/action spillover inside editing execution

2. Document trust model
- mark files as trusted/untrusted
- untrusted files force stricter operation allowlist

3. Python sandbox constraints
- bounded CPU/memory/time
- filesystem isolation
- deny outbound network by default

4. Guardrails
- block unsafe formulas/macros patterns where applicable
- require confirmation for high-impact operations (bulk delete/overwrite)

## 9) Observability and SLOs

Track per-agent metrics:

- success rate
- blocked rate by gate
- p95 latency by mode (`plan`, `preview`, `apply`)
- retry rate and timeout rate
- user-confirmation deferral rate
- post-apply rollback/undo rate

Emit all with labels:

- `agentId`, `domain`, `operator`, `mode`, `documentType`, `engine` (`ts`/`python`)

## 10) Testing and certification matrix

### Unit

- agent router selection
- per-agent operator resolution
- policy gates and blocked reasons

### Contract

- request/response schema contract between TS and Python engine
- idempotency behavior for repeated apply requests

### Golden

- docx and xlsx canonical edit scenarios with snapshot proofs

### Adversarial

- prompt injection in spreadsheet/doc content
- ambiguous target selection
- stale revision optimistic lock failures

### Performance

- p50/p95 by operation class
- degraded mode when Python unavailable

## 11) Implementation plan (phased)

### Phase 1: Agent router and metadata (no behavior break)

- Add `EditingAgentRouterService`
- route by `planRequest.domain`
- propagate `agentId` in controller responses and telemetry

### Phase 2: Domain-context isolation

- set conversation context defaults:
  - `editing:docx:<userId>`
  - `editing:sheets:<userId>`
- add explicit `meta.editingAgent` and `meta.domain` on editor-side runtime calls

### Phase 3: Sheets Python hardening

- tighten TS/Python contract
- add per-op status and proof enforcement
- add timeout/retry/degradation policy

### Phase 4: Chat/editor separation hardening

- remove editor execution from normal chat route decisions
- keep viewer UX streaming if needed, but editing execution delegates to agent endpoints/services

### Phase 5: Cleanup legacy paths

- remove unreachable/duplicate editing code once parity + tests pass

## 12) File-level changes to implement

### Add

- `backend/src/services/editing/entrypoints/editingAgentRouter.service.ts`
- `backend/src/services/editing/agents/docxEditAgent.service.ts`
- `backend/src/services/editing/agents/sheetsEditAgent.service.ts`
- `backend/src/data_banks/prompts/mode_editing_docx.any.json`
- `backend/src/data_banks/prompts/mode_editing_sheets.any.json`
- `backend/src/data_banks/policies/editing_agent_policy.any.json`

### Modify

- `backend/src/services/editing/entrypoints/editingFacade.service.ts`
- `backend/src/services/editing/index.ts`
- `backend/src/modules/editing/application/index.ts`
- `backend/src/controllers/editing.controller.ts`
- `backend/src/controllers/editorSession.controller.ts`
- `backend/src/entrypoints/http/routes/editing.routes.ts`
- `backend/src/entrypoints/http/routes/editor-session.routes.ts`
- `backend/src/services/llm/core/llmGateway.service.ts` (agent/domain meta plumbing)
- `backend/src/services/llm/core/llmRequestBuilder.service.ts` (domain-mode prompt selection)
- `backend/src/data_banks/prompts/prompt_registry.any.json`

### Later cleanup candidates (after parity)

- `backend/src/services/chat/handlers/editorTurn.handler.ts`
- viewer editor execution branch in `backend/src/entrypoints/http/routes/chat.routes.ts`
- editor route decision branch in `backend/src/services/chat/turnRouter.service.ts`

## 13) Rollout gates (must pass before full cutover)

- Gate A: 100% contract tests pass for docx/xlsx agent APIs
- Gate B: no regression in existing editing certification suite
- Gate C: p95 apply latency within target budget
- Gate D: blocked reason quality audit (no vague failures)
- Gate E: degraded mode validated (Python down -> safe fallback behavior)

## 14) Immediate next implementation slice (recommended)

1. Complete Phase 1 only:
- agent router in editing facade
- response metadata (`agentId`)
- telemetry labels

2. Add Phase 2 context isolation in both editing controllers.

3. Do not remove any old path yet.

This gets separation and observability first, with minimal risk.
