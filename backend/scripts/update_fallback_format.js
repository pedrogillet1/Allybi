/**
 * Script to update buildFallbackResponse and buildErrorResponse to use formatting
 */
const fs = require('fs');
const path = require('path');

const orchestratorPath = path.join(__dirname, '../src/services/core/kodaOrchestratorV3.service.ts');
let content = fs.readFileSync(orchestratorPath, 'utf-8');

let changes = 0;

// 1. Update buildFallbackResponse to use formatting
// Find the current implementation
const fallbackPattern = /private buildFallbackResponse\(\s*context: HandlerContext,\s*scenarioKey: string,\s*customMessage\?: string\s*\): IntentHandlerResponse \{[\s\S]*?return \{[\s\S]*?\};\s*\n  \}/;

if (content.match(fallbackPattern)) {
  content = content.replace(fallbackPattern, `private async buildFallbackResponse(
    context: HandlerContext,
    scenarioKey: string,
    customMessage?: string
  ): Promise<IntentHandlerResponse> {
    const language = context.language || context.intent?.language || 'en';
    const intent = context.intent?.primaryIntent || 'UNKNOWN';

    let responseText: string;
    if (customMessage) {
      responseText = customMessage;
    } else {
      const fallback = this.fallbackConfig.getFallback(
        scenarioKey as any,
        'short_guidance',
        language
      );
      responseText = fallback.text;
    }

    // Format through pipeline
    const formatted = await this.formatSimple(responseText, intent, language);

    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true, fallbackScenario: scenarioKey },
    };
  }`);
  changes++;
  console.log('Updated buildFallbackResponse to async with formatting');
}

// 2. Update buildErrorResponse to use formatting
const errorPattern = /private buildErrorResponse\(request: OrchestratorRequest, error: any\): IntentHandlerResponse \{[\s\S]*?return \{[\s\S]*?\};\s*\n  \}/;

if (content.match(errorPattern)) {
  content = content.replace(errorPattern, `private async buildErrorResponse(request: OrchestratorRequest, error: any): Promise<IntentHandlerResponse> {
    this.logger.error('[Orchestrator] Error:', error);

    const language = request.language || 'en';
    const fallback = this.fallbackConfig.getFallback(
      'LLM_ERROR',
      'one_liner',
      language
    );

    // Format through pipeline
    const formatted = await this.formatSimple(fallback.text, 'UNKNOWN', language);

    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true, error: true },
    };
  }`);
  changes++;
  console.log('Updated buildErrorResponse to async with formatting');
}

// 3. Update calls to buildFallbackResponse to use await
// These handlers call buildFallbackResponse and need to await it now
const handlersToUpdate = [
  'handleOutOfScope',
  'handleAmbiguous',
  'handleSafetyConcern'
];

for (const handler of handlersToUpdate) {
  const pattern = new RegExp(`return this\\.buildFallbackResponse\\(context,`);
  if (content.includes(`return this.buildFallbackResponse(context,`)) {
    // This is handled by the async change, just need to add await where called
  }
}

// 4. Update handleOutOfScope, handleAmbiguous, handleSafetyConcern to use await
content = content.replace(
  /private async handleOutOfScope\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return this\.buildFallbackResponse\(context, 'OUT_OF_SCOPE'\);\s*\n  \}/,
  `private async handleOutOfScope(context: HandlerContext): Promise<IntentHandlerResponse> {
    return await this.buildFallbackResponse(context, 'OUT_OF_SCOPE');
  }`
);

content = content.replace(
  /private async handleAmbiguous\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return this\.buildFallbackResponse\(context, 'AMBIGUOUS_QUESTION'\);\s*\n  \}/,
  `private async handleAmbiguous(context: HandlerContext): Promise<IntentHandlerResponse> {
    return await this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION');
  }`
);

content = content.replace(
  /private async handleSafetyConcern\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return this\.buildFallbackResponse\(context, 'OUT_OF_SCOPE'\);\s*\n  \}/,
  `private async handleSafetyConcern(context: HandlerContext): Promise<IntentHandlerResponse> {
    return await this.buildFallbackResponse(context, 'OUT_OF_SCOPE');
  }`
);
console.log('Updated fallback handlers to use await');

// 5. Update handleDocSummarize call to buildFallbackResponse
content = content.replace(
  /return this\.buildFallbackResponse\(context, 'AMBIGUOUS_QUESTION', 'Which document/g,
  `return await this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION', 'Which document`
);
console.log('Updated handleDocSummarize fallback call');

// 6. Also update the orchestrate catch block
content = content.replace(
  /return this\.buildErrorResponse\(request, error\);/g,
  `return await this.buildErrorResponse(request, error);`
);
console.log('Updated error response calls');

fs.writeFileSync(orchestratorPath, content);
console.log(`Done. Made ${changes} major changes.`);
