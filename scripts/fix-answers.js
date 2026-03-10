const fs = require('fs');
const dir = 'C:/Users/Pedro/Desktop/webapp/reports/query-grading';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
let ok = 0, err = 0, empty = 0, fixed = 0;
for (const f of files) {
  const path = dir + '/' + f;
  const j = JSON.parse(fs.readFileSync(path, 'utf8'));

  // Fix answer extraction: check rawResponse.data.assistantText
  if ((j.answer === null || j.answer === undefined || j.answer.length < 10) && j.rawResponse) {
    const r = j.rawResponse;
    const text = r.data?.assistantText || r.assistantText || null;
    if (text && text.length >= 10) {
      j.answer = text;
      fs.writeFileSync(path, JSON.stringify(j, null, 2));
      fixed++;
    }
  }

  if (j.error) { err++; }
  else if (j.answer === null || j.answer === undefined || j.answer.length < 10) { empty++; console.log('STILL EMPTY:', f); }
  else ok++;
}
console.log('\n--- Summary ---');
console.log('OK:', ok, '| Errors:', err, '| Empty:', empty, '| Fixed:', fixed, '| Total:', files.length);
