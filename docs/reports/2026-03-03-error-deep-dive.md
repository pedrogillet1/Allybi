# Error Deep Dive Report (2026-03-03)

## Scope
This report audits runtime/test/static errors with emphasis on ingestion and normalization behavior, plus global compile blockers currently present in backend.

## Commands Executed
| Command | Result |
| --- | --- |
| `npx jest --runTestsByPath src/services/ingestion/chunking.service.test.ts src/services/ingestion/titleGeneration.service.test.ts src/services/ingestion/pipeline/chunkAssembly.service.test.ts src/tests/ocr/ocr-signals.contract.test.ts src/tests/ocr/ocr-metrics.contract.test.ts` | PASS (31/31 tests) |
| `npx jest --runTestsByPath src/queues/workers/documentIngestionPipeline.service.test.ts src/services/extraction/ocrSignals.service.test.ts` | PASS (42/42 tests) |
| `npm run typecheck --silent` | FAIL (178 TS errors) |
| `npm run lint --silent` | PASS |
| `npm run audit:ocr:strict --silent` | FAIL (graceful_provider_unavailable, graceful_runtime_failure, ready_visual_only_contract, vision_retry_resilience) |

## Findings Summary
- Ingestion/OCR runtime behavior tests are green.
- OCR strict audit gate is red due to contract-check drift.
- Backend typecheck is red with 178 TypeScript errors across 21 files.
- Lint is currently clean.

## OCR Audit Failure Analysis
The OCR gate script checks hard-coded regex in legacy file `src/queues/document.queue.ts`, but OCR behavior moved to other modules:
- Provider/runtime graceful fallbacks are implemented in `src/services/ingestion/extraction/extractionDispatch.service.ts` (`[OCR] Provider unavailable...`, `[OCR] OCR processing failed...`, visual-only `skipReason`).
- Visual-only ready/skip decision is implemented in `src/queues/workers/documentIngestionPipeline.service.ts` (`keepVisibleWithoutText`, image/XLSX readiness branch).
- Retry resilience exists in `src/services/extraction/google-vision-ocr.service.ts` (`extractTextWithRetry`, transient codes, exponential backoff).

Conclusion: `audit:ocr:strict` currently has false negatives because it inspects stale locations/pattern contracts.

## Typecheck Error Taxonomy
| TS Code | Count |
| --- | --- |
| TS2339 | 114 |
| TS18046 | 14 |
| TS2345 | 13 |
| TS2352 | 12 |
| TS2322 | 11 |
| TS18047 | 4 |
| TS2554 | 3 |
| TS2353 | 2 |
| TS2551 | 1 |
| TS7053 | 1 |
| TS2488 | 1 |
| TS2305 | 1 |
| TS2341 | 1 |

## Errors by File
| File | Error Count |
| --- | --- |
| `src/services/core/retrieval/retrievalEngine.service.ts` | 83 |
| `src/services/core/banks/dataBankLoader.service.ts` | 30 |
| `src/services/core/enforcement/qualityGateRunner.service.ts` | 10 |
| `src/services/core/retrieval/retrievalEngine.v2.service.ts` | 8 |
| `src/services/core/banks/documentIntelligenceBanks.service.ts` | 7 |
| `src/services/core/scope/scopeGate.service.ts` | 7 |
| `src/services/llm/providers/openai/openaiClient.service.ts` | 7 |
| `src/services/chat/handlers/connectorTurn.handler.ts` | 4 |
| `src/services/core/inputs/languageDetector.service.ts` | 4 |
| `src/services/core/banks/runtimeWiringIntegrity.service.ts` | 3 |
| `src/services/core/enforcement/responseContractEnforcer.service.ts` | 3 |
| `src/services/editing/textGeneration.service.ts` | 2 |
| `src/services/llm/resilience/resilienceLlmClient.decorator.ts` | 2 |
| `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts` | 1 |
| `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts` | 1 |
| `src/server.ts` | 1 |
| `src/services/core/banks/bankLoader.service.ts` | 1 |
| `src/services/core/retrieval/evidenceGate.service.ts` | 1 |
| `src/services/core/scope/documentReferenceResolver.service.ts` | 1 |
| `src/services/llm/prompts/v2/template-compiler.ts` | 1 |
| `src/services/llm/providers/gemini/geminiClient.service.ts` | 1 |

## Root-Cause Clusters (Prioritized)
1. **Untyped bank config access (`Record<string, unknown>` and `{}` usage) explodes into TS2339**
   - Dominant in retrieval/banks loaders.
   - Examples: `src/services/core/retrieval/retrievalEngine.service.ts:747`, `:2363`, `:3473`; `src/services/core/banks/dataBankLoader.service.ts:957`, `:1654`.
