/**
 * Script to add formatting helpers to orchestrator
 */
const fs = require('fs');
const path = require('path');

const orchestratorPath = path.join(__dirname, '../src/services/core/kodaOrchestratorV3.service.ts');
let content = fs.readFileSync(orchestratorPath, 'utf-8');

// Check if already added
if (content.includes('formatSimple')) {
  console.log('Helper methods already exist');
  process.exit(0);
}

// Helper methods to add
const helperMethods = `
  /**
   * Format simple text responses for non-DOC handlers.
   * Wraps text through formatting pipeline to ensure consistent output.
   */
  private async formatSimple(
    text: string,
    intent: string,
    language: LanguageCode
  ): Promise<string> {
    try {
      const result = await this.formattingPipeline.format({
        text,
        citations: [],
        documents: [],
        intent,
        language,
      });
      return result.markdown || result.text || text;
    } catch (err) {
      this.logger.warn('[Orchestrator] formatSimple error, returning raw text:', err);
      return text;
    }
  }

  /**
   * Apply formatting and validation to a response.
   * Returns formatted fallback if validation fails with error severity.
   *
   * @param response - The raw handler response
   * @param intent - Intent name for validation policy lookup
   * @param language - Language for fallback messages
   * @param skipFormat - If true, skip formatting (handler already formatted)
   */
  private async applyFormatAndValidate(
    response: IntentHandlerResponse,
    intent: string,
    language: LanguageCode,
    skipFormat: boolean = false
  ): Promise<IntentHandlerResponse> {
    // Step 1: Format if not already formatted
    let formattedText = response.formatted || response.answer;
    if (!skipFormat && formattedText) {
      formattedText = await this.formatSimple(formattedText, intent, language);
    }

    // Step 2: Validate the response
    const validationResult = this.validationService.validate({
      answer: {
        text: formattedText,
        citations: response.citations,
        documentsUsed: response.metadata?.sourceDocumentIds,
      },
      intent: adaptPredictedIntent(
        { primaryIntent: intent as IntentName, confidence: 1, language } as PredictedIntent,
        { text: '', userId: '' }
      ),
      configKeys: {
        styleKey: 'default',
        systemPromptKey: 'default',
        examplesKey: 'default',
        validationPolicyKey: this.getValidationPolicyKey(intent),
      },
    });

    // Step 3: If validation fails with error severity, return safe fallback
    if (!validationResult.passed && validationResult.severity === 'error') {
      this.logger.warn('[Orchestrator] Validation failed:', validationResult.reasons);
      const fallback = this.fallbackConfig.getFallback('LLM_ERROR', 'short_guidance', language);
      const fallbackFormatted = await this.formatSimple(fallback.text, intent, language);
      return {
        answer: fallbackFormatted,
        formatted: fallbackFormatted,
        metadata: {
          ...response.metadata,
          validationFailed: true,
          validationReasons: validationResult.reasons,
        },
      };
    }

    // Step 4: Return formatted response
    return {
      ...response,
      answer: formattedText,
      formatted: formattedText,
      metadata: {
        ...response.metadata,
        validationPassed: validationResult.passed,
        validationSeverity: validationResult.severity,
      },
    };
  }

  /**
   * Get validation policy key based on intent.
   */
  private getValidationPolicyKey(intent: string): string {
    switch (intent) {
      case 'DOC_QA':
      case 'DOC_ANALYTICS':
        return 'documents.factual';
      case 'DOC_SUMMARIZE':
        return 'documents.summary';
      case 'DOC_SEARCH':
        return 'documents.compare';
      case 'PRODUCT_HELP':
      case 'ONBOARDING_HELP':
        return 'product.help';
      case 'CHITCHAT':
      case 'META_AI':
        return 'chitchat';
      default:
        return 'default';
    }
  }

`;

// Find buildErrorResponse and insert after it
const buildErrorResponsePattern = /private buildErrorResponse\(request: OrchestratorRequest, error: any\): IntentHandlerResponse \{[\s\S]*?return \{[\s\S]*?\};\s*\}/;
const match = content.match(buildErrorResponsePattern);

if (match) {
  const insertPoint = match.index + match[0].length;
  content = content.slice(0, insertPoint) + helperMethods + content.slice(insertPoint);
  fs.writeFileSync(orchestratorPath, content);
  console.log('Added formatSimple, applyFormatAndValidate, and getValidationPolicyKey helpers');
} else {
  console.error('Could not find buildErrorResponse method');
  process.exit(1);
}
