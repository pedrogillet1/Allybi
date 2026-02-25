# Reachability Triage

Generated: 2026-02-25T00:42:19.713Z

## Summary

- Unreachable files: 379
- `WIRE`: 15
- `MOVE`: 156
- `DELETE`: 208

## By Bucket

| Bucket | Unreachable | WIRE | MOVE | DELETE |
|---|---:|---:|---:|---:|
| admin | 9 | 0 | 9 | 0 |
| analytics | 16 | 0 | 16 | 0 |
| app | 3 | 2 | 0 | 1 |
| bootstrap | 1 | 0 | 1 | 0 |
| config | 2 | 0 | 2 | 0 |
| controllers | 2 | 0 | 1 | 1 |
| data_banks | 7 | 0 | 7 | 0 |
| entrypoints | 2 | 0 | 2 | 0 |
| infra | 2 | 0 | 2 | 0 |
| jobs | 2 | 0 | 2 | 0 |
| main | 3 | 0 | 3 | 0 |
| middleware | 2 | 0 | 2 | 0 |
| modules | 25 | 10 | 7 | 8 |
| platform | 5 | 3 | 1 | 1 |
| queues | 1 | 0 | 1 | 0 |
| routes | 21 | 0 | 0 | 21 |
| schemas | 3 | 0 | 3 | 0 |
| semantics | 2 | 0 | 2 | 0 |
| services | 190 | 0 | 52 | 138 |
| shared | 3 | 0 | 0 | 3 |
| storage | 2 | 0 | 2 | 0 |
| tests | 41 | 0 | 41 | 0 |
| types | 23 | 0 | 0 | 23 |
| utils | 8 | 0 | 0 | 8 |
| workers | 4 | 0 | 0 | 4 |

## Detailed Triage

