/**
 * PHASE 9 — END-TO-END TRACE (SINGLE QUERY)
 * Trace the full pipeline for a single query
 */

import {
  classifyIntent,
  getDomainService,
  getMathOrchestrator,
  computeDepth,
  requiresRAG,
  getValidationPolicyKey,
  STYLE_MAPPING,
} from './helpers';

interface PipelineStage {
  stage: string;
  result: any;
  duration: number;
  skipped: boolean;
  error?: string;
}

interface E2ETrace {
  query: string;
  timestamp: string;
  totalDuration: number;
  stages: PipelineStage[];
  summary: {
    stagesCompleted: number;
    stagesSkipped: number;
    stagesErrored: number;
    finalOutcome: 'success' | 'partial' | 'failure';
  };
}

async function traceFullPipeline(query: string): Promise<E2ETrace> {
  const trace: E2ETrace = {
    query,
    timestamp: new Date().toISOString(),
    totalDuration: 0,
    stages: [],
    summary: {
      stagesCompleted: 0,
      stagesSkipped: 0,
      stagesErrored: 0,
      finalOutcome: 'success',
    },
  };

  const overallStart = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('PHASE 9 — END-TO-END PIPELINE TRACE');
  console.log('='.repeat(60));
  console.log(`\nQuery: "${query}"`);
  console.log(`Timestamp: ${trace.timestamp}`);
  console.log('\n' + '-'.repeat(60) + '\n');

  // Stage 1: Input Reception
  console.log('STAGE 1: Input Reception');
  let stageStart = Date.now();
  trace.stages.push({
    stage: 'Input',
    result: { query, length: query.length },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  console.log(`  ✓ Query received (${query.length} chars)\n`);

  // Stage 2: Intent Classification
  console.log('STAGE 2: Intent Classification');
  stageStart = Date.now();
  let intent: any;
  try {
    intent = await classifyIntent(query);
    trace.stages.push({
      stage: 'Intent',
      result: {
        primary: intent.primaryIntent,
        confidence: intent.confidence,
        secondary: intent.secondaryIntents,
        language: intent.language,
      },
      duration: Date.now() - stageStart,
      skipped: false,
    });
    console.log(`  ✓ Intent: ${intent.primaryIntent} (${(intent.confidence * 100).toFixed(0)}%)`);
    console.log(`  ✓ Language: ${intent.language}\n`);
    trace.summary.stagesCompleted++;
  } catch (error: any) {
    trace.stages.push({
      stage: 'Intent',
      result: null,
      duration: Date.now() - stageStart,
      skipped: false,
      error: error.message,
    });
    console.log(`  ✗ Error: ${error.message}\n`);
    trace.summary.stagesErrored++;
    trace.summary.finalOutcome = 'failure';
    trace.totalDuration = Date.now() - overallStart;
    return trace;
  }

  // Stage 3: Domain Activation
  console.log('STAGE 3: Domain Activation');
  stageStart = Date.now();
  const domainService = getDomainService();
  const domainContext = domainService.getDomainContext(intent.primaryIntent);
  trace.stages.push({
    stage: 'Domain',
    result: {
      isDomainSpecific: domainContext.isDomainSpecific,
      domain: domainContext.domain || null,
      fileTypeFilters: domainContext.fileTypeFilters,
    },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  if (domainContext.isDomainSpecific) {
    console.log(`  ✓ Domain: ${domainContext.domain}`);
    console.log(`  ✓ File filters: ${domainContext.fileTypeFilters?.join(', ')}\n`);
  } else {
    console.log(`  ○ No domain-specific rules\n`);
  }
  trace.summary.stagesCompleted++;

  // Stage 4: Depth Decision
  console.log('STAGE 4: Depth Decision');
  stageStart = Date.now();
  const depthResult = computeDepth(intent.primaryIntent, intent.confidence, query);
  trace.stages.push({
    stage: 'Depth',
    result: { depth: depthResult.depth, reason: depthResult.reason, intent: intent.primaryIntent, confidence: intent.confidence },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  console.log(`  ✓ Depth: ${depthResult.depth} (${depthResult.reason})\n`);
  trace.summary.stagesCompleted++;

  // Stage 5: RAG Decision
  console.log('STAGE 5: RAG Decision');
  stageStart = Date.now();
  const needsRAG = requiresRAG(intent.primaryIntent);
  trace.stages.push({
    stage: 'requiresRAG',
    result: { required: needsRAG, intent: intent.primaryIntent },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  console.log(`  ${needsRAG ? '✓' : '○'} RAG required: ${needsRAG}\n`);
  trace.summary.stagesCompleted++;

  // Stage 6: Python Math Engine Check
  console.log('STAGE 6: Python Math Engine');
  stageStart = Date.now();
  const mathOrchestrator = getMathOrchestrator();
  const mathCheck = mathOrchestrator.requiresMathCalculation(query);
  const needsMath = mathCheck.requiresMath && mathCheck.confidence >= 0.25;
  trace.stages.push({
    stage: 'Python math',
    result: {
      required: needsMath,
      confidence: mathCheck.confidence,
      category: mathCheck.suggestedCategory,
      patterns: mathCheck.matchedPatterns.slice(0, 3),
    },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  if (needsMath) {
    console.log(`  ✓ Math engine required`);
    console.log(`  ✓ Category: ${mathCheck.suggestedCategory}\n`);
  } else {
    console.log(`  ○ Math engine not required\n`);
  }
  trace.summary.stagesCompleted++;

  // Stage 7: Validation Policies
  console.log('STAGE 7: Validation Policies');
  stageStart = Date.now();
  const validationKey = getValidationPolicyKey(intent.primaryIntent);
  trace.stages.push({
    stage: 'Validation policies',
    result: { policyKey: validationKey },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  console.log(`  ✓ Policy: ${validationKey}\n`);
  trace.summary.stagesCompleted++;

  // Stage 8: Answer Style
  console.log('STAGE 8: Answer Style');
  stageStart = Date.now();
  const answerStyle = STYLE_MAPPING[intent.primaryIntent] || 'default';
  trace.stages.push({
    stage: 'Answer style',
    result: { style: answerStyle, intent: intent.primaryIntent },
    duration: Date.now() - stageStart,
    skipped: false,
  });
  console.log(`  ✓ Style: ${answerStyle}\n`);
  trace.summary.stagesCompleted++;

  // Stage 9: Streaming Output (simulated)
  console.log('STAGE 9: Streaming Output');
  stageStart = Date.now();
  trace.stages.push({
    stage: 'Streaming output',
    result: { ready: true, format: 'SSE' },
    duration: Date.now() - stageStart,
    skipped: true, // Would need actual API call
  });
  console.log(`  ○ Streaming ready (not executed in trace)\n`);
  trace.summary.stagesSkipped++;

  // Calculate totals
  trace.totalDuration = Date.now() - overallStart;

  // Summary
  console.log('-'.repeat(60));
  console.log('\nTRACE SUMMARY');
  console.log('-'.repeat(60));
  console.log(`Total duration: ${trace.totalDuration}ms`);
  console.log(`Stages completed: ${trace.summary.stagesCompleted}`);
  console.log(`Stages skipped: ${trace.summary.stagesSkipped}`);
  console.log(`Stages errored: ${trace.summary.stagesErrored}`);
  console.log(`Final outcome: ${trace.summary.finalOutcome}`);

  // Expected trace order verification
  console.log('\nExpected trace order:');
  const expectedOrder = [
    'Input',
    'Intent',
    'Domain',
    'Depth',
    'requiresRAG',
    'Python math',
    'Validation policies',
    'Answer style',
    'Streaming output',
  ];

  const actualOrder = trace.stages.map(s => s.stage);
  const orderCorrect = expectedOrder.every((stage, i) => actualOrder[i] === stage);

  expectedOrder.forEach((stage, i) => {
    const actual = actualOrder[i];
    const match = actual === stage;
    console.log(`  ${match ? '✓' : '✗'} ${stage} ${!match ? `(got: ${actual})` : ''}`);
  });

  if (!orderCorrect) {
    console.log('\n⚠️  Stage order mismatch!');
    trace.summary.finalOutcome = 'partial';
  }

  console.log('\n' + '='.repeat(60) + '\n');

  return trace;
}

// Get query from command line or use default
const query = process.argv[2] || 'calculate ROI from this spreadsheet';

// Run
traceFullPipeline(query)
  .then(trace => {
    console.log('Full trace JSON:');
    console.log(JSON.stringify(trace, null, 2));

    if (trace.summary.finalOutcome === 'failure') {
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('E2E trace error:', err);
    process.exit(1);
  });
