# Language Drift Root Cause Analysis

## Findings from Testing

### Current State
The system has multiple language enforcement mechanisms:
1. **Language Detection**: Keyword-based heuristics in `languageDetector.service.ts`
2. **Localized System Prompts**: Full PT/ES prompts in `kodaAnswerEngineV3.service.ts`
3. **Phrase Substitution**: `enforceLanguageLock()` in `kodaFormattingPipelineV3.service.ts`

### Gap Identified
The current `enforceLanguageLock()` function only catches **known phrases** from `LANGUAGE_LOCK_MAP`.
It performs simple string substitution for patterns like:
- "The document shows" → "O documento mostra"
- "According to" → "De acordo com"
- Month names, etc.

**Problem**: If the LLM produces arbitrary English sentences mid-answer, they will NOT be detected because:
1. The phrases aren't in the predefined map
2. There's no validation that the overall response language matches the target

### Drift Scenarios

#### Scenario 1: Model Ignores Language Instruction
Even with PT system prompt, Gemini may occasionally:
- Start in PT then switch to EN for technical terms
- Use English connectors ("However", "Therefore") that aren't in the map
- Generate entirely English sentences when context chunks are in English

#### Scenario 2: Template Injection
File action responses, help text, or error messages may inject English templates
that aren't language-keyed.

#### Scenario 3: Citation/Source Text
Document citations contain English file names ("File: X.pdf") which are fine,
but sometimes model adds English explanatory text around them.

## Root Cause Summary

**Primary Cause**: No comprehensive validation that output language matches target.
**Secondary Cause**: Phrase map is incomplete - can't cover all possible English patterns.
**Tertiary Cause**: Some template strings may be English-only.

## Recommended Fix

### 1. Add Language Validation Function
Detect if significant portions of text contain wrong-language words.
Use a scoring mechanism similar to language detection.

### 2. Add Post-Process Correction
When drift is detected:
- For small drift: Apply expanded phrase replacement
- For large drift: Use model to translate with strict preservation of {{DOC::...}} markers

### 3. Apply at Final Mile
Run validation/correction AFTER formatting pipeline, BEFORE done event emission.
This ensures streamed chunks may have drift but fullAnswer is always correct.
