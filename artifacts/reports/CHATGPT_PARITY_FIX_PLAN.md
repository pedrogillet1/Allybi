# ChatGPT Parity Fix Plan - Complete Implementation Guide

## Diagnosis Summary

| Issue | Root Cause | Severity |
|-------|------------|----------|
| sourceButtons not showing in UI | Frontend not rendering `done.sourceButtons` | CRITICAL |
| Content questions → file_actions | Missing negative blockers for "topics", "summarize" | CRITICAL |
| Mixed bullet formatting (`-` + `2.`) | Formatting pipeline not normalizing list types | HIGH |
| Inventory shows "You have 48 files:" | Should be buttons-only, no text content | MEDIUM |
| "Note: Only X items found" in content | Debug info leaking into user-visible answer | MEDIUM |
| Answers ending with "..." | No completion gate before emitting done | HIGH |

---

## PHASE 1: Frontend - Render sourceButtons (CRITICAL)

### File: `frontend/src/components/ChatInterface.jsx`

**Problem:** Backend emits `sourceButtons` in done event but frontend doesn't render them.

**Fix Location:** Message rendering section (~line 2200-2400)

**What to add:**

```jsx
// After rendering message.content, check for sourceButtons
{message.sourceButtons?.buttons?.length > 0 && (
  <div className="source-buttons-container mt-3">
    <div className="flex flex-wrap gap-2">
      {message.sourceButtons.buttons.slice(0, 10).map((btn, idx) => (
        <button
          key={btn.documentId || idx}
          onClick={() => handleOpenDocument(btn.documentId)}
          className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-50
                     text-blue-700 rounded-full hover:bg-blue-100 transition-colors"
        >
          <DocumentIcon className="w-4 h-4 mr-1.5" />
          {btn.title}
        </button>
      ))}
      {message.sourceButtons.seeAll && (
        <button
          onClick={() => handleShowAllFiles()}
          className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100
                     text-gray-600 rounded-full hover:bg-gray-200"
        >
          See all ({message.sourceButtons.seeAll.totalCount})
        </button>
      )}
    </div>
  </div>
)}
```

**Also needed:** Store sourceButtons from done event in message state:

```jsx
// In handleDoneEvent or where done is processed:
setMessages(prev => prev.map(msg =>
  msg.id === assistantMessageId
    ? { ...msg, sourceButtons: doneEvent.sourceButtons, fileList: doneEvent.fileList }
    : msg
));
```

---

## PHASE 2: Routing - Add Negative Blockers (CRITICAL)

### File: `backend/src/services/core/routingPriority.service.ts`

**Problem:** Queries like "What are the main topics in X presentation?" route to `file_actions` because "presentation" triggers file listing.

**Fix:** Add CONTENT_VERB_BLOCKERS that override file_actions routing.

**Add at top of file (~line 30):**

```typescript
/**
 * CONTENT VERBS - These BLOCK file_actions even if file keywords present
 * If query contains these + a document reference, it's a CONTENT question
 */
const CONTENT_VERB_PATTERNS = [
  /\b(what|which)\s+(are|is|does)\s+(the\s+)?(main|key|primary)\s+(topics?|points?|themes?|ideas?)/i,
  /\b(summarize|summary|explain|describe|analyze|review|extract)\b/i,
  /\b(what\s+does|what\s+is|tell\s+me\s+about)\b.*\b(cover|discuss|contain|say|mention)/i,
  /\b(key\s+points?|main\s+points?|takeaways?|highlights?)\b/i,
  /\bcontent\s+of\b/i,
  /\b(chapters?|sections?|topics?)\s+(in|of|from)\b/i,
];

function hasContentVerb(query: string): boolean {
  return CONTENT_VERB_PATTERNS.some(p => p.test(query));
}
```

**Modify `adjustScores()` method (~line 330):**

```typescript
// BEFORE boosting file_actions, check for content verbs
if (hasContentVerb(query)) {
  // Content question - BLOCK file_actions, BOOST documents
  scores['file_actions'] = Math.max(0, (scores['file_actions'] || 0) - 0.6);
  scores['documents'] = (scores['documents'] || 0) + 0.4;
  this.logger?.debug('[RoutingPriority] Content verb detected - blocking file_actions');
}
```

---

## PHASE 3: Inventory Responses - Buttons Only (MEDIUM)

### File: `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Problem:** Inventory queries return "You have 48 file(s):" as text content. Should be buttons-only.

**Fix Location:** `composeFileListResponse()` method (~line 2500)

**Change:**

```typescript
// BEFORE (wrong):
return {
  answer: `You have ${count} file(s):`,
  sourceButtons: buildSourceButtons(files),
};

// AFTER (correct - ChatGPT style):
return {
  answer: '', // NO text content for inventory
  formatted: '', // NO formatted content
  sourceButtons: buildSourceButtons(files, {
    label: `${count} file${count !== 1 ? 's' : ''}`,
    showSeeAll: count > 10
  }),
  constraints: { buttonsOnly: true }, // Signal to frontend
};
```

---

## PHASE 4: Formatting Pipeline - Fix Mixed Bullets (HIGH)

