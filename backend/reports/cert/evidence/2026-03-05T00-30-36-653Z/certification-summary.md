# Certification Summary

- Generated: 2026-03-05T00:30:36.639Z
- Strict mode: yes
- Certification profile: local
- Auto refresh: no
- Commit hash: 7349df6bde9f1c1e370ca4249ec86948e4af9a85
- Commit hash source: git-files
- Lineage run id: cert_2026-03-05T00-30-36-639Z
- Lineage dataset id: none
- Lineage profile: local
- Passed: no
- Passed gates: 23/24
- Local cert run: fail (recent, ageHours=2.35)

| Gate | Criticality | Passed | Fresh | Failures |
|---|---|---:|---:|---:|
| wrong-doc | required | yes | yes | 0 |
| truncation | required | yes | no | 0 |
| persistence-restart | required | yes | no | 0 |
| editing-roundtrip | required | yes | no | 0 |
| editing-capabilities | required | yes | no | 0 |
| editing-eval-suite | required | yes | no | 0 |
| editing-slo | required | yes | no | 0 |
| runtime-wiring | required | yes | no | 0 |
| enforcer-failclosed | required | yes | yes | 0 |
| evidence-fidelity | required | yes | yes | 0 |
| provenance-strictness | required | yes | no | 0 |
| prompt-mode-coverage | required | yes | no | 0 |
| composition-routing | required | yes | no | 0 |
| composition-fallback-order | required | yes | no | 0 |
| composition-pinned-model-resolution | required | yes | no | 0 |
| composition-telemetry-integrity | required | yes | no | 0 |
| composition-analytical-structure | required | yes | no | 0 |
| builder-payload-budget | required | yes | no | 0 |
| gateway-json-routing | required | yes | no | 0 |
| turn-debug-packet | required | yes | yes | 0 |
| security-auth | required | yes | no | 0 |
| observability-integrity | required | yes | yes | 0 |
| retrieval-behavioral | required | yes | yes | 0 |
| query-latency | required | no | yes | 1 |

## wrong-doc
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"totalCases":120,"outOfScopeCases":0,"wrongDocRate":0,"emptyEvidenceCases":0,"emptyEvidenceRate":0,"multiDocsetCases":30,"multiDocsetOutOfScopeCases":0,"multiDocsetWrongDocRate":0}`

## truncation
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"estimatedTokens":1041,"hardLimit":2525,"rowLines":62,"blocked":false,"hasOverlongDashRun":false}`

## persistence-restart
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"durableTokenVault":true,"prismaNoopFallbackDetected":false,"chatRepoDurable":true,"messageSchemaComplete":true,"documentRevisionDurable":true,"conversationKeyWrapped":true,"paginationDeterministic":true,"failureCount":0}`

## editing-roundtrip
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"failures":0,"docxRestored":true,"xlsxRestored":true}`

## editing-capabilities
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"totalRows":119,"supportedRows":115,"unsupportedRows":4,"docxRows":36,"xlsxRows":42,"versionHash":"ae428bb16716cddd1f2ebdce38937e01ca74fbfbca53c29f2edd9a85373b3dfa"}`

## editing-eval-suite
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"docxTotal":264,"docxPassed":264,"docxPassRate":1,"docxPlanP95Ms":0,"xlsxTotal":336,"xlsxPassed":336,"xlsxPassRate":1,"xlsxPlanP95Ms":0,"pyTotal":328,"pyPassed":328,"pyPassRate":1,"pyPlanP95Ms":0,"adversarialTotal":252,"adversarialPassed":252,"adversarialPassRate":1,"adversarialP95Ms":0}`

## editing-slo
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"profile":"balanced","docxPassRate":1,"xlsxPassRate":1,"adversarialPassRate":1,"docxPlanP95Ms":0,"xlsxPlanP95Ms":0}`

## runtime-wiring
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"commandStatus":0,"commandMode":"cached","commandStrategy":"cached","requireLiveMode":false,"reachableFiles":494,"reachableRuntimeFiles":461,"runtimeCoverage":0.9427,"missingLocalRefs":0,"legacyRouteWrappers":0,"missingCriticalPaths":0}`

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
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"weakOverlapBlocked":true,"strongOverlapAccepted":true}`

## prompt-mode-coverage
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"coveredModes":11,"totalModes":11}`

## composition-routing
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"finalRouteProviderOpenAI":1,"finalRouteModelFamilyMatch":1,"draftRouteProviderGemini":1}`

## composition-fallback-order
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"fallbackCount":1,"gpt52First":1}`

## composition-pinned-model-resolution
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"openaiFamilyLimitResolved":1,"geminiFamilyLimitResolved":1}`

## composition-telemetry-integrity
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"hasRouteLane":1,"hasModelFamily":1,"hasFallbackRank":1}`

## composition-analytical-structure
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"hasDirectAnswer":1,"hasSynthesisMarker":1,"hasFollowupMarker":1}`

## builder-payload-budget
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"estimatedPromptTokens":2291,"evidenceItemsIncluded":6,"userPayloadChars":9134}`

## gateway-json-routing
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
- Failures: none
- Metrics: `{"task_plan_generationTemplateCount":1,"task_plan_generationMachineJsonCount":1,"editing_task_promptsTemplateCount":16,"editing_task_promptsMachineJsonCount":6}`

## turn-debug-packet
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"hasPacket":true,"docScopeMode":"docset","allowedDocumentIdsCount":2,"retrievalCandidates":12,"retrievalSelected":2,"hasEvidenceMapHash":true,"hasTokenBudget":true}`

## security-auth
- Passed: yes
- Freshness: stale (commit_hash_mismatch)
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

## query-latency
- Passed: no
- Freshness: fresh
- Failures: MISSING_PER_QUERY_REPORT
- Metrics: `{}`