2. **API drift between retrieval v1 and v2 types**
   - `retrievalEngine.v2.service.ts` expects `RetrievalRuntimeError`, `runtimeStatus`, `runtimeError`, and 4-arg `emptyPack`, which do not exist in current `retrievalEngine.service.ts` exports/signatures.
   - Examples: `src/services/core/retrieval/retrievalEngine.v2.service.ts:5`, `:35`, `:41`, `:73`, `:80`.
3. **Prompt registry interface mismatch (old builder contract vs new prompt v2 types)**
   - `LlmRequestBuilderService` expects `buildPrompt(promptId, ctx: Record<string, unknown>)`; `PromptRegistryService` now uses `PromptKind`/`PromptContext`.
   - Examples: `src/server.ts:168`, `src/services/editing/textGeneration.service.ts:761`.
4. **Unsafe object casting patterns blocked by stricter TS checks**
   - Widespread `as Record<string, unknown>` conversions where source type has no index signature.
   - Examples: `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts:1910`, `src/services/core/enforcement/responseContractEnforcer.service.ts:14`, `src/services/llm/resilience/resilienceLlmClient.decorator.ts:63`, `src/services/llm/providers/openai/openaiClient.service.ts:321`.
5. **Nullability and request-shape drift**
   - Examples: `messageId` no longer on `ChatRequest` but still referenced in `CentralizedChatRuntimeDelegate.ts:4244`; nullable bank checks missing in `languageDetector.service.ts:369` and `:476`; narrowed union mismatch in `connectorTurn.handler.ts:535`.

## First 40 Type Errors (for triage)
| File:Line | Code | Message |
| --- | --- | --- |
| `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts:4244:90` | `TS2551` | Property 'messageId' does not exist on type 'ChatRequest'. Did you mean 'message'? |
| `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts:1910:23` | `TS2352` | Conversion of type 'EvidencePack \| null' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| `src/server.ts:168:59` | `TS2345` | Argument of type 'import("/Users/pg/Desktop/koda-webapp/backend/src/services/llm/prompts/promptRegistry.service").PromptRegistryService' is not assignable to parameter of type 'import("/Users/pg/Desktop/koda-webapp/backend/src/services/llm/core/llmRequestBuilder.service").PromptRegistryService'. |
| `src/services/chat/handlers/connectorTurn.handler.ts:535:7` | `TS2322` | Type 'string' is not assignable to type '"doc_grounded_single" \| "doc_grounded_multi" \| "doc_grounded_quote" \| "doc_grounded_table" \| "nav_pills" \| "rank_autopick" \| "rank_disambiguate" \| "general_answer" \| "help_steps" \| ... 6 more ... \| undefined'. |
| `src/services/chat/handlers/connectorTurn.handler.ts:787:70` | `TS2345` | Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'GraphMessageItem'. |
| `src/services/chat/handlers/connectorTurn.handler.ts:789:46` | `TS2345` | Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'GraphMessageItem'. |
| `src/services/chat/handlers/connectorTurn.handler.ts:856:52` | `TS2345` | Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'SlackMessage'. |
| `src/services/core/banks/bankLoader.service.ts:292:5` | `TS2322` | Type 'BankRegistryEntry \| null' is not assignable to type 'Record<string, unknown> \| null'. |
| `src/services/core/banks/dataBankLoader.service.ts:179:22` | `TS7053` | Element implicitly has an 'any' type because expression of type 'EnvName' can't be used to index type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:209:17` | `TS2345` | Argument of type 'unknown' is not assignable to parameter of type 'Record<string, unknown>'. |
| `src/services/core/banks/dataBankLoader.service.ts:210:14` | `TS18046` | 'bank._meta' is of type 'unknown'. |
| `src/services/core/banks/dataBankLoader.service.ts:210:44` | `TS18046` | 'bank._meta' is of type 'unknown'. |
| `src/services/core/banks/dataBankLoader.service.ts:215:24` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:216:24` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:224:41` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:225:17` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:706:33` | `TS2345` | Argument of type 'BankRegistryFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| `src/services/core/banks/dataBankLoader.service.ts:707:19` | `TS2345` | Argument of type 'BankRegistryFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| `src/services/core/banks/dataBankLoader.service.ts:787:9` | `TS2345` | Argument of type 'BankDependenciesFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| `src/services/core/banks/dataBankLoader.service.ts:790:21` | `TS2345` | Argument of type 'BankDependenciesFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| `src/services/core/banks/dataBankLoader.service.ts:957:43` | `TS2339` | Property 'strictCategories' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:958:48` | `TS2339` | Property 'failOnUnknownCategory' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1344:31` | `TS2339` | Property 'failOnMissingAssignmentsInStrict' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1347:31` | `TS2339` | Property 'failOnSchemaMismatchInStrict' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1484:53` | `TS2339` | Property 'failOnOrphanInStrict' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1654:18` | `TS2339` | Property 'schema' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1655:19` | `TS2339` | Property 'action' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1656:19` | `TS2339` | Property 'config' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1662:19` | `TS2339` | Property '$schema' does not exist on type 'object'. |
| `src/services/core/banks/dataBankLoader.service.ts:1662:41` | `TS2339` | Property 'type' does not exist on type 'object'. |
| `src/services/core/banks/dataBankLoader.service.ts:1662:60` | `TS2339` | Property 'properties' does not exist on type 'object'. |
| `src/services/core/banks/dataBankLoader.service.ts:1664:15` | `TS2339` | Property '_meta' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1664:22` | `TS2339` | Property 'config' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1664:30` | `TS2339` | Property 'tests' does not exist on type '{}'. |
| `src/services/core/banks/dataBankLoader.service.ts:1671:26` | `TS2339` | Property '$schema' does not exist on type 'object'. |
| `src/services/core/banks/dataBankLoader.service.ts:1672:27` | `TS2339` | Property 'type' does not exist on type 'object'. |
| `src/services/core/banks/dataBankLoader.service.ts:1673:27` | `TS2339` | Property 'properties' does not exist on type 'object'. |
| `src/services/core/banks/dataBankLoader.service.ts:1692:33` | `TS2339` | Property 'compile' does not exist on type '{}'. |
| `src/services/core/banks/documentIntelligenceBanks.service.ts:398:23` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| `src/services/core/banks/documentIntelligenceBanks.service.ts:401:23` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |

