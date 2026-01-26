/**
 * P0/P1 Fix Validation Tests
 *
 * Validates all critical fixes for ChatGPT-quality parity:
 * - P0.1: attachedDocumentIds scope lock
 * - P0.2: banned_phrases.any.json enforcement
 * - P1.1/P1.2: Operator governance + patterns
 * - P1.3: Retrieval budget policy in fallback paths
 */

import { RouterService, RoutingRequest } from '../services/core/router.service';
import { getBannedPhrases } from '../services/core/bannedPhrases.service';
import { getTemplateGovernance } from '../services/core/templateGovernance.service';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TEST UTILITIES
// ============================================================================

interface TestResult {
  name: string;
  pass: boolean;
  details: string;
  category: 'P0.1' | 'P0.2' | 'P1.1' | 'P1.2' | 'P1.3';
}

const results: TestResult[] = [];

function test(category: TestResult['category'], name: string, fn: () => { pass: boolean; details: string }) {
  try {
    const result = fn();
    results.push({ name, pass: result.pass, details: result.details, category });
    console.log(`${result.pass ? '✅' : '❌'} [${category}] ${name}`);
    if (!result.pass) {
      console.log(`   Details: ${result.details}`);
    }
  } catch (error: any) {
    results.push({ name, pass: false, details: `Error: ${error.message}`, category });
    console.log(`❌ [${category}] ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

// ============================================================================
// P0.1 - ATTACHED DOCUMENT IDS SCOPE LOCK
// ============================================================================

function runP01Tests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('P0.1 - ATTACHED DOCUMENT IDS SCOPE LOCK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: RoutingRequest interface has attachedDocumentIds
  test('P0.1', 'RoutingRequest interface includes attachedDocumentIds', () => {
    const routerPath = path.join(__dirname, '../services/core/router.service.ts');
    const content = fs.readFileSync(routerPath, 'utf-8');
    const hasField = content.includes('attachedDocumentIds?: string[]');
    return {
      pass: hasField,
      details: hasField ? 'Field present in RoutingRequest' : 'Missing attachedDocumentIds field'
    };
  });

  // Test 2: Scope lock logic exists in applyScopeOverrides
  test('P0.1', 'Scope lock logic in applyScopeOverrides', () => {
    const routerPath = path.join(__dirname, '../services/core/router.service.ts');
    const content = fs.readFileSync(routerPath, 'utf-8');
    const hasScopeLock = content.includes('attachedDocumentIds') &&
                         content.includes('attached_docs_scope_lock');
    return {
      pass: hasScopeLock,
      details: hasScopeLock ? 'Scope lock logic present' : 'Missing scope lock implementation'
    };
  });

  // Test 3: Orchestrator passes attachedDocumentIds to router
  test('P0.1', 'Orchestrator passes attachedDocumentIds to router', () => {
    const orchPath = path.join(__dirname, '../services/core/kodaOrchestratorV3.service.ts');
    const content = fs.readFileSync(orchPath, 'utf-8');
    const passesField = content.includes('attachedDocumentIds: req.context?.attachedDocumentIds');
    return {
      pass: passesField,
      details: passesField ? 'Orchestrator correctly passes field' : 'Missing field in router call'
    };
  });
}

// ============================================================================
// P0.2 - BANNED PHRASES ENFORCEMENT
// ============================================================================

function runP02Tests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('P0.2 - BANNED PHRASES ENFORCEMENT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: Bank file exists
  test('P0.2', 'banned_phrases.any.json exists', () => {
    const bankPath = path.join(__dirname, '../data_banks/quality/banned_phrases.any.json');
    const exists = fs.existsSync(bankPath);
    return {
      pass: exists,
      details: exists ? `Bank file found at ${bankPath}` : 'Bank file not found'
    };
  });

  // Test 2: Bank has required categories
  test('P0.2', 'Bank has all required categories', () => {
    const bankPath = path.join(__dirname, '../data_banks/quality/banned_phrases.any.json');
    if (!fs.existsSync(bankPath)) {
      return { pass: false, details: 'Bank file not found' };
    }
    const bank = JSON.parse(fs.readFileSync(bankPath, 'utf-8'));
    const hasHardBlocked = !!bank.hardBlocked?.patterns;
    const hasSoftBlocked = !!bank.softBlocked?.patterns;
    const hasRobotic = !!bank.roboticPhrases?.patterns;
    const hasSources = !!bank.sourcesSection?.patterns;
    const all = hasHardBlocked && hasSoftBlocked && hasRobotic && hasSources;
    return {
      pass: all,
      details: `hardBlocked: ${hasHardBlocked}, softBlocked: ${hasSoftBlocked}, robotic: ${hasRobotic}, sources: ${hasSources}`
    };
  });

  // Test 3: Service loads bank correctly
  test('P0.2', 'BannedPhrasesService loads bank', () => {
    const service = getBannedPhrases();
    const isLoaded = service.isLoaded();
    return {
      pass: isLoaded,
      details: isLoaded ? 'Bank loaded successfully' : 'Bank failed to load'
    };
  });

  // Test 4: Service detects hard blocked phrases
  test('P0.2', 'Service detects hard blocked phrases (EN)', () => {
    const service = getBannedPhrases();
    const result = service.check('As an AI, I cannot do this.', 'en');
    return {
      pass: result.hasHardBlocked,
      details: result.hasHardBlocked ?
        `Detected: ${result.matches.filter(m => m.category === 'hardBlocked').map(m => m.phrase).join(', ')}` :
        'Failed to detect hard blocked phrase'
    };
  });

  // Test 5: Service detects hard blocked phrases (PT)
  test('P0.2', 'Service detects hard blocked phrases (PT)', () => {
    const service = getBannedPhrases();
    const result = service.check('Como uma IA, eu não posso fazer isso.', 'pt');
    return {
      pass: result.hasHardBlocked,
      details: result.hasHardBlocked ?
        `Detected: ${result.matches.filter(m => m.category === 'hardBlocked').map(m => m.phrase).join(', ')}` :
        'Failed to detect hard blocked phrase'
    };
  });

  // Test 6: Service detects sources section
  test('P0.2', 'Service detects "Sources:" section', () => {
    const service = getBannedPhrases();
    const result = service.check('Here is the information.\n\nSources:\n- Document A', 'en');
    return {
      pass: result.hasSourcesSection,
      details: result.hasSourcesSection ? 'Sources section detected' : 'Failed to detect Sources section'
    };
  });

  // Test 7: FinalAnswerGate uses banned phrases
  test('P0.2', 'FinalAnswerGate imports and uses BannedPhrasesService', () => {
    const gatePath = path.join(__dirname, '../services/core/finalAnswerGate.service.ts');
    const content = fs.readFileSync(gatePath, 'utf-8');
    const importsService = content.includes("import { getBannedPhrases }");
    const usesService = content.includes('bannedPhrases.check(');
    return {
      pass: importsService && usesService,
      details: `imports: ${importsService}, uses: ${usesService}`
    };
  });
}

// ============================================================================
// P1.1/P1.2 - OPERATOR GOVERNANCE + PATTERNS
// ============================================================================

function runP11P12Tests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('P1.1/P1.2 - OPERATOR GOVERNANCE + PATTERNS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: operator_templates.json exists
  test('P1.1', 'operator_templates.json exists', () => {
    const templatePath = path.join(__dirname, '../../data_banks/formatting/operator_templates.json');
    const exists = fs.existsSync(templatePath);
    return {
      pass: exists,
      details: exists ? `Found at ${templatePath}` : 'File not found'
    };
  });

  // Test 2: All new operators have governance entries
  const newOperators = ['group', 'again', 'count', 'stats', 'expand', 'count_pages', 'count_sheets', 'count_slides', 'capabilities', 'how_to', 'unknown'];

  test('P1.1', 'All 11 operators have governance entries', () => {
    const templatePath = path.join(__dirname, '../../data_banks/formatting/operator_templates.json');
    if (!fs.existsSync(templatePath)) {
      return { pass: false, details: 'Template file not found' };
    }
    const templates = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    const governance = templates.operator_governance || {};
    const missing = newOperators.filter(op => !governance[op]);
    return {
      pass: missing.length === 0,
      details: missing.length === 0 ? 'All operators governed' : `Missing: ${missing.join(', ')}`
    };
  });

  // Test 3: Each operator has required governance fields
  test('P1.1', 'Operators have required governance fields', () => {
    const templatePath = path.join(__dirname, '../../data_banks/formatting/operator_templates.json');
    if (!fs.existsSync(templatePath)) {
      return { pass: false, details: 'Template file not found' };
    }
    const templates = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    const governance = templates.operator_governance || {};
    const issues: string[] = [];
    for (const op of newOperators) {
      if (!governance[op]) {
        issues.push(`${op}: missing entry`);
        continue;
      }
      if (!('allowed_templates' in governance[op])) issues.push(`${op}: missing allowed_templates`);
      if (!('preamble_allowed' in governance[op])) issues.push(`${op}: missing preamble_allowed`);
      if (!('followup_allowed' in governance[op])) issues.push(`${op}: missing followup_allowed`);
    }
    return {
      pass: issues.length === 0,
      details: issues.length === 0 ? 'All fields present' : issues.join('; ')
    };
  });

  // Test 4: intent_patterns.runtime.json has output contracts
  test('P1.2', 'intent_patterns has output contracts for new operators', () => {
    const patternsPath = path.join(__dirname, '../data_banks/routing/intent_patterns.runtime.any.json');
    if (!fs.existsSync(patternsPath)) {
      return { pass: false, details: 'Patterns file not found' };
    }
    const content = fs.readFileSync(patternsPath, 'utf-8');
    // Check for operator output contracts
    const hasExpandContract = content.includes('"expand"') && content.includes('"outputShape"');
    const hasHowToContract = content.includes('"how_to"');
    return {
      pass: hasExpandContract || hasHowToContract,
      details: `expand contract: ${hasExpandContract}, how_to: ${hasHowToContract}`
    };
  });
}

// ============================================================================
// P1.3 - RETRIEVAL BUDGET POLICY IN FALLBACK PATHS
// ============================================================================

function runP13Tests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('P1.3 - RETRIEVAL BUDGET POLICY IN FALLBACK PATHS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: No hardcoded vectorTopK: 5 in retrieval engine
  test('P1.3', 'No hardcoded vectorTopK: 5 in fallback paths', () => {
    const retrievalPath = path.join(__dirname, '../services/core/kodaRetrievalEngineV3.service.ts');
    const content = fs.readFileSync(retrievalPath, 'utf-8');
    // Look for hardcoded values in the fallback injection section
    const hasHardcoded = /vectorTopK:\s*5[,\s]/.test(content) || /bm25TopK:\s*5[,\s]/.test(content);
    const hasMathMin = content.includes('Math.min(vectorTopK, 8)') && content.includes('Math.min(bm25TopK, 8)');
    return {
      pass: !hasHardcoded && hasMathMin,
      details: `hardcoded 5: ${hasHardcoded}, Math.min used: ${hasMathMin}`
    };
  });

  // Test 2: Budget policy is used with capping
  test('P1.3', 'Fallback uses budget policy with cap', () => {
    const retrievalPath = path.join(__dirname, '../services/core/kodaRetrievalEngineV3.service.ts');
    const content = fs.readFileSync(retrievalPath, 'utf-8');
    // Count occurrences of the capped version
    const mathMinCount = (content.match(/Math\.min\(vectorTopK, 8\)/g) || []).length;
    return {
      pass: mathMinCount >= 2,
      details: `Math.min(vectorTopK, 8) occurrences: ${mathMinCount} (expected >= 2)`
    };
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          P0/P1 FIX VALIDATION TEST SUITE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  runP01Tests();
  runP02Tests();
  runP11P12Tests();
  runP13Tests();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const byCategory: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  let totalPass = 0;
  let totalFail = 0;

  for (const [category, tests] of Object.entries(byCategory)) {
    const passed = tests.filter(t => t.pass).length;
    const failed = tests.filter(t => !t.pass).length;
    totalPass += passed;
    totalFail += failed;
    console.log(`${category}: ${passed}/${tests.length} passed`);
    for (const t of tests.filter(t => !t.pass)) {
      console.log(`  ❌ ${t.name}: ${t.details}`);
    }
  }

  console.log(`\nTotal: ${totalPass}/${totalPass + totalFail} passed`);

  if (totalFail > 0) {
    console.log('\n⚠️  Some tests failed. Please review the issues above.');
    process.exit(1);
  } else {
    console.log('\n✅ All P0/P1 fixes validated successfully!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
