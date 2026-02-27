# Two-Terminal Runbook: Separate Editing Agents From Normal Chat

Last updated: 2026-02-27

Goal: implement `DocxEditAgent` + `SheetsEditAgent` with clean wiring and full separation from normal chat.

## 0) Execution model (required)

Use **two worktrees** so both Codex terminals can work in parallel without stomping files.

```bash
cd /Users/pg/Desktop/koda-webapp

# choose a stable base commit/branch first
BASE_BRANCH=main

# create worktrees
git worktree add .worktrees/agent-core -b feat/edit-agent-core ${BASE_BRANCH}
git worktree add .worktrees/chat-isolation -b feat/edit-chat-isolation ${BASE_BRANCH}
```

Terminal A cwd:
- `/Users/pg/Desktop/koda-webapp/.worktrees/agent-core`

Terminal B cwd:
- `/Users/pg/Desktop/koda-webapp/.worktrees/chat-isolation`

## 1) Ownership split (no overlap)

### Terminal A owns (agent core + databanks)

- `backend/src/services/editing/entrypoints/*`
- `backend/src/services/editing/agents/*` (new)
- `backend/src/services/editing/index.ts`
- `backend/src/modules/editing/application/index.ts`
- `backend/src/controllers/editing.controller.ts`
- `backend/src/controllers/editorSession.controller.ts`
- `backend/src/data_banks/prompts/prompt_registry.any.json`
- `backend/src/data_banks/prompts/mode_editing_docx.any.json` (new)
- `backend/src/data_banks/prompts/mode_editing_sheets.any.json` (new)
- `backend/src/data_banks/policies/editing_agent_policy.any.json` (new)
- `backend/src/data_banks/manifest/bank_registry.any.json`

### Terminal B owns (chat isolation)

- `backend/src/services/chat/chatKernel.service.ts`
- `backend/src/services/chat/turnRouter.service.ts`
- `backend/src/services/chat/handlers/editorTurn.handler.ts`
- `backend/src/services/chat/guardrails/editorMode.guard.ts`
- `backend/src/modules/chat/domain/chat.types.ts`
- `backend/src/entrypoints/http/routes/chat.routes.ts`
- `backend/src/entrypoints/http/routes/editor-session.routes.ts` (if adding assistant stream route)
- `backend/src/entrypoints/http/routes/index.ts` (if route mounts change)

Do not edit each other’s files.

## 2) Terminal A implementation contract

### A1. Build agent router + domain agents

Required outcomes:
- Add `EditingAgentRouterService` that routes by `planRequest.domain`.
- Add explicit `agentId` values:
  - `edit_agent_docx`
  - `edit_agent_sheets`
  - `edit_agent_default`
- `EditingFacadeService.executeWithAgent()` returns `{ agentId, response }`.
- Existing `execute()` remains backward-compatible and returns only `response`.

### A2. API responses include agent identity

In both controllers (`editing`, `editor-session`) include in JSON response:
- `agentId`
- `domain`
- `executionPath: "editing_agent_router"`

### A3. Domain-scoped editing context IDs

Default conversation IDs must be:
- `editing:docx:<userId>` for docx requests
- `editing:sheets:<userId>` for sheets requests
- fallback `editing:generic:<userId>` when domain absent

### A4. Databank wiring

1. Add prompt banks:
- `prompts/mode_editing_docx.any.json`
- `prompts/mode_editing_sheets.any.json`

2. Add policy bank:
- `policies/editing_agent_policy.any.json`

3. Update `prompt_registry.any.json`:
- register new prompt files in `promptFiles`
- add selection rules by `meta.domain` / `meta.editingAgent`
- ensure no unreachable rule after catch-all

4. Update `bank_registry.any.json`:
- add entries for all new banks with correct `category`, `path`, `filename`, env toggles

### A5. Tests from terminal A

Add/extend tests for:
- agent router selection (`docx`/`sheets`/fallback)
- controller response includes `agentId`
- domain conversation-id defaults
- prompt registry rule ordering

## 3) Terminal B implementation contract

### B1. Remove editing execution from normal chat

