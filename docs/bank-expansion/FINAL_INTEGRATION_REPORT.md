# Final Integration Report: Banks from Previous Waves

Date: 2026-03-13  
Scope: 43 newly created / revised banks listed in `NEW_BANKS_REGISTERED.csv`

## Integration Outcome
The 43-bank wave is bank-complete and metadata-clean. It is not yet runtime-complete in the stronger sense of explicit orchestrator/retrieval callsite adoption.

- Registry coverage: `43/43`
- Alias coverage: `43/43`
- Dependency coverage: `43/43`
- Checksum integrity: `43/43`
- Existing `_meta.usedBy` path coverage: `43/43`
- Existing `_meta.tests` path coverage: `43/43`
- Direct non-test runtime source references: `0/43`

## Additional wiring completed in this pass
- Registered the 6 governance banks under `backend/src/data_banks/governance/**` in the bank system.
- Added the `governance` category to [bank_manifest.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/manifest/bank_manifest.any.json).
- Added governance aliases and dependency entries so the governance banks are loadable through the normal loader path.
- Wired [runtimeWiringIntegrity.service.ts](/Users/pg/Desktop/koda-webapp/backend/src/services/core/banks/runtimeWiringIntegrity.service.ts) to consume `governance_runtime_wiring_requirements`.
- Added [bank-wave-runtime-metadata.cert.test.ts](/Users/pg/Desktop/koda-webapp/backend/src/tests/certification/bank-wave-runtime-metadata.cert.test.ts) and included it in the runtime certification suite.

## What is now true
- The 43 target banks are no longer carrying stale `_meta.usedBy` or `_meta.tests` paths.
- The runtime integrity layer now has an explicit managed audit set of `49` banks: 43 expansion banks plus 6 governance banks.
- The governance runtime contract is now loadable and enforced by runtime integrity checks.

## What is still not true
- The 43 target banks still have `0` explicit non-test runtime source references. They are loaded and audited, but not yet selected through dedicated runtime callsites.
- The managed audit set still has `98` `requiredByEnv` gaps across production/staging. This is intentional for now and is the remaining signal that these banks are not yet promoted to strict runtime-required status.
- [docint-orphan-detection.test.ts](/Users/pg/Desktop/koda-webapp/backend/src/tests/document-intelligence/docint-orphan-detection.test.ts) still fails on `103` broader document-intelligence files outside this 43-bank wave.

## Verification
- Passed: [runtime-wiring.cert.test.ts](/Users/pg/Desktop/koda-webapp/backend/src/tests/certification/runtime-wiring.cert.test.ts)
- Passed: [bank-wave-runtime-metadata.cert.test.ts](/Users/pg/Desktop/koda-webapp/backend/src/tests/certification/bank-wave-runtime-metadata.cert.test.ts)
- Passed: [runtimeWiringIntegrity.service.test.ts](/Users/pg/Desktop/koda-webapp/backend/src/services/core/banks/runtimeWiringIntegrity.service.test.ts)
