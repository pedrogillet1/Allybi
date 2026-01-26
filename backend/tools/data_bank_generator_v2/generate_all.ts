/**
 * Data Bank Generator v2 - Main Entry Point
 *
 * Orchestrates the full generation, deduplication, validation, and publication
 * of all data banks according to the mission specification.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx ts-node generate_all.ts
 *   ANTHROPIC_API_KEY=... npx ts-node generate_all.ts --phase 2  # Run specific phase
 *   ANTHROPIC_API_KEY=... npx ts-node generate_all.ts --dry-run  # Don't write files
 */

import * as fs from "fs";
import * as path from "path";
import { getAnthropicClient } from "./lib/anthropic_client";
import {
  PRIMARY_INTENT_TARGETS,
  DECISION_FAMILY_TARGETS,
  DOCUMENTS_SUBINTENT_TARGETS,
  FILE_ACTIONS_SUBINTENT_TARGETS,
  NEGATIVE_TARGETS,
  OVERLAY_TARGETS,
  NORMALIZER_TARGETS,
  LEXICON_TARGETS,
} from "./schemas/bank_schemas";
import { deduplicateItems, findDuplicates, renumberIds } from "./lib/dedupe";
import { detectBroadPatterns, detectCollisions, generateCollisionReport, writeCollisionReport } from "./lib/collision_scan";
import { DataBankLoader, loadDataBanks } from "./lib/data_bank_loader";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DATA_BANKS_DIR = path.join(__dirname, "../../src/data_banks");
const AUDIT_DIR = process.env.AUDIT_DIR || path.join(__dirname, `../../audit_output_mass/data_bank_build_${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}`);
const DRY_RUN = process.argv.includes("--dry-run");
const SPECIFIC_PHASE = process.argv.find((a) => a.startsWith("--phase"))?.split("=")[1];

const CONCURRENCY = 4;

// ============================================================================
// PROMPTS
// ============================================================================

const TRIGGER_PROMPT = (intent: string, count: number, lang: string, description: string) => `
Generate exactly ${count} unique ${lang.toUpperCase()} language trigger patterns for the intent: "${intent}"

Description: ${description}

Requirements:
- Each pattern should be a natural language phrase users might say
- Include variety: formal, informal, short, long, with typos, with quoted terms
- Patterns should be specific enough to distinguish from other intents
- ${lang === "pt" ? "Include Portuguese diacritics and colloquial phrasing" : ""}

Return ONLY a valid JSON array with objects containing:
- "id": sequential number starting from 1
- "pattern": the trigger phrase (string)
- "priority": routing priority 50-90 (number)

Example:
[
  {"id": 1, "pattern": "summarize this document", "priority": 75},
  {"id": 2, "pattern": "give me a summary of", "priority": 70}
]

Generate ${count} patterns. Return ONLY the JSON array.
`;

const NEGATIVE_PROMPT = (category: string, count: number, lang: string, description: string) => `
Generate exactly ${count} unique ${lang.toUpperCase()} negative/blocking patterns for: "${category}"

Description: ${description}

These patterns help PREVENT incorrect routing by blocking certain intents when specific signals are present.

Return ONLY a valid JSON array with objects containing:
- "id": sequential number starting from 1
- "pattern": the pattern to detect (string)
- "priority": blocking priority 60-95 (number)

Example:
[
  {"id": 1, "pattern": "summarize the document", "priority": 80},
  {"id": 2, "pattern": "what does it say about", "priority": 75}
]

Generate ${count} patterns. Return ONLY the JSON array.
`;

const OVERLAY_PROMPT = (type: string, count: number, lang: string, description: string) => `
Generate exactly ${count} unique ${lang.toUpperCase()} overlay patterns for: "${type}"

Description: ${description}

Overlay patterns modify how a base intent is processed (e.g., follow-up context, format requests).

Return ONLY a valid JSON array with objects containing:
- "id": sequential number starting from 1
- "pattern": the overlay phrase (string)
- "priority": priority 50-80 (number)

Example:
[
  {"id": 1, "pattern": "and what about", "priority": 70},
  {"id": 2, "pattern": "also show me", "priority": 65}
]

Generate ${count} patterns. Return ONLY the JSON array.
`;

