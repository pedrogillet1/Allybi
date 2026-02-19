# Allybi Memory Parity Plan (Codex-Style Behavior)

## 1) Current Grade Snapshot

Source: `backend/memory_semantic_grade_report.json` (generated 2026-02-19)

- Overall: **26/100 (F)**
- Critical blockers:
  - Memory service is not in active chat turn loop.
  - Runtime retrieval path is lexical-first (`ILIKE`) rather than hybrid semantic recall.
  - Referential-follow-up heuristic overfires on short prompts.
  - Gateway memory pack is a fixed small recent window.

Key hard facts:

- Runtime history load cap: `60` messages (`src/services/chatRuntime.legacy.service.ts:16544`, `src/services/chatRuntime.legacy.service.ts:21854`)
- Gateway dialogue carryover: last `12` turns (`src/services/llm/core/llmGateway.service.ts:289`)
- Per-message clip in gateway dialogue pack: `800` chars (`src/services/llm/core/llmGateway.service.ts:291`)
- Memory service cache cap: `10` messages (`src/services/memory/conversationMemory.service.ts:37`)
- Active retrieval in chat runtime: lexical keyword scoring (`src/services/chatRuntime.legacy.service.ts:18435`)

## 2) What "Codex-Style Memory" Means In Practice

Exact proprietary internals are not available. The practical parity target is:

1. No fixed turn-count memory cap as primary context policy.
2. Token-budgeted context assembly (dynamic by model context window).
3. Rolling conversation summaries (hierarchical, never only raw replay).
4. Semantic episodic memory recall (vector + lexical + recency).
5. Deterministic anti-drift guards (scope lock, ambiguity checks, confidence gates).
6. Full observability and graded continuity tests.

## 3) Target Runtime Contract

For each turn, build context in this order:

1. System + policy prompts.
2. Active scope state (doc lock, selected files, mode).
3. Rolling summary chain:
  - `session_summary_short`
  - `session_summary_long`
  - `task_state` (goals, constraints, unresolved questions)
4. Episodic memory retrieval (semantic + lexical over stored memory units).
5. Recent raw turns (only the tail needed after summary packing).
6. Current user message.

Hard rule:
- If total tokens exceed budget, trim in this order:
  - lower-ranked episodic memories
  - oldest raw turns
  - redundant summary fragments
- Never drop active scope lock or unresolved constraints.

## 4) Implementation Using Existing Tables

Use currently available schema tables already present in migrations:

1. `conversation_states`
  - Store rolling summary blocks, unresolved tasks, preferred response style.
2. `conversation_chunks`
  - Store semantic memory units with embeddings and recency timestamps.
3. `conversation_context_states`
  - Store last retrieval decisions and memory IDs used per turn.

Current gap:
- These tables are not used in the active runtime path now.

## 5) Required Code Changes

## Phase A: Wire Memory Into Active Turn Loop (P0)

1. In `src/services/chatRuntime.legacy.service.ts`, replace fixed raw-history-only usage:
  - current: `loadRecentForEngine(..., 60, ...)`
  - target: `buildTurnMemoryContext(...)` returning:
    - summary blocks
    - episodic recalls
    - recent tail turns (token-aware)
2. Integrate `ConversationMemoryService` (or replacement) directly in `chat()` and `streamChat()`.
3. Persist post-turn memory updates after assistant response:
  - update summary cadence (every N turns or token threshold)
  - write memory chunk embeddings
  - write context state snapshot

## Phase B: Replace Lexical-Only Retrieval In Chat Runtime (P0)

1. Replace/augment `retrieveRelevantChunks()` in `src/services/chatRuntime.legacy.service.ts`:
  - add semantic vector phase
  - add BM25 phase
  - merge with rank fusion (weighted + calibrated)
2. Reuse existing hybrid stack from `src/services/retrieval/hybridSearch.service.ts` or `src/services/core/retrieval/retrievalEngine.service.ts` instead of isolated `ILIKE` scoring.
3. Add confidence threshold gates:
  - low evidence => clarify instead of hallucinating carryover.

## Phase C: Fix Drift Heuristics (P0)

1. In `isReferentialFollowUp`, remove blanket short-query auto-reference:
  - current risk: any short prompt can inherit wrong prior scope.
2. Require at least one of:
  - explicit pronoun/reference marker
  - high-confidence continuity state
  - recent confirmed scope mention by user
3. On uncertainty, ask one precise clarification.

## Phase D: Token-Budget Context Builder (P1)

1. Add `ContextBudgeterService`:
  - estimates token cost
  - allocates budget per block (summary, memory recalls, recent turns, evidence)
2. Replace fixed `slice(-12)` and fixed char clamps with budget-based packing in `src/services/llm/core/llmGateway.service.ts`.

## 6) Strict Grading Gates (Must Pass)

Create CI gate from `scripts/memory-semantic-grade.ts` plus scenario tests:

1. **Long continuity test**:
  - 200+ turn conversation with delayed recall queries.
2. **Cross-topic switch test**:
  - ensure no sticky old scope on new short query.
3. **Scope lock test**:
  - explicit file lock must never silently drop.
4. **Semantic recall test**:
  - synonym/paraphrase recall should succeed even when lexical overlap is low.
5. **Budget overflow test**:
  - context builder must keep constraints + goals while trimming safely.

Target deploy thresholds:

- Overall memory grade >= 85/100
- Zero P0 blockers
- Drift false-positive rate < 3%
- Recall accuracy on delayed follow-ups >= 90%

## 7) Minimal First PR (Recommended)

1. Wire memory state into `chat()` + `streamChat()` path.
2. Remove short-query catch-all in referential follow-up detection.
3. Replace lexical retrieval call with hybrid retrieval adapter.
4. Add 3 regression tests:
  - delayed recall
  - short-query no-drift
  - scope lock persistence

This is the minimum cut needed to stop "loses track of conversation" failures.
