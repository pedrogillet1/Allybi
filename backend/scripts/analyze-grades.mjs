import fs from 'fs';
const r = JSON.parse(fs.readFileSync('reports/cert/data-bank-grading-report.json', 'utf8'));
const nonA = r.allBanks.filter(b => b.grade !== 'A');
console.log('NON-A BANKS: ' + nonA.length + '\n');
nonA.forEach(b => {
  console.log(b.grade + ' ' + b.rawScore + ' | ' + b.filePath);
  b.failures.forEach(f => console.log('    ' + f));
});

// Group by check
console.log('\n=== FAILURE SUMMARY ===');
const byCheck = {};
for (const b of nonA) {
  for (const f of b.failures) {
    const check = (f.match(/\[([^\]]+)\]/) || [])[1] || 'unknown';
    if (!byCheck[check]) byCheck[check] = [];
    byCheck[check].push(b.filePath);
  }
}
for (const [check, files] of Object.entries(byCheck)) {
  console.log('\n' + check + ' (' + files.length + '):');
  files.forEach(f => console.log('  ' + f));
}
