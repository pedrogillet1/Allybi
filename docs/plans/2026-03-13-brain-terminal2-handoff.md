# Terminal 2 Handoff

Files created
- `backend/src/data_banks/document_intelligence/semantics/field_role_ontology.any.json`
- `backend/src/services/core/retrieval/retrievalEngine.semantic-banks.test.ts`
- `docs/plans/2026-03-13-brain-terminal2-handoff.md`

Files rewired
- `backend/src/services/core/banks/bankSchemas.ts`
- `backend/src/services/core/banks/documentIntelligenceBanks.service.ts`
- `backend/src/services/core/banks/documentIntelligenceBanks.service.test.ts`
- `backend/src/services/core/retrieval/retrievalEngine.service.ts`

Tests added
- `backend/src/services/core/retrieval/retrievalEngine.semantic-banks.test.ts`
- extended `backend/src/services/core/banks/documentIntelligenceBanks.service.test.ts`

Manifest changes needed by integration terminal
- Register `field_role_ontology` if it is not already present in the shared registry path and runtime loader inputs.
- No shared manifest files were edited in this change set.

New or renamed bank ids
- New: `field_role_ontology`
- Reused: `di_domain_ontology`
- Reused: `di_doc_type_ontology`
- Reused: `di_section_ontology`
- Reused: `di_metric_ontology`
- Reused: `di_unit_and_measurement_ontology`
- Reused: `headings_map`
- Reused: `layout_cues`
- Reused: `table_header_ontology_<domain>`

Unresolved blockers
- The existing DI semantic JSON banks are heavily synthetic and not yet business-realistic. Runtime wiring now consumes them, but ontology quality still depends on future normalization of source content.
- `field_role_ontology` is runtime-wired through retrieval, but integration still needs to register it in the shared bank registry path owned by another terminal.
