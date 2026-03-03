# Chat Services V2 Triage (Editing Excluded)

Generated: 2026-03-03T02:40:31.071Z

## Scope

- Graph roots:
  - src/entrypoints/http/routes/chat.routes.ts
  - src/modules/chat/index.ts
  - src/modules/chat/application/chat-runtime.service.ts
  - src/modules/chat/runtime/ChatRuntimeOrchestrator.ts
  - src/services/chat/chatKernel.service.ts
  - src/services/chat/turnRouter.service.ts
- Included: service files reachable from chat roots via runtime import graph
- Excluded: `src/services/editing/**`

## Summary

- Chat-related service files: **81**
- V2 now: **1**
- V2 targeted: **16**
- Keep: **64**
- Delete: **0**

## Priority Files

| file | decision | risk | loc | nearby test | reasons |
|---|---|---:|---:|:---:|---|
| src/services/cache.service.ts | V2_NOW | 9 | 568 | no | file_500_plus|no_nearby_tests_large|elevated_any_density|high_console_density|many_catch_paths |
| src/services/core/banks/dataBankLoader.service.ts | V2_TARGETED | 6 | 1604 | yes | very_large_file|any_density|planned_module_migration_scope |
| src/services/core/banks/documentIntelligenceBanks.service.ts | V2_TARGETED | 6 | 900 | no | large_file_800_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/retrieval/pinecone.service.ts | V2_TARGETED | 6 | 733 | no | file_500_plus|no_nearby_tests_large|elevated_any_density |
| src/services/retrieval/document_intelligence/ruleInterpreter.ts | V2_TARGETED | 5 | 1250 | yes | large_file_1000_plus|elevated_any_density |
| src/services/chat/turnRouter.service.ts | V2_TARGETED | 5 | 996 | yes | large_file_800_plus|elevated_any_density|planned_module_migration_scope |
| src/services/connectors/tokenVault.service.ts | V2_TARGETED | 5 | 552 | no | file_500_plus|no_nearby_tests_large|many_catch_paths |
| src/services/core/retrieval/retrievalEngine.service.ts | V2_TARGETED | 4 | 3641 | yes | very_large_file |
| src/services/core/enforcement/responseContractEnforcer.v2.service.ts | V2_TARGETED | 4 | 2770 | yes | very_large_file |
| src/services/core/enforcement/qualityGateRunner.service.ts | V2_TARGETED | 4 | 2122 | yes | very_large_file |
| src/services/chat/handlers/connectorTurn.handler.ts | V2_TARGETED | 4 | 1344 | yes | large_file_1000_plus|planned_module_migration_scope |
| src/services/core/banks/runtimeWiringIntegrity.service.ts | V2_TARGETED | 4 | 1060 | yes | large_file_1000_plus|planned_module_migration_scope |
| src/services/connectors/gmail/gmailOAuth.service.ts | V2_TARGETED | 4 | 710 | no | file_500_plus|no_nearby_tests_large |
| src/services/config/intentConfig.service.ts | V2_TARGETED | 4 | 686 | no | file_500_plus|no_nearby_tests_large |
| src/services/core/retrieval/sourceButtons.service.ts | V2_TARGETED | 4 | 624 | no | file_500_plus|no_nearby_tests_large |
| src/services/chat/turnContext.builder.ts | V2_TARGETED | 4 | 94 | no | no_nearby_tests|high_any_density |
| src/services/security/crypto.types.ts | V2_TARGETED | 4 | 19 | no | no_nearby_tests|high_any_density |

## Artifacts

- `chat-services-v2-triage.csv`
- `chat-services-v2-candidates.txt`
- `chat-services-keep.txt`
- `chat-services-all.txt`
