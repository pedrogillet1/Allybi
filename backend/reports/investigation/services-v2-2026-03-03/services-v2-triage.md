# Services V2 Triage

Generated: 2026-03-03T02:37:25.921Z

## Summary

- Total service implementation files: **295**
- V2 now: **8**
- V2 targeted: **46**
- Keep: **236**
- Delete (runtime unreachable): **5**

## Top V2 Now Candidates

| file | risk | loc | nearby test | reasons |
|---|---:|---:|:---:|---|
| src/services/editing/xlsx/xlsxFileEditor.service.ts | 10 | 1122 | no | large_file_1000_plus|no_nearby_tests_large|high_any_density|planned_module_migration_scope |
| src/services/cache.service.ts | 9 | 568 | no | file_500_plus|no_nearby_tests_large|elevated_any_density|high_console_density|many_catch_paths |
| src/services/editing/documentRevisionStore.service.ts | 8 | 3090 | yes | very_large_file|high_any_density|planned_module_migration_scope |
| src/services/editing/docx/docxEditor.service.ts | 8 | 2894 | no | very_large_file|no_nearby_tests_large|planned_module_migration_scope |
| src/services/editing/editOrchestrator.service.ts | 8 | 988 | no | large_file_800_plus|no_nearby_tests_large|elevated_any_density|planned_module_migration_scope |
| src/services/editing/allybi/operatorPlanner.ts | 7 | 1051 | no | large_file_1000_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/auth.service.ts | 7 | 1005 | no | large_file_1000_plus|no_nearby_tests_large|elevated_console_density |
| src/services/telemetry/telemetry.aggregations.ts | 7 | 982 | no | large_file_800_plus|no_nearby_tests_large|elevated_any_density |

## Top V2 Targeted Candidates

| file | risk | loc | nearby test | reasons |
|---|---:|---:|:---:|---|
| src/services/telemetry/adminTelemetryAdapter.ts | 6 | 1825 | yes | very_large_file|elevated_console_density|many_catch_paths |
| src/services/core/banks/dataBankLoader.service.ts | 6 | 1604 | yes | very_large_file|any_density|planned_module_migration_scope |
| src/services/editing/spreadsheetModel/computeOpsToPatchPlan.ts | 6 | 980 | no | large_file_800_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/core/banks/documentIntelligenceBanks.service.ts | 6 | 900 | no | large_file_800_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/editing/spreadsheetModel/spreadsheetModel.patch.apply.ts | 6 | 899 | no | large_file_800_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/editing/slides/slidesEditor.service.ts | 6 | 876 | no | large_file_800_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/editing/intentRuntime/slotFill.ts | 6 | 817 | no | large_file_800_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/extraction/pdfExtractor.service.ts | 6 | 766 | no | file_500_plus|no_nearby_tests_large|any_density|elevated_console_density |
| src/services/retrieval/pinecone.service.ts | 6 | 733 | no | file_500_plus|no_nearby_tests_large|elevated_any_density |
| src/services/extraction/google-vision-ocr.service.ts | 6 | 645 | no | file_500_plus|no_nearby_tests_large|elevated_any_density |
| src/services/preview/previewPdfGenerator.service.ts | 6 | 631 | no | file_500_plus|no_nearby_tests_large|high_console_density |
| src/services/retrieval/vectorEmbedding.service.ts | 6 | 607 | no | file_500_plus|no_nearby_tests_large|any_density|elevated_console_density |
| src/services/preview/pptxSlideImageGenerator.service.ts | 6 | 358 | no | no_nearby_tests_medium|elevated_any_density|high_console_density |
| src/services/retrieval/document_intelligence/ruleInterpreter.ts | 5 | 1250 | yes | large_file_1000_plus|elevated_any_density |
| src/services/chat/turnRouter.service.ts | 5 | 996 | yes | large_file_800_plus|elevated_any_density|planned_module_migration_scope |
| src/services/llm/providers/local/localClient.service.ts | 5 | 979 | no | large_file_800_plus|no_nearby_tests_large |
| src/services/editing/agents/sheetsEditAgent.service.ts | 5 | 771 | no | file_500_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/editing/slides/slidesClient.service.ts | 5 | 673 | no | file_500_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/editing/docx/docxAnchors.service.ts | 5 | 671 | no | file_500_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/extraction/xlsxExtractor.service.ts | 5 | 654 | no | file_500_plus|no_nearby_tests_large|any_density |
| src/services/editing/spreadsheetModel/spreadsheetModel.semanticIndex.ts | 5 | 587 | no | file_500_plus|no_nearby_tests_large|planned_module_migration_scope |
| src/services/connectors/tokenVault.service.ts | 5 | 552 | no | file_500_plus|no_nearby_tests_large|many_catch_paths |
| src/services/editing/spreadsheetModel/spreadsheetModel.compiler.ts | 5 | 313 | no | no_nearby_tests_medium|high_any_density |
| src/services/preview/googleSlidesPreview.service.ts | 5 | 132 | no | no_nearby_tests|elevated_any_density|high_console_density |
| src/services/core/retrieval/retrievalEngine.service.ts | 4 | 3641 | yes | very_large_file |
| src/services/core/enforcement/responseContractEnforcer.v2.service.ts | 4 | 2770 | yes | very_large_file |
| src/services/core/enforcement/qualityGateRunner.service.ts | 4 | 2122 | yes | very_large_file |
| src/services/chat/handlers/connectorTurn.handler.ts | 4 | 1344 | yes | large_file_1000_plus|planned_module_migration_scope |
| src/services/core/banks/runtimeWiringIntegrity.service.ts | 4 | 1060 | yes | large_file_1000_plus|planned_module_migration_scope |
| src/services/llm/providers/gemini/geminiClient.service.ts | 4 | 727 | no | file_500_plus|no_nearby_tests_large |

