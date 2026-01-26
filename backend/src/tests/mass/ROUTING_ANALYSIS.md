# Routing Mass Test Analysis

## Current Results (with Real Router)

- **Total Accuracy**: 51.5% (10,303/20,000 exact matches)
- **doc_stats**: 92.7% ✅ (passing target)
- **file_actions**: 66.4%
- **documents**: 36.5%
- **conversation**: 48.2%
- **help**: 21.8%

## Key Failure Patterns

### 1. Conversation Detection (48%)
Queries like "see you", "bye", "hi" often route to other intents instead of `conversation/unknown`.

**Examples:**
- "see you" → Expected: conversation/unknown/all, Actual: documents/extract/all
- The router's priority chain doesn't have strong conversation detection

**Router Fix**: Add explicit conversation pattern matching before contentGuard checks

### 2. Help Detection (22%)
Help queries often route to documents/extract when hasDocuments=true.

**Examples:**
- "supported file formats" → Expected: help/capabilities/all, Actual: documents/extract/single
- "what can you do" → Sometimes routes correctly, sometimes doesn't

**Router Fix**: Add priority check for help patterns before contentGuard

### 3. File Action Operators (66%)
Some file operations route to wrong operators:

**Examples:**
- "show me Contract Draft" → Expected: file_actions/open, Actual: file_actions/list
- "search for X in documents" → Expected: documents/locate_content, Actual: file_actions/list

**Router Fix**: Review operator pattern matching priority for "show me" vs "list"

### 4. Document Scope Detection (36.5%)
Scope mode often differs from expectations:

**Examples:**
- Queries about specific docs → Sometimes returns 'all' instead of 'single'
- ScopeGate's auto-narrowing sometimes over-narrows

**Note**: Some of these may be acceptable - the generator expects certain scopes that the router deliberately chooses differently

## Recommendations

1. **High Impact**: Add conversation intent detection early in priority chain
2. **High Impact**: Add help intent detection before contentGuard
3. **Medium Impact**: Review "show me" → open vs list pattern priority
4. **Low Impact**: Review scope mode edge cases

## Test Purpose

This mass test now serves as a **regression baseline**. As router improvements are made:
- Re-run test to measure accuracy improvements
- Target: >=90% overall accuracy
- Current gap: ~40% improvement needed

The 51.5% baseline reveals that many queries route differently than a human might expect,
but the routing is internally consistent. Some discrepancies may be acceptable design choices.