Normal chat endpoints (`/api/chat/stream`, `/api/chat/chat`) must not execute editor path.

Enforce:
- remove `EDITOR` route decision from normal chat path
- remove/disable editor handler wiring from `ChatKernelService`
- route all non-connector, non-knowledge normal requests to general/knowledge only

### B2. Viewer/editor path separated from normal chat

Do one of these (recommended first):

Option 1 (strict separation now):
- remove `/api/chat/viewer/stream`
- add `/api/editor-session/assistant/stream` that delegates to editing agent services

Option 2 (transition):
- keep `/api/chat/viewer/stream` but make it a thin proxy that calls editing-agent endpoint/service only
- no direct runtime path through general chat orchestration

### B3. Remove editor-mode coupling in chat internals

- deprecate or remove `EditorModeGuard` from normal chat routing
- remove `editorTurn.handler.ts` usage path
- clean `TurnRouteDecision` union if `EDITOR` removed

### B4. Tests from terminal B

Add/extend tests ensuring:
- normal chat never returns/uses editor route
- editing requests through normal chat are blocked or redirected with explicit error
- editor assistant endpoint uses editing agent path

## 4) Merge choreography

### Step 1
Merge Terminal A first:
```bash
cd /Users/pg/Desktop/koda-webapp/.worktrees/agent-core
git add -A
git commit -m "feat(editing): add domain agent router and databank wiring"
git push origin feat/edit-agent-core
```

### Step 2
Rebase Terminal B on A before merge:
```bash
cd /Users/pg/Desktop/koda-webapp/.worktrees/chat-isolation
git fetch origin
git rebase origin/feat/edit-agent-core
# resolve conflicts if any
git add -A
git rebase --continue
```

Then commit/push B:
```bash
git add -A
git commit -m "refactor(chat): isolate editor flows from normal chat"
git push origin feat/edit-chat-isolation
```

### Step 3
Integration branch:
- merge A, then B
- run full verification gates below

## 5) Verification gates (must all pass)

Run from integration branch root (`/Users/pg/Desktop/koda-webapp`).

### G1. Type and lint
```bash
npm run typecheck
cd backend && npm run lint
```

### G2. Bank integrity and prompt wiring
```bash
cd backend
npm run editing:validate-banks:ci
npm run banks:checksum:check || true
npm run lint:architecture
```

### G3. Routing/behavior tests
```bash
cd backend
npm run test:routing
npm run test:cert:wiring
npm run test:editing:golden
```

### G4. Hard separation checks (grep assertions)

1. Normal chat should not run editor handler:
```bash
rg -n "EditorTurnHandler|route\s*===\s*\"EDITOR\"|return\s+\"EDITOR\"" backend/src/services/chat backend/src/entrypoints/http/routes/chat.routes.ts
```
Expected: no active execution path (comment-only references acceptable during transition if route is dead).

2. Editing agent metadata present:
```bash
rg -n "edit_agent_docx|edit_agent_sheets|executionPath\s*:\s*\"editing_agent_router\"|agentId" backend/src/controllers backend/src/services/editing
```
Expected: present in routing + responses.

3. Databanks correctly referenced:
```bash
rg -n "mode_editing_docx|mode_editing_sheets|editing_agent_policy" backend/src/data_banks/prompts/prompt_registry.any.json backend/src/data_banks/manifest/bank_registry.any.json
```
Expected: all new bank IDs appear in both places.

## 6) Non-negotiable acceptance criteria

- Editing execution path is independent from normal chat runtime.
- Docx and sheets use distinct agent IDs and domain-scoped context IDs.
- Prompt/databank registry has valid references for new banks.
- No endpoint regression for existing `/api/editing/*` and `/api/editor-session/*`.
- All gates in section 5 pass.

## 7) Rollback plan

If integration fails:
1. keep Terminal A branch (agent router + databanks) and disable with feature flag
2. revert Terminal B isolation changes only
3. restore previous chat behavior while preserving agent-core code behind flag

Recommended feature flags:
- `EDITING_AGENT_ROUTER_ENABLED=true`
- `CHAT_EDITOR_ROUTE_ENABLED=false`
