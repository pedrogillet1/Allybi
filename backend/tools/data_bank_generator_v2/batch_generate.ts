/**
 * Batch Pattern Generator v2
 *
 * Generates pattern banks in smaller batches with robust JSON parsing.
 * Runs multiple intents in parallel for maximum speed.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!API_KEY) throw new Error('API key required');

const client = new Anthropic({ apiKey: API_KEY });
const OUTPUT_BASE = path.join(__dirname, '../../src/data_banks');
const BATCH_SIZE = 50; // Generate 50 patterns per API call
const CONCURRENCY = 10; // Run 10 API calls in parallel

// Ensure directories exist
['triggers', 'negatives', 'formatting', 'normalizers', 'lexicons'].forEach(dir => {
  fs.mkdirSync(path.join(OUTPUT_BASE, dir), { recursive: true });
});

interface GenerationTask {
  type: 'trigger' | 'negative' | 'formatting' | 'normalizer' | 'lexicon';
  name: string;
  lang: 'en' | 'pt' | 'shared';
  target: number;
  description: string;
  examples?: string[];
}

const TASKS: GenerationTask[] = [
  // TRIGGERS - EN
  { type: 'trigger', name: 'documents_qa', lang: 'en', target: 220, description: 'Questions about document content (summarize, explain, what does it say)', examples: ['what does the document say about', 'explain the section on', 'summarize the'] },
  { type: 'trigger', name: 'documents_search_locator', lang: 'en', target: 180, description: 'Find where something is mentioned (which doc, what page, where)', examples: ['where is it mentioned', 'which document contains', 'find where it says'] },
  { type: 'trigger', name: 'documents_extract_structured', lang: 'en', target: 180, description: 'Extract specific items (list the, extract all, names/dates/values)', examples: ['list all the', 'extract the names', 'what are the dates mentioned'] },
  { type: 'trigger', name: 'documents_summarize', lang: 'en', target: 140, description: 'Summarize content (summarize, overview, key points)', examples: ['summarize this', 'give me an overview', 'main points'] },
  { type: 'trigger', name: 'finance_excel', lang: 'en', target: 260, description: 'Financial/Excel queries (EBITDA, revenue, Q1, monthly, spreadsheet)', examples: ['what was the revenue in', 'EBITDA for Q1', 'monthly costs'] },
  { type: 'trigger', name: 'compare', lang: 'en', target: 160, description: 'Comparison queries (compare, difference between, versus, vs)', examples: ['compare A and B', 'difference between', 'X versus Y'] },
  { type: 'trigger', name: 'analytics_metrics', lang: 'en', target: 120, description: 'Usage/analytics queries (tokens used, most accessed, storage)', examples: ['how many tokens', 'most accessed documents', 'storage usage'] },
  { type: 'trigger', name: 'doc_stats', lang: 'en', target: 120, description: 'Document statistics (page count, file size, total docs)', examples: ['how many pages', 'file size', 'total documents'] },
  { type: 'trigger', name: 'file_list', lang: 'en', target: 80, description: 'List files with filters (show PDFs, list Excel files, files in folder)', examples: ['show only PDFs', 'list all Excel files', 'files in folder X'] },
  { type: 'trigger', name: 'file_search_by_topic', lang: 'en', target: 120, description: 'Find files by topic (files about, documents related to)', examples: ['files about compliance', 'documents related to marketing'] },
  { type: 'trigger', name: 'file_open_preview', lang: 'en', target: 120, description: 'Open/preview file (open file X, show me, preview)', examples: ['open the contract', 'show me the report', 'preview'] },
  { type: 'trigger', name: 'file_folder_ops', lang: 'en', target: 120, description: 'Folder operations (where is file, folder path, which folder)', examples: ['where is the file stored', 'folder path to', 'which folder contains'] },
  { type: 'trigger', name: 'help_product', lang: 'en', target: 80, description: 'Help/product questions (how do I, can Koda, does it support)', examples: ['how do I upload', 'can Koda search images', 'does it support Word'] },

  // TRIGGERS - PT (same structure)
  { type: 'trigger', name: 'documents_qa', lang: 'pt', target: 220, description: 'Perguntas sobre conteudo de documentos (resuma, explique, o que diz)', examples: ['o que o documento diz sobre', 'explique a secao sobre', 'resuma o'] },
  { type: 'trigger', name: 'documents_search_locator', lang: 'pt', target: 180, description: 'Encontrar onde algo e mencionado (qual doc, que pagina, onde)', examples: ['onde e mencionado', 'qual documento contem', 'encontre onde diz'] },
  { type: 'trigger', name: 'documents_extract_structured', lang: 'pt', target: 180, description: 'Extrair itens especificos (liste os, extraia todos, nomes/datas/valores)', examples: ['liste todos os', 'extraia os nomes', 'quais sao as datas mencionadas'] },
  { type: 'trigger', name: 'documents_summarize', lang: 'pt', target: 140, description: 'Resumir conteudo (resuma, visao geral, pontos principais)', examples: ['resuma isso', 'me de uma visao geral', 'pontos principais'] },
  { type: 'trigger', name: 'finance_excel', lang: 'pt', target: 260, description: 'Consultas financeiras/Excel (EBITDA, receita, Q1, mensal, planilha)', examples: ['qual foi a receita em', 'EBITDA do Q1', 'custos mensais'] },
  { type: 'trigger', name: 'compare', lang: 'pt', target: 160, description: 'Consultas de comparacao (compare, diferenca entre, versus, vs)', examples: ['compare A e B', 'diferenca entre', 'X versus Y'] },
  { type: 'trigger', name: 'analytics_metrics', lang: 'pt', target: 120, description: 'Consultas de uso/analytics (tokens usados, mais acessados, armazenamento)', examples: ['quantos tokens', 'documentos mais acessados', 'uso de armazenamento'] },
  { type: 'trigger', name: 'doc_stats', lang: 'pt', target: 120, description: 'Estatisticas de documentos (contagem de paginas, tamanho, total)', examples: ['quantas paginas', 'tamanho do arquivo', 'total de documentos'] },
  { type: 'trigger', name: 'file_list', lang: 'pt', target: 80, description: 'Listar arquivos com filtros (mostre PDFs, liste Excel, arquivos na pasta)', examples: ['mostre apenas PDFs', 'liste todos os Excel', 'arquivos na pasta X'] },
  { type: 'trigger', name: 'file_search_by_topic', lang: 'pt', target: 120, description: 'Encontrar arquivos por topico (arquivos sobre, documentos relacionados)', examples: ['arquivos sobre compliance', 'documentos relacionados a marketing'] },
  { type: 'trigger', name: 'file_open_preview', lang: 'pt', target: 120, description: 'Abrir/visualizar arquivo (abra arquivo X, mostre-me, visualize)', examples: ['abra o contrato', 'mostre-me o relatorio', 'visualize'] },
  { type: 'trigger', name: 'file_folder_ops', lang: 'pt', target: 120, description: 'Operacoes de pasta (onde esta arquivo, caminho da pasta, qual pasta)', examples: ['onde esta o arquivo', 'caminho da pasta para', 'qual pasta contem'] },
  { type: 'trigger', name: 'help_product', lang: 'pt', target: 80, description: 'Perguntas de ajuda/produto (como faco, o Koda pode, suporta)', examples: ['como faco upload', 'o Koda pesquisa imagens', 'suporta Word'] },

  // NEGATIVES - EN
  { type: 'negative', name: 'block_file_list_when_content', lang: 'en', target: 180, description: 'Block file_list when user asks about content (summarize, explain, extract)', examples: ['summarize the documents', 'what do the files say', 'explain the content'] },
  { type: 'negative', name: 'block_help_when_content', lang: 'en', target: 160, description: 'Block help when user asks about document content', examples: ['what does the guide say', 'explain the policy', 'summarize the manual'] },
  { type: 'negative', name: 'block_finance_when_no_terms', lang: 'en', target: 120, description: 'Block finance intent when no finance terms present', examples: ['list the steps', 'what are the requirements', 'summarize the process'] },
  { type: 'negative', name: 'block_doc_count_when_stats', lang: 'en', target: 80, description: 'Block total doc count when asking for specific stats (pages, slides)', examples: ['how many pages', 'count the slides', 'number of sheets'] },
  { type: 'negative', name: 'block_analytics_when_content', lang: 'en', target: 80, description: 'Block analytics when asking about document content', examples: ['what does the report say', 'summarize the analysis', 'explain the findings'] },
  { type: 'negative', name: 'block_filename_fuzzy', lang: 'en', target: 60, description: 'Block exact filename match for fuzzy references', examples: ['the budget file', 'that contract', 'the spreadsheet we discussed'] },
  { type: 'negative', name: 'block_generic_empty_sources', lang: 'en', target: 80, description: 'Block generic answers when no sources found', examples: ['based on the documents', 'according to your files', 'in your uploaded content'] },

  // NEGATIVES - PT
  { type: 'negative', name: 'block_file_list_when_content', lang: 'pt', target: 180, description: 'Bloquear file_list quando usuario pergunta sobre conteudo', examples: ['resuma os documentos', 'o que os arquivos dizem', 'explique o conteudo'] },
  { type: 'negative', name: 'block_help_when_content', lang: 'pt', target: 160, description: 'Bloquear help quando usuario pergunta sobre conteudo', examples: ['o que o guia diz', 'explique a politica', 'resuma o manual'] },
  { type: 'negative', name: 'block_finance_when_no_terms', lang: 'pt', target: 120, description: 'Bloquear finance quando nao ha termos financeiros', examples: ['liste os passos', 'quais sao os requisitos', 'resuma o processo'] },
  { type: 'negative', name: 'block_doc_count_when_stats', lang: 'pt', target: 80, description: 'Bloquear contagem total quando pedindo stats especificas', examples: ['quantas paginas', 'conte os slides', 'numero de planilhas'] },
  { type: 'negative', name: 'block_analytics_when_content', lang: 'pt', target: 80, description: 'Bloquear analytics quando perguntando sobre conteudo', examples: ['o que o relatorio diz', 'resuma a analise', 'explique as conclusoes'] },
  { type: 'negative', name: 'block_filename_fuzzy', lang: 'pt', target: 60, description: 'Bloquear match exato de nome para referencias fuzzy', examples: ['o arquivo de orcamento', 'aquele contrato', 'a planilha que discutimos'] },
  { type: 'negative', name: 'block_generic_empty_sources', lang: 'pt', target: 80, description: 'Bloquear respostas genericas quando sem fontes', examples: ['baseado nos documentos', 'de acordo com seus arquivos', 'no seu conteudo enviado'] },

  // FORMATTING - EN
  { type: 'formatting', name: 'exact_count', lang: 'en', target: 140, description: 'Exact count requests (list N items, give me X points)', examples: ['list five', 'give me three', 'top 10'] },
  { type: 'formatting', name: 'bullets', lang: 'en', target: 100, description: 'Bullet point requests (in bullets, bullet points)', examples: ['in bullet points', 'as bullets', 'bulleted list'] },
  { type: 'formatting', name: 'numbered_steps', lang: 'en', target: 90, description: 'Numbered list requests (numbered steps, step by step)', examples: ['numbered steps', 'step by step', 'in order'] },
  { type: 'formatting', name: 'table', lang: 'en', target: 120, description: 'Table format requests (in a table, table form, tabular)', examples: ['in a table', 'table format', 'create a table'] },
  { type: 'formatting', name: 'sentence_limit', lang: 'en', target: 70, description: 'Sentence limit requests (in N sentences, briefly)', examples: ['in three sentences', 'in one sentence', 'briefly'] },
  { type: 'formatting', name: 'paragraph_limit', lang: 'en', target: 70, description: 'Paragraph limit requests (in N paragraphs)', examples: ['in two paragraphs', 'one paragraph', 'short paragraph'] },
  { type: 'formatting', name: 'category_grouping', lang: 'en', target: 60, description: 'Category grouping requests (by category, grouped by)', examples: ['by category', 'grouped by type', 'organized by'] },
  { type: 'formatting', name: 'top_n_ranking', lang: 'en', target: 80, description: 'Top N ranking requests (top 5, best 3, highest)', examples: ['top 5', 'best three', 'highest rated'] },

  // FORMATTING - PT
  { type: 'formatting', name: 'exact_count', lang: 'pt', target: 140, description: 'Pedidos de contagem exata (liste N itens, me de X pontos)', examples: ['liste cinco', 'me de tres', 'top 10'] },
  { type: 'formatting', name: 'bullets', lang: 'pt', target: 100, description: 'Pedidos de bullet points (em bullets, topicos)', examples: ['em topicos', 'como bullets', 'lista com marcadores'] },
  { type: 'formatting', name: 'numbered_steps', lang: 'pt', target: 90, description: 'Pedidos de lista numerada (passos numerados, passo a passo)', examples: ['passos numerados', 'passo a passo', 'em ordem'] },
  { type: 'formatting', name: 'table', lang: 'pt', target: 120, description: 'Pedidos de formato tabela (em tabela, formato tabular)', examples: ['em tabela', 'formato tabela', 'crie uma tabela'] },
  { type: 'formatting', name: 'sentence_limit', lang: 'pt', target: 70, description: 'Pedidos de limite de frases (em N frases, brevemente)', examples: ['em tres frases', 'em uma frase', 'brevemente'] },
  { type: 'formatting', name: 'paragraph_limit', lang: 'pt', target: 70, description: 'Pedidos de limite de paragrafos (em N paragrafos)', examples: ['em dois paragrafos', 'um paragrafo', 'paragrafo curto'] },
  { type: 'formatting', name: 'category_grouping', lang: 'pt', target: 60, description: 'Pedidos de agrupamento por categoria (por categoria, agrupado por)', examples: ['por categoria', 'agrupado por tipo', 'organizado por'] },
  { type: 'formatting', name: 'top_n_ranking', lang: 'pt', target: 80, description: 'Pedidos de ranking top N (top 5, melhores 3, mais altos)', examples: ['top 5', 'melhores tres', 'mais altos'] },

  // NORMALIZERS (shared)
  { type: 'normalizer', name: 'month', lang: 'shared', target: 400, description: 'Month normalization (Jan/January/Janeiro -> 01)', examples: ['January', 'Jan', 'Janeiro', 'jan-2024'] },
  { type: 'normalizer', name: 'quarter', lang: 'shared', target: 160, description: 'Quarter normalization (Q1, first quarter, 1o trimestre)', examples: ['Q1', 'first quarter', 'primeiro trimestre'] },
  { type: 'normalizer', name: 'time_windows', lang: 'shared', target: 240, description: 'Time window normalization (last 24h, this week, last sprint)', examples: ['last 24 hours', 'this week', 'ultimo sprint'] },
  { type: 'normalizer', name: 'filename', lang: 'shared', target: 260, description: 'Filename normalization (strip versions, extensions optional)', examples: ['contract_v2.pdf', 'budget (final)', 'report-2024'] },
  { type: 'normalizer', name: 'folder_path', lang: 'shared', target: 180, description: 'Folder path normalization (quotes, slashes)', examples: ['Project Files/', '"My Documents"', 'folder/subfolder'] },
  { type: 'normalizer', name: 'typos', lang: 'shared', target: 200, description: 'Common typos normalization', examples: ['insperability', 'stakeholder/stakehodler', 'recieve'] },
  { type: 'normalizer', name: 'diacritics', lang: 'shared', target: 120, description: 'Diacritic normalization for Portuguese', examples: ['integracao/integração', 'revisao/revisão', 'onus/ônus'] },
  { type: 'normalizer', name: 'numbers_currency', lang: 'shared', target: 260, description: 'Number and currency normalization', examples: ['1.234,56', '$1,234.56', 'R$ 1.000'] },
  { type: 'normalizer', name: 'status_vocabulary', lang: 'shared', target: 120, description: 'Status vocabulary normalization', examples: ['uploaded', 'in review', 'aprovado', 'disabled'] },

  // LEXICONS (shared with EN/PT)
  { type: 'lexicon', name: 'agile_project_mgmt', lang: 'shared', target: 350, description: 'Agile/project management terms', examples: ['Scrum', 'Kanban', 'stakeholder', 'sprint', 'backlog'] },
  { type: 'lexicon', name: 'marketing_service_quality', lang: 'shared', target: 450, description: 'Marketing/service quality terms', examples: ['intangibility', 'inseparability', 'service blueprint', 'perceived quality'] },
  { type: 'lexicon', name: 'finance_accounting', lang: 'shared', target: 550, description: 'Finance/accounting terms', examples: ['EBITDA', 'net income', 'COGS', 'gross margin', 'YoY'] },
  { type: 'lexicon', name: 'compliance_security', lang: 'shared', target: 450, description: 'Compliance/security terms', examples: ['GDPR', 'SLA', 'governance', 'audit', 'policy'] },
  { type: 'lexicon', name: 'analytics_telemetry', lang: 'shared', target: 300, description: 'Analytics/telemetry terms', examples: ['tokens', 'usage', 'KPI', 'metrics', 'dashboard'] },
  { type: 'lexicon', name: 'navigation_ui', lang: 'shared', target: 250, description: 'Navigation/UI terms', examples: ['breadcrumb', 'folder', 'preview', 'modal', 'sidebar'] },
];

async function generateBatch(task: GenerationTask, batchNum: number, size: number): Promise<any[]> {
  const langText = task.lang === 'en' ? 'English' : task.lang === 'pt' ? 'Portuguese' : 'bilingual EN/PT';

  let prompt = '';
  if (task.type === 'trigger') {
    prompt = `Generate exactly ${size} unique ${langText} trigger patterns for intent "${task.name}".

Description: ${task.description}
Examples: ${task.examples?.join(', ')}

Return ONLY a valid JSON array, nothing else. Each object must have:
- "id": "${task.name}_${task.lang}_${batchNum * size + 1}" (increment for each)
- "pattern": the trigger phrase (lowercase)
- "priority": 1-100 (higher = more specific)

Output ONLY the JSON array, no markdown, no explanation:`;
  } else if (task.type === 'negative') {
    prompt = `Generate exactly ${size} unique ${langText} negative patterns for "${task.name}".

Description: ${task.description}
Examples of queries that should be BLOCKED: ${task.examples?.join(', ')}

Return ONLY a valid JSON array. Each object must have:
- "id": "${task.name}_${task.lang}_${batchNum * size + 1}" (increment)
- "pattern": the pattern that indicates blocking
- "blocks": "${task.name.replace('block_', '').split('_when_')[0]}"
- "priority": 1-100

Output ONLY the JSON array:`;
  } else if (task.type === 'formatting') {
    prompt = `Generate exactly ${size} unique ${langText} formatting detection patterns for "${task.name}".

Description: ${task.description}
Examples: ${task.examples?.join(', ')}

Return ONLY a valid JSON array. Each object must have:
- "id": "${task.name}_${task.lang}_${batchNum * size + 1}" (increment)
- "pattern": the formatting request phrase
- "extractCount": true if pattern includes a number to extract, false otherwise

Output ONLY the JSON array:`;
  } else if (task.type === 'normalizer') {
    prompt = `Generate exactly ${size} unique normalization rules for "${task.name}".

Description: ${task.description}
Examples: ${task.examples?.join(', ')}

Return ONLY a valid JSON array. Each object must have:
- "id": "${task.name}_${batchNum * size + 1}" (increment)
- "input": array of variant strings to match
- "output": the normalized canonical form
- "lang": "en" | "pt" | "both"

Output ONLY the JSON array:`;
  } else if (task.type === 'lexicon') {
    prompt = `Generate exactly ${size} unique domain terms for "${task.name}" lexicon.

Description: ${task.description}
Example terms: ${task.examples?.join(', ')}

Return ONLY a valid JSON array. Each object must have:
- "id": "${task.name}_${batchNum * size + 1}" (increment)
- "canonical_en": English term
- "canonical_pt": Portuguese translation
- "aliases_en": array of English aliases/abbreviations
- "aliases_pt": array of Portuguese aliases

Output ONLY the JSON array:`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Try to extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`  [BATCH ${batchNum}] No JSON found`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e: any) {
    console.error(`  [BATCH ${batchNum}] Error: ${e.message}`);
    return [];
  }
}

async function processTask(task: GenerationTask): Promise<void> {
  const numBatches = Math.ceil(task.target / BATCH_SIZE);
  console.log(`\n[${task.type}] ${task.name}.${task.lang} - ${task.target} patterns in ${numBatches} batches`);

  const allPatterns: any[] = [];

  // Process batches with concurrency limit
  for (let i = 0; i < numBatches; i += CONCURRENCY) {
    const batchPromises = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, numBatches); j++) {
      const size = j === numBatches - 1 ? task.target - j * BATCH_SIZE : BATCH_SIZE;
      batchPromises.push(generateBatch(task, j, size));
    }

    const results = await Promise.all(batchPromises);
    results.forEach(r => allPatterns.push(...r));
    console.log(`  Batches ${i + 1}-${Math.min(i + CONCURRENCY, numBatches)}: ${allPatterns.length} patterns`);
  }

  // Save to file
  const filename = task.lang === 'shared'
    ? `${task.name}.json`
    : `${task.name}.${task.lang}.json`;
  const dirName = task.type === 'formatting' ? 'formatting' : `${task.type}s`;
  const filepath = path.join(OUTPUT_BASE, dirName, filename);
  fs.writeFileSync(filepath, JSON.stringify(allPatterns, null, 2));
  console.log(`  Saved ${allPatterns.length} patterns to ${filename}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Batch Pattern Generator v2');
  console.log(`Tasks: ${TASKS.length} | Concurrency: ${CONCURRENCY}`);
  console.log('='.repeat(60));

  const args = process.argv.slice(2);
  let tasksToRun = TASKS;

  if (args.includes('--triggers')) {
    tasksToRun = TASKS.filter(t => t.type === 'trigger');
  } else if (args.includes('--negatives')) {
    tasksToRun = TASKS.filter(t => t.type === 'negative');
  } else if (args.includes('--formatting')) {
    tasksToRun = TASKS.filter(t => t.type === 'formatting');
  } else if (args.includes('--normalizers')) {
    tasksToRun = TASKS.filter(t => t.type === 'normalizer');
  } else if (args.includes('--lexicons')) {
    tasksToRun = TASKS.filter(t => t.type === 'lexicon');
  }

  // Group by type and run in parallel within type
  const types = [...new Set(tasksToRun.map(t => t.type))];

  for (const type of types) {
    const typeTasks = tasksToRun.filter(t => t.type === type);
    console.log(`\n${'='.repeat(40)}\nProcessing ${type.toUpperCase()}S (${typeTasks.length} tasks)\n${'='.repeat(40)}`);

    // Run tasks of same type in parallel (up to 5 at a time)
    for (let i = 0; i < typeTasks.length; i += 5) {
      await Promise.all(typeTasks.slice(i, i + 5).map(processTask));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Generation complete!');
  console.log('='.repeat(60));
}

main().catch(console.error);
