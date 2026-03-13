# Governance and Hygiene Implementation

## Scope
This implementation creates deterministic governance controls for future bank growth in `backend/src/data_banks/governance`.

Created banks:
- [bank_metadata_policy.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/governance/bank_metadata_policy.any.json)
- [ssot_contract.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/governance/ssot_contract.any.json)
- [sharding_policy.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/governance/sharding_policy.any.json)
- [eval_gate_policy.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/governance/eval_gate_policy.any.json)
- [runtime_wiring_requirements.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/governance/runtime_wiring_requirements.any.json)
- [bank_quality_contract.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/governance/bank_quality_contract.any.json)
- Sharding operating procedure: [SHARDING_PLAN.md](/Users/pg/Desktop/koda-webapp/docs/bank-expansion/SHARDING_PLAN.md)

## Metadata and Determinism
`bank_metadata_policy.any.json` enforces required `_meta.owner`, `_meta.usedBy`, `_meta.tests`, and `_meta.version` as hard signals for all candidate banks, then defines stable sorting and dedupe behavior:
- sort keys: `category`, `path`, `id`
- dedupe keys: `bankId` and `path`
- conflict policy: keep highest version with most recent timestamp, reject collisions.

## Runtime Wires
`runtime_wiring_requirements.any.json` defines when a bank is runtime-wired:
- must be present in registry and manifest
- must reference service paths in `_meta.usedBy`
- must have tests that exercise service-facing behavior
- must satisfy service-path validation against `services/*` ownership
- must pass runtime smoke checks before production use

Banks using runtime service references are split into runtime classes (`orchestration`, `evidence`, `governance`) and evaluated by wiring class.

## SSOT and Registry Coherence
`ssot_contract.any.json` sets the single source of truth boundary:
- bank id and path uniqueness must match registry
- category ordering and required schema mapping enforced
- category whitelist for new domains, including `governance`
- dependency graph validation including circular dependency checks
- source-of-truth paths are pinned to `manifest/bank_registry.any.json`, `manifest/bank_manifest.any.json`, and `manifest/bank_checksums.any.json`.

## Sharding Standards
`sharding_policy.any.json` defines shard structure, naming, and lifecycle:
- shard filename pattern: `{family}_{scope}_{index}.any.json`
- index rules: 1-based, zero padded to 3
- deterministic shard criteria by line count, case count, growth pressure
- deterministic dedupe and sort before shard split
- shard ownership risk controls for cross-team collisions and service-surface overlap are described in `SHARDING_PLAN.md`

## Eval Gate Before Shipping
`eval_gate_policy.any.json` blocks release until required checks pass:
- metadata checks
- schema + pattern wiring tests
- suite checks mapped to CI, staging, production gates
- hard rejects for missing metadata, missing tests, and missing critical evaluation coverage

## Quality Contract
`bank_quality_contract.any.json` defines acceptance contract:
- minimum sort/dedupe compliance
- anti-stub and anti-placeholder thresholds
- quality score floors by environment
- penalties for missing runtime wiring, missing tests, metadata and dedupe violations
- sort/dedupe policy is also the anchor for deterministic generation output.

## Operational Integration
Completed in the runtime wiring pass:
1. Registered all 6 governance bank IDs in manifests, aliases, dependencies, checksums, and the `governance` category in [bank_manifest.any.json](/Users/pg/Desktop/koda-webapp/backend/src/data_banks/manifest/bank_manifest.any.json).
2. Added a runtime wiring audit consumer in [runtimeWiringIntegrity.service.ts](/Users/pg/Desktop/koda-webapp/backend/src/services/core/banks/runtimeWiringIntegrity.service.ts) that consumes `governance_runtime_wiring_requirements`.
3. Added [bank-wave-runtime-metadata.cert.test.ts](/Users/pg/Desktop/koda-webapp/backend/src/tests/certification/bank-wave-runtime-metadata.cert.test.ts) so managed-bank metadata and checksum integrity are exercised in the runtime certification slice.

Still pending outside this pass:
1. Add a merge-blocking governance CI gate that consumes `governance_eval_gate_policy`.
2. Enforce shard lifecycle from `governance_sharding_policy` during bank generation and registry refresh.
3. Promote audited banks to production/staging `requiredByEnv` only after real selector/orchestrator adoption is in place.
