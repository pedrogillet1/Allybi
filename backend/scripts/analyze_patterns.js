const data = JSON.parse(require("fs").readFileSync("src/data/intent_patterns.json", "utf8"));
const skip = ["version", "lastUpdated", "description"];

const stats = [];
for (const [intent, config] of Object.entries(data)) {
  if (skip.includes(intent) || !config.patterns) continue;

  const en = (config.patterns.en || []).length;
  const pt = (config.patterns.pt || []).length;
  const es = (config.patterns.es || []).length;
  stats.push({ intent, en, pt, es, total: en + pt + es });
}

stats.sort((a, b) => a.total - b.total);
console.log("Intent Pattern Counts (sorted by total):\n");
console.log("Intent".padEnd(20), "EN".padStart(4), "PT".padStart(4), "ES".padStart(4), "Total".padStart(6));
console.log("-".repeat(42));
for (const s of stats) {
  console.log(s.intent.padEnd(20), String(s.en).padStart(4), String(s.pt).padStart(4), String(s.es).padStart(4), String(s.total).padStart(6));
}
console.log("-".repeat(42));
const totals = stats.reduce((acc, s) => ({ en: acc.en + s.en, pt: acc.pt + s.pt, es: acc.es + s.es }), { en: 0, pt: 0, es: 0 });
console.log("TOTAL".padEnd(20), String(totals.en).padStart(4), String(totals.pt).padStart(4), String(totals.es).padStart(4), String(totals.en + totals.pt + totals.es).padStart(6));
