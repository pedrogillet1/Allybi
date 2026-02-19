# System Prompt Audit (Strict)

Date: 2026-02-19
Scope: Historical snapshot from pre-cleanup runtime + legacy system-role prompts.

> Status note (updated): This audit references the pre-refactor `prismaChat.legacy.service.ts` path and line numbers.
> Current runtime now routes through `backend/src/services/prismaChat.service.ts` + `backend/src/services/chatRuntime.service.ts`.

## Method

Scoring rubric (0-10 each, higher is better):
- C: Instruction clarity (20%)
- E: Constraint enforceability (20%)
- X: Conflict/contradiction risk (15%)
- G: Grounding/hallucination resistance (15%)
- O: Output contract precision (10%)
- R: Robustness on follow-ups/edge cases (10%)
- M: Maintainability/duplication (10%)

Final score = weighted total (0-10).

Grade bands:
- 9.0-10.0 Excellent
- 7.5-8.9 Good
- 6.0-7.4 Risky
- <6.0 Critical rewrite needed

## Reachability Summary

- Active runtime path uses `LLMChatEngine` + `PrismaChatCoreService` legacy prompt assembly.
  - `backend/src/server.ts:101`
  - `backend/src/services/prismaChat.service.ts:43`
  - `backend/src/services/llm/core/llmChatEngine.ts:28`
- Central prompt bank stack exists but is not wired into this runtime path.
  - `backend/src/services/llm/prompts/promptRegistry.service.ts:218`
  - `backend/src/services/llm/core/llmRequestBuilder.service.ts:146`
  - no instantiation of `PromptRegistryService` / `LlmRequestBuilderService` in server wiring

## Critical Findings (Ordered)

1. `CRITICAL` Unwired centralized prompt stack
- Impact: You have two prompt architectures, but production chat uses legacy+hardcoded path. Bank edits can appear to do nothing.
- Evidence:
  - runtime wiring to `LLMChatEngine`: `backend/src/server.ts:101`
  - runtime chat service inherits legacy core: `backend/src/services/prismaChat.service.ts:43`
  - hardcoded root system prompt: `backend/src/services/llm/core/llmChatEngine.ts:28`
  - prompt registry class exists but is not wired from server path: `backend/src/services/llm/prompts/promptRegistry.service.ts:218`

2. `CRITICAL` `prompt_registry.any.json` rule order makes later rules unreachable if first-match semantics are honored
- Impact: `compose/retrieval/disambiguation/fallback` selection can be shadowed by always-true `system_prompt` rule.
- Evidence:
  - rule engine comment says first match wins: `backend/src/data_banks/prompts/prompt_registry.any.json:105`
  - first rule is unconditional `any:true`: `backend/src/data_banks/prompts/prompt_registry.any.json:115`

3. `CRITICAL` Contradictory source/citation instructions across active prompts
- Impact: repeated low-quality outputs, citation stripping, unstable behavior on quote/location questions.
- Evidence:
  - quote format requires attribution line with title/page: `backend/src/services/llm/core/llmChatEngine.ts:46`
  - RAG context forbids filenames/citations in body: `backend/src/services/prismaChat.legacy.service.ts:15003`
  - post-processing strips inline citations/filenames anyway: `backend/src/services/prismaChat.legacy.service.ts:13610`

4. `CRITICAL` Oversized monolithic RAG system prompt tries to do too many jobs
- Impact: instruction collisions, repetitive follow-ups, fragile behavior under OCR/noisy evidence.
- Evidence:
  - broad mixed concerns in one prompt block (formatting, finance, folder-tree rendering, bans): `backend/src/services/prismaChat.legacy.service.ts:15001`

5. `HIGH` Legacy config loader references missing legacy file layout
- Impact: if this path is enabled later, startup/runtime prompt config can fail.
- Evidence:
  - expects `system_prompts.json`: `backend/src/services/config/promptConfig.service.ts:573`
  - uses `src/data` default path: `backend/src/config/dataPaths.ts:41`
  - file not present in repo path; bank format now lives under `data_banks/prompts/*.any.json`

## Prompt Scorecards

### A) Active Chat System Prompts

