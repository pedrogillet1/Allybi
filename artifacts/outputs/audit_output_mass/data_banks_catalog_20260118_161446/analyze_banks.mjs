import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { join, basename, dirname, relative } from 'path';
import { createHash } from 'crypto';

const DATA_BANKS_ROOT = '/Users/pg/Desktop/koda-webapp/backend/src/data_banks';
const OUTPUT_DIR = '/Users/pg/Desktop/koda-webapp/backend/audit_output_mass/data_banks_catalog_20260118_161446';

async function walkDir(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, files);
    } else if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function inferLanguage(filename) {
  if (filename.includes('.en.')) return 'en';
  if (filename.includes('.pt.')) return 'pt';
  if (filename.includes('.es.')) return 'es';
  if (filename.includes('.any.')) return 'any';
  return 'unknown';
}

function inferCategory(filePath) {
  const rel = relative(DATA_BANKS_ROOT, filePath);
  const parts = rel.split('/');
  if (parts.length > 1) return parts[0];
  return 'root';
}

function countEntries(data, depth = 0) {
  if (Array.isArray(data)) {
    return { total: data.length, type: 'array' };
  }

  if (typeof data !== 'object' || data === null) {
    return { total: 0, type: 'scalar' };
  }

  // Check for _meta field (indicates structured bank)
  const hasMeta = '_meta' in data;

  // Count patterns in various structures
  let total = 0;
  let breakdown = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === '_meta') continue;

    if (Array.isArray(value)) {
      breakdown[key] = value.length;
      total += value.length;
    } else if (typeof value === 'object' && value !== null) {
      // Check for patterns array inside
      if (value.patterns && Array.isArray(value.patterns)) {
        breakdown[key] = value.patterns.length;
        total += value.patterns.length;
      } else if (value.terms && Array.isArray(value.terms)) {
        breakdown[key] = value.terms.length;
        total += value.terms.length;
      } else if (value.templates && Array.isArray(value.templates)) {
        breakdown[key] = value.templates.length;
        total += value.templates.length;
      } else if (value.rules && Array.isArray(value.rules)) {
        breakdown[key] = value.rules.length;
        total += value.rules.length;
      } else if (value.items && Array.isArray(value.items)) {
        breakdown[key] = value.items.length;
        total += value.items.length;
      } else {
        // Count nested categories
        const nested = countEntries(value, depth + 1);
        if (nested.total > 0) {
          breakdown[key] = nested.total;
          total += nested.total;
        } else {
          // Count object keys as entries
          const keyCount = Object.keys(value).filter(k => k !== '_meta').length;
          if (keyCount > 0) {
            breakdown[key] = keyCount;
            total += keyCount;
          }
        }
      }
    }
  }

  // If we found nothing, count top-level keys
  if (total === 0) {
    total = Object.keys(data).filter(k => k !== '_meta').length;
  }

  return { total, type: 'object', hasMeta, breakdown };
}

function getBankId(filename) {
  // Remove language suffix and .json
  return basename(filename)
    .replace(/\.(en|pt|es|any)\.json$/, '')
    .replace(/\.json$/, '');
}

async function analyzeFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const stats = await stat(filePath);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return {
      path: filePath,
      error: 'Invalid JSON: ' + e.message,
      bytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    };
  }

  const counts = countEntries(data);
  const language = inferLanguage(basename(filePath));
  const category = inferCategory(filePath);
  const bankId = getBankId(basename(filePath));

  // Extract meta info if present
  let meta = {};
  if (data._meta) {
    meta = {
      bank: data._meta.bank,
      version: data._meta.version,
      description: data._meta.description,
      targetCount: data._meta.target_count
    };
  }

  return {
    path: relative(DATA_BANKS_ROOT, filePath),
    fullPath: filePath,
    category,
    language,
    bankId,
    entryCount: counts.total,
    countType: counts.type,
    hasMeta: counts.hasMeta,
    breakdown: counts.breakdown,
    meta,
    sha256: hash,
    bytes: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
}

async function main() {
  console.log('Analyzing data banks...');

  const files = await walkDir(DATA_BANKS_ROOT);
  console.log(`Found ${files.length} JSON files`);

  const results = [];
  for (const file of files) {
    const analysis = await analyzeFile(file);
    results.push(analysis);
  }

  // Sort by category then path
  results.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.path.localeCompare(b.path);
  });

  // Write COUNTS_BY_BANK.json
  await writeFile(
    join(OUTPUT_DIR, 'COUNTS_BY_BANK.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('Wrote COUNTS_BY_BANK.json');

  // Generate stats
  const stats = {
    totalFiles: results.length,
    totalPatterns: results.reduce((sum, r) => sum + (r.entryCount || 0), 0),
    byCategory: {},
    byLanguage: { en: 0, pt: 0, es: 0, any: 0, unknown: 0 },
    top10Largest: [],
    errors: results.filter(r => r.error)
  };

  for (const r of results) {
    // By category
    if (!stats.byCategory[r.category]) {
      stats.byCategory[r.category] = { files: 0, patterns: 0 };
    }
    stats.byCategory[r.category].files++;
    stats.byCategory[r.category].patterns += r.entryCount || 0;

    // By language
    if (stats.byLanguage[r.language] !== undefined) {
      stats.byLanguage[r.language]++;
    }
  }

  // Top 10 largest
  stats.top10Largest = [...results]
    .filter(r => !r.error)
    .sort((a, b) => b.entryCount - a.entryCount)
    .slice(0, 10)
    .map(r => ({ path: r.path, count: r.entryCount, category: r.category }));

  await writeFile(
    join(OUTPUT_DIR, 'STATS.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log('Wrote STATS.json');

  // Generate parity report
  const families = {};
  for (const r of results) {
    if (!families[r.bankId]) {
      families[r.bankId] = { category: r.category };
    }
    families[r.bankId][r.language] = r.entryCount;
  }

  await writeFile(
    join(OUTPUT_DIR, 'PARITY.json'),
    JSON.stringify(families, null, 2)
  );
  console.log('Wrote PARITY.json');

  console.log('\n=== SUMMARY ===');
  console.log(`Total files: ${stats.totalFiles}`);
  console.log(`Total patterns: ${stats.totalPatterns}`);
  console.log('\nBy category:');
  for (const [cat, data] of Object.entries(stats.byCategory).sort((a, b) => b[1].patterns - a[1].patterns)) {
    console.log(`  ${cat}: ${data.files} files, ${data.patterns} patterns`);
  }
  console.log('\nBy language:');
  for (const [lang, count] of Object.entries(stats.byLanguage)) {
    console.log(`  ${lang}: ${count} files`);
  }
  console.log('\nTop 10 largest banks:');
  for (const item of stats.top10Largest) {
    console.log(`  ${item.path}: ${item.count} entries`);
  }
  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of stats.errors) {
      console.log(`  ${e.path}: ${e.error}`);
    }
  }
}

main().catch(console.error);
