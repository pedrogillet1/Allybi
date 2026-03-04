# Model Compliance Enforcement: Only Gemini 2.5 Flash + GPT-5.2

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Purge every non-compliant model reference so the entire system uses ONLY `gemini-2.5-flash` (draft) and `gpt-5.2` (final). No gpt-5-mini. No Claude. No local/Ollama. No Mistral. No Cohere.

**Architecture:** Two-model system. Gemini 2.5 Flash handles all draft/fast-path work. GPT-5.2 handles all final/precision work. All fallback chains collapse to cross-provider (gemini ↔ openai) only. Local provider remains as infrastructure but gets no model routing. Bank generator migrates from Claude to GPT-5.2 via OpenAI SDK.

**Tech Stack:** TypeScript, Jest, JSON data banks, OpenAI SDK, Google GenAI SDK

---

### Task 1: Purge gpt-5-mini from OpenAI models registry

**Files:**
- Modify: `backend/src/services/llm/providers/openai/openaiModels.ts`

**Step 1: Write the failing test**

Add to a new test or modify inline: the type `OpenAIModelId` should not include `gpt-5-mini`. Since this is a type-level change, the "test" is the TypeScript compiler. Skip explicit test — the existing cert tests will validate after.

**Step 2: Remove gpt-5-mini from the models file**

Replace the entire file content with:

```typescript
// src/services/llm/providers/openai/openaiModels.ts

/**
 * OpenAI Models (Allybi)
 * -----------------------------------
 * Allybi strategy:
 *  - Single OpenAI model: gpt-5.2 (precision finisher for all OpenAI lanes)
 *
 * This file is deliberately small but strict:
 *  - typed metadata so routers / capability checks can stay deterministic
 *  - safe defaults for streaming + final passes
 */

export type OpenAIModelId = "gpt-5.2";

export interface OpenAIModelSpec {
  id: OpenAIModelId;

  /**
   * Allybi semantic role for routing.
   */
  role: "precision_finish";

  /**
   * Capability flags (used by providerCapabilities / router constraints).
   */
  capabilities: {
    streaming: true;
    tools: true;
    images: false;
  };

  /**
   * Allybi default generation defaults (router/request builder can override).
   */
  defaults: {
    temperatureDraft: number;
    temperatureFinal: number;
    maxOutputTokensDraft: number;
    maxOutputTokensFinal: number;
  };
}

/**
 * Canonical OpenAI models used by Allybi.
 */
export const OPENAI_MODELS: Record<OpenAIModelId, OpenAIModelSpec> = {
  "gpt-5.2": {
    id: "gpt-5.2",
    role: "precision_finish",
    capabilities: {
      streaming: true,
      tools: true,
      images: false,
    },
    defaults: {
      temperatureDraft: 0.35,
      temperatureFinal: 0.2,
      maxOutputTokensDraft: 1600,
      maxOutputTokensFinal: 4096,
    },
  },
};

/**
 * Primary model id for Allybi's OpenAI lane.
 */
export const OPENAI_PRIMARY_MODEL: OpenAIModelId = "gpt-5.2";

/**
 * Convenience helpers
 */
export function isOpenAIModelId(x: unknown): x is OpenAIModelId {
  return x === "gpt-5.2";
}

export function listOpenAIModels(): OpenAIModelId[] {
  return Object.keys(OPENAI_MODELS) as OpenAIModelId[];
}

export function getOpenAIModelSpec(id: OpenAIModelId): OpenAIModelSpec {
  return OPENAI_MODELS[id];
}
```

**Step 3: Update openaiConfig.ts imports**

In `backend/src/services/llm/providers/openai/openaiConfig.ts`, remove the `OPENAI_DRAFT_MODEL` import (it no longer exists). Change line 71 default to use `OPENAI_PRIMARY_MODEL`:

```typescript
// Line 23-27: update imports
import {
  OPENAI_PRIMARY_MODEL,
  listOpenAIModels,
} from "./openaiModels";

// Line 40: update comment
defaultModelDraft: string; // gpt-5.2

// Line 71: change default
defaultModelDraft: process.env.OPENAI_DRAFT_MODEL || OPENAI_PRIMARY_MODEL,
```

**Step 4: Update openaiClient.service.ts comments**

In `backend/src/services/llm/providers/openai/openaiClient.service.ts`, update lines 8-9:

```typescript
 *   - Single model: gpt-5.2 (all OpenAI lanes)
```

**Step 5: Compile to verify no type errors**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to `gpt-5-mini` or `OPENAI_DRAFT_MODEL`

**Step 6: Commit**

```bash
git add backend/src/services/llm/providers/openai/openaiModels.ts backend/src/services/llm/providers/openai/openaiConfig.ts backend/src/services/llm/providers/openai/openaiClient.service.ts
git commit -m "refactor(llm): remove gpt-5-mini — single OpenAI model gpt-5.2"
```

