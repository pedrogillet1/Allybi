/**
 * Data Bank Generator v2
 *
 * Generates routing triggers, negatives, formatting constraints, normalizers,
 * and domain lexicons using Claude API with EN/PT parity enforcement.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx ts-node generate.ts --all
 *   ANTHROPIC_API_KEY=sk-... npx ts-node generate.ts --triggers
 *   ANTHROPIC_API_KEY=sk-... npx ts-node generate.ts --negatives
 *   ANTHROPIC_API_KEY=sk-... npx ts-node generate.ts --dry-run
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  model: 'claude-sonnet-4-20250514',
  temperature: 0.7,
  maxTokens: 4096,
  cacheDir: path.join(__dirname, '.cache'),
  outputBase: path.join(__dirname, '../../src/data_banks'),
  batchSize: 50,
  dedupeThreshold: 0.85,
};

const PLAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'generation_plan.json'), 'utf-8'));

// ============================================================================
// TYPES
// ============================================================================

interface GeneratedPattern {
  id: string;
  pattern: string;
  regex?: string;
  intent?: string;
  language: 'en' | 'pt';
  category?: string;
  priority?: number;
}

interface GenerationResult {
  bank: string;
  language: string;
  count: number;
  patterns: GeneratedPattern[];
  cached: boolean;
}

// ============================================================================
// CLAUDE CLIENT
// ============================================================================

class ClaudeGenerator {
  private client: Anthropic;
  private cache: Map<string, string> = new Map();

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable required');
    }
    this.client = new Anthropic({ apiKey });
    this.loadCache();
  }

  private loadCache(): void {
    if (!fs.existsSync(CONFIG.cacheDir)) {
      fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
    }
    const cacheFile = path.join(CONFIG.cacheDir, 'generations.json');
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      this.cache = new Map(Object.entries(data));
      console.log(`Loaded ${this.cache.size} cached generations`);
    }
  }

  private saveCache(): void {
    const cacheFile = path.join(CONFIG.cacheDir, 'generations.json');
    const data = Object.fromEntries(this.cache);
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  }

  private getCacheKey(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cacheKey = this.getCacheKey(prompt + (systemPrompt || ''));

    if (this.cache.has(cacheKey)) {
      console.log(`  [CACHE HIT] ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    console.log(`  [API CALL] Generating...`);

    const response = await this.client.messages.create({
      model: CONFIG.model,
      max_tokens: CONFIG.maxTokens,
      temperature: CONFIG.temperature,
      system: systemPrompt || 'You are a data generation assistant. Output only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    this.cache.set(cacheKey, content.text);
    this.saveCache();

    return content.text;
  }
}

// ============================================================================
// PATTERN GENERATORS
// ============================================================================

async function generateRoutingTriggers(client: ClaudeGenerator): Promise<void> {
  console.log('\n=== Generating Routing Triggers ===\n');

  const intents = PLAN.routing_triggers.intents;

  for (const [intentName, intentConfig] of Object.entries(intents) as [string, any][]) {
    console.log(`\nIntent: ${intentName} (target: ${intentConfig.count} per language)`);

    for (const lang of ['en', 'pt'] as const) {
      const prompt = buildTriggerPrompt(intentName, intentConfig, lang);
      const result = await client.generate(prompt, SYSTEM_PROMPTS.triggers);

      const patterns = parsePatterns(result, intentName, lang);
      console.log(`  ${lang.toUpperCase()}: Generated ${patterns.length} patterns`);

      // Save to file
      const outputPath = path.join(CONFIG.outputBase, 'triggers', `${intentName}.${lang}.json`);
      savePatterns(outputPath, patterns);
    }
  }
}

async function generateNegativePatterns(client: ClaudeGenerator): Promise<void> {
  console.log('\n=== Generating Negative Patterns ===\n');

  const categories = PLAN.negative_patterns.categories;

  for (const [catName, catConfig] of Object.entries(categories) as [string, any][]) {
    console.log(`\nCategory: ${catName} (target: ${catConfig.count} per language)`);

    for (const lang of ['en', 'pt'] as const) {
      const prompt = buildNegativePrompt(catName, catConfig, lang);
      const result = await client.generate(prompt, SYSTEM_PROMPTS.negatives);

      const patterns = parsePatterns(result, catName, lang);
      console.log(`  ${lang.toUpperCase()}: Generated ${patterns.length} patterns`);

      const outputPath = path.join(CONFIG.outputBase, 'negatives', `${catName}.${lang}.json`);
      savePatterns(outputPath, patterns);
    }
  }
}

async function generateFormattingConstraints(client: ClaudeGenerator): Promise<void> {
  console.log('\n=== Generating Formatting Constraints ===\n');

  const types = PLAN.formatting_constraints.types;

  for (const [typeName, typeConfig] of Object.entries(types) as [string, any][]) {
    console.log(`\nType: ${typeName} (target: ${typeConfig.count} per language)`);

    for (const lang of ['en', 'pt'] as const) {
      const prompt = buildFormattingPrompt(typeName, typeConfig, lang);
      const result = await client.generate(prompt, SYSTEM_PROMPTS.formatting);

      const patterns = parsePatterns(result, typeName, lang);
      console.log(`  ${lang.toUpperCase()}: Generated ${patterns.length} patterns`);

      const outputPath = path.join(CONFIG.outputBase, 'formatting', `${typeName}.${lang}.json`);
      savePatterns(outputPath, patterns);
    }
  }
}

async function generateNormalizers(client: ClaudeGenerator): Promise<void> {
  console.log('\n=== Generating Normalizers ===\n');

  const types = PLAN.normalizers.types;

  for (const [typeName, typeConfig] of Object.entries(types) as [string, any][]) {
    console.log(`\nType: ${typeName} (target: ${typeConfig.count} total)`);

    const prompt = buildNormalizerPrompt(typeName, typeConfig);
    const result = await client.generate(prompt, SYSTEM_PROMPTS.normalizers);

    const patterns = parseNormalizerPatterns(result, typeName);
    console.log(`  Generated ${patterns.length} normalizer entries`);

    const outputPath = path.join(CONFIG.outputBase, 'normalizers', `${typeName}.json`);
    savePatterns(outputPath, patterns);
  }
}

async function generateLexicons(client: ClaudeGenerator): Promise<void> {
  console.log('\n=== Generating Domain Lexicons ===\n');

  const domains = PLAN.domain_lexicons.domains;

  for (const [domainName, domainConfig] of Object.entries(domains) as [string, any][]) {
    console.log(`\nDomain: ${domainName} (target: ${domainConfig.count} terms)`);

    const prompt = buildLexiconPrompt(domainName, domainConfig);
    const result = await client.generate(prompt, SYSTEM_PROMPTS.lexicons);

    const terms = parseLexiconTerms(result, domainName);
    console.log(`  Generated ${terms.length} lexicon terms`);

    const outputPath = path.join(CONFIG.outputBase, 'lexicons', `${domainName}.json`);
    savePatterns(outputPath, terms);
  }
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

const SYSTEM_PROMPTS = {
  triggers: `You are a pattern generation expert. Generate diverse natural language patterns for intent detection.
Rules:
- Output valid JSON array only
- Each pattern must be unique and natural
- Include variations in phrasing, word order, and formality
- Patterns should be lowercase
- Include regex where helpful (escape special chars)
- No duplicates or near-duplicates`,

  negatives: `You are a negative pattern expert. Generate patterns that should BLOCK certain intent routing.
Rules:
- Output valid JSON array only
- Each pattern indicates when NOT to route to an intent
- Include context patterns that override base intent
- Patterns should be specific enough to prevent false positives`,

  formatting: `You are a format detection expert. Generate patterns for detecting output format requests.
Rules:
- Output valid JSON array only
- Include variations for each format type
- Cover both explicit and implicit format requests
- Include count extraction patterns (e.g., "list five" -> count=5)`,

  normalizers: `You are a text normalization expert. Generate input normalization rules.
Rules:
- Output valid JSON array only
- Include input variants and their normalized output
- Cover common misspellings, abbreviations, and variations
- For bilingual entries, include both EN and PT variants`,

  lexicons: `You are a domain terminology expert. Generate domain-specific term banks.
Rules:
- Output valid JSON array only
- Each term needs canonical EN name, PT translation, and aliases
- Include common abbreviations and variations
- Group related terms together`,
};

function buildTriggerPrompt(intent: string, config: any, lang: 'en' | 'pt'): string {
  const langName = lang === 'en' ? 'English' : 'Portuguese (Brazilian)';
  const examples = config.examples?.[lang] || [];

  return `Generate ${config.count} unique ${langName} patterns for the "${intent}" intent.

Description: ${config.description}
Anchor words: ${config.anchors?.join(', ') || 'N/A'}
Example queries: ${examples.join('; ')}

Output format:
[
  {"id": "${intent}_${lang}_001", "pattern": "pattern text", "regex": "optional regex", "priority": 1-100},
  ...
]

Generate exactly ${config.count} diverse patterns. Make them natural and varied.`;
}

function buildNegativePrompt(category: string, config: any, lang: 'en' | 'pt'): string {
  const langName = lang === 'en' ? 'English' : 'Portuguese (Brazilian)';

  return `Generate ${config.count} unique ${langName} negative patterns for category "${category}".

Description: ${config.description}
Trigger words that indicate this block: ${config.triggers?.join(', ') || 'N/A'}
This blocks routing to: ${config.blocks || 'N/A'}

Output format:
[
  {"id": "${category}_${lang}_001", "pattern": "pattern text", "blocks": "${config.blocks}", "priority": 1-100},
  ...
]

Generate ${config.count} patterns that should PREVENT incorrect routing.`;
}

function buildFormattingPrompt(type: string, config: any, lang: 'en' | 'pt'): string {
  const langName = lang === 'en' ? 'English' : 'Portuguese (Brazilian)';

  return `Generate ${config.count} unique ${langName} patterns for detecting "${type}" format requests.

Description: ${config.description}
Example patterns: ${config.patterns?.join(', ') || 'N/A'}
Validation rule: ${config.validator || 'N/A'}

Output format:
[
  {"id": "${type}_${lang}_001", "pattern": "pattern text", "extractCount": true/false, "regex": "optional regex"},
  ...
]

Generate ${config.count} patterns for detecting this format request.`;
}

function buildNormalizerPrompt(type: string, config: any): string {
  return `Generate ${config.count} normalization rules for "${type}".

Description: ${config.description}
Variant types: ${config.variants?.join(', ') || 'N/A'}
Expected output: ${config.output || 'N/A'}

Output format:
[
  {"id": "${type}_001", "input": ["variant1", "variant2"], "output": "normalized form", "lang": "en|pt|both"},
  ...
]

Generate ${config.count} normalization entries covering EN and PT variants.`;
}

function buildLexiconPrompt(domain: string, config: any): string {
  return `Generate ${config.count} domain terms for "${domain}".

Example terms: ${config.terms?.join(', ') || 'N/A'}
Requires PT aliases: ${config.requires_pt_aliases}

Output format:
[
  {
    "id": "${domain}_001",
    "canonical_en": "term in English",
    "canonical_pt": "term in Portuguese",
    "aliases_en": ["alias1", "alias2"],
    "aliases_pt": ["alias1", "alias2"],
    "category": "sub-category if applicable"
  },
  ...
]

Generate ${config.count} domain-specific terms with EN/PT parity.`;
}

// ============================================================================
// PARSERS
// ============================================================================

function parsePatterns(response: string, category: string, lang: string): GeneratedPattern[] {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`  [ERROR] No JSON array found in response`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((p: any, i: number) => ({
      id: p.id || `${category}_${lang}_${String(i + 1).padStart(3, '0')}`,
      pattern: p.pattern,
      regex: p.regex,
      language: lang,
      category,
      priority: p.priority || 50,
    }));
  } catch (e) {
    console.error(`  [ERROR] Failed to parse response: ${e}`);
    return [];
  }
}

function parseNormalizerPatterns(response: string, type: string): any[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`  [ERROR] Failed to parse normalizer response: ${e}`);
    return [];
  }
}

function parseLexiconTerms(response: string, domain: string): any[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`  [ERROR] Failed to parse lexicon response: ${e}`);
    return [];
  }
}

// ============================================================================
// FILE I/O
// ============================================================================

function savePatterns(outputPath: string, patterns: any[]): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(patterns, null, 2));
  console.log(`  Saved to ${path.relative(process.cwd(), outputPath)}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');

  console.log('='.repeat(60));
  console.log('Data Bank Generator v2');
  console.log('='.repeat(60));
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Output: ${CONFIG.outputBase}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Would generate:');
    console.log(`- Routing triggers: ${PLAN.routing_triggers.total_per_language} per language`);
    console.log(`- Overlays: ${PLAN.overlays.total_per_language} per language`);
    console.log(`- Negatives: ${PLAN.negative_patterns.total_per_language} per language`);
    console.log(`- Formatting: ${PLAN.formatting_constraints.total_per_language} per language`);
    console.log(`- Normalizers: ${PLAN.normalizers.total_shared} shared`);
    console.log(`- Lexicons: ${PLAN.domain_lexicons.total_terms} terms`);
    return;
  }

  const client = new ClaudeGenerator();

  if (all || args.includes('--triggers')) {
    await generateRoutingTriggers(client);
  }

  if (all || args.includes('--negatives')) {
    await generateNegativePatterns(client);
  }

  if (all || args.includes('--formatting')) {
    await generateFormattingConstraints(client);
  }

  if (all || args.includes('--normalizers')) {
    await generateNormalizers(client);
  }

  if (all || args.includes('--lexicons')) {
    await generateLexicons(client);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Generation complete!');
  console.log('='.repeat(60));
}

main().catch(console.error);
