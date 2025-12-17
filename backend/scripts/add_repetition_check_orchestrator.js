/**
 * Script to add repetition check to orchestrator's applyFormatAndValidate method
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'core', 'kodaOrchestratorV3.service.ts');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

// Check if already applied
if (content.includes('checkRepetition')) {
  console.log('✅ Repetition check already added to orchestrator!');
  process.exit(0);
}

// 1. Update the applyFormatAndValidate method signature to accept previousAnswer
const oldSignature = `private async applyFormatAndValidate(
    response: IntentHandlerResponse,
    intent: string,
    language: LanguageCode,
    skipFormat: boolean = false
  ): Promise<IntentHandlerResponse> {`;

const newSignature = `private async applyFormatAndValidate(
    response: IntentHandlerResponse,
    intent: string,
    language: LanguageCode,
    skipFormat: boolean = false,
    previousAnswer?: string
  ): Promise<IntentHandlerResponse> {`;

content = content.replace(oldSignature, newSignature);

// 2. Add the repetition check after validation, before returning
const oldReturnBlock = `    return {
      ...response,
      answer: formattedText,
      formatted: formattedText,
      metadata: {
        ...response.metadata,
        validationPassed: validationResult.passed,
        validationSeverity: validationResult.severity,
      } as any,
    };
  }

  /**
   * Get validation policy key based on intent.
   */`;

const newReturnBlock = `    // REPETITION CHECK: Prevent identical/near-identical answers
    if (previousAnswer) {
      const repetitionCheck = this.validationService.checkRepetition(
        formattedText,
        previousAnswer,
        language
      );

      if (repetitionCheck.isRepetition && repetitionCheck.shortConfirmation) {
        this.logger.info(\`[Orchestrator] Repetition detected (similarity: \${repetitionCheck.similarity.toFixed(2)}), returning short confirmation\`);
        return {
          answer: repetitionCheck.shortConfirmation,
          formatted: repetitionCheck.shortConfirmation,
          metadata: {
            ...response.metadata,
            wasRepetition: true,
            repetitionSimilarity: repetitionCheck.similarity,
          } as any,
        };
      }
    }

    return {
      ...response,
      answer: formattedText,
      formatted: formattedText,
      metadata: {
        ...response.metadata,
        validationPassed: validationResult.passed,
        validationSeverity: validationResult.severity,
      } as any,
    };
  }

  /**
   * Get validation policy key based on intent.
   */`;

content = content.replace(oldReturnBlock, newReturnBlock);

// 3. Find the main handleRequest method and update it to pass previousAnswer
// Look for where applyFormatAndValidate is called and pass the lastAssistant content

// We need to find calls to applyFormatAndValidate and update them
// For now, let's just add a helper method that orchestrator handlers can use

const helperMethod = `
  /**
   * Get the last assistant message from conversation context.
   * Used for repetition detection.
   */
  private async getLastAssistantAnswer(conversationId?: string): Promise<string | undefined> {
    if (!conversationId) return undefined;

    try {
      const context = await this.conversationMemory.getContext(conversationId);
      if (!context || !context.messages || context.messages.length === 0) {
        return undefined;
      }

      const lastAssistant = [...context.messages]
        .reverse()
        .find(m => m.role === 'assistant');

      return lastAssistant?.content;
    } catch (err) {
      this.logger.warn('[Orchestrator] Error getting last assistant answer:', err);
      return undefined;
    }
  }

`;

// Add the helper method before applyFormatAndValidate
content = content.replace(
  '  /**\n   * Apply formatting and validation to a response.',
  helperMethod + '  /**\n   * Apply formatting and validation to a response.'
);

// Write back
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Repetition check added to orchestrator!');
console.log('');
console.log('NOTE: You need to update handler calls to applyFormatAndValidate to pass previousAnswer.');
console.log('Use: const previousAnswer = await this.getLastAssistantAnswer(request.conversationId);');