---

### Task 2: Purge gpt-5-mini from all data banks

**Files:**
- Modify: `backend/src/data_banks/llm/provider_capabilities.any.json`
- Modify: `backend/src/data_banks/llm/provider_fallbacks.any.json`
- Modify: `backend/src/data_banks/llm/llm_cost_table.any.json`
- Modify: `backend/src/data_banks/fallbacks/fallback_router.any.json`

**Step 1: Remove gpt-5-mini from provider_capabilities.any.json**

Delete lines 128-142 (the entire `"gpt-5-mini"` model block inside `providers.openai.models`). Keep only the `"gpt-5.2"` entry.

**Step 2: Simplify provider_fallbacks.any.json**

Replace the `fallbacks` array — remove all `gpt-5-mini` references and all `local` fallbacks:

```json
"fallbacks": [
  {
    "when": { "provider": "gemini" },
    "try": [
      { "provider": "openai", "model": "gpt-5.2" }
    ]
  },
  {
    "when": { "provider": "openai" },
    "try": [
      { "provider": "gemini", "model": "gemini-2.5-flash" }
    ]
  }
]
```

**Step 3: Remove gpt-5-mini from llm_cost_table.any.json**

Delete the `"openai:gpt-5-mini"` entry (lines 26-29). Keep `google:gemini-2.5-flash`, `openai:gpt-5.2`, and `local:*`.

**Step 4: Replace GPT_5_MINI in fallback_router.any.json**

In `backend/src/data_banks/fallbacks/fallback_router.any.json`, change `"fallbackModelKey": "GPT_5_MINI"` to `"fallbackModelKey": "GPT_5_2"` on lines 159 and 192.

**Step 5: Commit**

```bash
git add backend/src/data_banks/llm/provider_capabilities.any.json backend/src/data_banks/llm/provider_fallbacks.any.json backend/src/data_banks/llm/llm_cost_table.any.json backend/src/data_banks/fallbacks/fallback_router.any.json
git commit -m "refactor(banks): purge gpt-5-mini from all LLM data banks"
```

---

### Task 3: Purge gpt-5-mini from router service

**Files:**
- Modify: `backend/src/services/llm/core/llmRouter.service.ts`

**Step 1: Replace all gpt-5-mini fallback references**

In the `buildFallbackChain` method (around lines 636-666), replace every `"gpt-5-mini"` with `"gpt-5.2"` and remove duplicate entries. The logic should simplify to:

```typescript
if (enableMultiProvider) {
  if (primary.provider === "gemini") {
    add("openai", "gpt-5.2");
  } else if (primary.provider === "openai") {
    add("gemini", "gemini-2.5-flash");
  } else {
    // local primary
    if (primary.stage === "final") {
      add("openai", "gpt-5.2");
      add("gemini", "gemini-2.5-flash");
    } else {
      add("gemini", "gemini-2.5-flash");
      add("openai", "gpt-5.2");
    }
  }
}
```

Also remove the `add("local", "local-default")` calls from all branches — local is no longer a fallback target.

**Step 2: Update the comment on line 12-13**

Change `"Gemini 3.0 Flash"` to `"Gemini 2.5 Flash"` in the file header.

**Step 3: Compile to verify**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -30`
Expected: Clean

**Step 4: Commit**

```bash
git add backend/src/services/llm/core/llmRouter.service.ts
git commit -m "refactor(router): purge gpt-5-mini and local fallbacks from router"
```

---

### Task 4: Remove Anthropic/Claude from types and telemetry

**Files:**
- Modify: `backend/src/services/llm/types/llmErrors.types.ts`
- Modify: `backend/src/services/llm/types/llmTools.types.ts`
- Modify: `backend/src/services/telemetry/adminTelemetryAdapter.ts`

**Step 1: Remove "anthropic" from LLMProvider type**

In `backend/src/services/llm/types/llmErrors.types.ts` line 14, remove `| "anthropic"`:

```typescript
export type LLMProvider =
  | "openai"
  | "google"
  | "ollama"
  | "local"
  | "unknown";
```

**Step 2: Remove anthropic provider from tool call types**

In `backend/src/services/llm/types/llmTools.types.ts`, remove the anthropic variant (lines 272-275):

```typescript
// Delete:
  | {
      provider: "anthropic";
      name: string;
      args: unknown;
    }
```

**Step 3: Remove "anthropic" from telemetry ext services**

In `backend/src/services/telemetry/adminTelemetryAdapter.ts` line 1778, remove `"anthropic"` from the `extServices` array.

**Step 4: Compile to catch any downstream type errors**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -i anthropic`
Expected: No output (clean)

**Step 5: Commit**

