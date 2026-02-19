# CHAT_SYSTEM_AUDIT

## Executive Summary
- **Audit date:** 2026-02-19
- **Scope covered:** backend chat/editing runtime, frontend chat/editing surfaces, and databanks influencing chat behavior.
- **Files scored:** 590 (`file_scorecard.csv`)
- **Deployment gate result:** **C (71/100) - Not deployable**

This build has strong progress on edit proofing and prompt-trace enforcement, but still has deployment blockers in runtime coherence, bank governance, and save-path reliability.

## System Score (100)
1. Runtime coherence & single source of truth: **12/20**
2. Prompt architecture correctness: **11/15**
3. Contract + schema correctness: **9/15**
4. Editing truthfulness (no fake success): **12/15**
5. Intent recognition quality: **7/10**
6. Fallback + microcopy specificity: **6/10**
7. Security + privacy correctness: **6/10**
8. Reliability + observability: **3/5**
9. Test safety net & CI gates: **5/10**

**Total: 71/100 (C)**

## Subsystem Scores (0-30 avg from `file_scorecard.csv`)
- `backend.banks`: 20.00
- `backend.editing`: 16.87
- `backend.chat.runtime`: 16.33
- `backend.routes`: 16.17
- `backend.controllers`: 16.25
- `backend.llm`: 17.70
- `backend.routing`: 14.00
- `frontend.chat`: 13.77
- `frontend.documents`: 14.06
- `frontend.services`: 15.20
- `databanks`: 13.42

## Auto-Fail / Grade Cap Check
Grade is capped to **<= B** due no-tolerance conditions:
1. **Bank governance bypass reachable at runtime** (loader bypass):
- `backend/src/services/config/fallbackConfig.service.ts:78`
- `backend/src/services/config/fallbackConfig.service.ts:99`
- `backend/src/services/editing/banks/bankService.ts:26`
- `backend/src/services/editing/banks/bankService.ts:57`
2. **Runtime can boot after bank init failure** (non-fatal bank startup):
- `backend/src/bootstrap/container.ts:105`
- `backend/src/bootstrap/container.ts:107`

## Top P0 Blockers (max 15)
1. **Bank init failure is non-fatal in container boot.**
- Evidence: `backend/src/bootstrap/container.ts:105`
- Impact: production can run with partial/missing banks and undefined prompt/routing behavior.

2. **Direct bank reads bypass loader governance in runtime services.**
- Evidence: `backend/src/services/config/fallbackConfig.service.ts:99`
- Impact: checksum/schema/registry guarantees are bypassed for fallback behavior.

3. **Editing bank fallback path bypasses registry/loader contract.**
- Evidence: `backend/src/services/editing/banks/bankService.ts:26`, `backend/src/services/editing/banks/bankService.ts:57`
- Impact: local/test behavior can diverge from production contracts; drift is hard to detect.

4. **Chat runtime is a monolith with mixed intent stacks.**
- Evidence: `backend/src/services/chatRuntime.service.ts:186`, `backend/src/services/chatRuntime.service.ts:6921`, `backend/src/services/chatRuntime.service.ts:7911`
- Impact: deterministic routing is difficult; behavior changes by branch/context.

5. **Manual-save path can produce repeated NOOP attempts and misleading UX.**
- Evidence: `frontend/src/components/documents/previews/DocxEditCanvas.jsx:1728`, `frontend/src/components/documents/previews/DocxEditCanvas.jsx:1768`
- Impact: user sees save loops/no-op warnings while local dirty state persists.

6. **Global API rate limiter is attached to editing apply, causing save storms to fail with 429.**
- Evidence: `backend/src/routes/editing.routes.ts:50`, `backend/src/middleware/rateLimit.middleware.ts:74`
- Impact: repeated save attempts fail even for legitimate editor flows.

7. **Chat contracts are inconsistent across endpoints.**
- Evidence: `backend/src/routes/chat.routes.ts:623`, `backend/src/routes/chat.routes.ts:737`, `backend/src/routes/chat.routes.ts:953`
- Impact: frontend normalization complexity and edge-case regressions.

8. **Legacy/localStorage token compatibility remains on critical chat path.**
- Evidence: `frontend/src/services/chatService.js:6`, `frontend/src/services/chatService.js:22`
- Impact: higher token exposure risk and inconsistent auth mode behavior.

9. **Token in URL query still used in verification flows.**
- Evidence: `frontend/src/components/auth/VerifyRecoveryEmail.jsx:28`, `frontend/src/components/auth/VerifyRecoveryPhone.jsx:28`
- Impact: secrets in URL can leak through logs/history/referrers.

10. **Registry checksum integrity currently has a mismatch.**
- Evidence: `bank_integrity_report.json` (`checksumMismatches: 1`, `bank_registry`)
- Impact: deployment integrity gates should fail but can be bypassed by non-fatal boot behavior.

