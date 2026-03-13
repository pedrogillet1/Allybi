# Domain Deepening Implementation

## Scope

Implemented domain-native interpretive and validation-rich behavior for:

- `backend/src/data_banks/document_intelligence/domains/finance/domain_writer.any.json`
- `backend/src/data_banks/document_intelligence/domains/finance/ambiguity_patterns.any.json`
- `backend/src/data_banks/document_intelligence/domains/finance/validation_rules.any.json`
- `backend/src/data_banks/document_intelligence/domains/finance/gold_queries.any.json`
- `backend/src/data_banks/document_intelligence/domains/accounting/domain_writer.any.json`
- `backend/src/data_banks/document_intelligence/domains/accounting/ambiguity_patterns.any.json`
- `backend/src/data_banks/document_intelligence/domains/accounting/validation_rules.any.json`
- `backend/src/data_banks/document_intelligence/domains/accounting/gold_queries.any.json`
- `backend/src/data_banks/document_intelligence/domains/legal/domain_writer.any.json`
- `backend/src/data_banks/document_intelligence/domains/legal/ambiguity_patterns.any.json`
- `backend/src/data_banks/document_intelligence/domains/legal/validation_rules.any.json`
- `backend/src/data_banks/document_intelligence/domains/legal/gold_queries.any.json`
- `backend/src/data_banks/document_intelligence/domains/medical/domain_writer.any.json`
- `backend/src/data_banks/document_intelligence/domains/medical/ambiguity_patterns.any.json`
- `backend/src/data_banks/document_intelligence/domains/medical/validation_rules.any.json`
- `backend/src/data_banks/document_intelligence/domains/medical/gold_queries.any.json`
- `backend/src/data_banks/document_intelligence/domains/ops/domain_writer.any.json` (rewritten)
- `backend/src/data_banks/document_intelligence/domains/ops/ambiguity_patterns.any.json` (added)
- `backend/src/data_banks/document_intelligence/domains/ops/validation_rules.any.json` (added)
- `backend/src/data_banks/document_intelligence/domains/ops/gold_queries.any.json` (added)

## Behavioral Outcomes

### Finance, Accounting, Medical, and Legal

- Kept and hardened existing domain-native interpretation posture from the stronger current packs:
  - role and basis locks before synthesis,
  - explicit lifecycle/context binding,
  - table/axis confidence handling,
  - prohibition of unsafe substitutions,
  - cautious legal/clinical language boundaries.
- Verified all files expose runtime metadata (`usedBy`, `runtimeUsageNotes`, emitted signal hints) and scenario-level `tests`.

### Operations (Gap Completion)

- Replaced the operations writer with a readiness-first interpretive profile that:
  - separates lifecycle statuses (requested/open/in-progress/blocked/completed),
  - binds actor roles (requestor, assignee, approver, reviewer, consignee),
  - forces source and window lock for cross-doc synthesis,
  - makes incident, shipping, maintenance, SLA, and quality reporting interpretive rather than extractive.
- Added missing domain ambiguity pack focused on:
  - actor-role collision,
  - status-window ambiguity,
  - date-axis selection,
  - shipment route vs aggregate interpretation,
  - quality non-conformance scoping.
- Added validation rules with explicit forbidden/allowed substitutions:
  - open/closed blending,
  - ownerless blocker claims,
  - planned-vs-completion date drift,
  - cross-doc work-order/maintenance-log merge without linkage,
  - shipping route context omissions.
- Added domain gold queries covering:
  - overdue work orders with actor ownership,
  - SLA breach interpretation with threshold methodology,
  - incident timeline and corrective status,
  - bilingual manifest variance checks.

## Metadata and Runtime Surfacing

All edited/added files include:

- `_meta` metadata with IDs, versions, language coverage, ownership, and test references.
- `config` execution intent (`enabled`, `deterministic`, domain binding, ambiguity limits where applicable).
- `runtimeUsageNotes` with stage/consumer/intent and emitted or consumed signals.

## Test Coverage References

- Existing tests already referenced in these banks:
  - `tests/patternWiringProof.test.ts`
  - `tests/document-intelligence/docint-eval-pack.test.ts`
  - `tests/document-intelligence/ambiguity-domain.test.ts`
  - `tests/document-intelligence/domain-validation.test.ts`
- Gold pack execution references:
  - `services/eval/goldQueryRunner.service.ts`

## Verification Notes

- Ran JSON parse validation over all domain writer, ambiguity, validation, and gold files for finance/accounting/legal/medical/ops.
- Fixed one syntax issue in legal writer (missing comma before `requiredFor` in interpretive rule `LEGAL_WRITER_008_dispute_grounding`).
