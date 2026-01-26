#!/usr/bin/env npx ts-node
/**
 * Consolidate cached banks into intent_patterns.runtime.json
 *
 * This script:
 * 1. Reads all cached bank files
 * 2. Groups them by intent and language
 * 3. Extracts patterns/keywords
 * 4. Merges with existing runtime patterns
 * 5. Writes the updated runtime file
 */

import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(__dirname, '.cache');
const DATA_DIR = path.join(__dirname, '../../src/data');
const RUNTIME_FILE = path.join(DATA_DIR, 'intent_patterns.runtime.json');

// Map cache file names to intent/language
interface CacheMapping {
  hash: string;
  intent: string;
  subIntent?: string;
  lang: 'en' | 'pt';
  type: 'trigger' | 'negative' | 'overlay';
}

// Read manifest if exists
function loadManifest(): Map<string, CacheMapping> {
  const manifestPath = path.join(CACHE_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return new Map(Object.entries(manifest));
  }
  return new Map();
}

// Strip markdown code blocks from content
function stripMarkdown(content: string): string {
  // Remove ```json and ``` wrappers
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

// Parse cached bank content
function parseCacheFile(filepath: string): Array<{ pattern: string; priority: number }> {
  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw);
    if (data.content) {
      const cleanedContent = stripMarkdown(data.content);
      const patterns = JSON.parse(cleanedContent);
      return patterns.map((p: any) => ({
        pattern: p.pattern || p.text || p.phrase || '',
        priority: p.priority || 50
      })).filter((p: any) => p.pattern);
    }
    return [];
  } catch (e) {
    // Silently skip parse errors
    return [];
  }
}

// Convert phrase to simple regex pattern
function phraseToPattern(phrase: string): string {
  // Escape regex special chars
  let escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Add word boundaries
  return `\\b${escaped}\\b`;
}

// Load existing runtime patterns
function loadRuntime(): any {
  if (fs.existsSync(RUNTIME_FILE)) {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf-8'));
  }
  return {
    _meta: {
      type: 'runtime_intent_patterns',
      version: '2.0.0',
      description: 'Generated runtime patterns',
      lastUpdated: new Date().toISOString().split('T')[0]
    },
    intents: {}
  };
}

// Main consolidation
async function consolidate() {
  console.log('=== Consolidating Cached Banks to Runtime ===\n');

  // Load existing runtime
  const runtime = loadRuntime();
  console.log(`Loaded existing runtime with ${Object.keys(runtime.intents).length} intents\n`);

  // Get all cache files
  const cacheFiles = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  console.log(`Found ${cacheFiles.length} cache files\n`);

  // Track new patterns by intent/lang
  const newPatterns: Map<string, Map<string, string[]>> = new Map();

  for (const file of cacheFiles) {
    const filepath = path.join(CACHE_DIR, file);
    const patterns = parseCacheFile(filepath);

    if (patterns.length === 0) continue;

    // Try to infer intent from patterns
    const samplePatterns = patterns.slice(0, 5).map(p => p.pattern.toLowerCase());
    const inferredIntent = inferIntent(samplePatterns);
    const inferredLang = inferLanguage(samplePatterns);

    if (!inferredIntent) {
      console.log(`  [SKIP] ${file}: Could not infer intent`);
      continue;
    }

    // Store patterns
    if (!newPatterns.has(inferredIntent)) {
      newPatterns.set(inferredIntent, new Map());
    }
    const intentMap = newPatterns.get(inferredIntent)!;

    if (!intentMap.has(inferredLang)) {
      intentMap.set(inferredLang, []);
    }

    const langPatterns = intentMap.get(inferredLang)!;
    for (const p of patterns) {
      if (!langPatterns.includes(p.pattern)) {
        langPatterns.push(p.pattern);
      }
    }

    console.log(`  [OK] ${file}: ${patterns.length} patterns → ${inferredIntent}.${inferredLang}`);
  }

  // Merge into runtime
  console.log('\n=== Merging into Runtime ===\n');

  for (const [intent, langMap] of newPatterns) {
    if (!runtime.intents[intent]) {
      runtime.intents[intent] = {
        priority: 70,
        description: `${intent} patterns`,
        keywords: { en: [], pt: [] },
        patterns: { en: [], pt: [] }
      };
    }

    for (const [lang, patterns] of langMap) {
      // Add as keywords (phrases) rather than regex patterns
      const existing = runtime.intents[intent].keywords[lang] || [];
      const newKw = patterns.filter((p: string) => !existing.includes(p));

      runtime.intents[intent].keywords[lang] = [
        ...existing,
        ...newKw.slice(0, 200 - existing.length) // Cap at 200
      ];

      console.log(`  ${intent}.${lang}: +${newKw.length} keywords (total: ${runtime.intents[intent].keywords[lang].length})`);
    }
  }

  // Update meta
  runtime._meta.lastUpdated = new Date().toISOString().split('T')[0];
  runtime._meta.version = '2.0.0';
  runtime._meta.generatedPatterns = cacheFiles.length;

  // Write output
  const outputPath = path.join(DATA_DIR, 'intent_patterns.runtime.json');
  fs.writeFileSync(outputPath, JSON.stringify(runtime, null, 2));
  console.log(`\nWrote updated runtime to ${outputPath}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total intents: ${Object.keys(runtime.intents).length}`);
  for (const [intent, data] of Object.entries(runtime.intents) as any) {
    const enKw = data.keywords?.en?.length || 0;
    const ptKw = data.keywords?.pt?.length || 0;
    console.log(`  ${intent}: ${enKw} EN keywords, ${ptKw} PT keywords`);
  }
}

