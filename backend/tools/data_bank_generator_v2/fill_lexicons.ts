import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LEXICONS = [
  { name: "agile_project_mgmt", target: 350, desc: "Agile and project management terms: sprint, backlog, kanban, scrum, retrospective, standup, velocity, burndown, epic, user story, acceptance criteria, MVP, iteration, release, roadmap, WIP, DoD, DoR" },
  { name: "marketing_service_quality", target: 450, desc: "Marketing and service quality terms: NPS, CSAT, churn, retention, conversion, funnel, lead, campaign, ROI, engagement, brand, customer journey, touchpoint, persona, segmentation, CLV, CAC, LTV" },
  { name: "compliance_security_ext", target: 350, desc: "Compliance and security terms: GDPR, LGPD, SOC2, ISO27001, audit, policy, risk assessment, vulnerability, encryption, access control, authentication, authorization, incident, breach, remediation, PCI-DSS" },
  { name: "analytics_telemetry_ext", target: 200, desc: "Analytics and telemetry terms: dashboard, KPI, metric, dimension, funnel, cohort, A/B test, session, pageview, event, conversion rate, bounce rate, attribution, segment, filter, trend, anomaly" },
];

async function generate(task: typeof LEXICONS[0]) {
  const prompt = `Generate exactly ${task.target} bilingual EN/PT term pairs for: ${task.desc}

IMPORTANT: Return ONLY a valid JSON array. No markdown, no explanation.
Each object MUST have exactly these fields:
- "id": sequential number starting from 1
- "en": English term (string)
- "pt": Portuguese translation (string)

Example of valid format:
[
  {"id": 1, "en": "sprint", "pt": "sprint"},
  {"id": 2, "en": "backlog", "pt": "backlog"},
  {"id": 3, "en": "user story", "pt": "história de usuário"}
]

Generate ${task.target} terms. Return ONLY the JSON array, nothing else.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }]
  });

  const text = (response.content[0] as any).text;

  // Clean the response - extract just the JSON array
  let jsonStr = text.trim();

  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Find the array
  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');

  if (startIdx === -1 || endIdx === -1) {
    throw new Error("No JSON array found");
  }

  jsonStr = jsonStr.slice(startIdx, endIdx + 1);

  // Parse and validate
  const terms = JSON.parse(jsonStr);

  if (!Array.isArray(terms)) {
    throw new Error("Response is not an array");
  }

  const baseDir = path.join(__dirname, "../../src/data_banks/lexicons");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  fs.writeFileSync(path.join(baseDir, `${task.name}.json`), JSON.stringify(terms, null, 2));
  console.log(`✓ lexicons/${task.name}.json: ${terms.length} terms`);
}

async function main() {
  console.log("Generating missing lexicons...\n");

  for (const task of LEXICONS) {
    try {
      await generate(task);
    } catch (e: any) {
      console.error(`✗ lexicons/${task.name}: ${e.message}`);
    }
  }

  console.log("\nDone!");
}

main();
