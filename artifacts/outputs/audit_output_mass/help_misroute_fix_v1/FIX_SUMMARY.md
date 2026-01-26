# HELP MISROUTE FIX - SUMMARY

## Issue
Koda was incorrectly routing document-content questions to the HELP intent, returning generic product help responses like "Posso ajudá-lo com: Upload e gerenciamento de documentos..." instead of answering from document content.

## Root Causes Identified

1. **Conflicting Keywords in HELP Intent**
   - "guide/guia/guía" matched document names like "Integration Guide"
   - Generic phrases like "how to", "can you", "where is" matched both help and document queries

2. **Follow-up Inheritance Gap**
   - Short follow-up queries without explicit document keywords failed to inherit doc context
   - Queries like "E por quê?" (And why?) routed to help instead of continuing doc chain

3. **Decision Tree Gap**
   - No check for previousIntent before routing to help
   - Help patterns matched before document context was considered

## Fixes Implemented

### 1. Intent Patterns (`intent_patterns.runtime.json`)

**Removed conflicting keywords from HELP:**
- EN: Removed "guide", "how to", "how do i", "how can i", "where is", "where can i find", "can you", "can koda", "does koda", "is it possible"
- PT: Removed "guia", "como", "como faço", "como posso", "onde fica", "onde encontro", "como encontrar", "você pode", "koda pode", "é possível"
- ES: Removed "guía", "cómo", "cómo hago", "cómo puedo", "dónde está", "dónde encuentro", "cómo encontrar", "puedes", "koda puede", "es posible"

**Added specific Koda-only help keywords:**
- EN: "how to use koda", "koda features", "how do i use koda", "how does koda work", "can koda upload", "can koda download", "what can koda do"
- PT: "como usar koda", "recursos do koda", "como funciona koda", "o que koda pode fazer"
- ES: "cómo usar koda", "recursos de koda", "cómo funciona koda", "qué puede hacer koda"

**Narrowed patterns:**
- Removed `\b(tutorial|guide|getting\s+started)\b` → `\b(tutorial|getting\s+started)\b`
- Removed `\b(tutorial|guia|começar)\b` → `\b(tutorial|começar)\b`
- Changed overly broad pattern `^(can|does)\s+(koda|you)\s+\w+\s*(\?)?$` to specific `^(can|does)\s+(koda|you)\s+(upload|download|import|export|read|support)\b`

### 2. Routing Priority Service (`routingPriority.service.ts`)

**Added HARD HELP BLOCKER (lines 803-837):**
```typescript
// P1 FIX: HARD HELP BLOCKER (HELP MISROUTE FIX)
// When previousIntent was document-related AND no explicit help trigger,
// HARD BLOCK help intent. User asking follow-ups about docs should NEVER
// get the help/identity template.

const DOC_FAMILY_INTENTS: IntentName[] = ['documents', 'extraction', 'reasoning', 'excel', 'finance', 'legal', 'medical', 'engineering', 'accounting'];
const wasDocumentContext = context.previousIntent && DOC_FAMILY_INTENTS.includes(context.previousIntent);

// Explicit help triggers - ONLY these should allow help to win
const EXPLICIT_HELP_TRIGGERS = [
  'help', 'ajuda', 'ayuda',
  'how do i use koda', 'como usar koda', 'cómo usar koda',
  // ... etc
];

if (wasDocumentContext && !hasExplicitHelpTrigger && context.hasDocuments) {
  helpScoreToBlock.confidence = 0; // HARD BLOCK
}
```

### 3. Decision Tree Service (`decisionTree.service.ts`)

**Added previousIntent check:**
- Added `previousIntent?: IntentName` to `DecisionSignals` interface
- Added doc family intent check in `determineFamily()` function
- When previous intent was document-related and user has docs, routes to documents instead of help

**Explicit help keyword detection:**
```typescript
const hasExplicitHelpKeyword = /\b(help|ajuda|ayuda)\b/i.test(text) ||
  /\bhow\s+do\s+i\s+use\s+koda\b/i.test(text) ||
  /\bcomo\s+usar\s+koda\b/i.test(text) ||
  /\bwhat\s+is\s+koda\b/i.test(text) ||
  /\bo\s+que\s+.{0,3}\s*koda\b/i.test(text) ||
  /\bqué\s+es\s+koda\b/i.test(text) ||
  /\bupload\b/i.test(text);
```

### 4. Orchestrator (`kodaOrchestratorV3.service.ts`)

**Passing previousIntent to decision tree:**
```typescript
const decisionSignals: DecisionSignals = {
  predicted: finalIntent,
  hasDocs,
  isRewrite: false,
  isFollowup: !!request.conversationId,
  previousIntent, // P1 FIX: Block help template when previous turn was document-related
};
```

## Test Suite Added

Created `helpMisrouteRegression.test.ts` with 51 tests covering:

1. **Document follow-up queries should NOT route to help** (12 tests)
2. **Guide-reference queries should NOT route to help** (5 tests)
3. **Implicit document context queries should NOT route to help** (6 tests)
4. **Explicit help requests should STILL route to help** (12 tests)
5. **First-turn document queries should NOT route to help** (3 tests)
6. **Product usage queries should route to help** (4 tests)
7. **Intent pattern keyword verification** (9 tests)

## Files Modified

| File | Changes |
|------|---------|
| `src/data/intent_patterns.runtime.json` | Removed conflicting keywords, narrowed patterns |
| `src/services/core/routingPriority.service.ts` | Added HARD HELP BLOCKER |
| `src/services/core/decisionTree.service.ts` | Added previousIntent check, explicit help detection |
| `src/services/core/kodaOrchestratorV3.service.ts` | Pass previousIntent to decision tree |
| `src/tests/helpMisrouteRegression.test.ts` | NEW: 51 regression tests |

## Verification

Run the regression tests:
```bash
npx jest helpMisrouteRegression --no-coverage
```

Expected: 51 tests pass

## Rollback Instructions

If issues arise:
```bash
git checkout HEAD -- src/data/intent_patterns.runtime.json
git checkout HEAD -- src/services/core/routingPriority.service.ts
git checkout HEAD -- src/services/core/decisionTree.service.ts
git checkout HEAD -- src/services/core/kodaOrchestratorV3.service.ts
rm src/tests/helpMisrouteRegression.test.ts
```
