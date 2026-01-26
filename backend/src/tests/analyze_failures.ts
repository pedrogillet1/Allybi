import * as fs from 'fs';
import * as path from 'path';
import { OperatorResolver } from '../services/core/operatorResolver.service';

const suitePath = path.join(__dirname, 'routing_probe_suite.json');
const suite = JSON.parse(fs.readFileSync(suitePath, 'utf-8'));

const resolver = new OperatorResolver();

// Focus on remaining failures
const targetOps = ['list', 'summarize', 'compare', 'compute', 'locate_file', 'open'];

console.log('=== REMAINING FAILURES ===');
for (const op of targetOps) {
  const probes = suite.probes.filter((p: any) => p.expectedOperator === op);
  const failures = probes.filter((p: any) => {
    const result = resolver.resolve(p.query, p.lang || 'en');
    return result.operator !== op;
  });

  if (failures.length > 0) {
    console.log(`\n--- ${op} (${probes.length - failures.length}/${probes.length}) ---`);
    for (const f of failures) {
      const result = resolver.resolve(f.query, f.lang || 'en');
      console.log(`  "${f.query.substring(0, 60)}" → ${result.operator} (${result.confidence.toFixed(2)})`);
    }
  }
}
