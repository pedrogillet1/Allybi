/**
 * Parallel Data Bank Generator
 * Uses Claude API to generate comprehensive intent patterns, aliases, and data planes
 * Runs multiple branches in parallel for maximum speed
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic();

const OUTPUT_DIR = path.join(__dirname, "..");
const TRIGGERS_DIR = path.join(OUTPUT_DIR, "triggers");
const SIGNALS_DIR = path.join(OUTPUT_DIR, "signals");
const ALIASES_DIR = path.join(OUTPUT_DIR, "aliases");
const LEXICONS_DIR = path.join(OUTPUT_DIR, "lexicons");
const RULES_DIR = path.join(OUTPUT_DIR, "rules");

// Ensure directories exist
[TRIGGERS_DIR, SIGNALS_DIR, ALIASES_DIR, LEXICONS_DIR, RULES_DIR].forEach(
  (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  },
);

interface GenerationTask {
  name: string;
  outputFile: string;
  prompt: string;
}

// ========== GENERATION PROMPTS ==========

const INTENT_PROMPTS: GenerationTask[] = [
  {
    name: "documents_content",
    outputFile: path.join(TRIGGERS_DIR, "documents_content_expanded.json"),
    prompt: `Generate a comprehensive JSON intent pattern bank for "documents_content" (QA/extract/summary queries).

Requirements:
- 100 Portuguese patterns and 100 English patterns
- Cover verbs: summarize, define, explain, describe, "what does X say", extract, analyze
- Cover domain hints: marketing, quality, compliance, operations, HR, legal, finance, technical
- Include variations with typos, informal speech, formal requests
- Weight range: 1.0-1.5 based on specificity

Output JSON format:
{
  "intent": "documents_content",
  "description": "Patterns for document content queries - QA, summaries, explanations",
  "priority": 75,
  "negates": ["help_product", "chitchat", "file_open_preview"],
  "patterns": {
    "pt": [
      {"id": "dc_pt_001", "pattern": "regex_here", "weight": 1.3, "examples": ["Example 1", "Example 2"]}
    ],
    "en": [
      {"id": "dc_en_001", "pattern": "regex_here", "weight": 1.3, "examples": ["Example 1", "Example 2"]}
    ]
  }
}

Generate diverse, natural language patterns. Be creative with variations. Output ONLY valid JSON.`,
  },
  {
    name: "documents_search_expanded",
    outputFile: path.join(TRIGGERS_DIR, "documents_search_expanded.json"),
    prompt: `Generate a comprehensive JSON intent pattern bank for "documents_search" (mention/locator queries).

Requirements:
- 80 Portuguese patterns and 80 English patterns
- Cover locator verbs: mention, appear, cite, reference, contain, include, discuss
- Cover filters: "which files", "where is it", "in which document", folder, slide, page, section
- Include casual and formal variations
- Weight range: 1.0-1.5

Output JSON format:
{
  "intent": "documents_search",
  "description": "Patterns for locating mentions and finding where content appears",
  "priority": 74,
  "negates": ["help_product", "chitchat"],
  "patterns": {
    "pt": [{"id": "dsrch_pt_001", "pattern": "...", "weight": 1.3, "examples": [...]}],
    "en": [{"id": "dsrch_en_001", "pattern": "...", "weight": 1.3, "examples": [...]}]
  }
}

Output ONLY valid JSON.`,
  },
  {
    name: "documents_extract_expanded",
    outputFile: path.join(TRIGGERS_DIR, "documents_extract_expanded.json"),
    prompt: `Generate a comprehensive JSON intent pattern bank for "documents_extract" (entity/KPI/date extraction).

Requirements:
- 80 Portuguese patterns and 80 English patterns
- Cover extract verbs: extract, list, pull out, get, find, identify, show me all
- Cover entity types: dates, people, names, clauses, KPIs, responsibilities, deadlines, metrics, numbers
- Include "list all X", "what are the Y", "give me the Z"
- Weight range: 1.0-1.5

Output JSON format:
{
  "intent": "documents_extract",
  "description": "Patterns for extracting specific entities, KPIs, dates from documents",
  "priority": 76,
  "negates": ["help_product", "chitchat"],
  "patterns": {
    "pt": [{"id": "dext_pt_001", "pattern": "...", "weight": 1.3, "examples": [...]}],
    "en": [{"id": "dext_en_001", "pattern": "...", "weight": 1.3, "examples": [...]}]
  }
}

Output ONLY valid JSON.`,
  },
  {
    name: "finance_excel_expanded",
    outputFile: path.join(TRIGGERS_DIR, "finance_excel_expanded.json"),
    prompt: `Generate a comprehensive JSON intent pattern bank for "finance_excel" (spreadsheet/financial queries).

Requirements:
- 120 Portuguese patterns and 120 English patterns
- Cover finance terms: EBITDA, revenue, receita, lucro, P&L, DRE, margin, cost, expense, profit, ROI, cash flow
- Cover time terms: all months (Janeiro-Dezembro, January-December), quarters (Q1-Q4, 1T-4T), years, YTD, MTD
- Cover computation verbs: calculate, compare, trend, difference, growth, variation, sum, average, highest, lowest
- Include month comparisons: "July vs August", "Janeiro comparado com Fevereiro"
- Weight range: 1.0-1.5

Output JSON format:
{
  "intent": "finance_excel",
  "description": "Patterns for financial/spreadsheet queries with computations",
  "priority": 78,
  "negates": ["help_product", "chitchat"],
  "patterns": {
    "pt": [{"id": "fin_pt_001", "pattern": "...", "weight": 1.4, "examples": [...]}],
    "en": [{"id": "fin_en_001", "pattern": "...", "weight": 1.4, "examples": [...]}]
  }
}

Output ONLY valid JSON.`,
  },
  {
    name: "compare_table",
    outputFile: path.join(TRIGGERS_DIR, "compare_table_expanded.json"),
    prompt: `Generate a comprehensive JSON intent pattern bank for "compare_table" (comparison/table queries).

Requirements:
- 70 Portuguese patterns and 70 English patterns
- Cover compare keywords: compare, versus, vs, lado a lado, side by side, difference between, contrast
- Cover table requirements: table, tabela, create table, comparison table, tabela comparativa
- Cover comparison subjects: layout vs content, X vs Y, A compared to B
- Weight range: 1.0-1.5

Output JSON format:
{
  "intent": "compare_table",
  "description": "Patterns for comparison requests and table generation",
  "priority": 74,
  "negates": ["help_product", "chitchat"],
  "patterns": {
    "pt": [{"id": "cmp_pt_001", "pattern": "...", "weight": 1.3, "examples": [...]}],
    "en": [{"id": "cmp_en_001", "pattern": "...", "weight": 1.3, "examples": [...]}]
  }
}

Output ONLY valid JSON.`,
  },
  {
    name: "file_inventory",
    outputFile: path.join(TRIGGERS_DIR, "file_inventory_expanded.json"),
    prompt: `Generate a comprehensive JSON intent pattern bank for "file_inventory" (file/folder metadata queries).

Requirements:
- 60 Portuguese patterns and 60 English patterns
- Cover metadata verbs: list files, list folders, show path, file size, file type, count files
- Cover inventory queries: "which folder holds X", "show largest files", "how many files", "surrounding files"
- Cover folder navigation: pasta, diretório, folder, directory, path, caminho
- Weight range: 1.0-1.5

Output JSON format:
{
  "intent": "file_inventory",
  "description": "Patterns for file/folder metadata and inventory queries",
  "priority": 72,
  "negates": ["help_product", "chitchat"],
  "patterns": {
    "pt": [{"id": "finv_pt_001", "pattern": "...", "weight": 1.3, "examples": [...]}],
    "en": [{"id": "finv_en_001", "pattern": "...", "weight": 1.3, "examples": [...]}]
  }
}

Output ONLY valid JSON.`,
  },
];

const SIGNAL_PROMPTS: GenerationTask[] = [
  {
    name: "formatting_overlay",
    outputFile: path.join(SIGNALS_DIR, "formatting_overlay_expanded.json"),
    prompt: `Generate a comprehensive JSON signal pattern bank for "formatting_overlay" (format constraints).

Requirements:
- 80 Portuguese patterns and 80 English patterns
- Cover format terms: list, bullets, numbered, exactly N, table, linhas, pontos, tópicos
- Cover count patterns: "exactly 5", "in 6 lines", "5 key points", "máximo de 3", "no máximo 10"
- Include regex to capture the number N from the pattern
- Weight range: 1.0-1.5

Output JSON format:
{
  "signal": "formatting_overlay",
  "description": "Patterns for detecting formatting constraints in queries",
  "priority": 90,
  "patterns": {
    "pt": [{"id": "fmt_pt_001", "pattern": "...", "weight": 1.3, "examples": [...], "extractsCount": true}],
    "en": [{"id": "fmt_en_001", "pattern": "...", "weight": 1.3, "examples": [...], "extractsCount": true}]
  }
}

Output ONLY valid JSON.`,
  },
  {
    name: "followup_memory",
    outputFile: path.join(SIGNALS_DIR, "followup_memory_expanded.json"),
    prompt: `Generate a comprehensive JSON signal pattern bank for "followup_memory" (conversation memory markers).

Requirements:
- 70 Portuguese patterns and 70 English patterns
- Cover memory markers: "it", "that", "this", "last", "previous", "esse", "essa", "aquele", "anterior"
- Cover reference patterns: "that handbook", "last two folders", "in that memo", "the same document"
- Cover continuation: "more about", "continue", "also", "and what about", "e sobre"
- Weight range: 1.0-1.5

Output JSON format:
{
  "signal": "followup_memory",
  "description": "Patterns for detecting follow-up queries that need conversation memory",
  "priority": 92,
  "patterns": {
    "pt": [{"id": "mem_pt_001", "pattern": "...", "weight": 1.3, "examples": [...]}],
    "en": [{"id": "mem_en_001", "pattern": "...", "weight": 1.3, "examples": [...]}]
  }
}

Output ONLY valid JSON.`,
  },
];

const ALIAS_PROMPTS: GenerationTask[] = [
  {
    name: "finance_aliases",
    outputFile: path.join(ALIASES_DIR, "finance_aliases.json"),
    prompt: `Generate a comprehensive JSON semantic alias bank for finance terms.

Requirements:
- 500+ alias entries covering finance/accounting terminology
- Each entry maps a canonical term to its aliases in both PT and EN
- Cover: EBITDA, revenue, profit, margin, cash flow, assets, liabilities, equity, ROI, ROE, P&L, etc.
- Include informal variations, abbreviations, and typos

Output JSON format:
{
  "domain": "finance",
  "description": "Semantic aliases for finance and accounting terms",
  "aliases": [
    {
      "canonical": "ebitda",
      "pt": ["ebitda", "lucro antes de juros", "lajida", "resultado operacional", "ebtida"],
      "en": ["ebitda", "earnings before interest", "operating profit", "ebtida", "ebidta"]
    },
    {
      "canonical": "revenue",
      "pt": ["receita", "faturamento", "vendas", "receita bruta", "receita líquida", "faturação"],
      "en": ["revenue", "sales", "income", "turnover", "top line", "gross revenue"]
    }
  ]
}

Generate at least 100 canonical terms with their aliases. Output ONLY valid JSON.`,
  },
  {
    name: "document_type_aliases",
    outputFile: path.join(ALIASES_DIR, "document_type_aliases.json"),
    prompt: `Generate a comprehensive JSON semantic alias bank for document types and references.

Requirements:
- 200+ alias entries for document types, sections, references
- Cover: document, file, spreadsheet, presentation, PDF, report, manual, guide, handbook, memo, slide, page, section, chapter
- Include informal variations and typos

Output JSON format:
{
  "domain": "documents",
  "description": "Semantic aliases for document types and references",
  "aliases": [
    {
      "canonical": "document",
      "pt": ["documento", "doc", "arquivo", "ficheiro", "documentação", "material"],
      "en": ["document", "doc", "file", "documentation", "material", "paper"]
    }
  ]
}

Generate at least 50 canonical terms. Output ONLY valid JSON.`,
  },
  {
    name: "time_period_aliases",
    outputFile: path.join(ALIASES_DIR, "time_period_aliases.json"),
    prompt: `Generate a comprehensive JSON semantic alias bank for time periods.

Requirements:
- All 12 months with PT/EN variations and abbreviations
- Quarters (Q1-Q4, 1T-4T, primeiro trimestre, first quarter)
- Time references (YTD, MTD, year-to-date, acumulado no ano)
- Relative time (last month, previous quarter, mês passado)

Output JSON format:
{
  "domain": "time_periods",
  "description": "Semantic aliases for months, quarters, and time periods",
  "aliases": [
    {
      "canonical": "january",
      "pt": ["janeiro", "jan", "jan.", "1º mês"],
      "en": ["january", "jan", "jan.", "first month"]
    },
    {
      "canonical": "q1",
      "pt": ["primeiro trimestre", "1º trimestre", "1T", "Q1", "jan-mar"],
      "en": ["first quarter", "Q1", "1st quarter", "jan-mar"]
    }
  ]
}

Cover all 12 months, 4 quarters, and common time references. Output ONLY valid JSON.`,
  },
];

const LEXICON_PROMPTS: GenerationTask[] = [
  {
    name: "navigation_lexicon",
    outputFile: path.join(LEXICONS_DIR, "navigation_lexicon.json"),
    prompt: `Generate a comprehensive JSON navigation lexicon for file actions.

Requirements:
- 150+ navigation terms in PT and EN
- Cover: open, go to, show me, navigate, browse, folder, slide, document, page, section
- Include casual phrases: "Go to that file", "show me the doc", "abre o arquivo"
- Group by action type: open, navigate, show, list, browse

Output JSON format:
{
  "lexicon": "navigation",
  "description": "Navigation verbs and phrases for file actions",
  "categories": {
    "open": {
      "pt": ["abrir", "abre", "abra", "abrir arquivo", "abra o documento", "abre isso"],
      "en": ["open", "open file", "open document", "open it", "open this", "launch"]
    },
    "navigate": {
      "pt": ["ir para", "vai para", "navegar", "voltar para", "ir até"],
      "en": ["go to", "navigate to", "go back to", "jump to", "move to"]
    },
    "show": {
      "pt": ["mostrar", "mostra", "mostre", "exibir", "ver", "visualizar"],
      "en": ["show", "show me", "display", "view", "see", "look at"]
    }
  }
}

Output ONLY valid JSON.`,
  },
  {
    name: "computation_lexicon",
    outputFile: path.join(LEXICONS_DIR, "computation_lexicon.json"),
    prompt: `Generate a comprehensive JSON computation lexicon for financial/data operations.

Requirements:
- 200+ computation terms in PT and EN
- Cover operations: calculate, sum, average, compare, difference, growth, trend, percentage
- Cover aggregations: total, maximum, minimum, count, median, variance
- Cover comparisons: higher, lower, increase, decrease, change, versus

Output JSON format:
{
  "lexicon": "computation",
  "description": "Computation and analysis verbs for data operations",
  "categories": {
    "calculate": {
      "pt": ["calcular", "calcula", "calcule", "fazer conta", "computar", "determinar"],
      "en": ["calculate", "compute", "figure out", "work out", "determine"]
    },
    "aggregate": {
      "pt": ["somar", "totalizar", "média", "máximo", "mínimo", "contar"],
      "en": ["sum", "total", "average", "maximum", "minimum", "count"]
    },
    "compare": {
      "pt": ["comparar", "diferença", "variação", "versus", "contra", "em relação"],
      "en": ["compare", "difference", "variation", "versus", "against", "relative to"]
    }
  }
}

Output ONLY valid JSON.`,
  },
];

const RULES_PROMPTS: GenerationTask[] = [
  {
    name: "typo_normalization",
    outputFile: path.join(RULES_DIR, "typo_normalization.json"),
    prompt: `Generate a comprehensive JSON typo/normalization rules file.

Requirements:
- Common typos for finance terms (EBITDA, revenue, etc.)
- Accent variations (português vs portugues)
- Keyboard adjacency errors
- Common misspellings in PT and EN

Output JSON format:
{
  "rules": "typo_normalization",
  "description": "Typo corrections and normalization rules",
  "corrections": [
    {"typo": "ebtida", "correct": "ebitda"},
    {"typo": "revnue", "correct": "revenue"},
    {"typo": "receta", "correct": "receita"},
    {"typo": "lucor", "correct": "lucro"}
  ],
  "accent_normalization": [
    {"with_accent": "português", "without": "portugues"},
    {"with_accent": "relatório", "without": "relatorio"}
  ]
}

Generate 100+ typo corrections and 50+ accent normalizations. Output ONLY valid JSON.`,
  },
  {
    name: "tone_banned_phrases",
    outputFile: path.join(RULES_DIR, "tone_banned_phrases.json"),
    prompt: `Generate a comprehensive JSON tone and banned phrases file.

Requirements:
- Banned opening phrases (avoid robotic responses)
- Banned filler phrases
- Language lock rules (don't mix EN/PT)
- Tone guidelines

Output JSON format:
{
  "rules": "tone_banned_phrases",
  "description": "Banned phrases and tone guidelines",
  "banned_openings": {
    "pt": ["Com base nos documentos", "De acordo com os arquivos", "Baseado nas informações"],
    "en": ["Based on the documents", "According to the files", "Based on the information"]
  },
  "banned_fillers": {
    "pt": ["como mencionado", "conforme indicado", "vale ressaltar"],
    "en": ["as mentioned", "as indicated", "it's worth noting", "it should be noted"]
  },
  "language_lock": {
    "pt_triggers": ["em português", "responda em português", "fale português"],
    "en_triggers": ["in english", "answer in english", "respond in english"]
  },
  "tone_guidelines": [
    "Be direct and concise",
    "Answer the question first, then provide context",
    "Use natural language, not corporate speak"
  ]
}

Output ONLY valid JSON.`,
  },
  {
    name: "formatting_triggers",
    outputFile: path.join(RULES_DIR, "formatting_triggers.json"),
    prompt: `Generate a comprehensive JSON formatting trigger rules file.

Requirements:
- Bullet list triggers (PT and EN)
- Numbered list triggers
- Table triggers
- Count extraction patterns (regex to extract N from "exactly 5 points")
- Line limit patterns

Output JSON format:
{
  "rules": "formatting_triggers",
  "description": "Formatting detection and enforcement triggers",
  "bullet_triggers": {
    "pt": ["em bullets", "com marcadores", "em tópicos", "pontos principais", "itens"],
    "en": ["in bullets", "bullet points", "key points", "items", "as bullets"]
  },
  "numbered_triggers": {
    "pt": ["numerado", "lista numerada", "em ordem", "passos"],
    "en": ["numbered", "numbered list", "in order", "steps"]
  },
  "table_triggers": {
    "pt": ["em tabela", "tabela comparativa", "formato tabela", "criar tabela"],
    "en": ["in table", "comparison table", "table format", "create table"]
  },
  "count_patterns": [
    {"pattern": "\\\\b(exatamente|exactly)\\\\s+(\\\\d+)\\\\b", "group": 2},
    {"pattern": "\\\\b(\\\\d+)\\\\s+(pontos|points|bullets|itens|items)\\\\b", "group": 1},
    {"pattern": "\\\\bem\\\\s+(\\\\d+)\\\\s+(linhas|lines)\\\\b", "group": 1},
    {"pattern": "\\\\bmáximo\\\\s+(de\\\\s+)?(\\\\d+)\\\\b", "group": 2}
  ]
}

Output ONLY valid JSON.`,
  },
];

// ========== GENERATION FUNCTIONS ==========

async function generateWithClaude(task: GenerationTask): Promise<void> {
  console.log(`  [${task.name}] Starting generation...`);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: task.prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    // Extract JSON from response
    let jsonStr = content.text;

    // Try to find JSON in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    // Validate JSON
    const parsed = JSON.parse(jsonStr);

    // Write to file
    fs.writeFileSync(task.outputFile, JSON.stringify(parsed, null, 2));
    console.log(
      `  [${task.name}] ✓ Generated and saved to ${path.basename(task.outputFile)}`,
    );
  } catch (error) {
    console.error(`  [${task.name}] ✗ Error:`, error);
    throw error;
  }
}

async function runParallelBranch(
  tasks: GenerationTask[],
  branchName: string,
): Promise<void> {
  console.log(`\n=== Branch: ${branchName} (${tasks.length} tasks) ===`);

  // Run tasks in parallel within the branch
  const results = await Promise.allSettled(
    tasks.map((task) => generateWithClaude(task)),
  );

  const successful = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(
    `\n  Branch ${branchName}: ${successful}/${tasks.length} successful, ${failed} failed`,
  );
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("PARALLEL DATA BANK GENERATOR");
  console.log("=".repeat(60));
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  console.log(
    `Total tasks: ${INTENT_PROMPTS.length + SIGNAL_PROMPTS.length + ALIAS_PROMPTS.length + LEXICON_PROMPTS.length + RULES_PROMPTS.length}`,
  );

  const startTime = Date.now();

  // Run all branches in parallel
  await Promise.all([
    runParallelBranch(INTENT_PROMPTS, "INTENTS"),
    runParallelBranch(SIGNAL_PROMPTS, "SIGNALS"),
    runParallelBranch(ALIAS_PROMPTS, "ALIASES"),
    runParallelBranch(LEXICON_PROMPTS, "LEXICONS"),
    runParallelBranch(RULES_PROMPTS, "RULES"),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log(`GENERATION COMPLETE in ${elapsed}s`);
  console.log("=".repeat(60));

  // Count generated patterns
  console.log("\nGenerated files:");
  const dirs = [
    TRIGGERS_DIR,
    SIGNALS_DIR,
    ALIASES_DIR,
    LEXICONS_DIR,
    RULES_DIR,
  ];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      console.log(`  ${path.basename(dir)}/: ${files.length} files`);
    }
  }
}

main().catch(console.error);
