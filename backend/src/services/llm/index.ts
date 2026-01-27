// src/services/llm/index.ts
/**
 * LLM Service Layer
 *
 * Multi-provider LLM abstraction with unified contracts for:
 * - Request/response handling
 * - Streaming
 * - Tool/function calling
 * - Safety filtering
 * - Rate limiting and caching
 * - Prompt composition
 * - Provider policy routing
 */

// Types
export * from './types/llm.types';
export * from './types/llmErrors.types';
export * from './types/llmStreaming.types';
export * from './types/llmTools.types';

// Core
export * from './core/llmRouter.service';
export * from './core/llmClient.interface';
export * from './core/llmRequestBuilder.service';
export * from './core/llmResponseParser.service';
export * from './core/llmStreamAdapter.service';
export * from './core/llmSafetyAdapter.service';
export * from './core/llmRateLimit.service';
export * from './core/llmCache.service';
export * from './core/llmTelemetry.service';

// Providers
export * from './providers/gemini';
export * from './providers/openai';
export * from './providers/local';

// Prompts
export * from './prompts/promptRegistry.service';
export * from './prompts/systemPrompt.builder';
export * from './prompts/retrievalPrompt.builder';
export * from './prompts/composePrompt.builder';
export * from './prompts/toolPrompt.builder';

// Policy
export * from './policy/providerPolicy.router';