```bash
git add backend/src/services/llm/types/llmErrors.types.ts backend/src/services/llm/types/llmTools.types.ts backend/src/services/telemetry/adminTelemetryAdapter.ts
git commit -m "refactor(types): remove anthropic from LLMProvider type and telemetry"
```

---

### Task 5: Migrate bank generator from Claude to GPT-5.2

**Files:**
- Modify: `backend/src/data_banks/generators/parallel_bank_generator.ts`

**Step 1: Replace Anthropic SDK with OpenAI SDK**

Replace the imports and client initialization (lines 7, 11):

```typescript
// Old:
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

// New:
import OpenAI from "openai";
const client = new OpenAI();
```

**Step 2: Replace the generateWithClaude function (around line 519)**

Replace the Claude API call with OpenAI:

```typescript
async function generateWithClaude(task: GenerationTask): Promise<void> {
  console.log(`  [${task.name}] Starting generation...`);

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 16000,
      messages: [
        {
          role: "user",
          content: task.prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Unexpected empty response");
    }

    // Extract JSON from response (rest of function unchanged, but use `content` directly)
```

Note: Rename the function from `generateWithClaude` to `generateWithLLM` (search-replace all call sites in the same file).

**Step 3: Compile to verify**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add backend/src/data_banks/generators/parallel_bank_generator.ts
git commit -m "refactor(generator): migrate bank generator from Claude to GPT-5.2"
```

---

### Task 6: Migrate lambda worker from Claude to GPT-5.2

**Files:**
- Modify: `backend/lambda/kodaClaudeDataWorker/.env`

**Step 1: Update the lambda .env**

Replace Claude-specific vars with OpenAI:

```env
OPENAI_API_KEY=<value from backend/.env OPENAI_API_KEY>
OPENAI_MODEL=gpt-5.2
OPENAI_TEMPERATURE=0.2
OPENAI_MAX_TOKENS=4096
CLOUD_RUN_URL=http://localhost:8080
WORKERS=100
ESTIMATED_OUTPUT_TOKENS=1500
UPSTASH_REDIS_REST_URL=https://exciting-bluegill-41801.upstash.io
UPSTASH_REDIS_REST_TOKEN=AaNJAAIncDJhODk0ZWQxNDg4NTE0NzU5OTliOTllMTNlYWMwNGIxZHAyNDE4MDE
```

**Step 2: Find and update the lambda handler code**

Search the lambda handler for Claude SDK usage and replace with OpenAI SDK. The handler files are in `backend/lambda/kodaClaudeDataWorker/`. Read the handler, replace `Anthropic` imports with `OpenAI`, replace `messages.create` with `chat.completions.create`, and update model references.

**Step 3: Commit**

```bash
git add backend/lambda/kodaClaudeDataWorker/
git commit -m "refactor(lambda): migrate kodaClaudeDataWorker from Claude to GPT-5.2"
```

---

### Task 7: Remove CLAUDE_API_KEY and MISTRAL_API_KEY from env config

**Files:**
- Modify: `backend/src/config/env.ts`

**Step 1: Remove the type declarations**

In `backend/src/config/env.ts` lines 110-111, remove:

```typescript
  MISTRAL_API_KEY: string;
  CLAUDE_API_KEY: string;
```

**Step 2: Remove the runtime assignments**

In lines 226-227, remove:

```typescript
  MISTRAL_API_KEY: getEnvVar("MISTRAL_API_KEY", false),
  CLAUDE_API_KEY: getEnvVar("CLAUDE_API_KEY", false),
```

**Step 3: Compile to catch any downstream usage**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -30`

Fix any references to `env.MISTRAL_API_KEY` or `env.CLAUDE_API_KEY` that break.

**Step 4: Commit**

```bash
git add backend/src/config/env.ts
git commit -m "refactor(env): remove CLAUDE_API_KEY and MISTRAL_API_KEY from env config"
```

---

### Task 8: Remove local provider from capabilities bank and factory type

**Files:**
- Modify: `backend/src/data_banks/llm/provider_capabilities.any.json`
- Modify: `backend/src/services/llm/types/llm.types.ts`

**Step 1: Remove the "local" provider block from provider_capabilities.any.json**

Delete lines 145-177 (the entire `"local"` provider section). Remove the `"disableToolCallingOnLocal"` feature flag (line 182).

**Step 2: Remove local test from the tests array**

Delete the `"local_has_no_toolcalling"` test block (lines 217-230).

**Step 3: Update LlmProviderId type**

In `backend/src/services/llm/types/llm.types.ts` line 36, keep local for infrastructure but update the comment:

```typescript
export type LlmProviderId = "openai" | "gemini" | "local" | (string & {});
```

Note: Keep `"local"` in the type since it's still used as infrastructure fallback in dev — but no models route to it.

**Step 4: Commit**

