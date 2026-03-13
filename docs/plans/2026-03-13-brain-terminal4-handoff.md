# Brain Terminal 4 Handoff

## Files created

- `backend/src/tests/certification/retrieval-brain-terminal4.cert.test.ts`
- `docs/plans/2026-03-13-brain-terminal4-handoff.md`

## Files rewired

- `backend/src/services/core/banks/documentIntelligenceBanks.service.ts`
  - Added terminal-4 retrieval accessors with fallback to already-registered banks:
    - `getRetrievalRankerConfig`
    - `getRetrievalQueryRewritePolicy`
    - `getRetrievalSectionBoostRules`
    - `getRetrievalTableBoostRules`
    - `getFieldLockPatterns`
    - `getQuoteSpanRules`
    - `getEvidenceBindingContract`
    - `getCrossDocSynthesisRules`
    - `getEvidencePackagingStrategies`
    - `getNegativeRetrievalPatterns`
- `backend/src/services/core/retrieval/retrievalEngine.service.ts`
  - Merged DI ranker config into runtime rank weighting.
  - Reused DI rewrite policy plus domain rewrites in query planning.
  - Reused section/table boost banks in ranking.
  - Reused negative retrieval patterns in suppression.
  - Added field-lock-aware boosting.
  - Added quote-span extraction for quoted evidence asks.
  - Added rich provenance packaging fields by default:
    - `page`
    - `slide`
    - `sheet`
    - `cell`
    - `section`
    - `locationLabel`
    - existing `locationKey` preserved
  - Reused cross-doc synthesis rules as the first cross-doc policy surface, falling back to existing grounding policy.

## Tests added

- `backend/src/tests/certification/retrieval-brain-terminal4.cert.test.ts`
  - proves provenance location richness
  - proves wrong-doc prevention under explicit doc lock
  - proves cross-doc compare gating and allowed compare behavior
  - proves quote span extraction
  - proves field-lock-sensitive evidence preference
  - proves irrelevant-source suppression

## Verification run

- `npm test -- --runInBand --runTestsByPath src/tests/certification/retrieval-brain-terminal4.cert.test.ts`
- `npm test -- --runInBand --runTestsByPath src/tests/certification/wrong-doc.cert.test.ts`

## Manifest changes needed by integration terminal

- None are required for the runtime wiring shipped here because this work intentionally reuses already-registered banks.
- Optional future registration work, if the integration terminal wants one-to-one terminal-4 ids instead of fallback mapping:
  - `query_rewrites`
  - `field_lock_patterns`
  - `quote_span_rules`
  - `evidence_binding_contract`
  - `cross_doc_synthesis_rules`
  - `evidence_packaging_strategies`

## Unresolved blockers

- Shared manifest files were explicitly out of scope, so terminal-4 bank names are normalized through accessor fallback instead of new registry entries.
- The workspace already contains unrelated in-flight modifications outside terminal 4 ownership; those were left untouched.
