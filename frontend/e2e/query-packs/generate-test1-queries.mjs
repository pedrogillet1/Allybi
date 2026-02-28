#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DOCS_DIR = process.argv[2] || '/Users/pg/Desktop/test1';
const OUT_FILE = process.argv[3] || 'frontend/e2e/query-packs/test1-queries.pt-BR.json';

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
  const cleaned = base
    .replace(/[()]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  return words.slice(0, Math.min(5, words.length)).join(' ');
}

const files = fs
  .readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'pt'));

if (files.length === 0) {
  throw new Error(`No files found in ${DOCS_DIR}`);
}

const documents = files.map((filename) => {
  const alias = aliasFromFilename(filename);
  const key = normalize(alias).replace(/\s+/g, '_');
  return { key, alias, filename };
});

const queries = [];
let index = 1;

function addQuery(text, targets = [], type = 'doc_grounded') {
  queries.push({
    id: `Q${String(index).padStart(3, '0')}`,
    text,
    targets,
    type,
  });
  index += 1;
}

const allAliases = documents.map((d) => d.alias);

addQuery(
  `Quero começar: me dê uma visão geral dos ${documents.length} documentos anexados (${allAliases.join(', ')}), em 10 bullets, com citações.` ,
  documents.map((d) => d.key),
  'global_overview',
);
addQuery(
  'Classifique os documentos por tipo (acadêmico, financeiro, jurídico, comercial, apresentação, comprovante) e explique o critério com fontes.',
  documents.map((d) => d.key),
  'global_classification',
);
addQuery(
  'Quais documentos parecem mais críticos para tomada de decisão imediata? Monte ranking com justificativa e evidência.',
  documents.map((d) => d.key),
  'global_prioritization',
);
addQuery(
  'Liste os 10 maiores riscos ou inconsistências detectados no conjunto de documentos e cite origem de cada item.',
  documents.map((d) => d.key),
  'global_risks',
);
addQuery(
  'Faça um resumo executivo final em PT-BR com 8 bullets e uma seção "O que falta validar".',
  documents.map((d) => d.key),
  'global_summary',
);

for (const doc of documents) {
  addQuery(
    `No documento "${doc.alias}", qual é o objetivo principal? Responda em 4 bullets e cite evidências.`,
    [doc.key],
    'single_doc_summary',
  );
  addQuery(
    `No documento "${doc.alias}", extraia entidades-chave (pessoas, empresas, locais), datas e valores em tabela com colunas campo | valor | evidência.`,
    [doc.key],
    'single_doc_extraction',
  );
  addQuery(
    `No documento "${doc.alias}", quais são as lacunas, ambiguidades ou pontos sem comprovação? Dê 3 perguntas de esclarecimento.`,
    [doc.key],
    'single_doc_gap_analysis',
  );
}

for (let i = 0; i < documents.length - 1; i += 1) {
  const a = documents[i];
  const b = documents[i + 1];
  addQuery(
    `Compare "${a.alias}" com "${b.alias}" em uma matriz: tema | convergência | divergência | documento-fonte.`,
    [a.key, b.key],
    'pairwise_compare',
  );
}

for (let i = 0; i < documents.length; i += 1) {
  const current = documents[i];
  const next = documents[(i + 1) % documents.length];
  addQuery(
    `Se eu só tiver 2 minutos para ler "${current.alias}", o que é obrigatório? E como isso conecta com "${next.alias}"?`,
    [current.key, next.key],
    'pairwise_prioritize',
  );
}

while (queries.length < 100) {
  const idx = queries.length % documents.length;
  const doc = documents[idx];
  addQuery(
    `No documento "${doc.alias}", gere um mini checklist de validação operacional com 5 itens e evidência por item.`,
    [doc.key],
    'single_doc_checklist',
  );
}

const coverage = Object.fromEntries(documents.map((d) => [d.key, 0]));
for (const query of queries) {
  for (const target of query.targets) {
    if (coverage[target] !== undefined) coverage[target] += 1;
  }
}

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceDirectory: DOCS_DIR,
    totalDocuments: documents.length,
    totalQueries: queries.length,
    language: 'pt-BR',
  },
  documents,
  coverage,
  queries,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
console.log(`Generated ${queries.length} queries for ${documents.length} docs -> ${OUT_FILE}`);
const uncovered = Object.entries(coverage).filter(([, c]) => c === 0);
if (uncovered.length > 0) {
  console.error('Uncovered docs:', uncovered.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('Coverage OK: every document is targeted by at least one query.');
