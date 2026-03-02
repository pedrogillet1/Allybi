# Runtime Integration Ledger (Runtime-First)

Last updated: 2026-03-01

## Policy

- Scope: backend runtime wiring, bank/prompt integrity, and regression coverage.
- Merge policy: selective parity by runtime intent, not strict branch parity.
- Out-of-scope for this pass: unrelated frontend/mobile polish and production infra CORS-only deltas.

## Branch Delta Decisions

### `feature/python-compute-engine`

- `backend/src/data_banks/intent_patterns/excel.en.any.json`: `ADOPT` (runtime compose/routing parity dependency).
- `backend/src/data_banks/intent_patterns/excel.pt.any.json`: `ADOPT` (runtime compose/routing parity dependency).
- `backend/src/data_banks/manifest/bank_registry.any.json`: `ADOPT` (bank discoverability parity).
- `backend/src/data_banks/operators/allybi_xlsx_operators.any.json`: `ADOPT` (operator wiring parity).
- `backend/src/data_banks/parsers/operator_catalog.any.json`: `ADOPT` (operator wiring parity).
- `backend/python-engine/app/catalog/*`: `REJECT_THIS_PASS` (python compute runtime not in current chat/fallback wiring risk envelope).
- `backend/python-engine/tests/*`: `REJECT_THIS_PASS` (blocked on prior python-engine catalog adoption).
- `docker-compose.dev.yml`: `REJECT_THIS_PASS` (environment plumbing, not required for current runtime wiring gate).

### `fix/chat-quality-root-causes`

- `backend/src/data_banks/fallbacks/fallback_router.any.json`: `ADOPT` (fallback route quality).
- `backend/src/data_banks/prompts/rag_policy.any.json`: `ADOPT` (prompt behavior quality).
- `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts`: `ADOPT_PARTIAL` (canonical-mode + product-help plumbing path only).
- `backend/src/services/core/retrieval/evidenceGate.service.ts`: `ADOPT` (locale/runtime tuning correctness retained).
- `backend/src/services/core/retrieval/evidenceGate.service.test.ts`: `ADOPT` (restored regression coverage).
- `backend/src/services/llm/core/llmRequestBuilder.service.ts`: `ADOPT` (fallback/disambiguation/help wiring coverage).
- `backend/src/services/llm/providers/gemini/geminiGateway.service.ts`: `REJECT_THIS_PASS` (path renamed to `geminiClient.service.ts` in current tree).
- `.gitignore`: `REJECT_THIS_PASS` (worktree hygiene change, not runtime wiring critical).

### `mobile-ui-fixes-20260216`

- All frontend/UI files: `REJECT_THIS_PASS` (runtime-first backend scope).

### `prod-cors-chatfix-20260216`

- `deploy/nginx/allybi.co.conf`: `REJECT_THIS_PASS` (infra scope, no runtime bank/prompt dependency).
- `frontend/src/services/runtimeConfig.js`: `REJECT_THIS_PASS` (frontend scope).
- Shared mobile-ui files from this branch: `REJECT_THIS_PASS` (frontend scope).

## Residual Deferred Work

- Python engine catalog branch parity remains deferred to a dedicated compute-runtime integration pass.
- Frontend/mobile/CORS parity remains deferred to a UI/platform integration pass.