const LEXICON_PROMPT = (domain: string, count: number, description: string) => `
Generate exactly ${count} bilingual EN/PT term pairs for the domain: "${domain}"

Description: ${description}

Return ONLY a valid JSON array with objects containing:
- "id": sequential number starting from 1
- "term": canonical English term (string)
- "en": English variant (string)
- "pt": Portuguese translation (string)
- "aliases_en": array of English aliases/variants
- "aliases_pt": array of Portuguese aliases/variants

Example:
[
  {"id": 1, "term": "EBITDA", "en": "EBITDA", "pt": "EBITDA", "aliases_en": ["earnings before interest"], "aliases_pt": ["lucro operacional"]},
  {"id": 2, "term": "revenue", "en": "revenue", "pt": "receita", "aliases_en": ["sales", "income"], "aliases_pt": ["faturamento", "vendas"]}
]

Generate ${count} terms with 4-8 aliases each. Return ONLY the JSON array.
`;

// ============================================================================
// GENERATION TASKS
// ============================================================================

interface GenerationTask {
  type: "trigger" | "negative" | "overlay" | "lexicon";
  name: string;
  lang: string;
  target: number;
  description: string;
  outputPath: string;
}

function buildGenerationTasks(): GenerationTask[] {
  const tasks: GenerationTask[] = [];

  // Primary Intent Triggers
  const primaryIntentDescriptions: Record<string, string> = {
    documents: "Questions about document content, summarization, extraction, analysis",
    file_actions: "File operations like opening, moving, listing, searching files",
    help: "Product help, how-to questions, feature guidance",
    conversation: "Casual conversation, greetings, chitchat",
    edit: "Editing documents, modifying content",
    reasoning: "Complex reasoning, analysis, explanation requests",
    memory: "Remember things, recall previous conversations",
    preferences: "User preferences, settings, customization",
    extraction: "Extract specific data, pull information",
    error: "Error handling, troubleshooting",
    excel: "Excel/spreadsheet operations",
    finance: "Financial analysis, reports, metrics",
    accounting: "Accounting terms, ledgers, transactions",
    legal: "Legal document analysis, contracts",
    medical: "Medical document analysis, health records",
    engineering: "Technical documentation, engineering specs",
  };

  for (const [intent, counts] of Object.entries(PRIMARY_INTENT_TARGETS)) {
    for (const lang of ["en", "pt"]) {
      const count = lang === "en" ? counts.en : counts.pt;
      tasks.push({
        type: "trigger",
        name: `primary_${intent}`,
        lang,
        target: count,
        description: primaryIntentDescriptions[intent] || intent,
        outputPath: path.join(DATA_BANKS_DIR, "triggers", `primary_${intent}.${lang}.json`),
      });
    }
  }

  // Document Sub-intents
  const docSubintentDescriptions: Record<string, string> = {
    factual: "Factual questions about document content",
    summary: "Summarization requests",
    compare: "Comparison between documents or sections",
    analytics: "Analytics and metrics from documents",
    extract: "Extract specific data points",
    manage: "Document management operations",
    search: "Search within documents",
    recommend: "Recommendations based on documents",
    stats: "Statistics about documents",
    count: "Counting items in documents",
    table: "Table-related queries",
    filter_extension: "Filter by file extension",
    folder_path: "Queries about folder paths",
    group_by_folder: "Group documents by folder",
    largest: "Find largest documents",
    smallest: "Find smallest documents",
    most_recent: "Find most recent documents",
    name_contains: "Find documents by name pattern",
  };

  for (const [subintent, counts] of Object.entries(DOCUMENTS_SUBINTENT_TARGETS)) {
    for (const lang of ["en", "pt"]) {
      const count = lang === "en" ? counts.en : counts.pt;
      tasks.push({
        type: "trigger",
        name: `doc_${subintent}`,
        lang,
        target: count,
        description: docSubintentDescriptions[subintent] || subintent,
        outputPath: path.join(DATA_BANKS_DIR, "triggers", `doc_${subintent}.${lang}.json`),
      });
    }
  }

  // File Actions Sub-intents
  const fileActionDescriptions: Record<string, string> = {
    list_all: "List all files",
    list_folder: "List files in a specific folder",
    list_files: "List only files (not folders)",
    list_folders: "List only folders",
    location: "Find file location",
    open: "Open a file",
    preview: "Preview a file",
    search: "Search for files",
    type_filter: "Filter by file type",
    type_search: "Search for specific file types",
    newest_type: "Find newest files of a type",
    semantic: "Semantic file search",
    semantic_folder: "Semantic search within folder",
    topic_search: "Search files by topic",
    same_folder: "Find files in same folder",
    folder_ops: "Folder operations",
    again: "Repeat last file action",
    default: "Default file action",
  };

  for (const [subintent, counts] of Object.entries(FILE_ACTIONS_SUBINTENT_TARGETS)) {
    for (const lang of ["en", "pt"]) {
      const count = lang === "en" ? counts.en : counts.pt;
      tasks.push({
        type: "trigger",
        name: `file_${subintent}`,
        lang,
        target: count,
        description: fileActionDescriptions[subintent] || subintent,
        outputPath: path.join(DATA_BANKS_DIR, "triggers", `file_${subintent}.${lang}.json`),
      });
    }
  }

  // Negatives
  const negativeDescriptions: Record<string, string> = {
    block_file_actions_when_content: "Block file_actions when content verbs (summarize, explain) are present",
    block_help_when_content: "Block help when asking about document content",
    block_conversation_when_doc: "Block conversation when document signals present",
    block_finance_when_no_terms: "Block finance routing when no finance terms present",
    block_inventory_when_doc_stats: "Block inventory totals when doc_stats keywords present",
    block_exact_filename_fuzzy: "Block exact filename match for fuzzy references",
    force_clarify_empty_sources: "Force clarification when sources are empty/ambiguous",
  };

  for (const [negative, counts] of Object.entries(NEGATIVE_TARGETS)) {
    for (const lang of ["en", "pt"]) {
      const count = lang === "en" ? counts.en : counts.pt;
      tasks.push({
        type: "negative",
        name: negative,
        lang,
        target: count,
        description: negativeDescriptions[negative] || negative,
        outputPath: path.join(DATA_BANKS_DIR, "negatives", `${negative}.${lang}.json`),
      });
    }
  }

  // Overlays
  const overlayDescriptions: Record<string, string> = {
    followup_inherit_pronoun: "Pronoun-based follow-ups (it, that, this, the same)",
    followup_inherit_continuation: "Continuation phrases (and what about, also show)",
    format_request_list: "List format requests (list N items, bullet points)",
    format_request_table: "Table format requests (as a table, tabular form)",
    format_request_sentence: "Sentence limit requests (in N sentences)",
    format_request_line: "Line limit requests (in N lines)",
    clarify_ambiguous_doc: "Ambiguous document reference detection",
    clarify_multiple_files: "Multiple file match detection",
    clarify_not_found: "Not found with evidence patterns",
  };

  for (const [overlay, counts] of Object.entries(OVERLAY_TARGETS)) {
    for (const lang of ["en", "pt"]) {
      const count = lang === "en" ? counts.en : counts.pt;
      tasks.push({
        type: "overlay",
        name: overlay,
        lang,
        target: count,
        description: overlayDescriptions[overlay] || overlay,
        outputPath: path.join(DATA_BANKS_DIR, "overlays", `${overlay}.${lang}.json`),
      });
    }
  }

  // Lexicons (shared)
  const lexiconDescriptions: Record<string, string> = {
    finance: "Financial terms and metrics (EBITDA, P&L, revenue, margin)",
    accounting: "Accounting terms (ledger, journal, balance sheet)",
    legal: "Legal terminology (contract, liability, indemnification)",
    medical: "Medical terminology (diagnosis, treatment, symptoms)",
    engineering: "Engineering terms (specification, tolerance, calibration)",
    project_agile: "Project management and Agile terms (sprint, backlog, kanban)",
    marketing_service_quality: "Marketing and service quality terms (NPS, CSAT, churn)",
    analytics_telemetry: "Analytics and telemetry terms (metric, KPI, dashboard)",
    ui_navigation: "UI and navigation terms (sidebar, modal, breadcrumb)",
  };

  for (const [lexicon, counts] of Object.entries(LEXICON_TARGETS)) {
    if (counts.shared && counts.shared > 0) {
      tasks.push({
        type: "lexicon",
        name: lexicon,
        lang: "shared",
        target: counts.shared,
        description: lexiconDescriptions[lexicon] || lexicon,
        outputPath: path.join(DATA_BANKS_DIR, "lexicons", `${lexicon}.json`),
      });
    }
  }

  return tasks;
}

