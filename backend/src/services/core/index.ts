/**
 * Core Services Index V3
 * Re-exports all core RAG services
 */

// V3 Orchestrator (main entry point)
export * from './kodaOrchestratorV3.service';

// V3 Intent classification
export * from './kodaIntentEngineV3.service';

// V3 Config services
export * from './intentConfig.service';
export * from './fallbackConfig.service';
export * from './brainDataLoader.service';

// V3 Fallback engine
export * from './kodaFallbackEngineV3.service';

// V3 Formatting pipeline
export * from './kodaFormattingPipelineV3.service';

// V3 Format constraint parser (bullet counts, tables, etc.)
export * from './formatConstraintParser.service';

// V3 Product help
export * from './kodaProductHelpV3.service';

// V3 Pattern classifier
export * from './patternClassifierV3.service';

// Retrieval and answer engines (unchanged)
export * from './kodaRetrievalEngineV3.service';
export * from './kodaAnswerEngineV3.service';

// Document resolution (unchanged)
export * from './documentResolution.service';

// Supporting services (unchanged)
export * from './languageDetector.service';
export * from './multiIntent.service';
export * from './override.service';

// Math orchestrator (LLM → Python Math Engine bridge)
export * from './mathOrchestrator.service';

// Language enforcement (post-processing for PT/ES answers)
export * from './languageEnforcement.service';

// Evidence gate (anti-hallucination for doc Q&A)
export * from './evidenceGate.service';

// Scope gate (anti-contamination: single-doc vs multi-doc scoping)
export * from './scopeGate.service';

// Coherence gate (post-generation quality validation)
export * from './coherenceGate.service';

// Completion gate (pre-done validation: truncation, markers, constraints)
export * from './completionGate.service';

// Month normalization (expands "July" to match "Jul-2024" in spreadsheets)
export * from './monthNormalization.service';

// Answer Composer (CENTRALIZED output formatting - ALL responses must pass through)
export * from './answerComposer.service';

// Source Buttons (CENTRALIZED source/citation handling - ChatGPT-like pills)
export * from './sourceButtons.service';

// Bank Loader (loads all data banks: triggers, negatives, overlays, etc.)
export * from './bankLoader.service';

// Data Bank Loader (content-location pattern banks for routing decisions)
export * from './dataBankLoader.service';

// Operator Resolver (ChatGPT-like operator detection with policy integration)
export * from './operatorResolver.service';

// Preamble Stripper (answer-first style - removes "Here are...", "I found...")
export * from './preambleStripper.service';

// Template Governance (operator-to-template rules, format constraints)
export * from './templateGovernance.service';

// Presentation Normalizer (bullets, numbered lists, tables, paragraphs)
export * from './presentationNormalizer.service';

// Follow-up Suppression (strict rules for when follow-ups should NEVER appear)
export * from './followupSuppression.service';

// Capability Registry (validates follow-ups only suggest available actions)
export * from './capabilityRegistry.service';

// Clarify Templates (short, contextual clarification messages)
export * from './clarifyTemplates.service';

// Boilerplate Stripper (removes "Key points:", "Here's what I found:", etc.)
export * from './boilerplateStripper.service';

// Trust Gate (ensures no fact invention, states plainly when evidence missing)
export * from './trustGate.service';

// Terminology Service (ChatGPT-like terminology enforcement, banned phrases)
export * from './terminology.service';

// Document Intelligence Services (PHASE 1: World-class doc intelligence)
export * from './findMentions.service';
export * from './documentOutline.service';
export * from './documentCompare.service';

// Runtime Patterns (CENTRALIZED pattern matching - replaces hardcoded patterns)
export * from './runtimePatterns.service';
