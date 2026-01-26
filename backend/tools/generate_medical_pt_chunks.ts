#!/usr/bin/env npx ts-node
/**
 * Generate medical.pt.json lexicon in chunks to avoid truncation
 * Each chunk is a category with ~200 terms (smaller batches to avoid truncation)
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(__dirname, "../src/data_banks/lexicons");

const client = new Anthropic();

interface MedicalCategory {
  name: string;
  description: string;
  targetTerms: number;
}

// Smaller batches to avoid truncation
const CATEGORIES: MedicalCategory[] = [
  { name: "antibioticos", description: "Antibióticos: amoxicilina, azitromicina, ciprofloxacino, cefalexina, etc.", targetTerms: 150 },
  { name: "analgesicos_antiinflamatorios", description: "Analgésicos e anti-inflamatórios: paracetamol, ibuprofeno, dipirona, diclofenaco, etc.", targetTerms: 150 },
  { name: "cardiovasculares", description: "Medicamentos cardiovasculares: losartana, atenolol, enalapril, sinvastatina, etc.", targetTerms: 150 },
  { name: "psiquiatricos", description: "Medicamentos psiquiátricos: fluoxetina, sertralina, clonazepam, risperidona, etc.", targetTerms: 150 },
  { name: "diabetes_hormonais", description: "Antidiabéticos e hormonais: metformina, insulina, levotiroxina, etc.", targetTerms: 150 },
  { name: "outros_medicamentos", description: "Outros medicamentos: omeprazol, salbutamol, prednisona, etc.", targetTerms: 150 },
  { name: "doencas_cardiacas", description: "Doenças cardíacas: infarto, arritmia, insuficiência cardíaca, hipertensão, etc.", targetTerms: 150 },
  { name: "doencas_metabolicas", description: "Doenças metabólicas: diabetes, obesidade, dislipidemia, hipotireoidismo, etc.", targetTerms: 150 },
  { name: "doencas_respiratorias", description: "Doenças respiratórias: asma, DPOC, pneumonia, bronquite, etc.", targetTerms: 150 },
  { name: "doencas_neurologicas", description: "Doenças neurológicas: AVC, Alzheimer, Parkinson, epilepsia, enxaqueca, etc.", targetTerms: 150 },
  { name: "cancer_oncologia", description: "Câncer e oncologia: carcinoma, linfoma, leucemia, metástase, quimioterapia, etc.", targetTerms: 150 },
  { name: "doencas_infecciosas", description: "Doenças infecciosas: COVID, HIV, hepatite, tuberculose, dengue, etc.", targetTerms: 150 },
  { name: "cirurgias", description: "Cirurgias: apendicectomia, colecistectomia, cesariana, angioplastia, etc.", targetTerms: 150 },
  { name: "exames_imagem", description: "Exames de imagem: raio-x, tomografia, ressonância, ultrassom, mamografia, etc.", targetTerms: 150 },
  { name: "exames_laboratoriais", description: "Exames laboratoriais: hemograma, glicemia, colesterol, creatinina, TSH, etc.", targetTerms: 150 },
  { name: "anatomia_orgaos", description: "Anatomia e órgãos: coração, pulmão, fígado, rim, cérebro, etc.", targetTerms: 150 },
  { name: "sinais_sintomas", description: "Sinais e sintomas: dor, febre, dispneia, edema, náusea, fadiga, etc.", targetTerms: 150 },
  { name: "especialidades", description: "Especialidades médicas: cardiologia, neurologia, ortopedia, pediatria, etc.", targetTerms: 150 },
];

/**
 * Repair truncated JSON arrays by:
 * 1. Removing incomplete last entry
 * 2. Closing array properly
 */
function repairTruncatedJSON(text: string): string {
  let s = text.trim();

  // Remove markdown fences
  s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();

  // Find array start
  const arrayStart = s.indexOf("[");
  if (arrayStart === -1) throw new Error("No array found");
  s = s.substring(arrayStart);

  // If already valid, return as-is
  try {
    JSON.parse(s);
    return s;
  } catch {}

  // Find last complete object (ends with })
  const lastCompleteObj = s.lastIndexOf("}");
  if (lastCompleteObj === -1) throw new Error("No complete objects found");

  // Truncate to last complete object and close array
  s = s.substring(0, lastCompleteObj + 1);

  // Remove trailing comma if present
  s = s.replace(/,\s*$/, "");

  // Close the array
  s = s + "\n]";

  // Validate
  JSON.parse(s);
  return s;
}

