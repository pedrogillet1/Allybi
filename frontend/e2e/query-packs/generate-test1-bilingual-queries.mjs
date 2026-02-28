#!/usr/bin/env node
import fs from 'fs';

const DOCS_DIR = process.argv[2] || '/Users/pg/Desktop/test1';
const OUT_FILE = process.argv[3] || 'frontend/e2e/query-packs/test1-bilingual-100.json';

function normalize(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function aliasFromFilename(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '');
  return base
    .replace(/[()]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .join(' ');
}

const files = fs
  .readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'pt'));

if (files.length === 0) throw new Error(`No files in ${DOCS_DIR}`);

const documents = files.map((filename) => {
  const alias = aliasFromFilename(filename);
  return {
    key: normalize(alias).replace(/\s+/g, '_'),
    alias,
    filename,
  };
});

const queries = [];
let i = 1;
function add(text, language, targets, type) {
  queries.push({ id: `Q${String(i).padStart(3, '0')}`, text, language, targets, type });
  i += 1;
}

const allKeys = documents.map((d) => d.key);
const allAliases = documents.map((d) => d.alias).join(', ');

// 10 global queries (5 PT + 5 EN)
add(`Quero uma visão geral dos documentos anexados (${allAliases}) em 10 bullets com fontes.`, 'pt', allKeys, 'global_overview');
add('Classifique todos os documentos por tipo e prioridade de leitura com justificativa baseada em evidências.', 'pt', allKeys, 'global_classification');
add('Liste os principais riscos, lacunas e conflitos entre os documentos em formato de tabela.', 'pt', allKeys, 'global_risks');
add('Monte um plano de revisão de 30 minutos indicando ordem de leitura e objetivo por documento.', 'pt', allKeys, 'global_plan');
add('Faça um resumo executivo final com seção: comprovado, provável e não comprovado.', 'pt', allKeys, 'global_summary');

add(`Give me an executive overview of the attached documents (${allAliases}) in 10 bullets with citations.`, 'en', allKeys, 'global_overview');
add('Classify all documents by type and reading priority with evidence-based justification.', 'en', allKeys, 'global_classification');
add('List the top risks, gaps, and cross-document conflicts in a table.', 'en', allKeys, 'global_risks');
add('Build a 30-minute review plan with reading order and objective per document.', 'en', allKeys, 'global_plan');
add('Provide a final executive summary with sections: proven, likely, and not evidenced.', 'en', allKeys, 'global_summary');

// 80 single-doc queries (2 PT + 2 EN per doc)
for (const doc of documents) {
  add(`No documento "${doc.alias}", resuma objetivo, pontos-chave e conclusões em 5 bullets com fontes.`, 'pt', [doc.key], 'single_doc_summary');
  add(`No documento "${doc.alias}", extraia entidades, datas e valores em tabela campo | valor | evidência.`, 'pt', [doc.key], 'single_doc_extraction');
  add(`For the document "${doc.alias}", summarize objective, key points, and conclusions in 5 bullets with sources.`, 'en', [doc.key], 'single_doc_summary');
  add(`For the document "${doc.alias}", extract entities, dates, and numeric values in a field | value | evidence table.`, 'en', [doc.key], 'single_doc_extraction');
}

// 10 cross-doc queries (5 PT + 5 EN)
for (let p = 0; p < 5; p += 1) {
  const a = documents[p % documents.length];
  const b = documents[(p + 1) % documents.length];
  add(`Compare "${a.alias}" e "${b.alias}" em uma matriz: convergências | divergências | evidência.`, 'pt', [a.key, b.key], 'pair_compare');
}
for (let p = 0; p < 5; p += 1) {
  const a = documents[(p + 5) % documents.length];
  const b = documents[(p + 6) % documents.length];
  add(`Compare "${a.alias}" and "${b.alias}" in a matrix: alignments | divergences | evidence.`, 'en', [a.key, b.key], 'pair_compare');
}

if (queries.length !== 100) {
  throw new Error(`Expected 100 queries, got ${queries.length}`);
}

const coverage = Object.fromEntries(documents.map((d) => [d.key, 0]));
for (const q of queries) for (const k of q.targets) coverage[k] += 1;

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceDirectory: DOCS_DIR,
    totalDocuments: documents.length,
    totalQueries: queries.length,
    languages: ['pt', 'en'],
  },
  documents,
  coverage,
  queries,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
console.log(`Generated bilingual pack -> ${OUT_FILE}`);
console.log('Queries:', queries.length, 'Docs:', documents.length);
const minCov = Math.min(...Object.values(coverage));
console.log('Coverage min:', minCov);
if (minCov < 1) process.exit(1);
