import * as fs from "fs";
import * as path from "path";

const LEXICONS_DIR = path.join(__dirname, "../../src/data_banks/lexicons");

// Transform lexicons from {en, pt} format to {term, aliases_en, aliases_pt} format
function transformLexicon(inputFile: string): void {
  const filePath = path.join(LEXICONS_DIR, inputFile);

  if (!fs.existsSync(filePath)) {
    console.log(`✗ ${inputFile}: Not found`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  if (!Array.isArray(data)) {
    console.log(`✗ ${inputFile}: Not an array`);
    return;
  }

  // Check current format
  if (data.length > 0 && data[0].aliases_en !== undefined) {
    console.log(`✓ ${inputFile}: Already in correct format`);
    return;
  }

  // Transform
  const transformed = data.map((item: any, idx: number) => ({
    id: item.id || idx + 1,
    term: item.en || item.term,
    aliases_en: [item.en].filter(Boolean),
    aliases_pt: [item.pt].filter(Boolean),
  }));

  fs.writeFileSync(filePath, JSON.stringify(transformed, null, 2));
  console.log(`✓ ${inputFile}: Transformed ${transformed.length} entries`);
}

function main(): void {
  console.log("Fixing lexicon formats...\n");

  const files = fs.readdirSync(LEXICONS_DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    transformLexicon(file);
  }

  console.log("\nDone!");
}

main();
