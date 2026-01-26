import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BASE_DIR = path.join(__dirname, "../../src/data_banks");

interface FillTask {
  dir: string;
  file: string;
  currentCount: number;
  targetCount: number;
  desc: string;
}

const FILL_TASKS: FillTask[] = [
  // Overlays - need to double
  { dir: "triggers", file: "overlay_followup_inherit.en.json", currentCount: 110, targetCount: 220, desc: "Follow-up patterns for context inheritance (and what about, tell me more, expand on, also show)" },
  { dir: "triggers", file: "overlay_followup_inherit.pt.json", currentCount: 110, targetCount: 220, desc: "Padrões de continuação para herança de contexto (e quanto a, me conte mais, expanda, também mostre)" },
  { dir: "triggers", file: "overlay_format_request.en.json", currentCount: 120, targetCount: 240, desc: "Format change patterns (as table, in bullets, numbered list, in JSON, as markdown)" },
  { dir: "triggers", file: "overlay_format_request.pt.json", currentCount: 120, targetCount: 240, desc: "Padrões de mudança de formato (como tabela, em tópicos, lista numerada, em JSON, como markdown)" },
  { dir: "triggers", file: "overlay_clarify_required.en.json", currentCount: 60, targetCount: 120, desc: "Clarification needed patterns (which one, be specific, clarify, which file exactly)" },
  { dir: "triggers", file: "overlay_clarify_required.pt.json", currentCount: 60, targetCount: 120, desc: "Padrões de esclarecimento necessário (qual deles, seja específico, esclareça, qual arquivo exatamente)" },

  // Negatives - need to double
  { dir: "negatives", file: "block_exact_filename_fuzzy.en.json", currentCount: 30, targetCount: 60, desc: "Patterns blocking exact match when fuzzy references are used (the rosewood file, that document, the integration one)" },
  { dir: "negatives", file: "block_exact_filename_fuzzy.pt.json", currentCount: 30, targetCount: 60, desc: "Padrões bloqueando correspondência exata quando referências fuzzy são usadas (o arquivo rosewood, aquele documento, o de integração)" },

  // Formatting - need to double
  { dir: "formatting", file: "line_limit.en.json", currentCount: 35, targetCount: 70, desc: "Line limit patterns (in N lines, maximum N lines, keep to N lines)" },
  { dir: "formatting", file: "line_limit.pt.json", currentCount: 35, targetCount: 70, desc: "Padrões de limite de linhas (em N linhas, máximo N linhas, mantenha em N linhas)" },
  { dir: "formatting", file: "ranking_topn.en.json", currentCount: 40, targetCount: 80, desc: "Top-N ranking patterns (top 5, best 3, first 10, most important N)" },
  { dir: "formatting", file: "ranking_topn.pt.json", currentCount: 40, targetCount: 80, desc: "Padrões de ranking top-N (top 5, melhores 3, primeiros 10, N mais importantes)" },
];

async function generateMore(task: FillTask): Promise<any[]> {
  const needed = task.targetCount - task.currentCount;

  const isFormatting = task.dir === "formatting";
  const schema = isFormatting
    ? `Each object must have: "id" (number), "pattern" (string), "extractCount" (boolean, true if pattern has {n} placeholder)`
    : `Each object must have: "id" (number), "pattern" (string), "priority" (number 60-95)`;

  const prompt = `Generate exactly ${needed} UNIQUE patterns for: ${task.desc}

${schema}

IMPORTANT:
- These must be DIFFERENT from existing patterns
- Return ONLY a valid JSON array, no markdown or explanation
- Start id from ${task.currentCount + 1}

Return ONLY the JSON array.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }]
  });

  const text = (response.content[0] as any).text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array found");

  return JSON.parse(match[0]);
}

async function fillFile(task: FillTask): Promise<void> {
  const filePath = path.join(BASE_DIR, task.dir, task.file);

  // Load existing
  let existing: any[] = [];
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  if (existing.length >= task.targetCount) {
    console.log(`✓ ${task.file}: Already at ${existing.length}/${task.targetCount}`);
    return;
  }

  // Generate more
  const newPatterns = await generateMore(task);

  // Merge and save
  const merged = [...existing, ...newPatterns];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  console.log(`✓ ${task.file}: ${existing.length} → ${merged.length} (target: ${task.targetCount})`);
}

async function main(): Promise<void> {
  console.log("Filling remaining patterns to reach targets...\n");

  // Run in batches of 4
  for (let i = 0; i < FILL_TASKS.length; i += 4) {
    const batch = FILL_TASKS.slice(i, i + 4);
    await Promise.all(batch.map(fillFile));
  }

  console.log("\nDone!");
}

main().catch(console.error);