## Top P1 Backlog (max 25)
1. Split `chatRuntime.service.ts` into routing, retrieval, editing-bridge, connector, and response modules.
2. Remove filesystem fallback from `safeEditingBank` and enforce loader-only bank access.
3. Move fallback config loading to `getBank('fallback_router')` instead of direct file reads.
4. Standardize chat API response envelopes (`{ok,data,error}`) for all chat CRUD routes.
5. Add explicit schema validation for chat route responses in tests.
6. Add per-user/per-document limiter for `/api/editing/apply` separate from generic IP limiter.
7. Add idempotency and dedupe on manual save bursts in Docx/Excel canvases.
8. Add typed NOOP reason mapping from backend to UI banners/toasts.
9. Add explicit “changed target count” gate in frontend save notices.
10. Consolidate editor/viewer stream routing checks to avoid accidental viewer-mode behavior.
11. Remove or quarantine dormant legacy prompt banks not in active stack (`system_prompt`, `compose_answer_prompt`).
12. Add prompt contradiction tests for citation/source policy across all prompt families.
13. Add contract tests for conversation list/get/create/rename/delete envelope consistency.
14. Add an end-to-end test for “new conversation appears in sidebar after first turn”.
15. Add end-to-end test for “return to previous chat after screen change”.
16. Add end-to-end test for “manual save persists after leaving/reopening document”.
17. Add edit-apply backoff and jitter client-side on 429 with bounded retries.
18. Add structured telemetry fields (`request_id`, `conversation_id`, prompt family, operator).
19. Add dashboard metric for save no-op rate and save failure rate by endpoint.
20. Enforce `BANK_VALIDATE_SCHEMAS=true` in all non-local environments via startup assert.
21. Harden `chatService` to remove legacy websocket paths not used by current UI.
22. Add CI check for bank registry checksum freshness.
23. Add CI check to fail when direct `data_banks` file reads are introduced outside loader.
24. Enforce single source for editing operator schema (`operator_catalog`) and generate derived views.
25. Add scoped remediation text for indexing-in-progress answers with ETA/status hints.

## Quick Wins (<2h) (max 20)
1. Make bank initialization fatal for production/staging in `container.ts`.
2. Replace fallback direct read with `getOptionalBank('fallback_router')`.
3. Add a lint rule/grep CI gate for `readFileSync(...data_banks...)` outside bank loader.
4. Normalize `/api/chat/conversations` to `{ok,data}` envelope.
5. Add frontend helper to unwrap both envelope styles in one place.
6. Add client guard to skip apply calls when `candidatePids.length === 0` with clear “already saved” state.
7. Add `Retry-After` handling in docx manual save loop.
8. Add `x-request-id` logging in chat and editing routes.
9. Add one regression test for `newText cannot be empty` path in manual save.
10. Add one regression test for “applied:true with changed=false must never happen”.
11. Add one test ensuring viewer stream never pollutes standard conversation list.
12. Add one test ensuring standard stream does not delete conversation.
13. Add one test asserting prompt trace metadata always present.
14. Add one test asserting conversation list route and service shape compatibility.
15. Add one test asserting save toast only shows “Saved” when revisionId exists.

## Evidence Highlights
### Runtime coherence
- Kernel toggle creates dual turn path (`runtime` vs `kernel`): `backend/src/services/prismaChat.service.ts:64`, `backend/src/services/prismaChat.service.ts:73`.
- Chat runtime contains mixed routing + editing + connector logic in a single file: `backend/src/services/chatRuntime.service.ts:186`.
- Active intent engine path plus separate Allybi classifier branches: `backend/src/services/chatRuntime.service.ts:6921`, `backend/src/services/chatRuntime.service.ts:7911`.

### Prompt architecture
- Deterministic prompt chooser exists: `backend/src/services/llm/core/llmRequestBuilder.service.ts:237`.
- Prompt trace hard guard exists: `backend/src/services/llm/core/llmGateway.service.ts:179`.
- Unreachable-rule protection exists in registry service: `backend/src/services/llm/prompts/promptRegistry.service.ts:263`.
- Conflicting dormant prompt instructions still exist:
  - `backend/src/data_banks/prompts/system_prompt.any.json:118`
  - `backend/src/data_banks/prompts/compose_answer_prompt.any.json:67`
  - `backend/src/data_banks/prompts/policy_citations.any.json:15`

### Editing truthfulness
- Verified no-op downgrade implemented: `backend/src/services/editing/editOrchestrator.service.ts:385`.
- `applied: true` only in changed path: `backend/src/services/editing/editOrchestrator.service.ts:416`.
- DOCX bundle throws no-op when no patch mutates: `backend/src/services/editing/documentRevisionStore.service.ts:717`.
- XLSX patch plan throws no-op when diff unchanged: `backend/src/services/editing/documentRevisionStore.service.ts:1902`.

### Contract mismatches
- Chat list returns plain `{conversations}`: `backend/src/routes/chat.routes.ts:623`.
- Chat messages returns `{ok:true,data}`: `backend/src/routes/chat.routes.ts:737`.
- Title patch returns `{ok:true,data}`: `backend/src/routes/chat.routes.ts:953`.
- Editing apply enforces strict required fields, causing 400 on empty proposed text: `backend/src/controllers/editing.controller.ts:478`.

### Bank integrity and governance
- Registry checksum mismatch detected (1): `bank_integrity_report.json`.
- Orphan bank file detected (1): `bank_integrity_report.json`.
- Direct runtime bank bypass examples:
  - `backend/src/services/config/fallbackConfig.service.ts:99`
  - `backend/src/services/editing/banks/bankService.ts:57`

### Security/privacy
- localStorage auth compatibility path: `frontend/src/services/chatService.js:6`, `frontend/src/services/chatService.js:22`.
- URL token query usage in recovery verification:
  - `frontend/src/components/auth/VerifyRecoveryEmail.jsx:28`
  - `frontend/src/components/auth/VerifyRecoveryPhone.jsx:28`

### Test safety net
- Prompt compilation/selection regression tests exist: `backend/src/tests/promptCompilation.test.ts:57`.
- Prompt unreachable-rule test exists: `backend/src/tests/promptRegistryRules.test.ts:6`.
- Editing proof tests exist: `backend/src/services/editing/editOrchestrator.proof.test.ts:13`.
- Missing: required golden suites for 50+50+50 prompts and CI gates that enforce them.

## Artifact Index
1. `CHAT_SYSTEM_AUDIT.md`
2. `chat_system_inventory.json`
3. `chat_contract_matrix.json`
4. `prompt_path_matrix.json`
5. `bank_integrity_report.json`
6. `file_scorecard.csv`
