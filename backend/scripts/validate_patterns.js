const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../src/data/intent_patterns.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let errors = [];
let validated = 0;

// Test all patterns in all intents
for (const [intent, config] of Object.entries(data)) {
  if (typeof config !== 'object' || !config.patterns) continue;

  for (const [lang, patterns] of Object.entries(config.patterns)) {
    if (!Array.isArray(patterns)) continue;

    for (const pattern of patterns) {
      try {
        new RegExp(pattern, 'i');
        validated++;
      } catch (e) {
        errors.push({ intent, lang, pattern, error: e.message });
      }
    }
  }
}

console.log('=== Regex Validation Results ===');
console.log('Patterns validated:', validated);
console.log('Errors:', errors.length);

if (errors.length > 0) {
  console.log('\n=== ERRORS ===');
  errors.forEach(e => {
    console.log('Intent:', e.intent, '| Lang:', e.lang);
    console.log('Pattern:', e.pattern);
    console.log('Error:', e.error);
    console.log('---');
  });
  process.exit(1);
} else {
  console.log('\n✅ All regex patterns compile successfully!');
  process.exit(0);
}