## Largest Keep Files

| file | risk | loc | nearby test | reasons |
|---|---:|---:|:---:|---|
| src/services/llm/core/llmRequestBuilder.service.ts | 3 | 1140 | yes | large_file_1000_plus |
| src/services/core/handlers/connectorHandler.service.ts | 3 | 1073 | yes | large_file_1000_plus |
| src/services/llm/core/llmGateway.service.ts | 3 | 1066 | yes | large_file_1000_plus |
| src/services/core/retrieval/prismaRetrievalAdapters.service.ts | 3 | 1059 | yes | large_file_1000_plus |
| src/services/core/scope/scopeGate.service.ts | 3 | 1007 | yes | large_file_1000_plus |
| src/services/llm/prompts/promptRegistry.service.ts | 2 | 918 | yes | large_file_800_plus |
| src/services/chat/chatMicrocopy.service.ts | 2 | 780 | yes | file_500_plus|planned_module_migration_scope |
| src/services/editing/textGeneration.service.ts | 2 | 771 | yes | file_500_plus|planned_module_migration_scope |
| src/services/editing/intentRuntime/matcher.ts | 2 | 699 | yes | file_500_plus|planned_module_migration_scope |
| src/services/telemetry/traceWriter.service.ts | 1 | 665 | yes | file_500_plus |
| src/services/chat/turnRoutePolicy.service.ts | 3 | 582 | yes | file_500_plus|any_density|planned_module_migration_scope |
| src/services/extraction/piiExtractor.service.ts | 2 | 581 | yes | file_500_plus|any_density |
| src/services/core/handlers/editHandler.service.ts | 1 | 574 | yes | file_500_plus |
| src/services/core/retrieval/evidenceGate.service.ts | 1 | 557 | yes | file_500_plus |
| src/services/core/inputs/languageDetector.service.ts | 3 | 549 | yes | file_500_plus|elevated_any_density |
| src/services/core/policy/fallbackDecisionPolicy.service.ts | 1 | 508 | yes | file_500_plus |
| src/services/extraction/pptxExtractor.service.ts | 3 | 487 | no | no_nearby_tests_medium|any_density |
| src/services/connectors/slack/slackOAuth.service.ts | 2 | 484 | no | no_nearby_tests_medium |
| src/services/editing/docx/docxMarkdownBridge.service.ts | 2 | 477 | no | no_nearby_tests_medium |
| src/services/connectors/outlook/graphClient.service.ts | 2 | 475 | no | no_nearby_tests_medium |

## Inputs

- docs/runtime/runtime-import-graph.json
- docs/runtime/backend-refactor-move-map.json
- source metrics (LOC, any density, console density, catch count, nearby tests)
