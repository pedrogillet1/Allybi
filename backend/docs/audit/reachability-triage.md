# Reachability Triage

Generated: 2026-02-27T19:19:56.736Z

## Summary

- Unreachable files: 82
- `WIRE`: 0
- `MOVE`: 73
- `DELETE`: 9

## By Bucket

| Bucket | Unreachable | WIRE | MOVE | DELETE |
|---|---:|---:|---:|---:|
| admin | 9 | 0 | 9 | 0 |
| analytics | 16 | 0 | 16 | 0 |
| controllers | 1 | 0 | 1 | 0 |
| data_banks | 7 | 0 | 7 | 0 |
| entrypoints | 1 | 0 | 1 | 0 |
| modules | 4 | 0 | 4 | 0 |
| services | 22 | 0 | 14 | 8 |
| tests | 21 | 0 | 21 | 0 |
| types | 1 | 0 | 0 | 1 |

## Detailed Triage

| File | Action | Owner | Milestone | Reason |
|---|---|---|---|---|
| src/admin/types/_base.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/file.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/index.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/llm.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/overview.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/query.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/reliability.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/security.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/user.types.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/analytics/cache/analytics.cache.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/cache/cacheKeys.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/cache/index.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/cost.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/dau.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/errorRate.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/formatScore.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/index.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/latency.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/retention.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/wau.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/weakEvidence.calculator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/dailyRollup.job.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/hourlyRollup.job.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/index.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/retentionRollup.job.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/controllers/rag.controller.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/data_banks/build/compile_banks.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/build/validate_banks.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/build_pattern_bank.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/dataBankRegistry.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/generators/generateAllBanks.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/generators/generateCapabilitiesCatalog.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/generators/parallel_bank_generator.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/entrypoints/http/routes/editor-session.routes.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/CentralizedChatRuntimeDelegate.truncation.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/provenance/ProvenanceBuilder.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/truncationClassifier.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/guardrails/editorMode.guard.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/guardrails/editorMode.guard.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/chat/handlers/editorTurn.handler.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/chat/turnRoutePolicy.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/turnRouter.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/banks/runtimeWiringIntegrity.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/certification/orchestratorCertification.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/certification/orchestratorCertification.types.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/certification/orchestratorCertificationPolicy.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/handlers/editHandler.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalDocLock.benchmark.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/scope/documentReferenceResolver.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/assetSpec.types.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/deckPlan.types.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/documentRevisionStore.findReplace.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/entrypoints/editingAgentRouter.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/safety/editingSafetyGate.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/textGeneration.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/xlsx/xlsxFileEditor.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmRequestBuilder.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/spreadsheetEngine/spreadsheetEngine.client.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/telemetry/traceWriter.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/benchmarks/runBenchmarks.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editing-capability-matrix.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editing-eval-suite.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editing-roundtrip.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editing-slo.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editingSloProfile.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/enforcer-failclosed.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/evidence-fidelity.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/observability-integrity.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/persistence-restart.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/reporting.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/retrieval-behavioral.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/runtime-wiring.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/security-auth.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/truncation.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/turn-debug-packet.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/types.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/wrong-doc.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing/capabilityMatrix.consistency.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing/docx_xlsx_bitwise.contract.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/memory-semantic-continuity.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/types/express.d.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |

