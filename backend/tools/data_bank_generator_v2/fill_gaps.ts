import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MISSING_BANKS = [
  // Overlays
  { type: "overlays", name: "followup_inherit", lang: "en", target: 110, desc: "Patterns for follow-up queries that inherit context (e.g., and what about, also show, tell me more, continue, expand on that)" },
  { type: "overlays", name: "followup_inherit", lang: "pt", target: 110, desc: "Padrões para perguntas de continuação que herdam contexto (e.g., e quanto a, também mostre, me conte mais, continue, expanda isso)" },
  { type: "overlays", name: "format_request", lang: "en", target: 120, desc: "Patterns for format change requests (e.g., format as table, make it a list, show as bullets, convert to JSON)" },
  { type: "overlays", name: "format_request", lang: "pt", target: 120, desc: "Padrões para pedidos de mudança de formato (e.g., formate como tabela, faça uma lista, mostre em bullets, converta para JSON)" },
  { type: "overlays", name: "clarify_required", lang: "en", target: 60, desc: "Patterns indicating query needs clarification (e.g., which one, which file, be more specific, I meant the other)" },
  { type: "overlays", name: "clarify_required", lang: "pt", target: 60, desc: "Padrões indicando que a consulta precisa de esclarecimento (e.g., qual deles, qual arquivo, seja mais específico, eu quis dizer o outro)" },

  // Missing negatives
  { type: "negatives", name: "block_filename_fuzzy", lang: "en", target: 30, desc: "Patterns to block fuzzy filename matching when exact match is needed (e.g., must be exact match, this specific file, literally named)" },
  { type: "negatives", name: "block_filename_fuzzy", lang: "pt", target: 30, desc: "Padrões para bloquear correspondência fuzzy de nome de arquivo quando correspondência exata é necessária (e.g., deve ser exato, este arquivo específico, literalmente chamado)" },

  // Missing formatting
  { type: "formatting", name: "line_limit", lang: "en", target: 35, desc: "Patterns requesting line limits (e.g., in 3 lines, max 5 lines, no more than 2 lines, keep to one line)" },
  { type: "formatting", name: "line_limit", lang: "pt", target: 35, desc: "Padrões solicitando limite de linhas (e.g., em 3 linhas, máximo 5 linhas, não mais que 2 linhas, mantenha em uma linha)" },
  { type: "formatting", name: "top_n_ranking", lang: "en", target: 40, desc: "Patterns for top-N ranking requests (e.g., top 5, best 3, first 10, highest 5)" },
  { type: "formatting", name: "top_n_ranking", lang: "pt", target: 40, desc: "Padrões para solicitações de ranking top-N (e.g., top 5, melhores 3, primeiros 10, maiores 5)" },

  // Missing lexicons (fill gaps)
  { type: "lexicons", name: "agile_project_mgmt", lang: "shared", target: 350, desc: "Agile and project management terms with EN/PT pairs: sprint, backlog, kanban, scrum, retrospective, standup, velocity, burndown, epic, user story, acceptance criteria, MVP, iteration, release, roadmap" },
  { type: "lexicons", name: "marketing_service_quality", lang: "shared", target: 450, desc: "Marketing and service quality terms with EN/PT pairs: NPS, CSAT, churn, retention, conversion, funnel, lead, campaign, ROI, engagement, brand, customer journey, touchpoint, persona, segmentation" },
  { type: "lexicons", name: "compliance_security_ext", lang: "shared", target: 350, desc: "Compliance and security terms with EN/PT pairs: GDPR, LGPD, SOC2, ISO27001, audit, policy, risk assessment, vulnerability, encryption, access control, authentication, authorization, incident, breach, remediation" },
  { type: "lexicons", name: "analytics_telemetry_ext", lang: "shared", target: 200, desc: "Analytics and telemetry terms with EN/PT pairs: dashboard, KPI, metric, dimension, funnel, cohort, A/B test, session, pageview, event, conversion rate, bounce rate, attribution, segment, filter" },
  { type: "lexicons", name: "navigation_ui_ext", lang: "shared", target: 200, desc: "Navigation and UI terms with EN/PT pairs: sidebar, navbar, modal, dropdown, tooltip, breadcrumb, tab, accordion, carousel, pagination, search bar, filter, sort, toggle, checkbox, radio button" },
];

async function generate(task: typeof MISSING_BANKS[0]) {
  let prompt: string;

  if (task.type === "overlays" || task.type === "negatives") {
    prompt = `Generate exactly ${task.target} unique ${task.lang.toUpperCase()} language patterns for: ${task.desc}
Return ONLY a valid JSON array of objects with "id" (number), "pattern" (string), and "priority" (number 60-95).
Example: [{"id": 1, "pattern": "and what about", "priority": 75}]
Return ONLY the JSON array, no explanation.`;
  } else if (task.type === "formatting") {
    prompt = `Generate exactly ${task.target} unique ${task.lang.toUpperCase()} language patterns for: ${task.desc}
Return ONLY a valid JSON array of objects with "id" (number), "pattern" (string), and "extractCount" (boolean, true if pattern includes {n} placeholder for extracting a number).
Example: [{"id": 1, "pattern": "top {n}", "extractCount": true}, {"id": 2, "pattern": "show best ones", "extractCount": false}]
Return ONLY the JSON array, no explanation.`;
  } else if (task.type === "lexicons") {
    prompt = `Generate exactly ${task.target} bilingual EN/PT term pairs for: ${task.desc}
Return ONLY a valid JSON array of objects with "id" (number), "en" (English term), "pt" (Portuguese term), and "aliases" (array of alternative spellings in both languages).
Example: [{"id": 1, "en": "sprint", "pt": "sprint", "aliases": ["sprints", "sprint cycle"]}, {"id": 2, "en": "backlog", "pt": "backlog", "aliases": ["product backlog", "lista de pendências"]}]
Return ONLY the JSON array, no explanation.`;
  } else {
    throw new Error(`Unknown type: ${task.type}`);
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }]
  });

  const text = (response.content[0] as any).text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array found");

  const patterns = JSON.parse(match[0]);

  const baseDir = path.join(__dirname, "../../src/data_banks", task.type);
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const filename = task.lang === "shared" ? `${task.name}.json` : `${task.name}.${task.lang}.json`;
  fs.writeFileSync(path.join(baseDir, filename), JSON.stringify(patterns, null, 2));
  console.log(`✓ ${task.type}/${filename}: ${patterns.length} patterns`);
}

async function main() {
  console.log("Generating missing banks...\n");

  // Run in batches of 4 for rate limiting
  for (let i = 0; i < MISSING_BANKS.length; i += 4) {
    const batch = MISSING_BANKS.slice(i, i + 4);
    await Promise.all(batch.map(async (task) => {
      try {
        await generate(task);
      } catch (e: any) {
        console.error(`✗ ${task.type}/${task.name}.${task.lang}: ${e.message}`);
      }
    }));
  }

  console.log("\nDone!");
}

main();
