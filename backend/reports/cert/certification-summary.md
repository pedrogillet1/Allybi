# Certification Summary

- Generated: 2026-02-25T21:01:34.358Z
- Passed: yes
- Passed gates: 10/10

| Gate | Passed | Failures |
|---|---:|---:|
| wrong-doc | yes | 0 |
| truncation | yes | 0 |
| persistence-restart | yes | 0 |
| editing-roundtrip | yes | 0 |
| runtime-wiring | yes | 0 |
| enforcer-failclosed | yes | 0 |
| evidence-fidelity | yes | 0 |
| turn-debug-packet | yes | 0 |
| security-auth | yes | 0 |
| observability-integrity | yes | 0 |

## wrong-doc
- Passed: yes
- Failures: none
- Metrics: `{"totalCases":120,"outOfScopeCases":0,"wrongDocRate":0,"emptyEvidenceCases":0,"emptyEvidenceRate":0,"multiDocsetCases":30,"multiDocsetOutOfScopeCases":0,"multiDocsetWrongDocRate":0}`

## truncation
- Passed: yes
- Failures: none
- Metrics: `{"estimatedTokens":218,"hardLimit":220,"rowLines":14,"blocked":false,"hasOverlongDashRun":false}`

## persistence-restart
- Passed: yes
- Failures: none
- Metrics: `{"durableTokenVault":true,"prismaNoopFallbackDetected":false,"failureCount":0}`

## editing-roundtrip
- Passed: yes
- Failures: none
- Metrics: `{"failures":0,"docxRestored":true,"xlsxRestored":true}`

## runtime-wiring
- Passed: yes
- Failures: none
- Metrics: `{"commandStatus":0,"reachableFiles":388,"reachableRuntimeFiles":360,"runtimeCoverage":0.9068,"missingLocalRefs":0,"legacyRouteWrappers":0,"missingCriticalPaths":0}`

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
- Metrics: `{"missingTokenRejected":true,"forgedHeaderRejected":true,"forgedHeaderDidNotSetUser":true,"headerTrustPathPresent":false,"jwtVerificationUsed":true}`

## observability-integrity
- Passed: yes
- Failures: none
- Metrics: `{"requiredStepCount":6,"traceTypeMissingCount":0,"delegateSpanMissingCount":0}`

