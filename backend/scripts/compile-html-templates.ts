/**
 * Compile HTML/CSS template packs into Google Slides template libraries.
 *
 * Usage (example):
 *   cd backend
 *   ts-node --transpile-only scripts/compile-html-templates.ts \
 *     --pack-dir "/Users/pg/Downloads/Koda_Template_Pack_extracted/Koda_Template_Pack" \
 *     --pack-name "v1" \
 *     --drive-assets-folder-id "<optional folder id>"
 *
 * Expects directories like:
 *   <pack-dir>/koda_template_business/*.html
 *   <pack-dir>/koda_template_legal/*.html
 *   ...
 */

import * as path from 'path';
import HtmlTemplateCompilerService from '../src/services/editing/slides/htmlTemplateCompiler.service';

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('--')) return null;
  return v;
}

function requiredArg(flag: string): string {
  const v = argValue(flag);
  if (!v) {
    throw new Error(`Missing required arg: ${flag}`);
  }
  return v;
}

async function main() {
  // Puppeteer `file://` navigation requires absolute paths; relative paths produce invalid URLs.
  const packDir = path.resolve(requiredArg('--pack-dir'));
  const packName = argValue('--pack-name') || 'pack';
  const driveAssetsFolderId = argValue('--drive-assets-folder-id') || undefined;
  const includeVariants = process.argv.includes('--include-variants');

  const compiler = new HtmlTemplateCompilerService();

  const domains: Array<{ key: string; dirName: string; title: string }> = [
    { key: 'business', dirName: 'koda_template_business', title: `Koda Template - Business (${packName})` },
    { key: 'legal', dirName: 'koda_template_legal', title: `Koda Template - Legal (${packName})` },
    { key: 'stats', dirName: 'koda_template_stats', title: `Koda Template - Stats (${packName})` },
    { key: 'medical', dirName: 'koda_template_medical', title: `Koda Template - Medical (${packName})` },
    { key: 'book', dirName: 'koda_template_book', title: `Koda Template - Book (${packName})` },
    { key: 'script', dirName: 'koda_template_script', title: `Koda Template - Script (${packName})` },
  ];

  const results: any[] = [];
  for (const d of domains) {
    const sourceDir = path.resolve(packDir, d.dirName);
    // eslint-disable-next-line no-console
    console.log(`\n== Compiling ${d.key} from ${sourceDir} ==`);
    const r = await compiler.compileDomainTemplate({
      domain: d.key,
      sourceDir,
      title: d.title,
      driveAssetsFolderId,
      includeVariants,
    });
    results.push(r);
    // eslint-disable-next-line no-console
    console.log(`Created: ${r.url}`);
    if (r.warnings?.length) {
      // eslint-disable-next-line no-console
      console.log(`Warnings:\n- ${r.warnings.join('\n- ')}`);
    }
  }

  // Print env snippet for wiring into Koda. Keep per-domain list vars so you can accumulate packs.
  // eslint-disable-next-line no-console
  console.log('\n== Env snippet ==');
  for (const r of results) {
    const upper = String(r.domain).toUpperCase();
    // eslint-disable-next-line no-console
    console.log(`KODA_SLIDES_TEMPLATE_${upper}_IDS=${r.presentationId}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
