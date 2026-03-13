# Terminal 5 Handoff - 2026-03-13

## Files created

- `backend/src/data_banks/document_intelligence/validation/claim_strength_matrix.any.json`
- `backend/src/data_banks/document_intelligence/validation/field_exactness_rules.any.json`
- `backend/src/data_banks/document_intelligence/validation/conflict_resolution_rules.any.json`
- `backend/src/data_banks/document_intelligence/validation/table_integrity_rules.any.json`
- `backend/src/data_banks/document_intelligence/validation/high_stakes_response_rules.any.json`
- `backend/src/data_banks/document_intelligence/safety/sensitive_content_rules.any.json`
- `backend/src/data_banks/document_intelligence/safety/legal_privilege_rules.any.json`
- `backend/src/data_banks/document_intelligence/safety/medical_safety_boundaries.any.json`
- `backend/src/data_banks/document_intelligence/safety/privacy_minimal.any.json`
- `backend/src/data_banks/document_intelligence/safety/retention_and_deletion_policy.any.json`
- `backend/src/data_banks/document_intelligence/safety/access_scope_rules.any.json`

## Files rewired

- `backend/src/services/core/banks/documentIntelligenceBanks.service.ts`
  - Extended `DocumentIntelligenceQualityGateType`.
  - Added canonical fallback resolution so enforcement can request terminal-5 banks while reusing existing canonical banks where available.
- `backend/src/services/core/enforcement/qualityGateRunner.service.ts`
  - Moved exactness/trust checks onto bank-backed rule execution for:
    - `claim_strength_matrix`
    - `fact_type_requirements`
    - `field_exactness_rules`
    - `conflict_resolution_rules`
    - `table_integrity_rules`
    - `numeric_reconciliation_rules`
    - `unsafe_inference_rules`
    - `high_stakes_response_rules`
    - `medical_safety_boundaries`
  - Replaced direct PII regex-only gating with `pii_patterns` plus `sensitive_content_rules` selection.
  - Rewired `privacy_minimal` gate to prefer bank-driven pattern sources.
  - Added resolved domain into DI policy scope so bank rules can reason on `context.domain`.

## Tests added or updated

- `backend/src/services/core/enforcement/qualityGateRunner.service.test.ts`
  - Added proof coverage for exact fact vs inference labeling.
  - Added proof coverage for numeric reconciliation.
  - Added proof coverage for field exactness.
  - Added proof coverage for PII redaction gating.
  - Added proof coverage for medical high-stakes guardrails.
  - Added proof coverage for bilingual language mismatch handling.
  - Existing wrong-doc-lock coverage remains active and still passes.

## Manifest changes needed by integration terminal

- Register these new bank files in shared manifests, especially:
  - `backend/src/data_banks/manifest/bank_registry.any.json`
  - Any checksum, dependency, alias, and usage manifest files required by the integration workflow
- Ensure the new ids are loaded at runtime:
  - `claim_strength_matrix`
  - `field_exactness_rules`
  - `conflict_resolution_rules`
  - `table_integrity_rules`
  - `high_stakes_response_rules`
  - `sensitive_content_rules`
  - `legal_privilege_rules`
  - `medical_safety_boundaries`
  - `privacy_minimal`
  - `retention_and_deletion_policy`
  - `access_scope_rules`
- Decide whether the new shims should remain distinct canonical ids or be aliased to existing global banks such as:
  - `privacy_minimal_rules`
  - global `medical_safety_boundaries`
  - existing contradiction/table evidence policies

## Unresolved blockers

- Shared manifest/governance files were explicitly out of scope for Terminal 5, so the new bank files are not yet registered for real loader startup.
- Runtime behavior is rewired and covered by tests through bank consumers, but full production loading of the new files depends on the integration terminal registering them.
- Some requested policy areas were normalized through canonical fallback rather than duplicating truth:
  - privacy minimal
  - medical safety boundaries
  - contradiction/conflict handling
  - table evidence integrity
