# Language System Map - Koda RAG Backend

## Overview

This document maps how language detection and enforcement flows through the Koda RAG system.

## Language Detection Entry Points

### 1. Request Level
- **File**: `src/services/core/kodaOrchestratorV3.service.ts`
- **Path**: Request can include `request.language` explicitly
- **Default**: Falls back to intent detection

### 2. Intent Engine Detection
- **File**: `src/services/core/kodaIntentEngineV3.service.ts`
- **Function**: `classifyIntent()` → `detectLanguage()`
- **Line 71**: `const language = request.language || await this.detectLanguage(request.text);`
- **Output**: Language is included in `PredictedIntent.language`

### 3. Language Detector Service
- **File**: `src/services/core/languageDetector.service.ts`
- **Class**: `DefaultLanguageDetector`
- **Method**: `detect(text: string): Promise<LanguageCode>`
- **Algorithm**: Keyword heuristics scoring for PT/ES/EN indicators
- **Default**: Returns 'en' if no language scores higher

## Language Flow Through System

```
Request → IntentEngine.classify() → languageDetector.detect()
                ↓
         PredictedIntent { language: 'pt' | 'en' | 'es' }
                ↓
         Orchestrator.orchestrate() / orchestrateStream()
                ↓
         handler context: { language: LanguageCode }
                ↓
    ┌───────────────────────────────────────────────────────┐
    │ Multiple Handlers (all receive language):              │
    │ - handleDocumentQnA()                                 │
    │ - streamDocumentQnA()                                 │
    │ - handleFileActions()                                 │
    │ - handleInventoryQuery()                              │
    │ - etc.                                                │
    └───────────────────────────────────────────────────────┘
                ↓
         AnswerEngine.generateWithDocuments()
                ↓
         buildSystemPrompt(intent, lang, ...)  ← LANGUAGE-AWARE
                ↓
         LLM Generation (Gemini)
                ↓
         FormattingPipeline.format()
                ↓
         enforceLanguageLock(text, targetLanguage)  ← POST-PROCESS
                ↓
         SSE Stream → done event with fullAnswer
```

## Key Language-Aware Components

### 1. Answer Engine System Prompts
- **File**: `src/services/core/kodaAnswerEngineV3.service.ts`
- **Function**: `buildSystemPrompt(intent, lang, ...)`
- **Lines 999-1105**: Full localized prompts for EN/PT/ES
- **PT Instruction**: `"IDIOMA: Responda SEMPRE em português brasileiro."`

### 2. Formatting Pipeline Language Lock
- **File**: `src/services/core/kodaFormattingPipelineV3.service.ts`
- **Map**: `LANGUAGE_LOCK_MAP` (lines 67-155)
- **Function**: `enforceLanguageLock(text, targetLanguage)` (lines 590-624)
- **Mechanism**: Phrase-by-phrase substitution of common English patterns

### 3. Fallback Config
- **File**: `src/services/core/fallbackConfig.service.ts`
- **Function**: `getFallback(scenarioKey, format, language)`
- **Returns**: Localized fallback messages

### 4. Answer Styles
- **File**: `src/data/answer_styles.json`
- **Structure**: Templates keyed by language (en/pt/es)
- **Example**: `DOCUMENT_QNA.SUMMARY.pt.template`

## Current Language Enforcement Points

| Stage | File | Function | Enforcement |
|-------|------|----------|-------------|
| Detection | languageDetector.service.ts | detect() | Heuristic keywords |
| Prompt | kodaAnswerEngineV3.service.ts | buildSystemPrompt() | Full localized prompts |
| Post-process | kodaFormattingPipelineV3.service.ts | enforceLanguageLock() | Phrase substitution |
| Fallbacks | fallbackConfig.service.ts | getFallback() | Language-keyed messages |

## Identified Gaps

### 1. Model Drift Not Caught
The current `enforceLanguageLock()` only catches known phrases from `LANGUAGE_LOCK_MAP`.
If the model produces arbitrary English sentences mid-answer, they are NOT detected.

### 2. No Language Validation
There is no validation that the final answer is predominantly in the target language.
A response could be 50% English and still pass through.

### 3. Streaming Safety Unknown
During streaming, content chunks are emitted in real-time.
If drift happens mid-stream, the chunks already sent to client are wrong.
Only `done.fullAnswer` could be corrected after-the-fact.

### 4. Template Injection Points
File action templates and help responses may have English-only strings
that get injected regardless of target language.

## Files to Audit for Hardcoded English

- `src/services/core/kodaOrchestratorV3.service.ts` (file action templates)
- `src/services/fileSearch.service.ts` (search messages)
- `src/data/answer_styles.json` (verify all intents have PT versions)
- `src/data/fallback_messages.json` or similar

## Recommended Fixes

1. **Stronger Prompt Lock**: Add explicit "Do not switch languages" instruction
2. **Post-Process Validation**: Detect language of output and rewrite if mismatched
3. **Streaming Safety**: Apply correction to `done.fullAnswer` before emission
4. **Complete Template Audit**: Ensure all user-facing strings are localized
