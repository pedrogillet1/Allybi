# Brain Terminal 1 Handoff

Files created
- backend/src/data_banks/document_intelligence/identity/system_base.any.json
- backend/src/data_banks/document_intelligence/identity/assistant_identity.any.json
- backend/src/data_banks/document_intelligence/identity/mission_and_non_goals.any.json
- backend/src/data_banks/document_intelligence/identity/behavioral_contract.any.json
- backend/src/data_banks/document_intelligence/identity/confidence_calibration.any.json
- backend/src/data_banks/document_intelligence/identity/help_and_capabilities.any.json
- backend/src/data_banks/document_intelligence/language/language_indicators.any.json
- backend/src/data_banks/document_intelligence/language/synonym_expansion.any.json
- backend/src/data_banks/document_intelligence/language/entity_aliases.any.json
- backend/src/data_banks/document_intelligence/language/colloquial_phrasing.any.json
- backend/src/data_banks/document_intelligence/language/misspelling_and_variant_map.any.json
- backend/src/data_banks/document_intelligence/routing/intent_patterns.any.json
- backend/src/data_banks/document_intelligence/routing/mode_switch.any.json
- backend/src/data_banks/document_intelligence/routing/one_best_question_policy.any.json
- backend/src/data_banks/document_intelligence/routing/navigation_intents.any.json
- backend/src/data_banks/document_intelligence/routing/integration_intents.any.json
- backend/src/data_banks/document_intelligence/routing/editing_intents.any.json
- backend/src/data_banks/document_intelligence/routing/calc_intents.any.json
- backend/src/data_banks/document_intelligence/scope/doc_lock_policy.any.json
- backend/src/data_banks/document_intelligence/scope/scope_resolution_rules.any.json
- backend/src/data_banks/document_intelligence/scope/folder_scope_patterns.any.json
- backend/src/data_banks/document_intelligence/scope/doc_reference_resolution.any.json
- backend/src/data_banks/document_intelligence/scope/multi_doc_compare_rules.any.json
- backend/src/data_banks/document_intelligence/scope/conversation_state_carryover.any.json
- backend/src/data_banks/document_intelligence/scope/project_memory_policy.any.json
- backend/src/data_banks/document_intelligence/scope/context_container_profiles.any.json

Files rewired
- backend/src/services/core/banks/documentIntelligenceBanks.service.ts
- backend/src/services/chat/turnRouter.service.ts
- backend/src/services/core/scope/scopeGate.service.ts
- backend/src/services/core/retrieval/retrievalEngine.service.ts
- backend/src/services/core/scope/documentReferenceResolver.service.ts

Tests added
- backend/src/services/core/banks/documentIntelligenceBanks.service.test.ts
- backend/src/services/chat/turnRouter.service.test.ts
- backend/src/services/core/scope/scopeGate.service.test.ts
- backend/src/services/core/scope/documentReferenceResolver.service.test.ts

Manifest changes needed by integration terminal
- Register new bank IDs for all files created under `document_intelligence/identity`, `document_intelligence/language`, `document_intelligence/routing`, and `document_intelligence/scope`.
- Add usage-manifest entries for runtime consumers:
  `documentIntelligenceBanks.service.ts`, `turnRouter.service.ts`, `scopeGate.service.ts`, `retrievalEngine.service.ts`, `documentReferenceResolver.service.ts`.
- Add runtime wiring gate entries for:
  `system_base`, `assistant_identity`, `mission_and_non_goals`, `behavioral_contract`, `confidence_calibration`, `help_and_capabilities`, `entity_aliases`, `colloquial_phrasing`, `misspelling_and_variant_map`, `intent_patterns`, `mode_switch`, `one_best_question_policy`, `navigation_intents`, `integration_intents`, `editing_intents`, `calc_intents`, `doc_reference_resolution`, `multi_doc_compare_rules`, `conversation_state_carryover`, `project_memory_policy`, `context_container_profiles`.

Unresolved blockers
- Without shared manifest registration, the newly created banks are not loadable by the global bank loader in integrated runtime; current code uses typed getters with fallback to already-registered legacy banks where possible.
- `mode_switch.any.json` is a compatibility bank; integrated runtime still depends on existing registered locale-specific pattern banks until the new ID is registered.
- `followup_policy.any.json` existing payload is answer-composition oriented; follow-up turn classification still relies on legacy `followup_indicators` semantics when present.
