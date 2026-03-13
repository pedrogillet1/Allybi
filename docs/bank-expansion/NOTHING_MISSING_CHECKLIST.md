# Nothing Missing Checklist

Date: 2026-03-13  
Target set: 43 banks from `NEW_BANKS_REGISTERED.csv`

## Completion Checklist
- [x] Create the new bank files from upstream pass outputs.
- [x] Register all 43 banks in `backend/src/data_banks/manifest/bank_registry.any.json`.
- [x] Add all 43 aliases in `backend/src/data_banks/manifest/bank_aliases.any.json`.
- [x] Add all 43 dependency entries in `backend/src/data_banks/manifest/bank_dependencies.any.json`.
- [x] Update `backend/src/data_banks/document_intelligence/manifest/dependency_graph.any.json` with finance/accounting/legal/medical/ops domain nodes and DI dependencies.
- [x] Ensure every target bank has non-empty `_meta.owner`.
- [x] Ensure every target bank has non-empty `_meta.usedBy`.
- [x] Ensure every target bank has non-empty `_meta.tests`.
- [x] Ensure every target bank has top-level `runtimeUsageNotes`.
- [x] Normalize `_meta.usedBy` and `_meta.tests` so the referenced files actually exist.
- [x] Ensure checksum values in CSV and runtime registry stay consistent.
- [x] Verify no duplicate IDs across target set.
- [x] Register the 6 governance banks and add the `governance` category to the bank manifest.
- [x] Wire `governance_runtime_wiring_requirements` into runtime integrity checks.
- [x] Add a runtime certification test for the managed bank wave.
- [x] Regenerate `docs/bank-expansion/ORPHAN_CHECK_REPORT.md`.
- [x] Maintain canonical list in `docs/bank-expansion/NEW_BANKS_REGISTERED.csv`.
- [ ] Promote the 43 target banks to explicit production/staging `requiredByEnv` once selector/orchestrator adoption is real.
- [ ] Confirm direct non-test runtime callsite wiring for each new ID.
- [ ] Re-run broader document-intelligence orphan coverage after the unrelated 103-bank backlog is resolved.

## What is bank-complete vs runtime-complete
- Bank-complete: yes. All 43 are registered, checksummed, aliased, dependency-covered, and metadata-clean.
- Runtime-complete: no. The managed audit contract exists and the banks are audited at runtime, but direct non-test runtime source references for the 43-bank wave are still `0`.
