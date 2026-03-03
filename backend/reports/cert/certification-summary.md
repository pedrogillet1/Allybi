# Certification Summary

- Generated: 2026-03-03T02:58:00.212Z
- Strict mode: yes
- Auto refresh: yes
- Commit hash: 3562f341191bd9c8d077e37da995fc98d2d02588
- Passed: yes
- Passed gates: 19/19

| Gate | Passed | Fresh | Failures |
|---|---:|---:|---:|
| wrong-doc | yes | yes | 0 |
| truncation | yes | yes | 0 |
| persistence-restart | yes | yes | 0 |
| editing-roundtrip | yes | yes | 0 |
| editing-capabilities | yes | yes | 0 |
| editing-eval-suite | yes | yes | 0 |
| editing-slo | yes | yes | 0 |
| runtime-wiring | yes | yes | 0 |
| enforcer-failclosed | yes | yes | 0 |
| evidence-fidelity | yes | yes | 0 |
| provenance-strictness | yes | yes | 0 |
| prompt-mode-coverage | yes | yes | 0 |
| builder-payload-budget | yes | yes | 0 |
| gateway-json-routing | yes | yes | 0 |
| query-latency | yes | yes | 0 |
| turn-debug-packet | yes | yes | 0 |
| security-auth | yes | yes | 0 |
| observability-integrity | yes | yes | 0 |
| retrieval-behavioral | yes | yes | 0 |

## wrong-doc
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"totalCases":120,"outOfScopeCases":0,"wrongDocRate":0,"emptyEvidenceCases":0,"emptyEvidenceRate":0,"multiDocsetCases":30,"multiDocsetOutOfScopeCases":0,"multiDocsetWrongDocRate":0}`

## truncation
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"estimatedTokens":1041,"hardLimit":2525,"rowLines":62,"blocked":false,"hasOverlongDashRun":false}`

## persistence-restart
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"durableTokenVault":true,"prismaNoopFallbackDetected":false,"chatRepoDurable":true,"messageSchemaComplete":true,"documentRevisionDurable":true,"conversationKeyWrapped":true,"paginationDeterministic":true,"failureCount":0}`

## editing-roundtrip
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"failures":0,"docxRestored":true,"xlsxRestored":true}`

## editing-capabilities
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"totalRows":119,"supportedRows":115,"unsupportedRows":4,"docxRows":36,"xlsxRows":42,"versionHash":"ae428bb16716cddd1f2ebdce38937e01ca74fbfbca53c29f2edd9a85373b3dfa"}`

## editing-eval-suite
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"docxTotal":264,"docxPassed":264,"docxPassRate":1,"docxPlanP95Ms":0,"xlsxTotal":336,"xlsxPassed":336,"xlsxPassRate":1,"xlsxPlanP95Ms":0,"pyTotal":328,"pyPassed":328,"pyPassRate":1,"pyPlanP95Ms":0,"adversarialTotal":252,"adversarialPassed":252,"adversarialPassRate":1,"adversarialP95Ms":0}`

## editing-slo
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"profile":"balanced","docxPassRate":1,"xlsxPassRate":1,"adversarialPassRate":1,"docxPlanP95Ms":0,"xlsxPlanP95Ms":0}`

## runtime-wiring
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"commandStatus":0,"reachableFiles":444,"reachableRuntimeFiles":414,"runtimeCoverage":0.9764,"missingLocalRefs":0,"legacyRouteWrappers":0,"missingCriticalPaths":0}`

## enforcer-failclosed
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"failureCode":"enforcer_runtime_error","outputChanged":true,"hasWarning":true}`

## evidence-fidelity
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"missingMapBlocked":true,"missingMapReasonCode":"missing_evidence_map","hashMismatchBlocked":true,"hashMismatchReasonCode":"evidence_map_hash_mismatch","validMapPasses":true}`

## provenance-strictness
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"weakOverlapBlocked":true,"strongOverlapAccepted":true}`

## prompt-mode-coverage
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"coveredModes":11,"totalModes":11}`

## builder-payload-budget
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"estimatedPromptTokens":2291,"evidenceItemsIncluded":6,"userPayloadChars":9134}`

## gateway-json-routing
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"task_plan_generationTemplateCount":1,"task_plan_generationMachineJsonCount":1,"editing_task_promptsTemplateCount":16,"editing_task_promptsMachineJsonCount":6}`

## query-latency
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"reportPath":"/Users/pg/Desktop/koda-webapp/frontend/e2e/reports/latest/per_query.json","totalQueries":10,"p95LatencyMs":11125,"runtimeErrorCount":0,"qualityFailCount":0,"errorRate":0,"timeoutRate":0,"qualityFailRate":0}`

## turn-debug-packet
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"hasPacket":true,"docScopeMode":"docset","allowedDocumentIdsCount":2,"retrievalCandidates":12,"retrievalSelected":2,"hasEvidenceMapHash":true,"hasTokenBudget":true}`

## security-auth
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"missingTokenRejected":true,"forgedHeaderRejected":true,"forgedHeaderDidNotSetUser":true,"headerTrustPathPresent":false,"jwtVerificationUsed":true,"expiredTokenRejected":true,"revokedSessionRejected":true,"tokenVersionMismatchRejected":true,"crossUserSessionRejected":true,"unguardedDevCodeLogging":false,"unmaskedPhoneLogging":false,"plaintextWritePathCount":0}`

## observability-integrity
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"requiredStepCount":6,"traceTypeMissingCount":0,"delegateSpanMissingCount":0,"strictModeWiringPresent":true}`

## retrieval-behavioral
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"totalCases":120,"wrongDocCount":0,"wrongDocRate":0,"missCount":0,"missRate":0,"passCount":120,"passRate":1}`