// Intent inference heuristics
function inferIntent(samples: string[]): string | null {
  const text = samples.join(' ').toLowerCase();

  // File actions
  if (text.includes('where is') || text.includes('find file') || text.includes('open file') ||
      text.includes('show me file') || text.includes('list files') || text.includes('my documents') ||
      text.includes('what files') || text.includes('folder')) {
    return 'file_actions';
  }

  // Documents / RAG
  if (text.includes('summarize') || text.includes('summary') || text.includes('explain') ||
      text.includes('what does') || text.includes('tell me about') || text.includes('extract') ||
      text.includes('analyze') || text.includes('compare')) {
    return 'documents';
  }

  // Help
  if (text.includes('how do i') || text.includes('how to') || text.includes('help') ||
      text.includes('tutorial') || text.includes('what can you')) {
    return 'help';
  }

  // Conversation
  if (text.includes('hello') || text.includes('hi ') || text.includes('thank') ||
      text.includes('bye') || text.includes('how are you')) {
    return 'conversation';
  }

  // Finance
  if (text.includes('budget') || text.includes('expense') || text.includes('revenue') ||
      text.includes('financial') || text.includes('investment')) {
    return 'finance';
  }

  // Legal
  if (text.includes('contract') || text.includes('legal') || text.includes('clause') ||
      text.includes('agreement') || text.includes('liability')) {
    return 'legal';
  }

  // Medical
  if (text.includes('diagnosis') || text.includes('patient') || text.includes('treatment') ||
      text.includes('symptom') || text.includes('medical')) {
    return 'medical';
  }

  // Engineering
  if (text.includes('specification') || text.includes('technical') || text.includes('design') ||
      text.includes('requirements') || text.includes('architecture')) {
    return 'engineering';
  }

  // Reasoning
  if (text.includes('calculate') || text.includes('compute') || text.includes('solve') ||
      text.includes('math') || text.includes('formula')) {
    return 'reasoning';
  }

  // Extraction
  if (text.includes('extract') || text.includes('pull out') || text.includes('get the') ||
      text.includes('list all') || text.includes('find all')) {
    return 'extraction';
  }

  return 'documents'; // Default fallback
}

// Language inference
function inferLanguage(samples: string[]): 'en' | 'pt' {
  const text = samples.join(' ').toLowerCase();

  // Portuguese indicators
  const ptIndicators = ['onde', 'arquivo', 'documento', 'mostrar', 'listar', 'qual', 'quais',
    'como', 'fazer', 'resumo', 'extrair', 'analisar', 'comparar', 'ajuda', 'obrigado'];

  const ptCount = ptIndicators.filter(ind => text.includes(ind)).length;

  return ptCount >= 2 ? 'pt' : 'en';
}

// Run
consolidate().catch(console.error);