| Prompt | Location | Reachability | C | E | X | G | O | R | M | Score | Grade | Top Issues |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| KODA root system prompt | `backend/src/services/llm/core/llmChatEngine.ts:28` | Active | 6 | 5 | 3 | 6 | 5 | 5 | 4 | 5.0 | Critical | Conflicts with downstream no-citation/no-filename rules; brittle forbidden phrase policy. |
| RAG context instruction block | `backend/src/services/prismaChat.legacy.service.ts:14987` | Active | 4 | 4 | 2 | 6 | 3 | 4 | 3 | 3.8 | Critical | Overloaded prompt with conflicting contracts and mixed concerns. |
| Language rule injection | `backend/src/services/prismaChat.legacy.service.ts:13583` | Active | 9 | 8 | 7 | 7 | 8 | 8 | 8 | 7.9 | Good | Duplicated in stream path (maintenance drift risk). |
| Email+document fusion rules | `backend/src/services/prismaChat.legacy.service.ts:1176` | Active | 8 | 7 | 7 | 8 | 7 | 7 | 8 | 7.5 | Good | Could use explicit conflict-resolution output contract. |
| Email-only QA rules | `backend/src/services/prismaChat.legacy.service.ts:1186` | Active | 8 | 8 | 8 | 9 | 7 | 7 | 8 | 8.0 | Good | Solid constraints; no major conflict found. |
| Email context system message | `backend/src/services/prismaChat.legacy.service.ts:1197` | Active | 7 | 6 | 6 | 6 | 6 | 6 | 7 | 6.3 | Risky | Context payload can be echoed (IDs/metadata) without explicit anti-leak guard. |
| Email explainer system prompt | `backend/src/services/prismaChat.legacy.service.ts:1423` | Active | 7 | 6 | 7 | 7 | 7 | 6 | 7 | 6.8 | Risky | Weakly bounded output; can drift into generic summaries. |
| Provisional indexing fallback prompt | `backend/src/services/prismaChat.legacy.service.ts:13909` | Active | 7 | 6 | 6 | 7 | 6 | 6 | 7 | 6.5 | Risky | Minimal guardrails; no strict structure for uncertain OCR text. |
| Auto-title system prompt | `backend/src/services/prismaChat.legacy.service.ts:18387` | Active | 9 | 8 | 8 | 5 | 9 | 8 | 8 | 7.9 | Good | Works well for title task; low grounding weight is acceptable here. |

### B) Active Editing System Prompts

| Prompt | Location | Reachability | C | E | X | G | O | R | M | Score | Grade | Top Issues |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Bullet enhancement JSON prompt | `backend/src/services/prismaChat.legacy.service.ts:5198` | Active | 8 | 8 | 7 | 8 | 9 | 7 | 7 | 7.8 | Good | Good contract; could share common editor prompt template to reduce drift. |
| Line-by-line rewrite JSON prompt | `backend/src/services/prismaChat.legacy.service.ts:5290` | Active | 8 | 8 | 7 | 8 | 9 | 8 | 7 | 8.0 | Good | Strong deterministic contract. |
| Bullet-list to paragraph JSON prompt | `backend/src/services/prismaChat.legacy.service.ts:5533` | Active | 7 | 7 | 6 | 7 | 8 | 7 | 6 | 7.0 | Risky | Mixed summarize/preserve semantics create ambiguity. |
| Section-to-paragraph JSON prompt | `backend/src/services/prismaChat.legacy.service.ts:5664` | Active | 8 | 8 | 7 | 8 | 8 | 7 | 7 | 7.7 | Good | Generally strong. |
| Translation batch JSON prompt | `backend/src/services/prismaChat.legacy.service.ts:5741` | Active | 8 | 8 | 7 | 8 | 9 | 7 | 7 | 7.8 | Good | Strong machine contract. |
| Translation retry JSON prompt | `backend/src/services/prismaChat.legacy.service.ts:5839` | Active | 7 | 7 | 7 | 8 | 9 | 7 | 6 | 7.4 | Risky | Slight contract drift across retry layers. |
| Translation single-paragraph fallback | `backend/src/services/prismaChat.legacy.service.ts:5886` | Active | 8 | 6 | 6 | 8 | 6 | 7 | 6 | 6.8 | Risky | Non-JSON fallback diverges from upstream parser expectations. |
| Paragraph-to-bullets prompt | `backend/src/services/prismaChat.legacy.service.ts:6802` | Active | 8 | 7 | 7 | 7 | 7 | 7 | 7 | 7.3 | Risky | Output marker-specific formatting can break across locales. |
| Rewrite selected paragraph prompt | `backend/src/services/prismaChat.legacy.service.ts:6908` | Active | 8 | 8 | 7 | 8 | 8 | 8 | 7 | 7.8 | Good | Good with sanitizer backstops. |
| Rewrite selected span prompt (base) | `backend/src/services/prismaChat.legacy.service.ts:7001` | Active | 8 | 8 | 7 | 8 | 8 | 8 | 7 | 7.8 | Good | Strong; relies on secondary guard pass. |
| Rewrite selected span prompt (strict retry) | `backend/src/services/prismaChat.legacy.service.ts:7033` | Active | 8 | 9 | 8 | 8 | 8 | 8 | 7 | 8.0 | Good | Better anti-echo hardening. |
| Insert new paragraph prompt | `backend/src/services/prismaChat.legacy.service.ts:7995` | Active | 8 | 7 | 7 | 8 | 7 | 7 | 7 | 7.4 | Risky | Useful but lacks explicit style controls for domain consistency. |

