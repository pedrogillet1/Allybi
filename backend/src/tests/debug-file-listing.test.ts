/**
 * Debug test for file listing response format
 */

import { container } from '../bootstrap/container';

describe('File Listing Debug', () => {
  beforeAll(async () => {
    await container.initialize();
  });

  it('should return DOC markers for file listing', async () => {
    const orchestrator = container.getOrchestrator();

    const result = await orchestrator.orchestrate({
      userId: '0d0d88a8-701e-48a3-a987-dcc0340048eb',
      text: 'What files do I have uploaded?',
      language: 'en',
    });

    console.log('=== RESULT ===');
    console.log('Intent:', result.metadata?.intent);
    console.log('Answer:');
    console.log(result.answer);
    console.log('');
    console.log('Has DOC markers:', /\{\{DOC::/.test(result.answer || ''));
    console.log('Has type grouping:', /\*\*(PDF|Spreadsheet|Presentation)/.test(result.answer || ''));
    console.log('Has numbered list:', /^\d+\./m.test(result.answer || ''));

    expect(result.answer).toMatch(/\{\{DOC::/);
  }, 30000);
});
