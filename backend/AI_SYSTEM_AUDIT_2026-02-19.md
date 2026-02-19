# AI System Audit (Strict)

Date: 2026-02-19
Scope: databanks, prompt stack, intents/operators, routing/fallback logic, service centralization, and test coverage.

## Executive Grade

Overall score: **5.8/10**  
Definition of 10/10: a complex AI system that performs all current capabilities correctly with no behavioral failures.

## Inventory and Integrity Snapshot

- Registered banks: **305** (`backend/src/data_banks/manifest/bank_registry.any.json`)
- `.any.json` files on disk: **309** (`backend/src/data_banks`)
- Orphans (not in registry): **4**
  - `backend/src/data_banks/__bank_generation_report.any.json`
  - `backend/src/data_banks/microcopy/followup_suggestions.any.json`
  - `backend/src/data_banks/routing/operator_priority.any.json`
  - `backend/src/data_banks/semantics/capabilities_catalog.any.json`
- Missing bank files from registry: **0**
- Registry dependency edges: **88**
- Missing declared dependency targets: **1**
  - `format_semantics -> language_indicators_semantic`
- Empty checksums in registry: **305 / 305**

## Subsystem Scorecard

| Subsystem | Score | Grade |
|---|---:|---|
| Databank integrity and governance | 6.1 | Risky |
| Prompt architecture and runtime wiring | 7.6 | Good |
| Intent/operator contract correctness | 4.2 | Critical |
| Fallback/microcopy behavior quality | 4.9 | Critical |
| Service centralization/runtime coherence | 5.7 | Critical |
| Test safety net | 6.8 | Risky |

## Critical Findings

### 1) Intent constraints likely not applied correctly (Critical)

The runtime lookup shape in intent logic does not match current bank structures.

- Code expects record lookup:
  - `backend/src/services/core/routing/intentEngine.service.ts:909`
  - `backend/src/services/core/routing/intentEngine.service.ts:915`
- Banks currently use:
  - `mapping` for output shapes: `backend/src/data_banks/operators/operator_output_shapes.any.json:103`
  - array of `operators` contracts: `backend/src/data_banks/operators/operator_contracts.any.json:31`

Impact: output shape and contract constraints can silently fail for many operators.

### 2) Disambiguation prompting not consistently activated in normal chat (Critical)

Prompt type switches to disambiguation only if `signals.disambiguation.active` is present.

- Selection rule in builder:
  - `backend/src/services/llm/core/llmRequestBuilder.service.ts:238`
- Gateway passes parsed values, but disambiguation signal path is limited:
  - `backend/src/services/llm/core/llmGateway.service.ts:136`
  - `backend/src/services/llm/core/llmGateway.service.ts:290`

Impact: ambiguous follow-ups can still fall through to generic compose paths.

### 3) Governance drift: orphan banks still used by legacy service (High)

Unregistered banks are still read directly in legacy runtime paths.

- Direct reads:
  - `backend/src/services/prismaChat.legacy.service.ts:18407`
  - `backend/src/services/prismaChat.legacy.service.ts:18451`
- Files are orphaned from registry:
  - `backend/src/data_banks/semantics/capabilities_catalog.any.json`
  - `backend/src/data_banks/microcopy/followup_suggestions.any.json`

Impact: behavior depends on files outside strict registry governance.

### 4) Loader hardening is optional and weak by default (High)

- Schema validation is off unless explicitly enabled:
  - `backend/src/bootstrap/container.ts:79`
  - `backend/src/services/core/banks/bankLoader.service.ts:318`
- Checksums are empty for all entries:
  - `backend/src/data_banks/manifest/bank_registry.any.json`

Impact: silent drift or malformed changes can enter runtime without strong guardrails.

### 5) Routing still bypasses centralized bank loader in resolver path (High)

`operatorResolver` reads files directly from disk using `readFileSync`.

- Base path:
  - `backend/src/services/core/routing/operatorResolver.service.ts:170`
- Raw reads:
  - `backend/src/services/core/routing/operatorResolver.service.ts:225`
  - `backend/src/services/core/routing/operatorResolver.service.ts:257`
  - `backend/src/services/core/routing/operatorResolver.service.ts:268`
  - `backend/src/services/core/routing/operatorResolver.service.ts:512`

Impact: split architecture and increased risk of runtime mismatch with managed bank loader state.

### 6) Normal-chat wording policy conflict still exists in microcopy (High)

Messages still include selection-based language in non-editor contexts.

- Evidence:
  - `backend/src/data_banks/microcopy/not_found_scope_messages.any.json:42`
  - `backend/src/data_banks/microcopy/not_found_scope_messages.any.json:43`

Impact: normal chat may reference “selected documents/selection” despite requirement to rely on stored docs/attachments semantics.

## What Is Strong

- Prompt runtime is now wired through centralized prompt stack:
  - `backend/src/server.ts:107`
  - `backend/src/server.ts:108`
  - `backend/src/server.ts:110`
  - `backend/src/server.ts:124`
- Prompt registry has guard against unreachable rule ordering:
  - `backend/src/services/llm/prompts/promptRegistry.service.ts:263`
- Bank-backed prompt layering is present:
  - `backend/src/data_banks/prompts/prompt_registry.any.json`

## Test Status (Targeted Audit Suite)

Executed and passing:

- `src/tests/promptRegistryRules.test.ts`
- `src/tests/promptCompilation.test.ts`
- `src/tests/routingAlignment.test.ts`
- `src/tests/bankCoverage.test.ts`

Result: **4/4 suites passed, 16/16 tests passed**.

## Priority Remediation Queue

### P0

- Align `intentEngine` to current bank shapes for output-shape + contract lookup.
- Ensure disambiguation path is triggered from normal chat whenever ambiguity signals are present.
- Remove selection/locked wording from normal-chat fallback microcopy banks.

### P1

- Register or remove orphan banks and stop direct legacy reads of unregistered files.
- Move resolver file loads behind centralized `getBank()` usage.

### P2

- Enforce non-empty checksums and default-on schema validation in staging/production.
- Add regression tests for fallback wording policy in normal chat (no “selected text/documents” phrasing).