## Full Type Error Inventory (178)
| # | File:Line:Col | Code | Message |
| --- | --- | --- | --- |
| 1 | `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts:4244:90` | `TS2551` | Property 'messageId' does not exist on type 'ChatRequest'. Did you mean 'message'? |
| 2 | `src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts:1910:23` | `TS2352` | Conversion of type 'EvidencePack \| null' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 3 | `src/server.ts:168:59` | `TS2345` | Argument of type 'import("/Users/pg/Desktop/koda-webapp/backend/src/services/llm/prompts/promptRegistry.service").PromptRegistryService' is not assignable to parameter of type 'import("/Users/pg/Desktop/koda-webapp/backend/src/services/llm/core/llmRequestBuilder.service").PromptRegistryService'. |
| 4 | `src/services/chat/handlers/connectorTurn.handler.ts:535:7` | `TS2322` | Type 'string' is not assignable to type '"doc_grounded_single" \| "doc_grounded_multi" \| "doc_grounded_quote" \| "doc_grounded_table" \| "nav_pills" \| "rank_autopick" \| "rank_disambiguate" \| "general_answer" \| "help_steps" \| ... 6 more ... \| undefined'. |
| 5 | `src/services/chat/handlers/connectorTurn.handler.ts:787:70` | `TS2345` | Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'GraphMessageItem'. |
| 6 | `src/services/chat/handlers/connectorTurn.handler.ts:789:46` | `TS2345` | Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'GraphMessageItem'. |
| 7 | `src/services/chat/handlers/connectorTurn.handler.ts:856:52` | `TS2345` | Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'SlackMessage'. |
| 8 | `src/services/core/banks/bankLoader.service.ts:292:5` | `TS2322` | Type 'BankRegistryEntry \| null' is not assignable to type 'Record<string, unknown> \| null'. |
| 9 | `src/services/core/banks/dataBankLoader.service.ts:179:22` | `TS7053` | Element implicitly has an 'any' type because expression of type 'EnvName' can't be used to index type '{}'. |
| 10 | `src/services/core/banks/dataBankLoader.service.ts:209:17` | `TS2345` | Argument of type 'unknown' is not assignable to parameter of type 'Record<string, unknown>'. |
| 11 | `src/services/core/banks/dataBankLoader.service.ts:210:14` | `TS18046` | 'bank._meta' is of type 'unknown'. |
| 12 | `src/services/core/banks/dataBankLoader.service.ts:210:44` | `TS18046` | 'bank._meta' is of type 'unknown'. |
| 13 | `src/services/core/banks/dataBankLoader.service.ts:215:24` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 14 | `src/services/core/banks/dataBankLoader.service.ts:216:24` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 15 | `src/services/core/banks/dataBankLoader.service.ts:224:41` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 16 | `src/services/core/banks/dataBankLoader.service.ts:225:17` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 17 | `src/services/core/banks/dataBankLoader.service.ts:706:33` | `TS2345` | Argument of type 'BankRegistryFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| 18 | `src/services/core/banks/dataBankLoader.service.ts:707:19` | `TS2345` | Argument of type 'BankRegistryFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| 19 | `src/services/core/banks/dataBankLoader.service.ts:787:9` | `TS2345` | Argument of type 'BankDependenciesFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| 20 | `src/services/core/banks/dataBankLoader.service.ts:790:21` | `TS2345` | Argument of type 'BankDependenciesFile' is not assignable to parameter of type 'Record<string, unknown>'. |
| 21 | `src/services/core/banks/dataBankLoader.service.ts:957:43` | `TS2339` | Property 'strictCategories' does not exist on type '{}'. |
| 22 | `src/services/core/banks/dataBankLoader.service.ts:958:48` | `TS2339` | Property 'failOnUnknownCategory' does not exist on type '{}'. |
| 23 | `src/services/core/banks/dataBankLoader.service.ts:1344:31` | `TS2339` | Property 'failOnMissingAssignmentsInStrict' does not exist on type '{}'. |
| 24 | `src/services/core/banks/dataBankLoader.service.ts:1347:31` | `TS2339` | Property 'failOnSchemaMismatchInStrict' does not exist on type '{}'. |
| 25 | `src/services/core/banks/dataBankLoader.service.ts:1484:53` | `TS2339` | Property 'failOnOrphanInStrict' does not exist on type '{}'. |
| 26 | `src/services/core/banks/dataBankLoader.service.ts:1654:18` | `TS2339` | Property 'schema' does not exist on type '{}'. |
| 27 | `src/services/core/banks/dataBankLoader.service.ts:1655:19` | `TS2339` | Property 'action' does not exist on type '{}'. |
| 28 | `src/services/core/banks/dataBankLoader.service.ts:1656:19` | `TS2339` | Property 'config' does not exist on type '{}'. |
| 29 | `src/services/core/banks/dataBankLoader.service.ts:1662:19` | `TS2339` | Property '$schema' does not exist on type 'object'. |
| 30 | `src/services/core/banks/dataBankLoader.service.ts:1662:41` | `TS2339` | Property 'type' does not exist on type 'object'. |
| 31 | `src/services/core/banks/dataBankLoader.service.ts:1662:60` | `TS2339` | Property 'properties' does not exist on type 'object'. |
| 32 | `src/services/core/banks/dataBankLoader.service.ts:1664:15` | `TS2339` | Property '_meta' does not exist on type '{}'. |
| 33 | `src/services/core/banks/dataBankLoader.service.ts:1664:22` | `TS2339` | Property 'config' does not exist on type '{}'. |
| 34 | `src/services/core/banks/dataBankLoader.service.ts:1664:30` | `TS2339` | Property 'tests' does not exist on type '{}'. |
| 35 | `src/services/core/banks/dataBankLoader.service.ts:1671:26` | `TS2339` | Property '$schema' does not exist on type 'object'. |
| 36 | `src/services/core/banks/dataBankLoader.service.ts:1672:27` | `TS2339` | Property 'type' does not exist on type 'object'. |
| 37 | `src/services/core/banks/dataBankLoader.service.ts:1673:27` | `TS2339` | Property 'properties' does not exist on type 'object'. |
| 38 | `src/services/core/banks/dataBankLoader.service.ts:1692:33` | `TS2339` | Property 'compile' does not exist on type '{}'. |
| 39 | `src/services/core/banks/documentIntelligenceBanks.service.ts:398:23` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 40 | `src/services/core/banks/documentIntelligenceBanks.service.ts:401:23` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 41 | `src/services/core/banks/documentIntelligenceBanks.service.ts:404:23` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 42 | `src/services/core/banks/documentIntelligenceBanks.service.ts:409:37` | `TS2339` | Property 'minAliasConfidence' does not exist on type '{}'. |
| 43 | `src/services/core/banks/documentIntelligenceBanks.service.ts:869:43` | `TS2339` | Property 'version' does not exist on type '{}'. |
| 44 | `src/services/core/banks/documentIntelligenceBanks.service.ts:871:22` | `TS2339` | Property 'lastUpdated' does not exist on type '{}'. |
| 45 | `src/services/core/banks/documentIntelligenceBanks.service.ts:871:50` | `TS2339` | Property 'updatedAt' does not exist on type '{}'. |
| 46 | `src/services/core/banks/runtimeWiringIntegrity.service.ts:538:48` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 47 | `src/services/core/banks/runtimeWiringIntegrity.service.ts:540:28` | `TS2339` | Property 'runtimePathsNoRawConsole' does not exist on type '{}'. |
| 48 | `src/services/core/banks/runtimeWiringIntegrity.service.ts:542:28` | `TS2339` | Property 'runtimePathsNoRawConsole' does not exist on type '{}'. |
| 49 | `src/services/core/enforcement/qualityGateRunner.service.ts:1697:7` | `TS2322` | Type 'unknown' is not assignable to type 'Record<string, unknown>'. |
| 50 | `src/services/core/enforcement/qualityGateRunner.service.ts:1698:7` | `TS2322` | Type 'unknown' is not assignable to type 'Record<string, unknown>'. |
| 51 | `src/services/core/enforcement/qualityGateRunner.service.ts:1699:7` | `TS2322` | Type 'unknown' is not assignable to type 'Record<string, unknown>'. |
| 52 | `src/services/core/enforcement/qualityGateRunner.service.ts:1700:7` | `TS2322` | Type 'unknown' is not assignable to type 'Record<string, unknown>'. |
| 53 | `src/services/core/enforcement/qualityGateRunner.service.ts:1701:7` | `TS2322` | Type 'unknown' is not assignable to type 'Record<string, unknown>'. |
| 54 | `src/services/core/enforcement/qualityGateRunner.service.ts:2049:33` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 55 | `src/services/core/enforcement/qualityGateRunner.service.ts:2069:50` | `TS2339` | Property 'id' does not exist on type '{}'. |
| 56 | `src/services/core/enforcement/qualityGateRunner.service.ts:2086:52` | `TS2339` | Property 'id' does not exist on type '{}'. |
| 57 | `src/services/core/enforcement/qualityGateRunner.service.ts:2102:29` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 58 | `src/services/core/enforcement/qualityGateRunner.service.ts:2117:50` | `TS2339` | Property 'id' does not exist on type '{}'. |
| 59 | `src/services/core/enforcement/responseContractEnforcer.service.ts:14:11` | `TS2352` | Conversion of type 'ResponseContractEnforcerService' to type '{ [key: string]: (c: ResponseContractContext) => number; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 60 | `src/services/core/enforcement/responseContractEnforcer.service.ts:24:11` | `TS2352` | Conversion of type 'ResponseContractEnforcerService' to type '{ [key: string]: (c: ResponseContractContext, s: number) => number; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 61 | `src/services/core/enforcement/responseContractEnforcer.service.ts:34:11` | `TS2352` | Conversion of type 'ResponseContractEnforcerService' to type '{ [key: string]: (c: ResponseContractContext) => number; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 62 | `src/services/core/inputs/languageDetector.service.ts:369:33` | `TS18047` | 'triggersBank' is possibly 'null'. |
| 63 | `src/services/core/inputs/languageDetector.service.ts:369:56` | `TS18047` | 'triggersBank' is possibly 'null'. |
| 64 | `src/services/core/inputs/languageDetector.service.ts:476:33` | `TS18047` | 'indicatorsBank' is possibly 'null'. |
| 65 | `src/services/core/inputs/languageDetector.service.ts:477:10` | `TS18047` | 'indicatorsBank' is possibly 'null'. |
| 66 | `src/services/core/retrieval/evidenceGate.service.ts:112:36` | `TS2339` | Property 'runtimeTuning' does not exist on type '{}'. |
| 67 | `src/services/core/retrieval/retrievalEngine.service.ts:747:36` | `TS2339` | Property 'maxMatchedRules' does not exist on type '{}'. |
| 68 | `src/services/core/retrieval/retrievalEngine.service.ts:751:36` | `TS2339` | Property 'maxDocumentIntelligenceBoost' does not exist on type '{}'. |
| 69 | `src/services/core/retrieval/retrievalEngine.service.ts:822:42` | `TS2339` | Property 'maxRewriteTerms' does not exist on type '{}'. |
| 70 | `src/services/core/retrieval/retrievalEngine.service.ts:869:58` | `TS2339` | Property 'maxRewriteTerms' does not exist on type '{}'. |
| 71 | `src/services/core/retrieval/retrievalEngine.service.ts:960:34` | `TS2339` | Property 'maxMatchedRules' does not exist on type '{}'. |
| 72 | `src/services/core/retrieval/retrievalEngine.service.ts:964:34` | `TS2339` | Property 'maxDocumentIntelligenceBoost' does not exist on type '{}'. |
| 73 | `src/services/core/retrieval/retrievalEngine.service.ts:999:7` | `TS2345` | Argument of type 'Record<string, unknown> \| null' is not assignable to parameter of type 'Record<string, unknown> \| undefined'. |
| 74 | `src/services/core/retrieval/retrievalEngine.service.ts:1246:41` | `TS2339` | Property 'queryExpansionPolicy' does not exist on type '{}'. |
| 75 | `src/services/core/retrieval/retrievalEngine.service.ts:1280:31` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 76 | `src/services/core/retrieval/retrievalEngine.service.ts:1285:47` | `TS2339` | Property 'policy' does not exist on type '{}'. |
| 77 | `src/services/core/retrieval/retrievalEngine.service.ts:1287:11` | `TS2339` | Property 'policy' does not exist on type '{}'. |
| 78 | `src/services/core/retrieval/retrievalEngine.service.ts:1298:25` | `TS2488` | Type '{}' must have a '[Symbol.iterator]()' method that returns an iterator. |
| 79 | `src/services/core/retrieval/retrievalEngine.service.ts:1958:46` | `TS2339` | Property 'hybridPhases' does not exist on type '{}'. |
| 80 | `src/services/core/retrieval/retrievalEngine.service.ts:1998:60` | `TS2554` | Expected 1-2 arguments, but got 3. |
| 81 | `src/services/core/retrieval/retrievalEngine.service.ts:2003:76` | `TS2554` | Expected 1-2 arguments, but got 3. |
| 82 | `src/services/core/retrieval/retrievalEngine.service.ts:2130:30` | `TS18046` | 'hit' is of type 'unknown'. |
| 83 | `src/services/core/retrieval/retrievalEngine.service.ts:2131:42` | `TS18046` | 'hit' is of type 'unknown'. |
| 84 | `src/services/core/retrieval/retrievalEngine.service.ts:2132:36` | `TS18046` | 'hit' is of type 'unknown'. |
| 85 | `src/services/core/retrieval/retrievalEngine.service.ts:2134:11` | `TS18046` | 'hit' is of type 'unknown'. |
| 86 | `src/services/core/retrieval/retrievalEngine.service.ts:2138:20` | `TS18046` | 'hit' is of type 'unknown'. |
| 87 | `src/services/core/retrieval/retrievalEngine.service.ts:2141:11` | `TS18046` | 'hit' is of type 'unknown'. |
| 88 | `src/services/core/retrieval/retrievalEngine.service.ts:2143:58` | `TS18046` | 'hit' is of type 'unknown'. |
| 89 | `src/services/core/retrieval/retrievalEngine.service.ts:2167:16` | `TS18046` | 'hit' is of type 'unknown'. |
| 90 | `src/services/core/retrieval/retrievalEngine.service.ts:2168:39` | `TS18046` | 'hit' is of type 'unknown'. |
| 91 | `src/services/core/retrieval/retrievalEngine.service.ts:2176:18` | `TS18046` | 'hit' is of type 'unknown'. |
| 92 | `src/services/core/retrieval/retrievalEngine.service.ts:2194:18` | `TS18046` | 'hit' is of type 'unknown'. |
| 93 | `src/services/core/retrieval/retrievalEngine.service.ts:2195:21` | `TS18046` | 'hit' is of type 'unknown'. |
| 94 | `src/services/core/retrieval/retrievalEngine.service.ts:2359:33` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 95 | `src/services/core/retrieval/retrievalEngine.service.ts:2363:12` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 96 | `src/services/core/retrieval/retrievalEngine.service.ts:2385:39` | `TS2339` | Property 'find' does not exist on type '{}'. |
| 97 | `src/services/core/retrieval/retrievalEngine.service.ts:2403:28` | `TS2339` | Property 'slotExtraction' does not exist on type '{}'. |
| 98 | `src/services/core/retrieval/retrievalEngine.service.ts:2454:32` | `TS2339` | Property 'slotExtraction' does not exist on type '{}'. |
| 99 | `src/services/core/retrieval/retrievalEngine.service.ts:2493:18` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 100 | `src/services/core/retrieval/retrievalEngine.service.ts:2494:20` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 101 | `src/services/core/retrieval/retrievalEngine.service.ts:2498:18` | `TS2339` | Property 'regionWeights' does not exist on type '{}'. |
| 102 | `src/services/core/retrieval/retrievalEngine.service.ts:2498:52` | `TS2339` | Property 'regionWeights' does not exist on type '{}'. |
| 103 | `src/services/core/retrieval/retrievalEngine.service.ts:2502:18` | `TS2339` | Property 'regionWeights' does not exist on type '{}'. |
| 104 | `src/services/core/retrieval/retrievalEngine.service.ts:2506:18` | `TS2339` | Property 'regionWeights' does not exist on type '{}'. |
| 105 | `src/services/core/retrieval/retrievalEngine.service.ts:2511:24` | `TS2339` | Property 'genericTermGuard' does not exist on type '{}'. |
| 106 | `src/services/core/retrieval/retrievalEngine.service.ts:2512:24` | `TS2339` | Property 'genericTermGuard' does not exist on type '{}'. |
| 107 | `src/services/core/retrieval/retrievalEngine.service.ts:2513:24` | `TS2339` | Property 'genericTermGuard' does not exist on type '{}'. |
| 108 | `src/services/core/retrieval/retrievalEngine.service.ts:2523:18` | `TS2339` | Property 'genericTermGuard' does not exist on type '{}'. |
| 109 | `src/services/core/retrieval/retrievalEngine.service.ts:2524:20` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 110 | `src/services/core/retrieval/retrievalEngine.service.ts:2529:35` | `TS2339` | Property 'boostWeights' does not exist on type '{}'. |
| 111 | `src/services/core/retrieval/retrievalEngine.service.ts:2531:16` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 112 | `src/services/core/retrieval/retrievalEngine.service.ts:2532:18` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 113 | `src/services/core/retrieval/retrievalEngine.service.ts:2536:16` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 114 | `src/services/core/retrieval/retrievalEngine.service.ts:2543:20` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 115 | `src/services/core/retrieval/retrievalEngine.service.ts:2551:15` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 116 | `src/services/core/retrieval/retrievalEngine.service.ts:2557:42` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 117 | `src/services/core/retrieval/retrievalEngine.service.ts:2558:39` | `TS2339` | Property 'recencyWeights' does not exist on type '{}'. |
| 118 | `src/services/core/retrieval/retrievalEngine.service.ts:2561:18` | `TS2339` | Property 'neverOverrideExplicitDocLock' does not exist on type '{}'. |
| 119 | `src/services/core/retrieval/retrievalEngine.service.ts:2565:18` | `TS2339` | Property 'timeFilterGuards' does not exist on type '{}'. |
| 120 | `src/services/core/retrieval/retrievalEngine.service.ts:2569:18` | `TS2339` | Property 'timeFilterGuards' does not exist on type '{}'. |
| 121 | `src/services/core/retrieval/retrievalEngine.service.ts:2572:26` | `TS2339` | Property 'timeFilterGuards' does not exist on type '{}'. |
| 122 | `src/services/core/retrieval/retrievalEngine.service.ts:2581:40` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 123 | `src/services/core/retrieval/retrievalEngine.service.ts:2613:38` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 124 | `src/services/core/retrieval/retrievalEngine.service.ts:2647:37` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 125 | `src/services/core/retrieval/retrievalEngine.service.ts:2651:35` | `TS2339` | Property 'typeWeights' does not exist on type '{}'. |
| 126 | `src/services/core/retrieval/retrievalEngine.service.ts:2658:38` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 127 | `src/services/core/retrieval/retrievalEngine.service.ts:3027:26` | `TS2339` | Property 'weights' does not exist on type '{}'. |
| 128 | `src/services/core/retrieval/retrievalEngine.service.ts:3039:7` | `TS2345` | Argument of type 'Record<string, unknown> \| undefined' is not assignable to parameter of type 'Record<string, unknown>'. |
| 129 | `src/services/core/retrieval/retrievalEngine.service.ts:3098:39` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 130 | `src/services/core/retrieval/retrievalEngine.service.ts:3191:39` | `TS2339` | Property 'enabled' does not exist on type '{}'. |
| 131 | `src/services/core/retrieval/retrievalEngine.service.ts:3202:34` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 132 | `src/services/core/retrieval/retrievalEngine.service.ts:3206:34` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 133 | `src/services/core/retrieval/retrievalEngine.service.ts:3211:34` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 134 | `src/services/core/retrieval/retrievalEngine.service.ts:3216:34` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 135 | `src/services/core/retrieval/retrievalEngine.service.ts:3468:50` | `TS2339` | Property 'maxSnippetChars' does not exist on type '{}'. |
| 136 | `src/services/core/retrieval/retrievalEngine.service.ts:3469:44` | `TS2339` | Property 'preserveNumericUnits' does not exist on type '{}'. |
| 137 | `src/services/core/retrieval/retrievalEngine.service.ts:3470:40` | `TS2339` | Property 'preserveHeadings' does not exist on type '{}'. |
| 138 | `src/services/core/retrieval/retrievalEngine.service.ts:3473:11` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 139 | `src/services/core/retrieval/retrievalEngine.service.ts:3477:11` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 140 | `src/services/core/retrieval/retrievalEngine.service.ts:3484:15` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 141 | `src/services/core/retrieval/retrievalEngine.service.ts:3493:15` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 142 | `src/services/core/retrieval/retrievalEngine.service.ts:3501:24` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 143 | `src/services/core/retrieval/retrievalEngine.service.ts:3508:15` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 144 | `src/services/core/retrieval/retrievalEngine.service.ts:3517:15` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 145 | `src/services/core/retrieval/retrievalEngine.service.ts:3519:17` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 146 | `src/services/core/retrieval/retrievalEngine.service.ts:3529:15` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 147 | `src/services/core/retrieval/retrievalEngine.service.ts:3545:11` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 148 | `src/services/core/retrieval/retrievalEngine.service.ts:3563:28` | `TS2339` | Property 'slotExtraction' does not exist on type '{}'. |
| 149 | `src/services/core/retrieval/retrievalEngine.service.ts:3748:21` | `TS2339` | Property 'maxPerDoc' does not exist on type '{}'. |
| 150 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:5:8` | `TS2305` | Module '"./retrievalEngine.service"' has no exported member 'RetrievalRuntimeError'. |
| 151 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:35:14` | `TS2339` | Property 'runtimeStatus' does not exist on type 'EvidencePack'. |
| 152 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:38:18` | `TS2339` | Property 'runtimeStatus' does not exist on type 'EvidencePack'. |
| 153 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:41:18` | `TS2339` | Property 'runtimeError' does not exist on type 'EvidencePack'. |
| 154 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:51:11` | `TS2353` | Object literal may only specify known properties, and 'runtimeStatus' does not exist in type 'EvidencePack'. |
| 155 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:57:9` | `TS2353` | Object literal may only specify known properties, and 'runtimeStatus' does not exist in type 'EvidencePack'. |
| 156 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:73:19` | `TS2341` | Property 'emptyPack' is private and only accessible within class 'RetrievalEngineService'. |
| 157 | `src/services/core/retrieval/retrievalEngine.v2.service.ts:80:9` | `TS2554` | Expected 2-3 arguments, but got 4. |
| 158 | `src/services/core/scope/documentReferenceResolver.service.ts:155:41` | `TS2339` | Property 'runtimeTuning' does not exist on type '{}'. |
| 159 | `src/services/core/scope/scopeGate.service.ts:483:7` | `TS2322` | Type 'MergedDocAliasesBank' is not assignable to type 'Record<string, unknown>'. |
| 160 | `src/services/core/scope/scopeGate.service.ts:518:15` | `TS2352` | Conversion of type 'ConversationStateLike' to type 'Record<string, unknown> & { lastDisambiguation?: { chosenDocumentId?: string \| undefined; } \| undefined; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 161 | `src/services/core/scope/scopeGate.service.ts:521:10` | `TS2352` | Conversion of type 'ConversationStateLike' to type 'Record<string, unknown> & { lastDisambiguation?: { chosenDocumentId?: string \| undefined; } \| undefined; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 162 | `src/services/core/scope/scopeGate.service.ts:636:36` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 163 | `src/services/core/scope/scopeGate.service.ts:670:36` | `TS2339` | Property 'actionsContract' does not exist on type '{}'. |
| 164 | `src/services/core/scope/scopeGate.service.ts:802:53` | `TS2339` | Property 'minAliasConfidence' does not exist on type '{}'. |
| 165 | `src/services/core/scope/scopeGate.service.ts:886:19` | `TS2345` | Argument of type 'unknown' is not assignable to parameter of type 'string'. |
| 166 | `src/services/editing/textGeneration.service.ts:736:11` | `TS2322` | Type '{ enabled: true; config: { apiKey: string; baseUrl: string; defaults: { gemini3: string; gemini3Flash: string; }; timeoutMs: number; }; } \| { enabled: false; config: {}; }' is not assignable to type '{ enabled: boolean; config: GeminiClientConfig; } \| undefined'. |
| 167 | `src/services/editing/textGeneration.service.ts:761:59` | `TS2345` | Argument of type 'import("/Users/pg/Desktop/koda-webapp/backend/src/services/llm/prompts/promptRegistry.service").PromptRegistryService' is not assignable to parameter of type 'import("/Users/pg/Desktop/koda-webapp/backend/src/services/llm/core/llmRequestBuilder.service").PromptRegistryService'. |
| 168 | `src/services/llm/prompts/v2/template-compiler.ts:209:9` | `TS2322` | Type 'PromptMessage[]' is not assignable to type 'Record<string, unknown>[]'. |
| 169 | `src/services/llm/providers/gemini/geminiClient.service.ts:635:12` | `TS2352` | Conversion of type 'GeminiPart' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 170 | `src/services/llm/providers/openai/openaiClient.service.ts:165:42` | `TS2339` | Property 'name' does not exist on type '{}'. |
| 171 | `src/services/llm/providers/openai/openaiClient.service.ts:166:56` | `TS2339` | Property 'description' does not exist on type '{}'. |
| 172 | `src/services/llm/providers/openai/openaiClient.service.ts:168:20` | `TS2339` | Property 'parameters' does not exist on type '{}'. |
| 173 | `src/services/llm/providers/openai/openaiClient.service.ts:321:7` | `TS2352` | Conversion of type 'Record<string, unknown>' to type 'ChatCompletionCreateParamsBase' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 174 | `src/services/llm/providers/openai/openaiClient.service.ts:326:20` | `TS2352` | Conversion of type '(Stream<ChatCompletionChunk> & { _request_id?: string \| null \| undefined; }) \| (ChatCompletion & { _request_id?: string \| null \| undefined; })' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 175 | `src/services/llm/providers/openai/openaiClient.service.ts:358:7` | `TS2352` | Conversion of type 'Record<string, unknown>' to type 'ChatCompletionCreateParamsBase' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 176 | `src/services/llm/providers/openai/openaiClient.service.ts:369:7` | `TS2322` | Type 'AsyncIterable<Record<string, unknown>>' is not assignable to type 'AsyncIterable<LlmStreamEvent>'. |
| 177 | `src/services/llm/resilience/resilienceLlmClient.decorator.ts:63:8` | `TS2352` | Conversion of type 'LLMCompletionResponse' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
| 178 | `src/services/llm/resilience/resilienceLlmClient.decorator.ts:133:8` | `TS2352` | Conversion of type 'LLMStreamResponse' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. |
