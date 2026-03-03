# Reachability Triage

Generated: 2026-03-03T02:58:03.789Z

## Summary

- Unreachable files: 10
- `WIRE`: 1
- `MOVE`: 1
- `DELETE`: 8

## By Bucket

| Bucket | Unreachable | WIRE | MOVE | DELETE |
|---|---:|---:|---:|---:|
| _full_test.js | 1 | 0 | 1 | 0 |
| modules | 1 | 1 | 0 | 0 |
| services | 8 | 0 | 0 | 8 |

## Detailed Triage

| File | Action | Owner | Milestone | Reason |
|---|---|---|---|---|
| src/_full_test.js | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts | WIRE | platform-runtime | R2-WIRE | Runtime-layer file should be reachable from server seeds. |
| src/services/core/banks/bankRollout.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/banks/bankSchemas.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/banks/bankSelectionPlanner.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/banks/docTypeInheritanceResolver.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/banks/domainPackLoader.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/policy/policyCertificationRunner.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/policy/policyContracts.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/policy/policyValidator.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |

