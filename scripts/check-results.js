const fs = require('fs');
const dir = 'C:/Users/Pedro/Desktop/webapp/reports/query-grading';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
let ok = 0, err = 0, empty = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  if (j.error) { err++; console.log('ERROR:', f, j.error); }
  else if (j.answer === null || j.answer === undefined || j.answer.length < 10) { empty++; console.log('EMPTY:', f); }
  else ok++;
}
console.log('\n--- Summary ---');
console.log('OK:', ok, '| Errors:', err, '| Empty:', empty, '| Total:', files.length);
