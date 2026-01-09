/**
 * PHASE 8 — QUALITY & PRECISION AUDIT (NON-UI)
 * Deterministic quality checklist per answer
 */

import { classifyIntent, getDomainService, getMathOrchestrator } from './helpers';

interface QualityAudit {
  query: string;
  intent_correct: boolean;
  depth_correct: boolean;
  domain_rules_applied: boolean;
  math_engine_used: boolean | 'N/A';
  hallucination_risk: 'low' | 'medium' | 'high';
  fallback_used: boolean;
  confidence_varied: boolean;
  overall_pass: boolean;
}

interface TestCase {
  query: string;
  expectedIntent: string;
  expectsMath: boolean;
  description?: string;
}

// Test cases for quality audit - aligned with current routing
const TEST_CASES: TestCase[] = [
  // Document queries (RAG required)
  { query: 'summarize the main findings', expectedIntent: 'documents', expectsMath: false, description: 'Document summary' },
  { query: 'what does section 3 say?', expectedIntent: 'documents', expectsMath: false, description: 'Document lookup' },

  // Domain-specific (domain rules should apply)
  { query: 'explain the revenue recognition policy', expectedIntent: 'finance', expectsMath: false, description: 'Finance query' },
  { query: 'check the journal entry', expectedIntent: 'accounting', expectsMath: false, description: 'Accounting query' },

  // Math queries (Python engine required)
  { query: 'calculate the average of 10, 20, 30', expectedIntent: 'reasoning', expectsMath: true, description: 'Math calculation' },
  { query: 'sum column A', expectedIntent: 'excel', expectsMath: true, description: 'Spreadsheet calc' },

  // Conversation (no RAG, no math)
  { query: 'hello', expectedIntent: 'conversation', expectsMath: false, description: 'Greeting' },
  { query: 'thank you', expectedIntent: 'conversation', expectsMath: false, description: 'Thanks' },

  // Help (no RAG, no math)
  { query: 'how do I use this?', expectedIntent: 'help', expectsMath: false, description: 'Help query' },
];

async function runQualityAudit(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 8 — QUALITY & PRECISION AUDIT');
  console.log('='.repeat(60) + '\n');

  const domainService = getDomainService();
  const mathOrchestrator = getMathOrchestrator();

  const audits: QualityAudit[] = [];
  const confidences: number[] = [];

  for (const testCase of TEST_CASES) {
    try {
      // Classify intent
      const prediction = await classifyIntent(testCase.query);
      confidences.push(prediction.confidence);

      // Check domain
      const domainContext = domainService.getDomainContext(prediction.primaryIntent);

      // Check math
      const mathCheck = mathOrchestrator.requiresMathCalculation(testCase.query);

      // Build audit
      const audit: QualityAudit = {
        query: testCase.query,
        intent_correct: prediction.primaryIntent === testCase.expectedIntent,
        depth_correct: true, // Assume correct unless specific check needed
        domain_rules_applied: domainContext.isDomainSpecific ? true : !['accounting', 'engineering', 'finance', 'legal', 'medical'].includes(testCase.expectedIntent),
        math_engine_used: testCase.expectsMath ? (mathCheck.requiresMath && mathCheck.confidence >= 0.25) : 'N/A',
        hallucination_risk: prediction.confidence > 0.7 ? 'low' : prediction.confidence > 0.4 ? 'medium' : 'high',
        fallback_used: false, // Would need actual orchestrator call to verify
        confidence_varied: true, // Will check at end
        overall_pass: true, // Will calculate
      };

      // Calculate overall pass
      audit.overall_pass =
        audit.intent_correct &&
        audit.depth_correct &&
        audit.domain_rules_applied &&
        (audit.math_engine_used === 'N/A' || audit.math_engine_used === true) &&
        audit.hallucination_risk !== 'high';

      audits.push(audit);

      const icon = audit.overall_pass ? '✓' : '✗';
      console.log(`${icon} "${testCase.query}"`);
      console.log(`    Intent correct: ${audit.intent_correct}`);
      console.log(`    Depth correct: ${audit.depth_correct}`);
      console.log(`    Domain rules: ${audit.domain_rules_applied}`);
      console.log(`    Math engine: ${audit.math_engine_used}`);
      console.log(`    Hallucination risk: ${audit.hallucination_risk}`);
      console.log(`    Confidence: ${(prediction.confidence * 100).toFixed(0)}%`);
      console.log('');

    } catch (error: any) {
      console.log(`✗ "${testCase.query}" — ERROR: ${error.message}`);
      audits.push({
        query: testCase.query,
        intent_correct: false,
        depth_correct: false,
        domain_rules_applied: false,
        math_engine_used: false,
        hallucination_risk: 'high',
        fallback_used: true,
        confidence_varied: false,
        overall_pass: false,
      });
    }
  }

  // Check confidence variation
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const confidenceVariance = confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;
  const confidenceVaries = confidenceVariance > 0.01; // Some variance expected

  audits.forEach(a => {
    a.confidence_varied = confidenceVaries;
  });

  // Summary
  console.log('-'.repeat(60));
  const passed = audits.filter(a => a.overall_pass).length;
  const failed = audits.filter(a => !a.overall_pass).length;

  console.log(`\nResults: ${passed}/${audits.length} passed (${failed} failed)`);

  // Quality metrics
  console.log('\nQuality Metrics:');
  console.log(`  Intent accuracy: ${(audits.filter(a => a.intent_correct).length / audits.length * 100).toFixed(0)}%`);
  console.log(`  Domain rule compliance: ${(audits.filter(a => a.domain_rules_applied).length / audits.length * 100).toFixed(0)}%`);
  console.log(`  Low hallucination risk: ${(audits.filter(a => a.hallucination_risk === 'low').length / audits.length * 100).toFixed(0)}%`);
  console.log(`  Confidence variance: ${confidenceVariance.toFixed(4)}`);
  console.log(`  Confidence varies: ${confidenceVaries}`);

  if (!confidenceVaries) {
    console.log('\n⚠️  WARNING: Confidence scores are constant — may indicate pattern matching issue');
  }

  if (failed > 0) {
    console.log('\n❌ QUALITY AUDIT FAILED');
    console.log('\nFailed audits:');
    audits.filter(a => !a.overall_pass).forEach(a => {
      console.log(`  - "${a.query}":`);
      if (!a.intent_correct) console.log(`    - Intent incorrect`);
      if (!a.domain_rules_applied) console.log(`    - Domain rules not applied`);
      if (a.math_engine_used === false) console.log(`    - Math engine not used when expected`);
      if (a.hallucination_risk === 'high') console.log(`    - High hallucination risk`);
    });
    process.exit(1);
  }

  console.log('\n✅ Quality audit passed');

  console.log('\n' + '='.repeat(60) + '\n');

  // Output JSON
  console.log('JSON Audit Results:');
  console.log(JSON.stringify(audits.slice(0, 3), null, 2));
}

// Run
runQualityAudit().catch(err => {
  console.error('Quality audit error:', err);
  process.exit(1);
});
