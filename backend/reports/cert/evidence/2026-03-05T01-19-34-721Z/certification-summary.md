# Certification Summary

- Generated: 2026-03-05T01:19:24.595Z
- Strict mode: yes
- Certification profile: retrieval_signoff
- Mode: repair
- Verify only: no
- Auto refresh: yes
- Commit hash: 76bc39efc63107fba99584d8c7a7b83189d65119
- Commit hash source: git-files
- Lineage run id: cert_2026-03-05T01-19-24-595Z
- Lineage dataset id: none
- Lineage profile: retrieval_signoff
- Passed: no
- Passed gates: 26/28
- Local cert run: fail (recent, ageHours=3.17)

| Gate | Criticality | Passed | Fresh | Failures |
|---|---|---:|---:|---:|
| wrong-doc | required | yes | yes | 0 |
| truncation | required | yes | yes | 0 |
| persistence-restart | required | yes | yes | 0 |
| editing-roundtrip | required | yes | yes | 0 |
| editing-capabilities | required | yes | yes | 0 |
| editing-eval-suite | required | yes | yes | 0 |
| editing-slo | required | yes | yes | 0 |
| runtime-wiring | required | yes | yes | 0 |
| enforcer-failclosed | required | yes | yes | 0 |
| evidence-fidelity | required | yes | yes | 0 |
| provenance-strictness | required | yes | yes | 0 |
| prompt-mode-coverage | required | yes | yes | 0 |
| composition-routing | required | yes | yes | 0 |
| composition-fallback-order | required | yes | yes | 0 |
| composition-pinned-model-resolution | required | yes | yes | 0 |
| composition-telemetry-integrity | required | yes | yes | 0 |
| composition-analytical-structure | required | yes | yes | 0 |
| builder-payload-budget | required | yes | yes | 0 |
| gateway-json-routing | required | yes | yes | 0 |
| turn-debug-packet | required | yes | yes | 0 |
| security-auth | required | yes | yes | 0 |
| observability-integrity | required | yes | yes | 0 |
| retrieval-behavioral | required | yes | yes | 0 |
| query-latency | required | no | yes | 1 |
| retrieval-golden-eval | required | yes | yes | 0 |
| retrieval-realistic-eval | required | yes | yes | 0 |
| frontend-retrieval-evidence | required | no | yes | 3 |
| indexing-live-integration | required | yes | yes | 0 |

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
- Metrics: `{"commandStatus":0,"commandMode":"cached","commandStrategy":"cached","requireLiveMode":false,"reachableFiles":496,"reachableRuntimeFiles":463,"runtimeCoverage":0.9449,"missingLocalRefs":0,"legacyRouteWrappers":0,"missingCriticalPaths":0,"embeddingRuntimeMode":"v1","embeddingRuntimeAllowedModes":["v1","v2"],"embeddingRuntimeModeAllowed":true}`

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

## composition-routing
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"finalRouteProviderOpenAI":1,"finalRouteModelFamilyMatch":1,"draftRouteProviderGemini":1}`

## composition-fallback-order
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"fallbackCount":1,"gpt52First":1}`

## composition-pinned-model-resolution
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"openaiFamilyLimitResolved":1,"geminiFamilyLimitResolved":1}`

## composition-telemetry-integrity
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"hasRouteLane":1,"hasModelFamily":1,"hasFallbackRank":1}`

## composition-analytical-structure
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"hasDirectAnswer":1,"hasSynthesisMarker":1,"hasFollowupMarker":1}`

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

## query-latency
- Passed: no
- Freshness: fresh
- Failures: MISSING_PER_QUERY_REPORT
- Metrics: `{}`

## retrieval-golden-eval
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"totalQueries":45,"passedCount":45,"precision":1,"categoryBreakdown":{"single_doc_extract":{"total":5,"passed":5},"multi_doc_compare":{"total":5,"passed":5},"numeric_precision":{"total":5,"passed":5},"legal_clause":{"total":5,"passed":5},"time_scoped":{"total":5,"passed":5},"table_context":{"total":1,"passed":1},"negation":{"total":1,"passed":1},"crossdoc_conflict":{"total":1,"passed":1},"section_diversity":{"total":1,"passed":1},"unit_preservation":{"total":1,"passed":1},"scope_lock":{"total":1,"passed":1},"discovery_mode":{"total":1,"passed":1},"pptx_notes":{"total":1,"passed":1},"near_dup_tables":{"total":1,"passed":1},"footnote_preservation":{"total":1,"passed":1},"cross_domain_confusion":{"total":2,"passed":2},"wrong_doc_trap":{"total":2,"passed":2},"section_target_no_anchor":{"total":2,"passed":2},"table_header_mismatch":{"total":2,"passed":2},"version_disambiguation":{"total":2,"passed":2}}}`

## retrieval-realistic-eval
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"totalCases":12,"top1HitRate":0.9167,"precisionAtK":0.9167,"contaminationRate":0.0833,"noEvidenceRate":0}`

## frontend-retrieval-evidence
- Passed: no
- Freshness: fresh
- Failures: LATEST_FILES_MISSING:scorecard.json,grading.md,a-plus-gap-deep-dive.md,per_query.json,lineage.json, PLAYWRIGHT_EXPECTED_ZERO, PLAYWRIGHT_SKIPPED_TESTS_PRESENT
- Metrics: `{"latestDir":"C:\\Users\\Pedro\\Desktop\\webapp\\frontend\\e2e\\reports\\latest","missingLatestFiles":["scorecard.json","grading.md","a-plus-gap-deep-dive.md","per_query.json","lineage.json"],"perQueryRows":0,"playwrightExpected":0,"playwrightSkipped":1}`

## indexing-live-integration
- Passed: yes
- Freshness: fresh
- Failures: none
- Metrics: `{"runtimeMode":"v1","runtimeModeAllowed":true,"allowedModes":["v1","v2"],"strictFailClosed":true,"verifyRequired":true}`