### File: `backend/src/services/core/kodaFormattingPipelineV3.service.ts`

**Problem:** Output mixes `-` bullets with `2.` `3.` numbered items.

**Root Cause:** Partial list repair that inserts numbers without converting the whole list.

**Fix:** Add list normalization pass that ensures consistent list type.

**Add method (~line 200):**

```typescript
/**
 * Normalize list formatting - ensure consistent bullet or number style
 */
private normalizeListFormatting(text: string): string {
  const lines = text.split('\n');

  // Detect predominant list style
  let bulletCount = 0;
  let numberCount = 0;

  lines.forEach(line => {
    if (/^\s*[-•*]\s/.test(line)) bulletCount++;
    if (/^\s*\d+[.)]\s/.test(line)) numberCount++;
  });

  // If mixed, convert all to the predominant style
  if (bulletCount > 0 && numberCount > 0) {
    const useBullets = bulletCount >= numberCount;
    let itemNumber = 1;

    return lines.map(line => {
      // Convert numbered to bullet
      if (useBullets && /^\s*\d+[.)]\s/.test(line)) {
        return line.replace(/^\s*\d+[.)]\s/, '- ');
      }
      // Convert bullet to numbered
      if (!useBullets && /^\s*[-•*]\s/.test(line)) {
        return line.replace(/^\s*[-•*]\s/, `${itemNumber++}. `);
      }
      return line;
    }).join('\n');
  }

  return text;
}
```

**Call this in the main format method:**

```typescript
// In formatResponse() or equivalent:
let formatted = this.generateResponse(chunks, query, constraints);
formatted = this.normalizeListFormatting(formatted);
formatted = this.enforceConstraints(formatted, constraints);
return formatted;
```

---

## PHASE 5: Completion Gate (HIGH)

### File: `backend/src/services/core/completionGate.service.ts` (NEW)

**Purpose:** Never emit incomplete/truncated answers.

```typescript
/**
 * Completion Gate Service
 *
 * Validates answer completeness before SSE done emission.
 * Prevents truncated answers, dangling list items, and broken formatting.
 */

export interface CompletionCheckResult {
  isComplete: boolean;
  issues: string[];
  canRepair: boolean;
}

export interface CompletionConstraints {
  exactBullets?: number;
  exactNumbers?: number;
  maxSentences?: number;
  requireTable?: boolean;
}

export class CompletionGateService {

  /**
   * Check if answer is complete and well-formed
   */
  checkCompletion(answer: string, constraints?: CompletionConstraints): CompletionCheckResult {
    const issues: string[] = [];

    // Check 1: Truncation signals
    if (answer.endsWith('...') || answer.endsWith('…')) {
      issues.push('TRUNCATED: Ends with ellipsis');
    }

    // Check 2: Dangling list markers
    if (/\n\s*[-•*]\s*$/.test(answer) || /\n\s*\d+[.)]\s*$/.test(answer)) {
      issues.push('DANGLING_LIST: Ends with empty list item');
    }

    // Check 3: Mid-sentence ending (no terminal punctuation)
    const lastChar = answer.trim().slice(-1);
    if (!/[.!?:)\]"]/.test(lastChar) && answer.length > 50) {
      issues.push('MID_SENTENCE: Does not end with terminal punctuation');
    }

    // Check 4: Constraint validation
    if (constraints?.exactBullets) {
      const bulletCount = (answer.match(/^\s*[-•*]\s/gm) || []).length;
      if (bulletCount !== constraints.exactBullets) {
        issues.push(`BULLETS_MISMATCH: Expected ${constraints.exactBullets}, got ${bulletCount}`);
      }
    }

    if (constraints?.exactNumbers) {
      const numberCount = (answer.match(/^\s*\d+[.)]\s/gm) || []).length;
      if (numberCount !== constraints.exactNumbers) {
        issues.push(`NUMBERS_MISMATCH: Expected ${constraints.exactNumbers}, got ${numberCount}`);
      }
    }

    if (constraints?.requireTable) {
      const hasTable = /\|.*\|/.test(answer) && /\|[-:]+\|/.test(answer);
      if (!hasTable) {
        issues.push('TABLE_MISSING: Table was requested but not found');
      }
    }

    // Check 5: Debug info leakage
    if (/Note:\s*Only\s*\d+\s*items?\s*(were|was)\s*found/i.test(answer)) {
      issues.push('DEBUG_LEAK: "Only X items found" note in content');
    }

    return {
      isComplete: issues.length === 0,
      issues,
      canRepair: issues.every(i =>
        i.startsWith('BULLETS_MISMATCH') ||
        i.startsWith('DEBUG_LEAK') ||
        i.startsWith('DANGLING_LIST')
      ),
    };
  }

  /**
   * Attempt to repair minor completion issues
   */
  repairAnswer(answer: string, issues: string[]): string {
    let repaired = answer;

    // Remove debug notes
    if (issues.some(i => i.startsWith('DEBUG_LEAK'))) {
      repaired = repaired.replace(/\n?\s*\*?Note:\s*Only\s*\d+\s*items?\s*(were|was)\s*found[^.]*\.?\s*\*?/gi, '');
    }

    // Remove dangling list markers
    if (issues.some(i => i.startsWith('DANGLING_LIST'))) {
      repaired = repaired.replace(/\n\s*[-•*\d.]+\s*$/g, '');
    }

    // Remove trailing ellipsis (but flag for continuation)
    if (issues.some(i => i.startsWith('TRUNCATED'))) {
      repaired = repaired.replace(/\.{3,}$|…$/g, '.');
    }

    return repaired.trim();
  }
}

export const completionGate = new CompletionGateService();
```

