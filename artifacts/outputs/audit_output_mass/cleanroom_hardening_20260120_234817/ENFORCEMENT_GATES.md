# Enforcement Gates - Cleanroom Hardening

## Existing Gates (Already Implemented)

### 1. no_done_bypass
**Script**: `scripts/no_done_bypass.js`
**Command**: `npm run lint:done`
**Status**: PASSING (with legacy allowlist)

**What it checks**:
- Scans all .ts files for `type: 'done'` emissions
- Allowlisted: `answerComposer.service.ts`, `rag.controller.ts`
- Legacy allowlisted (needs refactor): `kodaOrchestratorV3.service.ts`, `kodaAnswerEngineV3.service.ts`

**Result**: PASS (no unauthorized emissions)

### 2. lint-routing-priority
**Script**: `scripts/lint-routing-priority.mjs`
**Command**: `npm run lint:routing`
**Status**: PASSING

**What it checks**:
- Verifies `routingPriority.service.ts` uses bank-driven signals
- No inline regex patterns allowed

**Result**: PASS (clean - uses RoutingSignals)

---

## Gates to Add

### 3. no_hardcoded_patterns (NEW)
**Script**: `scripts/no_hardcoded_patterns.js`
**Command**: `npm run lint:patterns`

**Forbidden files** (should have NO inline regex):
- `src/services/core/kodaOrchestratorV3.service.ts`
- `src/services/core/decisionTree.service.ts`
- `src/services/core/routingPriority.service.ts`
- `src/services/core/kodaFormattingPipelineV3.service.ts`

**Allowed files** (may have regex for parsing):
- `src/services/core/runtimePatterns.service.ts` (loads patterns)
- `src/services/core/operatorResolver.service.ts` (compiles patterns)
- `src/services/core/languageDetector.service.ts` (language patterns)

**Banned patterns** (in forbidden files):
```
/revenue|sales|income/
/expense|cost|spending/
/profit|margin/
/budget/
/onde está|onde fica/
/where is|where's/
/dónde está/
/Here (are|is)/
/Key points/
/I found/
/As an AI/
/Liste|Mostre apenas/
```

### 4. composer_stamp_gate (NEW)
**Script**: `scripts/composer_stamp_gate.js`
**Command**: `npm run lint:composer`

**What it checks**:
- Every done event in tests MUST have `composedBy: 'AnswerComposerV1'`
- Any done event without stamp is a violation

### 5. bank_completeness_gate (NEW)
**Script**: `scripts/bank_completeness_gate.js`
**Command**: `npm run lint:banks`

**What it checks**:
- Required banks exist for EN and PT
- No empty arrays in required sections
- All operators have patterns in both languages

---

## Build Integration

### Current package.json scripts:
```json
{
  "build": "prisma generate && tsc && cp -r src/data dist/",
  "build:runtime-patterns": "ts-node --transpile-only tools/build/compile_runtime_patterns.ts",
  "lint:done": "node scripts/no_done_bypass.js",
  "lint:routing": "node scripts/lint-routing-priority.mjs",
  "check:all": "npm run typecheck && npm run lint && npm run lint:routing && npm run lint:done && npm run format:check"
}
```

### Recommended package.json scripts:
```json
{
  "build": "npm run lint:gates && prisma generate && tsc && cp -r src/data dist/",
  "build:runtime-patterns": "ts-node --transpile-only tools/build/compile_runtime_patterns.ts",
  "lint:done": "node scripts/no_done_bypass.js",
  "lint:done:strict": "node scripts/no_done_bypass.js --strict",
  "lint:routing": "node scripts/lint-routing-priority.mjs",
  "lint:patterns": "node scripts/no_hardcoded_patterns.js",
  "lint:composer": "node scripts/composer_stamp_gate.js",
  "lint:banks": "node scripts/bank_completeness_gate.js",
  "lint:gates": "npm run lint:done && npm run lint:routing && npm run lint:patterns",
  "check:all": "npm run typecheck && npm run lint && npm run lint:gates && npm run format:check"
}
```

---

## Gate Exit Criteria

| Gate | Pass Condition |
|------|----------------|
| no_done_bypass | 0 violations (legacy allowlist OK for now) |
| lint-routing-priority | 0 forbidden patterns |
| no_hardcoded_patterns | 0 inline regex in forbidden files |
| composer_stamp_gate | 100% done events have composedBy stamp |
| bank_completeness_gate | All required banks populated |

---

## Implementation Notes

### For no_hardcoded_patterns.js:

```javascript
const FORBIDDEN_FILES = [
  'src/services/core/kodaOrchestratorV3.service.ts',
  'src/services/core/decisionTree.service.ts',
];

const BANNED_PATTERNS = [
  /\/revenue\|sales\|income\//,
  /\/onde está\|onde fica\//,
  /\/where is\|where's\//,
  /\/Here (are|is)\//,
  /\/As an AI\//,
];

// Scan forbidden files for banned patterns
// Exit 1 if any found
```

### For composer_stamp_gate.js:

```javascript
// Scan test result JSONLs for done events
// Every done event must have composedBy: 'AnswerComposerV1'
// Exit 1 if any missing
```

---

## Current Status

| Gate | Status | Notes |
|------|--------|-------|
| no_done_bypass | ✅ PASS | Legacy files allowlisted |
| lint-routing-priority | ✅ PASS | Clean |
| no_hardcoded_patterns | 🔴 NOT IMPLEMENTED | |
| composer_stamp_gate | 🔴 NOT IMPLEMENTED | |
| bank_completeness_gate | 🔴 NOT IMPLEMENTED | |

---

## Recommended Action

1. Wire existing gates into build: `"build": "npm run lint:gates && ..."`
2. Implement `no_hardcoded_patterns.js`
3. Run gates before every test ladder
4. Fail CI if any gate fails