// ============================================================================
// GENERATION RUNNER
// ============================================================================

async function runGeneration(tasks: GenerationTask[]): Promise<Map<string, any[]>> {
  const client = getAnthropicClient();
  const results = new Map<string, any[]>();

  console.log(`\nGenerating ${tasks.length} banks...\n`);

  // Process in batches
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);

    const promises = batch.map(async (task) => {
      try {
        let prompt: string;

        switch (task.type) {
          case "trigger":
            prompt = TRIGGER_PROMPT(task.name, task.target, task.lang, task.description);
            break;
          case "negative":
            prompt = NEGATIVE_PROMPT(task.name, task.target, task.lang, task.description);
            break;
          case "overlay":
            prompt = OVERLAY_PROMPT(task.name, task.target, task.lang, task.description);
            break;
          case "lexicon":
            prompt = LEXICON_PROMPT(task.name, task.target, task.description);
            break;
        }

        const data = await client.generateJsonArray(prompt, { maxTokens: 16000 });
        results.set(task.outputPath, data);
        console.log(`  ✓ ${task.name}.${task.lang}: ${data.length} items`);
        return { task, data, success: true };
      } catch (error: any) {
        console.log(`  ✗ ${task.name}.${task.lang}: ${error.message}`);
        return { task, data: [], success: false, error: error.message };
      }
    });

    await Promise.all(promises);

    // Progress indicator
    const completed = Math.min(i + CONCURRENCY, tasks.length);
    console.log(`  [${completed}/${tasks.length}] completed\n`);
  }

  return results;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Data Bank Generator v2");
  console.log("=".repeat(60));
  console.log(`\nAudit Dir: ${AUDIT_DIR}`);
  console.log(`Dry Run: ${DRY_RUN}`);
  if (SPECIFIC_PHASE) console.log(`Specific Phase: ${SPECIFIC_PHASE}`);
  console.log("");

  // Ensure directories exist
  if (!DRY_RUN) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    fs.mkdirSync(path.join(DATA_BANKS_DIR, "triggers"), { recursive: true });
    fs.mkdirSync(path.join(DATA_BANKS_DIR, "negatives"), { recursive: true });
    fs.mkdirSync(path.join(DATA_BANKS_DIR, "overlays"), { recursive: true });
    fs.mkdirSync(path.join(DATA_BANKS_DIR, "formatting"), { recursive: true });
    fs.mkdirSync(path.join(DATA_BANKS_DIR, "normalizers"), { recursive: true });
    fs.mkdirSync(path.join(DATA_BANKS_DIR, "lexicons"), { recursive: true });
  }

  // Build task list
  const tasks = buildGenerationTasks();
  console.log(`\nTotal generation tasks: ${tasks.length}`);

  // Count by type
  const byType = new Map<string, number>();
  for (const task of tasks) {
    byType.set(task.type, (byType.get(task.type) || 0) + 1);
  }
  for (const [type, count] of byType) {
    console.log(`  ${type}: ${count} banks`);
  }

  // PHASE 2: Generation
  if (!SPECIFIC_PHASE || SPECIFIC_PHASE === "2") {
    console.log("\n" + "=".repeat(60));
    console.log("PHASE 2: Generation");
    console.log("=".repeat(60));

    if (DRY_RUN) {
      console.log("\n[DRY RUN] Would generate the following banks:");
      for (const task of tasks.slice(0, 20)) {
        console.log(`  - ${task.name}.${task.lang} (${task.target} items) → ${task.outputPath}`);
      }
      if (tasks.length > 20) {
        console.log(`  ... and ${tasks.length - 20} more`);
      }
      return;
    }

    const results = await runGeneration(tasks);

    // Write results
    if (!DRY_RUN) {
      console.log("\nWriting bank files...");
      for (const [outputPath, data] of results) {
        if (data.length > 0) {
          // Deduplicate and renumber
          const deduped = deduplicateItems(data);
          const final = renumberIds(deduped.items);

          // Sort by id and write
          final.sort((a, b) => Number(a.id) - Number(b.id));
          fs.writeFileSync(outputPath, JSON.stringify(final, null, 2));
        }
      }
      console.log(`Wrote ${results.size} files`);
    }
  }

  // PHASE 3: Deduplication and Collision Scan
  if (!SPECIFIC_PHASE || SPECIFIC_PHASE === "3") {
    console.log("\n" + "=".repeat(60));
    console.log("PHASE 3: Deduplication and Collision Scan");
    console.log("=".repeat(60));

    const loader = loadDataBanks();
    const stats = loader.getStats();

    console.log(`\nLoaded ${stats.totalBanks} banks with ${stats.totalPatterns} patterns`);

    // Run collision scan
    const triggerBanks = loader.getBanksByType("trigger");
    const sources = triggerBanks.map((bank) => ({
      name: bank.id,
      intent: bank.id.split(":")[1]?.split(".")[0] || "unknown",
      items: bank.data,
    }));

    const broadPatterns = detectBroadPatterns(sources);
    const collisions = detectCollisions(sources);
    const report = generateCollisionReport(broadPatterns, collisions);

    console.log(`\nBroad patterns: ${broadPatterns.length}`);
    console.log(`Collisions: ${collisions.length}`);
    console.log(`  Critical: ${report.summary.criticalCount}`);
    console.log(`  Warning: ${report.summary.warningCount}`);

    if (!DRY_RUN) {
      writeCollisionReport(report, path.join(AUDIT_DIR, "COLLISION_REPORT.md"));
      console.log(`\nWrote COLLISION_REPORT.md`);
    }
  }

  // PHASE 4: Publish (already done in phase 2)
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 4: Publish (completed during generation)");
  console.log("=".repeat(60));

  // PHASE 6: Summary
  if (!SPECIFIC_PHASE || SPECIFIC_PHASE === "6") {
    console.log("\n" + "=".repeat(60));
    console.log("PHASE 6: Generation Summary");
    console.log("=".repeat(60));

    const loader = loadDataBanks();
    const stats = loader.getStats();
    const validation = loader.validateAll();

    const summary: string[] = [
      "# Generation Summary",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Statistics",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Banks | ${stats.totalBanks} |`,
      `| Total Patterns | ${stats.totalPatterns} |`,
      `| Validation Errors | ${validation.errors.length} |`,
      `| Validation Warnings | ${validation.warnings.length} |`,
      "",
      "## By Type",
      "",
      "| Type | Banks | Patterns |",
      "|------|-------|----------|",
    ];

    for (const [type, data] of Object.entries(stats.byType)) {
      if (data.count > 0) {
        summary.push(`| ${type} | ${data.count} | ${data.patterns} |`);
      }
    }

    summary.push("");
    summary.push("## How to Run Again");
    summary.push("");
    summary.push("```bash");
    summary.push("cd backend");
    summary.push("ANTHROPIC_API_KEY=your-key npx ts-node tools/data_bank_generator_v2/generate_all.ts");
    summary.push("```");
    summary.push("");

    if (!DRY_RUN) {
      fs.writeFileSync(path.join(AUDIT_DIR, "GENERATION_SUMMARY.md"), summary.join("\n"));
      console.log(`\nWrote GENERATION_SUMMARY.md`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("GENERATION COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
