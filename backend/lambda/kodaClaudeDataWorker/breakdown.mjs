import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./output/dataset_en_complete.json', 'utf8'));

const breakdown = {};

for (const item of data) {
  const key = item.intent;
  if (!breakdown[key]) {
    breakdown[key] = { subIntents: {}, totals: { keywords: 0, patterns: 0, examples: 0, edge_cases: 0, negatives: 0 } };
  }

  const sub = item.subIntent;
  breakdown[key].subIntents[sub] = {
    keywords: item.keywords?.length || 0,
    patterns: item.patterns?.length || 0,
    examples: item.examples?.length || 0,
    edge_cases: item.edge_cases?.length || 0,
    negatives: item.negatives?.length || 0
  };

  breakdown[key].totals.keywords += item.keywords?.length || 0;
  breakdown[key].totals.patterns += item.patterns?.length || 0;
  breakdown[key].totals.examples += item.examples?.length || 0;
  breakdown[key].totals.edge_cases += item.edge_cases?.length || 0;
  breakdown[key].totals.negatives += item.negatives?.length || 0;
}

let grandTotal = { keywords: 0, patterns: 0, examples: 0, edge_cases: 0, negatives: 0 };

for (const [intent, info] of Object.entries(breakdown)) {
  const t = info.totals;
  const total = t.keywords + t.patterns + t.examples + t.edge_cases + t.negatives;
  console.log(`\n=== ${intent.toUpperCase()} === (Total: ${total})`);
  console.log(`  Keywords: ${t.keywords} | Patterns: ${t.patterns} | Examples: ${t.examples} | Edge: ${t.edge_cases} | Neg: ${t.negatives}`);
  console.log(`  Sub-intents:`);

  for (const [sub, counts] of Object.entries(info.subIntents)) {
    const subTotal = counts.keywords + counts.patterns + counts.examples + counts.edge_cases + counts.negatives;
    console.log(`    - ${sub}: ${subTotal} (kw:${counts.keywords} pat:${counts.patterns} ex:${counts.examples} edge:${counts.edge_cases} neg:${counts.negatives})`);
  }

  grandTotal.keywords += t.keywords;
  grandTotal.patterns += t.patterns;
  grandTotal.examples += t.examples;
  grandTotal.edge_cases += t.edge_cases;
  grandTotal.negatives += t.negatives;
}

const gt = grandTotal.keywords + grandTotal.patterns + grandTotal.examples + grandTotal.edge_cases + grandTotal.negatives;
console.log(`\n${'='.repeat(60)}`);
console.log(`GRAND TOTAL: ${gt}`);
console.log(`  Keywords:   ${grandTotal.keywords}`);
console.log(`  Patterns:   ${grandTotal.patterns}`);
console.log(`  Examples:   ${grandTotal.examples}`);
console.log(`  Edge Cases: ${grandTotal.edge_cases}`);
console.log(`  Negatives:  ${grandTotal.negatives}`);