| File | Action | Reason |
|---|---|---|
| src/admin/types/_base.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/file.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/llm.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/overview.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/query.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/reliability.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/security.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/admin/types/user.types.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/analytics/cache/analytics.cache.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/cache/cacheKeys.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/cache/index.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/cost.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/dau.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/errorRate.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/formatScore.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/index.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/latency.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/retention.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/wau.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/calculators/weakEvidence.calculator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/dailyRollup.job.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/hourlyRollup.job.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/index.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/analytics/rollups/retentionRollup.job.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/app/http/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/app/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/app/workers/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/bootstrap/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/config/dataPaths.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/config/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/controllers/chat.controller.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/controllers/rag.controller.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/data_banks/build/compile_banks.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/build/validate_banks.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/build_pattern_bank.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/dataBankRegistry.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/generators/generateAllBanks.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/generators/generateCapabilitiesCatalog.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/data_banks/generators/parallel_bank_generator.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/entrypoints/workers/document.worker.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/entrypoints/workers/jobs.worker.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/infra/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/infra/serviceTracer.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/jobs/orphanCleanup.scheduler.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/jobs/socialMetrics.scheduler.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/main/app.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/main/container.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/main/health.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/middleware/authorize.middleware.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/middleware/requestId.middleware.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/api/chatResultEnvelope.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/http/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/chat/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/chat/infra/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/EvidenceValidator.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/ScopeService.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/docScopeSignals.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/provenance/ProvenanceBuilder.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/chat/runtime/provenance/ProvenanceValidator.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/modules/documents/application/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/documents/http/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/documents/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/documents/infra/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/domain/application/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/domain/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/domain/infra/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/editing/application/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/editing/http/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/editing/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/editing/infra/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/retrieval/application/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/modules/retrieval/http/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/retrieval/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/modules/retrieval/infra/index.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/platform/db/prismaClient.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/platform/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/platform/security/auth/rbac.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/platform/storage/driveStorage.service.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/platform/storage/gcsStorage.service.ts | WIRE | Runtime-layer file should be reachable from server seeds. |
| src/queues/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/routes/adminAnalytics.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/adminAuth.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/adminTelemetry.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/auth.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/batch.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/chat.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/document.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/editing.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/editorSession.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/folder.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/health.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/history.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/integrations.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/multipartUpload.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/presignedUrls.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/profile.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/rag.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/recoveryVerification.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/storage.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/telemetry.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/routes/user.routes.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/schemas/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/schemas/pptxPreview.schema.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/schemas/response.schemas.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/semantics/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/semantics/semanticQuery.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/services/admin/acquisition.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/admin/cohorts.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/admin/gaps.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/admin/patterns.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/admin/queryTrace.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/admin/socialMetrics.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/admin/testSuite.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/app/adminTelemetryApp.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/app/authApp.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/app/documentsApp.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/app/filesApp.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/app/foldersApp.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/app/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/app/profileApp.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/chat/chatMicrocopy.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/followupSuggestion.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/followupSuggestion.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/chat/guardrails/editorMode.guard.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/turnRoutePolicy.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/chat/turnRouter.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/config/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/config/promptConfig.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/connectors/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/conversion/libreOffice.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/banks/runtimeWiringIntegrity.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/certification/orchestratorCertification.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/certification/orchestratorCertification.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/certification/orchestratorCertification.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/certification/orchestratorCertificationPolicy.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/compose/answerComposer.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/compose/answerComposer.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/compose/answerEngine.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/compose/microcopyPicker.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/enforcement/contentGuard.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/enforcement/fallbackEngine.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/enforcement/responseContractEnforcer.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/enforcement/tokenBudget.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/enforcement/trustGate.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/execution/actionHistory.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/execution/emailComposeExtractor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/execution/fileActionExecutor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/extraction/entityExtractor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/index.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/boilerplateStripper.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/boldingNormalizer.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/formatConstraintParser.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/languageEnforcement.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/markdownNormalizer.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/monthNormalization.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/inputs/runtimePatterns.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/core/retrieval/evidenceGate.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalDocLock.benchmark.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalEngine.docScopeLock.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/retrievalEngine.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/retrieval/slotExtraction.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/core/scope/scopeGate.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetLibrary.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetProvenance.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetRenderer.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/assetRenderer.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/assetSpec.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/creativeOrchestrator.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/creativeOrchestrator.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/deckPlan.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/deckPlanner.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/deck/deckPlanner.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/deckVisuals.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/deck/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/creative/deck/slidesDeckBuilder.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/imageTransparency.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/creative/nanoBanana.client.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/creative/promptBuilder.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/qualityGate.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/creative/styleDNA.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/documents/documentCompare.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/documents/documentOutline.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/documents/export.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/documents/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/documents/metadataCrypto.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/allybi/capabilities.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/intentClassifier.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/multiIntentPlanner.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/operatorPlanner.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/operatorValidator.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/scopeResolver.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/allybi/supportContract.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/bulkEditIntent.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/bulkEditIntent.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/documentRevisionStore.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/docx/docxValidators.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/editOperatorAliases.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editOrchestrator.coverage.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editOrchestrator.proof.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editOrchestrator.stalePlan.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/editReceipt.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/excelSourceOfTruth.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/excelSourceOfTruth.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/intentRuntime/planAssembler.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/sheets/chartShapeValidator.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/sheets/chartShapeValidator.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsChart.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsClient.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsEditor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsFormula.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsTable.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/sheets/sheetsValidators.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/slides/htmlTemplateCompiler.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/slides/slidesAssets.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/slides/slidesLayout.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/spreadsheetModel/computeOpsToPatchPlan.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/spreadsheetModel/spreadsheetModel.charts.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/spreadsheetModel/spreadsheetModel.patch.apply.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/xlsx/xlsxFileEditor.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/editing/xlsx/xlsxFileEditor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editing/xlsx/xlsxInspector.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorLock.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorPatchQueue.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorSession.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorState.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/editorStream.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/editorSession/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/extraction/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/extraction/piiExtractor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/files/deletion.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/files/fileInventory.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/files/fileManagement.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/files/folderNavigation.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/files/folderPath.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/files/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/files/utils/buildFolderTree.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/folders/encryptedFolderRepo.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/index.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/ingestion/fileValidator.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/ingestion/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/ingestion/markdownConversion.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/ingestion/pptxImageExtractor.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/ingestion/titleGeneration.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmCache.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmChatEngine.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/core/llmRateLimit.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmRequestBuilder.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/core/llmResponseParser.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmSafetyAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmStreamAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/core/llmTelemetry.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/index.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/policy/providerPolicy.router.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/prompts/composePrompt.builder.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/prompts/llmTools.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/prompts/retrievalPrompt.builder.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/prompts/systemPrompt.builder.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/prompts/toolPrompt.builder.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiErrorMapper.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiGateway.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiModels.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiPromptAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiSafetyAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiStreamAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/geminiToolAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/gemini/index.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/local/index.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/local/llmErrors.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/local/llmStreaming.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/local/llmTools.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/local/localErrorMapper.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/local/localStreamAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/openai/index.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/openai/openaiErrorMapper.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/openai/openaiPromptAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/openai/openaiSafetyAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/openai/openaiStreamAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/providers/openai/openaiToolAdapter.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/llm/tests/geminiAdapter.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/tests/llmContract.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/tests/openaiAdapter.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/llm/tests/streamingParity.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/memory/conversationMemory.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/memory/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/memory/memoryPolicyEngine.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/memory/memoryRedaction.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/preview/previewOrchestrator.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/retrieval/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/security/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/spreadsheetEngine/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/spreadsheetEngine/spreadsheetEngine.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/telemetry/traceWriter.service.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/services/utils/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/services/utils/markerUtils.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/services/validation/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/shared/contracts/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/shared/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/shared/testkit/index.ts | DELETE | Unreachable barrel wrapper with re-export-only body. |
| src/storage/index.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/storage/localStorage.ts | MOVE | Unknown bucket: move to non-runtime location or wire explicitly. |
| src/tests/_check-all-text.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_check-doc.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_fixtures.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_inspect-docs.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/_list-docs.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/answerComposeBankContracts.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/bankCoverage.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/benchmarks/runBenchmarks.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/editing-roundtrip.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/enforcer-failclosed.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/evidence-fidelity.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/observability-integrity.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/persistence-restart.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/reporting.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/runtime-wiring.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/security-auth.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/truncation.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/turn-debug-packet.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/certification/types.ts | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/certification/wrong-doc.cert.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/chatRuntimeCentralization.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/connectors.integration.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/conversation-behavior.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/creative.integration.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/docxStructural.integration.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing-suggestions.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing-verify.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing.integration.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editing/docx_xlsx_bitwise.contract.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editingHarness.integration.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editingRouting.guard.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/editorSession.e2e.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/fixtures/_generate-fixtures.cjs | MOVE | Non-runtime workload should live under scripts/tools or data. |
| src/tests/generation-streaming.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/generation-validation-suite.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/intentRuntime.integration.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/memory-semantic-continuity.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/prismaChatService.contract.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/promptCompilation.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/promptRegistryRules.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/tests/routingAlignment.test.ts | MOVE | Test-only file under src should not count as runtime debt. |
| src/types/adminTelemetry.api.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/api.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/auth.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/chat.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/connectors.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/conversationState.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/documents.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/domains.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/editing.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/errors.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/express.d.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/folders.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |
| src/types/ingestion.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/operators.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/rag.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/retrieval.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/richMessage.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/scope.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/streaming.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/styleDNA.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/user.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/types/validation.types.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/cacheInvalidation.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/excelCellUtils.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/excelDateUtils.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/hashing.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/kodaMarkerGenerator.service.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/setupLogging.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/strings/index.js | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/utils/strings/normalizeWhitespace.js | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/workers/document-worker.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/workers/gcp-pubsub-fanout-worker.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/workers/gcp-pubsub-worker.ts | DELETE | Legacy runtime subtree file is unreachable from active seeds. |
| src/workers/index.ts | DELETE | Legacy wrapper re-export is unreachable and redundant. |

