# Certification Summary

- Generated: 2026-02-27T19:36:36.253Z
- Passed: yes
- Passed gates: 14/14

| Gate | Passed | Failures |
|---|---:|---:|
| wrong-doc | yes | 0 |
| truncation | yes | 0 |
| persistence-restart | yes | 0 |
| editing-roundtrip | yes | 0 |
| editing-capabilities | yes | 0 |
| editing-eval-suite | yes | 0 |
| editing-slo | yes | 0 |
| runtime-wiring | yes | 0 |
| enforcer-failclosed | yes | 0 |
| evidence-fidelity | yes | 0 |
| turn-debug-packet | yes | 0 |
| security-auth | yes | 0 |
| observability-integrity | yes | 0 |
| retrieval-behavioral | yes | 0 |

## wrong-doc
- Passed: yes
- Failures: none
- Metrics: `{"totalCases":120,"outOfScopeCases":0,"wrongDocRate":0,"emptyEvidenceCases":0,"emptyEvidenceRate":0,"multiDocsetCases":30,"multiDocsetOutOfScopeCases":0,"multiDocsetWrongDocRate":0}`

## truncation
- Passed: yes
- Failures: none
- Metrics: `{"estimatedTokens":2098,"hardLimit":4320,"rowLines":122,"blocked":false,"hasOverlongDashRun":false}`

## persistence-restart
- Passed: yes
- Failures: none
- Metrics: `{"durableTokenVault":true,"prismaNoopFallbackDetected":false,"chatRepoDurable":true,"messageSchemaComplete":true,"documentRevisionDurable":true,"conversationKeyWrapped":true,"paginationDeterministic":true,"failureCount":0}`

## editing-roundtrip
- Passed: yes
- Failures: none
- Metrics: `{"failures":0,"docxRestored":true,"xlsxRestored":true}`

## editing-capabilities
- Passed: yes
- Failures: none
- Metrics: `{"totalRows":67,"supportedRows":61,"unsupportedRows":6,"docxRows":30,"xlsxRows":37,"versionHash":"075df2d653f907fa894cf101295e5ff26be204edc3aaed45db292cde7ba1cdac"}`

## editing-eval-suite
- Passed: yes
- Failures: none
- Metrics: `{"docxTotal":208,"docxPassed":208,"docxPassRate":1,"docxPlanP95Ms":0,"xlsxTotal":288,"xlsxPassed":288,"xlsxPassRate":1,"xlsxPlanP95Ms":0,"adversarialTotal":192,"adversarialPassed":192,"adversarialPassRate":1,"adversarialP95Ms":0}`

## editing-slo
- Passed: yes
- Failures: none
- Metrics: `{"profile":"balanced","docxPassRate":1,"xlsxPassRate":1,"adversarialPassRate":1,"docxPlanP95Ms":0,"xlsxPlanP95Ms":0}`

## runtime-wiring
- Passed: yes
- Failures: none
- Metrics: `{"commandStatus":0,"reachableFiles":403,"reachableRuntimeFiles":374,"runtimeCoverage":0.992,"missingLocalRefs":0,"legacyRouteWrappers":0,"missingCriticalPaths":0}`

## enforcer-failclosed
- Passed: yes
- Failures: none
- Metrics: `{"failureCode":"enforcer_runtime_error","outputChanged":true,"hasWarning":true}`

## evidence-fidelity
- Passed: yes
- Failures: none
- Metrics: `{"missingMapBlocked":true,"missingMapReasonCode":"missing_evidence_map","hashMismatchBlocked":true,"hashMismatchReasonCode":"evidence_map_hash_mismatch","validMapPasses":true}`

## turn-debug-packet
- Passed: yes
- Failures: none
- Metrics: `{"hasPacket":true,"docScopeMode":"docset","allowedDocumentIdsCount":2,"retrievalCandidates":12,"retrievalSelected":2,"hasEvidenceMapHash":true,"hasTokenBudget":true}`

## security-auth
- Passed: yes
- Failures: none
- Metrics: `{"missingTokenRejected":true,"forgedHeaderRejected":true,"forgedHeaderDidNotSetUser":true,"headerTrustPathPresent":false,"jwtVerificationUsed":true,"expiredTokenRejected":true,"revokedSessionRejected":true,"tokenVersionMismatchRejected":true,"crossUserSessionRejected":true,"unguardedDevCodeLogging":false,"unmaskedPhoneLogging":false,"plaintextWritePathCount":0}`

## observability-integrity
- Passed: yes
- Failures: none
- Metrics: `{"requiredStepCount":6,"traceTypeMissingCount":0,"delegateSpanMissingCount":0,"strictModeWiringPresent":true}`

## retrieval-behavioral
- Passed: yes
- Failures: none
- Metrics: `{"totalCases":120,"wrongDocCount":0,"wrongDocRate":0,"missCount":0,"missRate":0,"passCount":120,"passRate":1}`

