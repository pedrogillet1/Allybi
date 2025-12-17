/**
 * TEST SKILL SYSTEM
 *
 * Tests the new skill-based RAG pipeline components:
 * - Skill routing (rule-based and LLM fallback)
 * - Speed profile management
 * - Post-processing
 */

import { skillAndIntentRouter, RouterContext } from '../services/skillAndIntentRouter.service';
import { speedProfileManager } from '../services/speedProfileManager.service';
import { answerPostProcessor } from '../services/answerPostProcessor.service';
import { SpeedProfile, SkillDomain, SkillMode, SkillComplexity } from '../services/kodaSkillTaxonomyExtended';
import { getKodaSystemPrompt, getIdentityNormalizationRules } from '../config/kodaPersonaConfig';

// ============================================================================
// TEST CASES
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function test(name: string, testFn: () => boolean | Promise<boolean>, expected: string): Promise<void> {
  return (async () => {
    try {
      const passed = await testFn();
      results.push({ name, passed, details: passed ? 'OK' : `Expected: ${expected}` });
      console.log(`${passed ? '✅' : '❌'} ${name}`);
    } catch (error: any) {
      results.push({ name, passed: false, details: `Error: ${error.message}` });
      console.log(`❌ ${name} - Error: ${error.message}`);
    }
  })();
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 SKILL SYSTEM TEST SUITE');
  console.log('========================================\n');

  // ---------------------------------------------------------------------------
  // 1. KODA PERSONA CONFIG TESTS
  // ---------------------------------------------------------------------------
  console.log('\n📋 Testing Koda Persona Config...\n');

  await test('Koda system prompt exists', () => {
    const prompt = getKodaSystemPrompt();
    return prompt.length > 100 && prompt.includes('Koda');
  }, 'System prompt should mention Koda');

  await test('Identity normalization rules exist', () => {
    const rules = getIdentityNormalizationRules();
    return rules.length >= 5;
  }, 'Should have at least 5 identity rules');

  // ---------------------------------------------------------------------------
  // 2. SKILL ROUTING TESTS (RULE-BASED)
  // ---------------------------------------------------------------------------
  console.log('\n📋 Testing Skill Router (Rule-Based)...\n');

  // Test greeting detection
  await test('Greeting "oi" routes to META.GREETING', () => {
    const context: RouterContext = { query: 'oi', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'META.GREETING' && result?.speedProfile === SpeedProfile.ULTRA_FAST;
  }, 'META.GREETING with ULTRA_FAST');

  await test('Greeting "Olá!" routes to META.GREETING', () => {
    const context: RouterContext = { query: 'Olá!', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'META.GREETING';
  }, 'META.GREETING');

  await test('Greeting "bom dia" routes to META.GREETING', () => {
    const context: RouterContext = { query: 'bom dia', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'META.GREETING';
  }, 'META.GREETING');

  // Test document listing
  await test('"Liste meus documentos" routes to GENERAL.LIST_DOCUMENTS', () => {
    const context: RouterContext = { query: 'Liste meus documentos', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'GENERAL.LIST_DOCUMENTS';
  }, 'GENERAL.LIST_DOCUMENTS');

  await test('"Quais documentos eu tenho?" routes to GENERAL.LIST_DOCUMENTS', () => {
    const context: RouterContext = { query: 'Quais documentos eu tenho?', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'GENERAL.LIST_DOCUMENTS';
  }, 'GENERAL.LIST_DOCUMENTS');

  // Test explain section
  await test('"Explique a seção 3.2" routes to GENERAL.EXPLAIN_SECTION', () => {
    const context: RouterContext = { query: 'Explique a seção 3.2', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'GENERAL.EXPLAIN_SECTION';
  }, 'GENERAL.EXPLAIN_SECTION');

  // Test summarize
  await test('"Resuma este documento" routes to GENERAL.SUMMARIZE_DOCUMENT', () => {
    const context: RouterContext = { query: 'Resuma este documento', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'GENERAL.SUMMARIZE_DOCUMENT';
  }, 'GENERAL.SUMMARIZE_DOCUMENT');

  // Test find where
  await test('"Onde diz que o prazo é 30 dias?" routes to GENERAL.FIND_WHERE_IT_SAYS_X', () => {
    const context: RouterContext = { query: 'Onde diz que o prazo é 30 dias?', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'GENERAL.FIND_WHERE_IT_SAYS_X';
  }, 'GENERAL.FIND_WHERE_IT_SAYS_X');

  // Test legal skills
  await test('"Explique a cláusula 5.3" routes to LEGAL.EXPLAIN_CLAUSE', () => {
    const context: RouterContext = { query: 'Explique a cláusula 5.3', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'LEGAL.EXPLAIN_CLAUSE';
  }, 'LEGAL.EXPLAIN_CLAUSE');

  await test('"Quais são os riscos legais?" routes to LEGAL.SCAN_FOR_RISKS', () => {
    const context: RouterContext = { query: 'Quais são os riscos legais?', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'LEGAL.SCAN_FOR_RISKS';
  }, 'LEGAL.SCAN_FOR_RISKS');

  await test('"Esse contrato segue LGPD?" routes to LEGAL.CHECK_LGPD_COMPLIANCE', () => {
    const context: RouterContext = { query: 'Esse contrato segue LGPD?', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'LEGAL.CHECK_LGPD_COMPLIANCE';
  }, 'LEGAL.CHECK_LGPD_COMPLIANCE');

  // Test financial skills
  await test('"Verifique os cálculos" routes to FINANCIAL.CHECK_CALCULATIONS', () => {
    const context: RouterContext = { query: 'Verifique os cálculos', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'FINANCIAL.CHECK_CALCULATIONS';
  }, 'FINANCIAL.CHECK_CALCULATIONS');

  await test('"Faça uma análise de cenários" routes to FINANCIAL.SCENARIO_ANALYSIS', () => {
    const context: RouterContext = { query: 'Faça uma análise de cenários', userDocumentCount: 5 };
    const result = skillAndIntentRouter.ruleBasedClassification(context);
    return result?.skillId === 'FINANCIAL.SCENARIO_ANALYSIS';
  }, 'FINANCIAL.SCENARIO_ANALYSIS');

  // ---------------------------------------------------------------------------
  // 3. COMPLEXITY ADJUSTMENT TESTS
  // ---------------------------------------------------------------------------
  console.log('\n📋 Testing Complexity Adjustment...\n');

  await test('Query with "detalhado" increases complexity to DEEP', () => {
    const context: RouterContext = { query: 'Explique a seção 3.2', userDocumentCount: 5 };
    const initial = skillAndIntentRouter.ruleBasedClassification(context)!;
    const adjusted = skillAndIntentRouter.adjustComplexity(initial, 'Explique a seção 3.2 de forma detalhada');
    return adjusted.complexity === SkillComplexity.DEEP;
  }, 'DEEP complexity');

  await test('Query with "rápido" decreases complexity to LIGHT', () => {
    const context: RouterContext = { query: 'Explique a seção 3.2', userDocumentCount: 5 };
    const initial = skillAndIntentRouter.ruleBasedClassification(context)!;
    const adjusted = skillAndIntentRouter.adjustComplexity(initial, 'Explique a seção 3.2 rápido');
    return adjusted.complexity === SkillComplexity.LIGHT;
  }, 'LIGHT complexity');

  // ---------------------------------------------------------------------------
  // 4. SPEED PROFILE TESTS
  // ---------------------------------------------------------------------------
  console.log('\n📋 Testing Speed Profile Manager...\n');

  await test('ULTRA_FAST profile disables all RAG', () => {
    const config = speedProfileManager.getRAGPipelineConfig(SpeedProfile.ULTRA_FAST);
    return !config.useBM25 && !config.usePinecone && config.topK === 0;
  }, 'All RAG disabled for ULTRA_FAST');

  await test('FAST profile enables only BM25', () => {
    const config = speedProfileManager.getRAGPipelineConfig(SpeedProfile.FAST);
    return config.useBM25 && !config.usePinecone && config.topK === 5;
  }, 'Only BM25 for FAST');

  await test('NORMAL profile enables hybrid search', () => {
    const config = speedProfileManager.getRAGPipelineConfig(SpeedProfile.NORMAL);
    return config.useBM25 && config.usePinecone && config.useHybridSearch;
  }, 'Hybrid search for NORMAL');

  await test('DEEP profile enables all analysis', () => {
    const config = speedProfileManager.getRAGPipelineConfig(SpeedProfile.DEEP);
    return config.useNumericExtraction && config.useEntityExtraction && config.useScenarioLogic;
  }, 'All analysis for DEEP');

  await test('Financial skill override enables numeric extraction', () => {
    const baseConfig = speedProfileManager.getRAGPipelineConfig(SpeedProfile.NORMAL);
    const overridden = speedProfileManager.applySkillSpecificOverrides(baseConfig, 'FINANCIAL.CHECK_CALCULATIONS');
    return overridden.useNumericExtraction === true;
  }, 'Numeric extraction enabled for FINANCIAL');

  await test('List documents skill override disables all RAG', () => {
    const baseConfig = speedProfileManager.getRAGPipelineConfig(SpeedProfile.NORMAL);
    const overridden = speedProfileManager.applySkillSpecificOverrides(baseConfig, 'META.GREETING');
    return !overridden.useBM25 && !overridden.usePinecone;
  }, 'RAG disabled for META.GREETING');

  // ---------------------------------------------------------------------------
  // 5. POST-PROCESSOR TESTS
  // ---------------------------------------------------------------------------
  console.log('\n📋 Testing Answer Post-Processor...\n');

  await test('Removes duplicate paragraphs', () => {
    const input = 'Paragraph 1.\n\nParagraph 1.\n\nParagraph 2.';
    const result = answerPostProcessor.removeDuplicateParagraphs(input);
    return result.removed === 1 && !result.text.includes('Paragraph 1.\n\nParagraph 1.');
  }, 'One duplicate removed');

  await test('Cleans empty bullets', () => {
    const input = '- Item 1\n- \n- Item 2';
    const result = answerPostProcessor.cleanEmptyBulletsAndArtifacts(input);
    return !result.includes('- \n');
  }, 'Empty bullets removed');

  await test('Normalizes AI identity mentions', () => {
    const input = 'Como modelo de linguagem, posso te ajudar.';
    const result = answerPostProcessor.normalizeIdentity(input);
    return result.replacements > 0 && !result.text.includes('modelo de linguagem');
  }, 'Identity normalized');

  await test('Normalizes ChatGPT mentions to Koda', () => {
    const input = 'ChatGPT pode te ajudar com isso.';
    const result = answerPostProcessor.normalizeIdentity(input);
    return result.text.includes('Koda') && !result.text.includes('ChatGPT');
  }, 'ChatGPT replaced with Koda');

  await test('Removes excessive greetings', () => {
    const input = 'Olá! Claro, posso te ajudar.';
    const result = answerPostProcessor.removeExcessiveGreetings(input);
    return !result.startsWith('Olá');
  }, 'Greeting removed');

  await test('Detects weak DEEP answers', () => {
    const skillMapping = {
      skillId: 'LEGAL.SCAN_FOR_RISKS',
      skillName: 'Scan for Legal Risks',
      domain: SkillDomain.LEGAL,
      mode: SkillMode.DOC_ANALYSIS,
      complexity: SkillComplexity.DEEP,
      speedProfile: SpeedProfile.DEEP,
      skillConfig: {} as any,
      confidence: 0.9,
      detectionMethod: 'rule-based' as const,
    };
    const shortAnswer = 'This is too short.';
    const result = answerPostProcessor.checkMinimalRichness(skillMapping, shortAnswer);
    return result.isWeak === true;
  }, 'Weak answer detected');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================');
  console.log('📊 TEST SUMMARY');
  console.log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.details}`);
    });
  }

  console.log('\n========================================\n');
}

// Run tests
runTests().catch(console.error);