```bash
git add backend/src/data_banks/llm/provider_capabilities.any.json backend/src/services/llm/types/llm.types.ts
git commit -m "refactor(banks): remove local provider from capabilities matrix"
```

---

### Task 9: Update all test files referencing gpt-5-mini and old models

**Files:**
- Modify: `backend/src/services/llm/core/llmCostCalculator.test.ts`
- Modify: `backend/src/services/llm/core/llmRouter.service.test.ts`
- Modify: `backend/src/services/llm/core/llmGateway.service.test.ts`
- Modify: `backend/src/services/llm/core/llmRequestBuilder.service.test.ts`
- Modify: `backend/src/services/llm/core/llmChatEngine.test.ts`
- Modify: `backend/src/tests/certification/composition-fallback-order.cert.test.ts`
- Modify: `backend/src/tests/certification/builder-payload-budget.cert.test.ts`
- Modify: `backend/src/tests/integration/help-fallback-prompt-wiring.integration.test.ts`
- Modify: `backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts`
- Modify: `backend/src/analytics/calculators/cost.calculator.ts`

**Step 1: In llmCostCalculator.test.ts**

- Remove the `"openai:gpt-5-mini"` entry from `mockCostTable` (line 11)
- Remove or update the `toCostFamilyModel("gpt-5-mini-2026-01-15")` test (line 92)

**Step 2: In composition-fallback-order.cert.test.ts**

This test specifically tests gpt-5-mini fallback behavior. Rewrite to test that gemini falls back to gpt-5.2 (and vice versa):

```typescript
test("gemini fallback escalates to gpt-5.2", () => {
  const router = makeRouter();
  const failures: string[] = [];

  const order = router.listFallbackTargets({
    primary: {
      provider: "gemini",
      model: "gemini-2.5-flash",
      stage: "draft",
    },
    requireStreaming: true,
    allowTools: false,
  });

  const first = order[0];
  if (!first || first.provider !== "openai" || first.model !== "gpt-5.2") {
    failures.push(`FIRST_FALLBACK:${JSON.stringify(first || null)}`);
  }

  // ... rest of cert report
});
```

**Step 3: In ChatRuntimeOrchestrator.test.ts**

Replace `"gpt-4"` (line 602) with `"gpt-5.2"` and `"claude-3"` (line 619) with `"gemini-2.5-flash"`.

**Step 4: In cost.calculator.ts**

Update the comment test vectors (lines 228-230) to use `gpt-5.2` and `gemini-2.5-flash` instead of `gpt-4` and `claude-3`.

**Step 5: In all other test files**

Search-replace `gpt-5-mini` → `gpt-5.2` in every test that uses it as a model string. Verify each replacement makes semantic sense.

**Step 6: Run all tests**

Run: `cd backend && npx jest --passWithNoTests 2>&1 | tail -20`
Expected: All tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "test: update all tests to use only gpt-5.2 and gemini-2.5-flash"
```

---

### Task 10: Remove @anthropic-ai/sdk dependency

**Files:**
- Modify: `backend/package.json`

**Step 1: Uninstall the package**

Run: `cd backend && npm uninstall @anthropic-ai/sdk`

**Step 2: Verify no imports remain**

Run: `cd backend && grep -r "anthropic-ai/sdk" src/ --include="*.ts" | head -10`
Expected: No output (the bank generator was already migrated in Task 5)

**Step 3: Compile**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

**Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): remove @anthropic-ai/sdk — no longer used"
```

---

### Task 11: Run full certification test suite

**Files:** None (validation only)

**Step 1: Run composition cert tests**

Run: `cd backend && npx jest --testPathPattern="certification/composition" --verbose 2>&1 | tail -30`
Expected: All PASS

**Step 2: Run full test suite**

Run: `cd backend && npx jest --passWithNoTests 2>&1 | tail -30`
Expected: All PASS

**Step 3: Compile entire project**

Run: `cd backend && npx tsc --noEmit`
Expected: Clean

**Step 4: Final audit grep**

Run: `cd backend && grep -rn "gpt-5-mini\|claude-sonnet\|claude-haiku\|anthropic" src/ --include="*.ts" --include="*.json" | grep -v node_modules | head -20`
Expected: No output — zero remaining violations

**Step 5: Commit (if any final fixes needed)**

```bash
git commit -m "chore: final model compliance audit — only gemini-2.5-flash + gpt-5.2"
```

---

## Execution Order

Tasks 1-3 must be sequential (they share type dependencies).
Task 4 is independent.
Tasks 5-6 are independent.
Task 7 depends on Tasks 5-6.
Task 8 is independent.
Task 9 depends on Tasks 1-4.
Task 10 depends on Task 5.
Task 11 depends on all previous tasks.

```
1 → 2 → 3 ──┐
4 ───────────┤
5 → 6 → 7 ──┤→ 9 → 10 → 11
8 ───────────┘
```
