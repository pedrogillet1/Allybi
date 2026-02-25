# Reachability Triage

Generated: 2026-02-25T21:00:43.008Z

## Summary

- Unreachable files: 178
- `WIRE`: 0
- `MOVE`: 138
- `DELETE`: 40

## By Bucket

| Bucket | Unreachable | WIRE | MOVE | DELETE |
|---|---:|---:|---:|---:|
| admin | 9 | 0 | 9 | 0 |
| analytics | 16 | 0 | 16 | 0 |
| controllers | 1 | 0 | 1 | 0 |
| data_banks | 7 | 0 | 7 | 0 |
| jobs | 1 | 0 | 1 | 0 |
| middleware | 2 | 0 | 2 | 0 |
| modules | 7 | 0 | 7 | 0 |
| platform | 1 | 0 | 1 | 0 |
| schemas | 1 | 0 | 1 | 0 |
| services | 91 | 0 | 52 | 39 |
| tests | 41 | 0 | 41 | 0 |
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
| src/jobs/orphanCleanup.scheduler.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/middleware/authorize.middleware.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/middleware/requestId.middleware.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/api/chatResultEnvelope.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/EvidenceValidator.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/ScopeService.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/docScopeSignals.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/provenance/ProvenanceBuilder.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/provenance/ProvenanceValidator.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/platform/security/auth/rbac.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/schemas/response.schemas.ts | MOVE | platform-runtime | R2-MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/services/chat/chatMicrocopy.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/followupSuggestion.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/followupSuggestion.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/chat/guardrails/editorMode.guard.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/turnRoutePolicy.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/turnRouter.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/banks/runtimeWiringIntegrity.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/certification/orchestratorCertification.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/certification/orchestratorCertification.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/certification/orchestratorCertification.types.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/certification/orchestratorCertificationPolicy.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/compose/answerComposer.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/compose/answerComposer.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/compose/answerEngine.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/compose/microcopyPicker.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/enforcement/responseContractEnforcer.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/enforcement/tokenBudget.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/inputs/boilerplateStripper.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/boldingNormalizer.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/formatConstraintParser.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/markdownNormalizer.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/runtimePatterns.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/retrieval/evidenceGate.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalDocLock.benchmark.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalEngine.docScopeLock.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalEngine.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/slotExtraction.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/assetLibrary.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetProvenance.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetRenderer.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/assetRenderer.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetSpec.types.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/creativeOrchestrator.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/creativeOrchestrator.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/deckPlan.types.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/deckPlanner.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/deck/deckPlanner.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/imageTransparency.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/nanoBanana.client.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/promptBuilder.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/qualityGate.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/styleDNA.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/allybi/capabilities.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/intentClassifier.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/multiIntentPlanner.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/operatorPlanner.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/operatorValidator.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/scopeResolver.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/supportContract.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/bulkEditIntent.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/bulkEditIntent.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/documentRevisionStore.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/docx/docxValidators.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/editOperatorAliases.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editOrchestrator.coverage.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editOrchestrator.proof.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editOrchestrator.stalePlan.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editReceipt.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/excelSourceOfTruth.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/excelSourceOfTruth.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/intentRuntime/planAssembler.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/sheets/chartShapeValidator.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/sheets/chartShapeValidator.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsClient.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsEditor.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsValidators.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/slides/slidesLayout.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/spreadsheetModel/computeOpsToPatchPlan.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/spreadsheetModel/spreadsheetModel.charts.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/spreadsheetModel/spreadsheetModel.patch.apply.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/xlsx/xlsxFileEditor.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/xlsx/xlsxFileEditor.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/xlsx/xlsxInspector.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorLock.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorPatchQueue.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorSession.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorState.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorStream.service.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmChatEngine.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/core/llmRequestBuilder.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/prompts/composePrompt.builder.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/tests/geminiAdapter.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/tests/llmContract.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/tests/openaiAdapter.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/tests/streamingParity.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/memory/conversationMemory.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/memory/memoryPolicyEngine.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/memory/memoryRedaction.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/preview/previewOrchestrator.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/spreadsheetEngine/spreadsheetEngine.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/services/telemetry/traceWriter.service.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/_check-all-text.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_check-doc.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_fixtures.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_inspect-docs.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_list-docs.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/answerComposeBankContracts.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/bankCoverage.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/benchmarks/runBenchmarks.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editing-roundtrip.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/enforcer-failclosed.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/evidence-fidelity.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/observability-integrity.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/persistence-restart.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/reporting.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/runtime-wiring.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/security-auth.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/truncation.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/turn-debug-packet.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/types.ts | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/wrong-doc.cert.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/chatRuntimeCentralization.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/connectors.integration.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/conversation-behavior.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/creative.integration.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/docxStructural.integration.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing-suggestions.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing-verify.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing.integration.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing/docx_xlsx_bitwise.contract.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editingHarness.integration.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editingRouting.guard.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editorSession.e2e.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/fixtures/_generate-fixtures.cjs | MOVE | platform-runtime | R2-MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/generation-streaming.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/generation-validation-suite.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/intentRuntime.integration.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/memory-semantic-continuity.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/prismaChatService.contract.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/promptCompilation.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/promptRegistryRules.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/routingAlignment.test.ts | MOVE | qa-certification | R2-MOVE | Test-only file under src should not count as runtime debt. |
| src/types/express.d.ts | DELETE | legacy-migration | R2-DELETE | Legacy runtime subtree file is unreachable from active seeds. |

