# Runtime Ownership Map

## Owners

- `ChatRuntimeOrchestrator`
  - owns request preparation
  - owns scope preparation and persistence sequencing
  - owns the single post-delegate finalization call for `chat()` and `streamChat()`
  - owns the only turn pipeline from prepared request -> execution draft -> final result

- `CentralizedChatRuntimeDelegate`
  - owns retrieval, runtime context assembly, model invocation, raw draft assembly, persistence primitives, and tracing
  - returns `TurnExecutionDraft` for both `chat()` and `streamChat()`
  - does not own final invariant normalization, gate decisions, or contract enforcement

- `TurnFinalizationService`
  - owns end-of-turn contract normalization
  - owns scope/evidence invariant enforcement
  - owns truncation classification, quality gate evaluation, shape-enforcement outcome handling, and final `status`/`failureCode` reconciliation

- `responseContractEnforcer.service.ts`
  - owns shape repair only
  - emits structural violations when repair cannot satisfy the contract
  - does not invent fallback content or route the turn

- `ContractNormalizer`
  - owns deterministic contract defaults
  - owns answered/evidence/source normalization for the result envelope

- `EvidenceValidator`
  - owns machine-readable scope/evidence/provenance decisions
  - does not emit user-facing copy

- `ScopeService`
  - owns conversation scope persistence and validation
  - consumes injected config and prisma dependencies

- `qualityGateRunner.service.ts`
  - verifier-only runner consumed by `TurnFinalizationService`

## Microcopy

- user-facing copy belongs in microcopy banks / render helpers, not runtime/enforcement
- runtime completion metadata uses `nextActionCode` and `nextActionArgs`
- compatibility field `completion.nextAction` is kept nullable and unwritten by runtime finalization

## Local Verification

Run:

```bash
cd backend
npm test -- --runTestsByPath \
  src/modules/chat/runtime/TurnFinalizationService.test.ts \
  src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts \
  src/modules/chat/runtime/CentralizedChatRuntimeDelegate.provenance.test.ts \
  src/services/core/enforcement/responseContractEnforcer.service.test.ts \
  src/tests/certification/enforcer-failclosed.cert.test.ts \
  src/tests/certification/runtime-microcopy-ban.cert.test.ts
npx tsc --noEmit --pretty false
```

Inspect:

- `chat()` and `streamChat()` both flow through the same `TurnFinalizationService.finalize(...)` call
- navigation/file-list style results with empty `assistantText` are still `answered`
- scope/evidence failures emit `failureCode` plus `nextActionCode`, never English guidance
- `responseContractEnforcer` returns violations instead of fallback prose
