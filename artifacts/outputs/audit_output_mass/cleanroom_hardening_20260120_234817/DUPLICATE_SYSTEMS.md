# Duplicate Systems Analysis - Cleanroom Hardening

## File Action Detection (4 IMPLEMENTATIONS!)

### 1. KodaOrchestratorV3 - `detectFileActionQuery()` (MOST USED)
**File**: `src/services/core/kodaOrchestratorV3.service.ts:6714-7077`

```typescript
private detectFileActionQuery(query: string): {
  isFileAction: boolean;
  subIntent: string | null;
  targetFileName: string | null;
}
```

**Problems**:
- Contains inline regex patterns (not bank-driven)
- 360+ lines of pattern matching logic
- Returns multiple sub-intents inline
- Used directly by orchestrator

### 2. ContentGuard - `isFileActionQuery()` (CORRECT APPROACH)
**File**: `src/services/core/contentGuard.service.ts:665-795`

```typescript
export function isFileActionQuery(query: string, language?: LanguageCode): boolean
```

**This is the CANONICAL implementation** because:
- Queries runtimePatterns (bank-driven)
- Single responsibility
- Returns clean boolean

### 3. RuntimePatterns - `isFileActionQuery()` (DATA LAYER)
**File**: `src/services/core/runtimePatterns.service.ts:293-360`

```typescript
isFileActionQuery(query: string, lang: string = 'en'): boolean
```

**Purpose**: Load and match patterns from JSON banks (correct data layer)

### 4. DecisionTree - Inline Pattern Check
**File**: `src/services/core/decisionTree.service.ts:233-242`

```typescript
const isFileActionPattern =
  runtimePatterns.isFileActionQuery(rawQuery, detectedLang) ||
  // Additional inline checks...
```

**Problem**: Additional inline checks bypass the bank

### CANONICAL CHOICE
**ContentGuard.isFileActionQuery** should be the ONLY caller.
- It should call `runtimePatterns.isFileActionQuery` internally
- All other callers should use ContentGuard

### REMOVAL LIST
1. Remove `detectFileActionQuery` from orchestrator
2. Have orchestrator call `contentGuard.isFileActionQuery` instead
3. Remove inline patterns from decisionTree

---

## Pattern Matching (3 SYSTEMS)

### 1. RuntimePatterns Service (CANONICAL)
**File**: `src/services/core/runtimePatterns.service.ts`

Loads patterns from:
- `data_banks/triggers/*.json`
- `data_banks/routing/*.json`
- `data/intent_patterns.runtime.json`

### 2. BrainDataLoader Service
**File**: `src/services/core/brainDataLoader.service.ts`

Loads patterns from:
- `data/brain_data.json`

**Problem**: Overlaps with runtimePatterns for keyword matching

### 3. IntentConfig Service
**File**: `src/services/core/intentConfig.service.ts`

Loads patterns from:
- `data/intent_patterns.json`

**Problem**: Separate pattern source from runtimePatterns

### CANONICAL CHOICE
All pattern loading should go through **RuntimePatterns Service**.
- IntentConfig and BrainData should be deprecated or merged
- Single compiled runtime JSON should be the source

---

## Done Event Emission (3 SYSTEMS)

### 1. AnswerComposerV1 (CORRECT)
**File**: `src/services/core/answerComposer.service.ts`

This is where ALL done events should be constructed.

### 2. KodaOrchestratorV3 (BYPASS!)
**File**: `src/services/core/kodaOrchestratorV3.service.ts`

Lines emitting done directly:
- 1323, 1742, 1862, 1970, 2110, 2186, 2219, 2244, 2389, 2436, 2912, 8593

### 3. KodaAnswerEngineV3 (BYPASS!)
**File**: `src/services/core/kodaAnswerEngineV3.service.ts`

Lines emitting done directly:
- 557, 585, 622, 755

### CANONICAL CHOICE
Only **AnswerComposerV1** should emit done events.
- Orchestrator should yield handler results
- Controller should call composer.compose() and emit

---

## Routing Decision (2 SYSTEMS)

### 1. RoutingPriority Service
**File**: `src/services/core/routingPriority.service.ts`

Priority-based routing with signal weighting.

### 2. DecisionTree Service
**File**: `src/services/core/decisionTree.service.ts`

Family/sub-intent tree routing.

### CANONICAL CHOICE
Keep both but clarify responsibilities:
- **RoutingPriority**: Signal aggregation (scoring)
- **DecisionTree**: Final routing decision (tree traversal)

---

## Scope Gating (2 SYSTEMS)

### 1. ScopeGate Service
**File**: `src/services/core/scopeGate.service.ts`

Determines document scope narrowing.

### 2. ContentGuard Service
**File**: `src/services/core/contentGuard.service.ts`

Classifies content vs file action queries.

### CANONICAL CHOICE
Keep both but clarify:
- **ContentGuard**: Query classification (content vs file)
- **ScopeGate**: Document scope decision (all vs filtered vs single)

---

## Format Enforcement (2 SYSTEMS)

### 1. ResponseContractEnforcer
**File**: `src/services/core/responseContractEnforcer.service.ts`

Validates response format against contract.

### 2. FormattingPipelineV3
**File**: `src/services/core/kodaFormattingPipelineV3.service.ts`

Applies markdown formatting.

### CANONICAL CHOICE
Keep both but in sequence:
1. **FormattingPipeline**: Apply formatting
2. **ResponseContractEnforcer**: Validate output

---

## Hardcoded Patterns Found

### In Orchestrator (MUST REMOVE)
```
/revenue|sales|income/.test(queryLower)    // line 3941
/expense|cost|spending/.test(queryLower)   // line 3944
/profit|margin/.test(queryLower)           // line 3947
/budget/.test(queryLower)                  // line 3950
/\d+\.\s*$/.test(content)                  // line 6005
```

### In DecisionTree (MUST REMOVE)
```typescript
const PATTERNS = { ... }  // line 97
```

### In LanguageEngine (MUST REMOVE)
```
'where is', 'where\'s', 'find file'       // lines 117-181
'onde está', 'onde fica'
'dónde está', 'donde esta'
```

These should all be in `data_banks/routing/routing_patterns.{en,pt}.json`

---

## Summary

| System | Implementations | Canonical |
|--------|-----------------|-----------|
| File Action Detection | 4 | contentGuard.isFileActionQuery |
| Pattern Matching | 3 | runtimePatterns |
| Done Emission | 3 | answerComposer |
| Routing | 2 | decisionTree (uses routingPriority) |
| Scope | 2 | scopeGate + contentGuard |
| Format | 2 | formattingPipeline + enforcer |
