# Brain Terminal 3 Handoff

**Date**: 2026-03-13
**Scope owned**: `backend/src/data_banks/document_intelligence/domains/**`, owned domain/doc-type tests, handoff report
**Scope not owned**: shared manifests/governance files, runtime service expansion outside owned paths

## What changed

Added proof coverage for the current runtime-wired Terminal 3 contract in:

- `backend/src/tests/document-intelligence/domain-doc-type-pack-coverage.test.ts`

This new test file proves:

- priority domains `finance`, `accounting`, `legal`, and `medical` each expose the current runtime-wired root pack set
- every cataloged docType in those domains has required runtime pack files:
  - `sections/<docType>.sections.any.json`
  - `entities/<docType>.entities.schema.json`
  - `tables/<docType>.tables.any.json`
  - `extraction/<docType>.extraction_hints.any.json`
- `doc_type_catalog.any.json` `packRefs` still align with runtime bank ids
- planned next domains are not silently present on disk as half-built packs
- mission-required contract deltas remain explicit proof blockers until shared manifests/runtime are extended

## Files created

- `backend/src/tests/document-intelligence/domain-doc-type-pack-coverage.test.ts`
- `docs/plans/2026-03-13-brain-terminal3-handoff.md`

## Files rewired

None.

No runtime service files or shared manifests were edited.

## Tests added

- `backend/src/tests/document-intelligence/domain-doc-type-pack-coverage.test.ts`

Coverage added in that test:

- domain root pack coverage for current runtime families
- docType pack completeness coverage for cataloged docTypes
- `packRefs` to bank id alignment coverage
- blocker-proof coverage for mission contract files not yet runtime-wired

## Audit findings

### Current strong domains

The following domains are already present and materially populated:

- `finance`
- `accounting`
- `legal`
- `medical`

Each currently has:

- `domain_profile.any.json`
- `retrieval_strategies.any.json`
- `evidence_requirements.any.json`
- `validation_policies.any.json`
- `reasoning_scaffolds.any.json`
- `doc_types/doc_type_catalog.any.json`

Each cataloged docType in those domains currently resolves to:

- `sections/<docType>.sections.any.json`
- `entities/<docType>.entities.schema.json`
- `tables/<docType>.tables.any.json`
- `extraction/<docType>.extraction_hints.any.json`

### Missing mission-contract assets

For all audited priority domains, the following mission-target files are not present:

- `domain_writer.any.json`
- `ambiguity_patterns.any.json`
- `gold_queries.any.json`
- `validation_rules.any.json` as a sibling to the existing `validation_policies.any.json`

For docTypes in the audited priority domains, the following mission-target files are not present:

- `ambiguity/<docType>.any.json`
- `eval/<docType>.any.json`
- `extraction/<docType>.any.json`

### Next domains requested by mission but not present on disk

- `procurement`
- `compliance_regulatory`
- `supply_chain_logistics`
- `public_sector`
- `research_scientific`
- `sales_crm`
- `manufacturing`
- `commercial_real_estate`

## Manifest changes needed by integration terminal

These are required before Terminal 3 can safely add the missing contract files as real banks without failing registry/orphan/runtime proof tests:

- register any new domain root banks in `backend/src/data_banks/manifest/bank_registry.any.json`
- register any new docType ambiguity/eval/extraction alias banks in `backend/src/data_banks/manifest/bank_registry.any.json`
- extend `backend/src/data_banks/document_intelligence/manifest/bank_schema_registry.any.json` if new bank families are introduced
- extend `backend/src/data_banks/document_intelligence/manifest/usage_manifest.any.json` if new bank ids become runtime-consumed
- extend `backend/src/data_banks/document_intelligence/manifest/runtime_wiring_gates.any.json` so new families have proof-family coverage
- extend runtime loading in `backend/src/services/core/banks/documentIntelligenceBanks.service.ts` if product behavior is expected to consume:
  - `domain_writer`
  - `ambiguity_patterns`
  - `gold_queries`
  - `validation_rules`
  - `doc_types/ambiguity/*.any.json`
  - `doc_types/eval/*.any.json`
  - `doc_types/extraction/*.any.json` as an alias family distinct from `extraction_hints`

## Unresolved blockers

1. Shared-governance rule conflict:
   Terminal 3 mission asks for new bank files, but current orphan/registry tests require those files to be registered. Terminal 3 does not own shared manifests.

2. Runtime contract mismatch:
   Current runtime loads `validation_policies` and `extraction_hints`; mission asks for `validation_rules` and `extraction/<docType>.any.json`.

3. No safe way to add new next-domain packs in owned scope alone:
   creating new domain folders and `.any.json` banks under `document_intelligence/domains/**` would require shared manifest registration and likely runtime wiring updates.

4. No existing consumer path for `domain_writer`, `ambiguity_patterns`, or `gold_queries`:
   adding them now would create decorative banks, which violates the engineering bar.

## Recommended next integration order

1. Integration terminal updates shared manifests and schema registry for new bank families.
2. Runtime terminal extends `DocumentIntelligenceBanksService` and downstream consumers for the missing families.
3. Terminal 3 then adds the missing domain/docType banks as canonical, runtime-consumed assets.
4. Eval terminal expands suite registration if per-docType eval banks are promoted into runtime-governed proof assets.
