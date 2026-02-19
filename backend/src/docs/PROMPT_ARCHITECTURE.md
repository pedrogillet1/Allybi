# Prompt Architecture

## Single Source of Truth

Runtime prompt construction is centralized in one path:

1. `LlmGatewayService`
2. `LlmRequestBuilderService`
3. `PromptRegistryService`
4. prompt banks under `backend/src/data_banks/prompts/*.any.json`

`LLMChatEngine` is now only an adapter over `LlmGatewayService` and contains no embedded root system prompt.

## Deterministic Layering

`prompt_registry.any.json` defines layered prompt composition via `layersByKind`.

Examples:

- `compose_answer`: `system_base -> mode_chat -> rag_policy -> task_answer_with_sources -> policy_citations`
- `retrieval`: `system_base -> mode_chat -> rag_policy -> retrieval_prompt`
- `tool`: `system_base -> mode_editing -> editing_task_prompts -> task_plan_generation -> policy_citations -> tool_prompts`

`PromptRegistryService` compiles layers in deterministic order and emits trace metadata:

- prompt IDs
- prompt versions
- prompt template IDs
- content hashes

## Citation Contract

Citation policy is unified in `policy_citations.any.json`:

- when retrieved evidence is used, append a textual `Sources` block
- each source uses a human title with a stable locator when available
- when no retrieved evidence is used, omit the `Sources` block

## Runtime Guardrails

- `LlmGatewayService` rejects requests that do not include prompt trace metadata.
- `scripts/lint/no-inline-prompts.mjs` guards against reintroducing core inline system prompts in runtime hot paths.

## Regression Coverage

New tests validate prompt compilation and selection behavior:

- `src/tests/promptCompilation.test.ts`
- `src/tests/promptRegistryRules.test.ts`

These tests cover:

- deterministic selection and ordering
- placeholder resolution
- context matrix compilation (`chat_no_rag`, `chat_rag`, `docx_edit_plan`, `xlsx_edit_plan`, `multi_intent_plan`)
- unreachable rule detection in prompt registry selection rules
