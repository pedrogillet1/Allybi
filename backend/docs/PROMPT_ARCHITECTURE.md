# Prompt Architecture

## Single Source Of Truth

All runtime model calls follow one path:

1. `PrismaChatService`
2. `ChatRuntimeService`
3. `CentralizedChatRuntimeDelegate`
4. `LLMChatEngine`
5. `LlmGatewayService`
6. `LlmRequestBuilderService`
7. `PromptRegistryService` + prompt banks (`src/data_banks/prompts/*.any.json`)

No runtime prompt assembly is allowed outside this path.

## Prompt Selection

- Prompt registry bank: `src/data_banks/prompts/prompt_registry.any.json`
- Selection method: layered deterministic composition (`layersByKind`)
- Safety guard: unreachable rule detection (no catch-all shadowing)
- Telemetry tags include ordered prompt ids, versions, and hashes (`promptTrace`)

## Retrieval + Citation Contract

- Retrieval runtime uses `RetrievalEngineService` with bank-driven policies.
- Evidence is injected as structured runtime context for prompt compilation.
- Citation contract is centralized in `policy_citations.any.json`.
- UI source pills are emitted through `SourceButtonsService` (`source_buttons` attachment).

## Runtime Guardrails

- Lint: `scripts/lint/no-inline-prompts.mjs`
  - blocks root inline prompts in `llmChatEngine.ts`
  - blocks legacy runtime import in `modules/chat/application/chat-runtime.service.ts`
- Runtime wiring integrity:
  - `RuntimeWiringIntegrityService`
  - checks prompt registry shadowing and legacy runtime import leakage
- Retrieval centralization audit:
  - `scripts/lint/retrieval-centralization-audit.mjs`
  - strict mode (`npm run audit:retrieval:strict`) enforces runtime retrieval centralization and readiness wiring

## Readiness Requirements

`/ready` verifies:

- database reachability
- bank loader health
- retrieval storage availability (`document_chunks`)
- retrieval engine registration in container
- answer engine registration in container

In `production` and `staging`, missing required checks return `503`.
