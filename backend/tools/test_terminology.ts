#!/usr/bin/env npx ts-node
/**
 * Quick test for TerminologyService
 */

import { getTerminologyService } from '../src/services/core/terminology.service';

async function main() {
  const ts = getTerminologyService();

  console.log('\n=== TerminologyService Test ===\n');
  console.log(`Ready: ${ts.isReady()}`);
  console.log(`Domain policies loaded: ${ts.getDomainCount()}`);

  // Test 1: Banned opener stripping
  const test1 = ts.enforce("Here's what I found: The EBITDA increased by 15%.", { domain: 'finance', language: 'en' });
  console.log('\n--- Test 1: Banned opener ---');
  console.log(`Input: "Here's what I found: The EBITDA increased by 15%."`);
  console.log(`Output: "${test1.text}"`);
  console.log(`Modified: ${test1.modified}`);
  console.log(`Replacements: ${JSON.stringify(test1.replacements)}`);

  // Test 2: Banned phrase stripping
  const test2 = ts.enforce("Based on the available information, the revenue grew 10%.", { domain: 'general', language: 'en' });
  console.log('\n--- Test 2: Banned phrase ---');
  console.log(`Input: "Based on the available information, the revenue grew 10%."`);
  console.log(`Output: "${test2.text}"`);
  console.log(`Modified: ${test2.modified}`);

  // Test 3: Validate text
  const test3 = ts.validate("I'd be happy to help! Here's a summary of the document.", { language: 'en' });
  console.log('\n--- Test 3: Validation ---');
  console.log(`Input: "I'd be happy to help! Here's a summary of the document."`);
  console.log(`Valid: ${test3.valid}`);
  console.log(`Violations: ${JSON.stringify(test3.violations)}`);

  // Test 4: Clean text (should pass)
  const test4 = ts.enforce("The quarterly revenue increased by 15% compared to last year.", { domain: 'finance', language: 'en' });
  console.log('\n--- Test 4: Clean text ---');
  console.log(`Input: "The quarterly revenue increased by 15% compared to last year."`);
  console.log(`Output: "${test4.text}"`);
  console.log(`Modified: ${test4.modified}`);

  console.log('\n=== Test Complete ===\n');
}

main().catch(console.error);
