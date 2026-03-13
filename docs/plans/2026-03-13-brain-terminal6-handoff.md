# Terminal 6 Handoff

Files created:
- `backend/src/data_banks/document_intelligence/repair/clarification_question_bank.any.json`
- `backend/src/data_banks/document_intelligence/repair/not_enough_evidence.any.json`
- `backend/src/data_banks/document_intelligence/repair/partial_answer_recovery.any.json`
- `backend/src/modules/chat/runtime/documentIntelligenceCompositionBrain.service.ts`
- `backend/src/modules/chat/runtime/documentIntelligenceCompositionBrain.service.test.ts`

Files rewired:
- `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts`
- `backend/src/services/llm/core/llmRequestBuilder.service.ts`
- `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.truncation.test.ts`
- `backend/src/services/llm/core/llmRequestBuilder.service.test.ts`

Tests added:
- `backend/src/modules/chat/runtime/documentIntelligenceCompositionBrain.service.test.ts`
- Additional assertions in `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.truncation.test.ts`
- Additional assertions in `backend/src/services/llm/core/llmRequestBuilder.service.test.ts`

Manifest changes needed by integration terminal:
- Register `clarification_question_bank`
- Register `not_enough_evidence`
- Register `partial_answer_recovery`
- Add usage-manifest/runtime-wiring entries for `documentIntelligenceCompositionBrain.service.ts`

Unresolved blockers:
- Shared manifest ownership prevented canonical registration of new repair banks in this terminal.
- Existing compose-bank names requested by the prompt were not all available as canonical loader-visible banks, so runtime wiring currently reuses existing canonical compose banks and only locally loads the new repair files above.