### Integrate in Orchestrator

**File:** `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Add before returning answer (~line 3000):**

```typescript
import { completionGate } from './completionGate.service';

// Before emitting done:
const completionCheck = completionGate.checkCompletion(answer, constraints);

if (!completionCheck.isComplete) {
  if (completionCheck.canRepair) {
    answer = completionGate.repairAnswer(answer, completionCheck.issues);
  } else {
    // Log warning but still return - don't block user
    console.warn('[CompletionGate] Incomplete answer:', completionCheck.issues);
  }
}
```

---

## PHASE 6: Remove Debug Info from Content (MEDIUM)

### File: `backend/src/services/core/kodaAnswerEngineV3.service.ts`

**Problem:** "Note: Only X items were found" appears in user-visible content.

**Fix:** Move to metadata, not content.

**Find and modify (~line 800):**

```typescript
// BEFORE (wrong):
if (itemCount < requestedCount) {
  answer += `\n\n*Note: Only ${itemCount} items were found in the documents (${requestedCount} were requested).*`;
}

// AFTER (correct):
if (itemCount < requestedCount) {
  // Store in metadata, not content
  metadata.warnings = metadata.warnings || [];
  metadata.warnings.push({
    type: 'insufficient_items',
    found: itemCount,
    requested: requestedCount,
  });
  // Optionally add a CLEAN user-facing note (no "Note:" prefix)
  // answer += `\n\nBased on the available information, ${itemCount} relevant points were identified.`;
}
```

---

## PHASE 7: Replace Truncation with See All (MEDIUM)

### File: `backend/src/services/core/kodaFormattingPipelineV3.service.ts`

**Problem:** Long lists end with `...` instead of proper See All.

**Fix:** When truncating, always use attachment pattern.

```typescript
// When list exceeds maxItems:
if (items.length > maxItems) {
  const visibleItems = items.slice(0, maxItems);
  const remaining = items.length - maxItems;

  return {
    content: formatAsList(visibleItems), // NO ellipsis
    seeAll: {
      label: `See all ${items.length} items`,
      remainingCount: remaining,
      items: items, // Full list for expansion
    },
  };
}
```

---

## PHASE 8: Fix File Actions - Buttons Only (MEDIUM)

### File: `backend/src/services/core/kodaOrchestratorV3.service.ts`

**Location:** `handleFileActions()` method (~line 7500)

**Ensure file actions return ONLY buttons, NO text content:**

```typescript
// For "where is X", "open X", "find X":
return {
  answer: '', // EMPTY - no text for file actions
  formatted: '',
  sourceButtons: {
    type: 'source_buttons',
    buttons: matchedFiles.map(f => ({
      documentId: f.id,
      title: f.filename,
      mimeType: f.mimeType,
      action: actionType, // 'open' | 'preview' | 'locate'
    })),
  },
  constraints: { buttonsOnly: true },
  metadata: {
    intent: 'file_actions',
    action: actionType,
  },
};
```

---

## Implementation Order

1. **PHASE 4: Routing Negative Blockers** - Fixes misrouting (30 min)
2. **PHASE 1: Frontend sourceButtons** - Makes buttons visible (45 min)
3. **PHASE 6: Formatting Pipeline** - Fixes mixed bullets (30 min)
4. **PHASE 5: Completion Gate** - Prevents truncation (45 min)
5. **PHASE 3: Inventory Buttons-Only** - Clean inventory (20 min)
6. **PHASE 7: Debug Info Removal** - Clean answers (15 min)
7. **PHASE 8: File Actions Buttons-Only** - Clean file actions (20 min)

---

## Verification Queries

After each fix, test with:

```
# Routing fix
"What are the main topics in the Project Management Presentation?"
Expected: intent=documents, not file_actions

# Bullets fix
"Summarize the Rosewood Fund in 5 bullets"
Expected: 5 consistent bullet items (all - or all 1. 2. 3. 4. 5.)

# Inventory fix
"List my files"
Expected: buttons only, no "You have X files:" text

# File actions fix
"Where is the Rosewood Fund document?"
Expected: single button, no text content

# Completion fix
"Compare 2024 vs 2025 budget in a detailed table"
Expected: complete table, no "..." truncation
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Content questions → documents | 100% |
| Inventory → buttons only | 100% |
| File actions → buttons only | 100% |
| No mixed bullet types | 100% |
| No "..." truncation | 100% |
| No "Note: Only X found" in content | 100% |
| sourceButtons rendered in UI | 100% |