### C) Central Prompt Bank (Currently Unwired for Runtime Chat)

| Prompt | Location | Reachability | C | E | X | G | O | R | M | Score | Grade | Top Issues |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| system_prompt.any | `backend/src/data_banks/prompts/system_prompt.any.json:113` | Dormant/unwired | 7 | 7 | 4 | 8 | 5 | 6 | 5 | 6.3 | Risky | Requires `KODA_BLOCKS_V1`; can conflict with active plain-text pipeline if wired naively. |
| compose_answer_prompt.any | `backend/src/data_banks/prompts/compose_answer_prompt.any.json:62` | Dormant/unwired | 8 | 8 | 7 | 8 | 8 | 7 | 7 | 7.7 | Good | Strong base; currently not driving live responses. |
| retrieval_prompt.any | `backend/src/data_banks/prompts/retrieval_prompt.any.json:29` | Dormant/unwired | 8 | 8 | 8 | 8 | 8 | 7 | 7 | 7.8 | Good | Well-scoped deterministic plan format. |
| disambiguation_prompt.any | `backend/src/data_banks/prompts/disambiguation_prompt.any.json:55` | Dormant/unwired | 9 | 8 | 8 | 8 | 8 | 8 | 7 | 8.1 | Good | Best-designed of the bank prompts. |
| fallback_prompt.any | `backend/src/data_banks/prompts/fallback_prompt.any.json:37` | Dormant/unwired | 8 | 7 | 6 | 7 | 7 | 7 | 7 | 7.2 | Risky | Good intent; wording can still produce repetitive fallback loops. |
| tool_prompts.any | `backend/src/data_banks/prompts/tool_prompts.any.json:60` | Dormant/unwired | 8 | 8 | 7 | 7 | 8 | 7 | 7 | 7.6 | Good | Useful UI-contract specificity, but inactive today. |
| prompt_registry.any | `backend/src/data_banks/prompts/prompt_registry.any.json:104` | Dormant/unwired | 6 | 3 | 1 | 6 | 5 | 4 | 4 | 4.2 | Critical | First-match order bug can shadow non-system prompts. |

## Overall Grade

- Active chat prompt architecture health: **5.9/10 (Critical)**
- Active editing prompt architecture health: **7.6/10 (Good/Risky boundary)**
- Centralized bank prompt quality (as-authored): **7.0/10 (Risky but promising)**
- Centralized bank runtime integration quality: **2.5/10 (Critical, currently unwired)**

## Priority Remediation Queue

### P0 (Immediate)

1. Centralize to one runtime prompt path.
- Either wire `PromptRegistryService + LlmRequestBuilderService` into active chat or remove stale bank claims from production docs.

2. Fix `prompt_registry` rule ordering.
- Move unconditional `use_system_prompt` to apply as a base layer, not first-match terminal rule.

3. Split `buildRAGContext` mega-prompt into composable concerns.
- Separate: grounding contract, formatting contract, nav/file-list contract, folder-tree contract.

4. Remove cross-layer contradictions on citations/sources.
- Align quote behavior and source rendering policy once, then enforce in one place.

### P1 (Next)

1. Unify language-rule injection to avoid duplication across sync/stream paths.
- Evidence duplicated at `backend/src/services/prismaChat.legacy.service.ts:13583` and `backend/src/services/prismaChat.legacy.service.ts:18163`.

2. Harden email context anti-leak contract.
- Add explicit non-echo constraints for message IDs/provider metadata.

3. Normalize editing prompt templates through shared helper.
- Reduce drift across rewrite/translate/paragraph conversions.

### P2 (Cleanup)

1. Remove or quarantine dead `PromptConfigService` legacy file-path assumptions unless reactivated.
2. Add prompt contract tests that validate contradictions (citations, source labels, JSON leakage).
3. Add runtime telemetry tags to log which prompt family was used per turn.

## Assumptions

- This audit treats runtime as the code path currently constructed by server wiring (legacy core + `LLMChatEngine`).
- Central bank prompts were graded as authored quality even when dormant, to support future cutover.