function extractJSON(text: string): any {
  // First try direct parse after cleaning
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();

  // Find JSON boundaries
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const start = Math.min(
      s.indexOf("{") === -1 ? Infinity : s.indexOf("{"),
      s.indexOf("[") === -1 ? Infinity : s.indexOf("[")
    );
    if (start !== Infinity) s = s.substring(start);
  }

  // Try direct parse
  try {
    return JSON.parse(s);
  } catch {}

  // Try repair for truncated arrays
  const repaired = repairTruncatedJSON(text);
  return JSON.parse(repaired);
}

async function generateCategory(category: MedicalCategory, retryCount = 0): Promise<any[]> {
  console.log(`\n📝 Generating ${category.name} (${category.targetTerms} terms)...`);

  const prompt = `Generate a JSON array of ${category.targetTerms} medical terms in Portuguese (PT-BR).

Category: ${category.name}
Description: ${category.description}

Format - output ONLY valid JSON array, no markdown:
[
  {"canonical": "amoxicilina", "aliases": ["amoxil", "amox", "amoxacilina"]},
  {"canonical": "azitromicina", "aliases": ["zitromax", "azitro", "azi"]}
]

Rules:
- canonical: standardized Portuguese term
- aliases: 3-5 alternatives (abbreviations, brand names, typos, informal)
- Generate ${category.targetTerms} unique terms
- No duplicate canonicals`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Non-text response");

    const terms = extractJSON(content.text);
    if (!Array.isArray(terms)) throw new Error("Response is not an array");

    console.log(`✅ ${category.name}: ${terms.length} terms`);
    return terms;
  } catch (error: any) {
    console.error(`⚠️ ${category.name} parse error: ${error.message}`);

    // Retry with smaller batch
    if (retryCount < 2) {
      console.log(`   Retrying ${category.name} with smaller batch...`);
      const smallerCategory = { ...category, targetTerms: Math.floor(category.targetTerms / 2) };
      await new Promise((r) => setTimeout(r, 2000));
      return generateCategory(smallerCategory, retryCount + 1);
    }

    console.error(`❌ ${category.name} failed after retries`);
    return [];
  }
}

async function main() {
  console.log("🚀 Generating medical.pt.json in chunks...\n");

  const categoryTerms: Record<string, any[]> = {};

  for (const category of CATEGORIES) {
    const terms = await generateCategory(category);
    categoryTerms[category.name] = terms;
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Collect all terms and deduplicate
  const allTerms: any[] = [];
  const seen = new Set<string>();

  for (const [catName, terms] of Object.entries(categoryTerms)) {
    for (const term of terms) {
      const key = term.canonical?.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      allTerms.push({ ...term, _category: catName });
    }
  }

  // Group by high-level categories
  const medications = allTerms.filter((t) =>
    ["antibioticos", "analgesicos_antiinflamatorios", "cardiovasculares", "psiquiatricos", "diabetes_hormonais", "outros_medicamentos"].includes(t._category)
  );
  const conditions = allTerms.filter((t) =>
    ["doencas_cardiacas", "doencas_metabolicas", "doencas_respiratorias", "doencas_neurologicas", "cancer_oncologia", "doencas_infecciosas"].includes(t._category)
  );
  const procedures = allTerms.filter((t) => t._category === "cirurgias");
  const diagnostics = allTerms.filter((t) => ["exames_imagem", "exames_laboratoriais"].includes(t._category));
  const anatomy = allTerms.filter((t) => t._category === "anatomia_orgaos");
  const symptoms = allTerms.filter((t) => t._category === "sinais_sintomas");
  const specialties = allTerms.filter((t) => t._category === "especialidades");

  // Clean _category from output
  const clean = (arr: any[]) => arr.map(({ _category, ...rest }) => rest);

  const output = {
    _meta: {
      version: "1.0.0",
      generated: new Date().toISOString().split("T")[0],
      purpose: "Léxico médico PT-BR - termos canônicos e aliases para análise de documentos médicos",
      totalTerms: allTerms.length,
      domain: "medical",
      language: "pt-BR",
    },
    categories: {
      medications: clean(medications),
      conditions: clean(conditions),
      procedures: clean(procedures),
      diagnostics: clean(diagnostics),
      anatomy: clean(anatomy),
      symptoms: clean(symptoms),
      specialties: clean(specialties),
    },
  };

  const outputPath = path.join(OUTPUT_DIR, "medical.pt.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved: ${outputPath}`);
  console.log(`📊 Total unique terms: ${allTerms.length}`);
  console.log(`   - medications: ${medications.length}`);
  console.log(`   - conditions: ${conditions.length}`);
  console.log(`   - procedures: ${procedures.length}`);
  console.log(`   - diagnostics: ${diagnostics.length}`);
  console.log(`   - anatomy: ${anatomy.length}`);
  console.log(`   - symptoms: ${symptoms.length}`);
  console.log(`   - specialties: ${specialties.length}`);
}

main().catch(console.error);
