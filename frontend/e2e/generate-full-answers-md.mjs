#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.join(__dirname, 'reports', '99-query-run.json');
const OUTPUT = path.join(__dirname, 'reports', '99-query-full-answers.md');

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const results = data.results;

// Simplified grading (same logic as grade-99-query.mjs)
function countOccurrences(haystack, needle) {
  let c = 0, p = 0;
  while ((p = haystack.indexOf(needle, p)) !== -1) { c++; p += needle.length; }
  return c;
}

function isLikelyEnglish(text) {
  const v = ' ' + String(text || '').toLowerCase() + ' ';
  if (v.split(/\s+/).length < 8) return true;
  const en = [' the ', ' is ', ' are ', ' was ', ' were ', ' have ', ' has ', ' been ', ' would ', ' should ', ' could ', ' which ', ' their ', ' they '];
  const pt = [' não ', ' uma ', ' nas ', ' nos ', ' está ', ' são ', ' também ', ' então ', ' pode ', ' sobre ', ' seus ', ' mais ', ' pela ', ' pelo '];
  if (/\|.+\|/.test(text)) {
    const tLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const header = tLines.find(l => l.includes('|') && !/^[\s|:\-]+$/.test(l));
    if (header) {
      const hdr = ' ' + header.toLowerCase() + ' ';
      const enH = en.reduce((a, w) => a + countOccurrences(hdr, w), 0);
      const ptH = pt.reduce((a, w) => a + countOccurrences(hdr, w), 0);
      if (enH >= ptH) return true;
    }
  }
  const enScore = en.reduce((a, w) => a + countOccurrences(v, w), 0);
  const ptScore = pt.reduce((a, w) => a + countOccurrences(v, w), 0);
  return enScore >= ptScore;
}

function isProcessingError(r) {
  const text = (r.fullText || '').toLowerCase();
  return r.error != null || text.startsWith('i hit a runtime issue') || text.startsWith('there was a processing issue') || text.startsWith('i could not complete') || text.startsWith('i could not safely finalize') || text.length === 0;
}

function isLanguageFallback(r) {
  const text = (r.fullText || '').trim();
  return /could not safely finalize this answer in the requested language/i.test(text) || /Nao consegui finalizar a resposta/i.test(text);
}

function isAbstention(text) {
  const v = text.toLowerCase().trim();
  return /^(i cannot|i can't|i do not have|i don't have)\b/.test(v) || /\b(not available in the provided context|insufficient information)\b/.test(v) || /\b(the provided (documents|evidence|context) do not contain)\b/.test(v);
}

function hasStructuredContent(text) {
  return /(^|\n)([-*•]|\d+\.)\s+/m.test(text) || /\|.+\|/.test(text) || /\*\*[^*]+\*\*/.test(text);
}

function isGarbledEcho(text, query) {
  if (!text || !query) return false;
  const t = text.trim().toLowerCase().replace(/^the\s+/i, '');
  const q = query.trim().toLowerCase();
  if (t.length < q.length * 1.3 && q.length > 10) {
    const overlap = q.split(/\s+/).filter(w => t.includes(w)).length;
    const queryWords = q.split(/\s+/).length;
    if (overlap / queryWords >= 0.8) return true;
  }
  return false;
}

const grades = results.map(r => {
  const text = r.fullText || '';
  const textLen = text.length;
  const sources = r.sources || [];
  const issues = [];
  let score = 100;

  if (isProcessingError(r)) return { ...r, score: 0, grade: 'F', issues: ['PROCESSING_ERROR'] };
  if (isLanguageFallback(r)) return { ...r, score: 0, grade: 'F', issues: ['LANGUAGE_CONTRACT_BLOCKED'] };
  if (textLen > 50 && !isLikelyEnglish(text)) { issues.push('LANGUAGE_MISMATCH'); score -= 40; }
  if (!sources.length && textLen > 0) { issues.push('NO_SOURCES'); score -= 15; }
  if (r.truncated) { issues.push('TRUNCATED'); score -= 15; }
  if (textLen < 100 && textLen > 0) { issues.push('VERY_SHORT'); score -= 25; }
  else if (textLen < 200) { issues.push('SHORT'); score -= 10; }
  if (isAbstention(text)) { issues.push('ABSTENTION'); score -= 30; }
  if (r.latencyMs > 15000) { issues.push('HIGH_LATENCY'); score -= 5; }
  if (isGarbledEcho(text, r.query)) { issues.push('GARBLED_ECHO'); score -= 30; }
  const needsStructure = /(extract|compare|list|table|break.?down|identify|separate|reconstruct|build a table)/i.test(r.query);
  if (needsStructure && textLen > 200 && !hasStructuredContent(text)) { issues.push('MISSING_STRUCTURE'); score -= 10; }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return { ...r, score, grade, issues };
});

// Build markdown
const totalScore = grades.reduce((s, g) => s + g.score, 0);
const avgScore = (totalScore / grades.length).toFixed(1);
const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
for (const g of grades) dist[g.grade]++;
const avgLatency = Math.round(grades.reduce((s, g) => s + (g.latencyMs || 0), 0) / grades.length);

let md = `# 89-Query Full Results\n\n`;
md += `**Date**: ${new Date().toISOString().split('T')[0]}\n`;
md += `**Overall Score**: ${avgScore}/100\n`;
md += `**Grade Distribution**: A=${dist.A}  B=${dist.B}  C=${dist.C}  D=${dist.D}  F=${dist.F}\n`;
md += `**Avg Latency**: ${avgLatency}ms\n\n`;
md += `---\n\n`;

let currentDoc = '';
for (const g of grades) {
  if (g.docLabel !== currentDoc) {
    currentDoc = g.docLabel;
    md += `## ${currentDoc}\n\n`;
  }
  md += `### Q${g.queryNum} — ${g.grade} (${g.score}/100, ${g.latencyMs}ms, ${(g.fullText || '').length}ch)\n\n`;
  md += `**Query:** ${g.query}\n\n`;
  md += `**Answer:**\n\n${g.fullText}\n\n`;
  if (g.issues && g.issues.length) md += `_Issues: ${g.issues.join(', ')}_\n\n`;
  md += `---\n\n`;
}

fs.writeFileSync(OUTPUT, md);
console.log(`Written ${grades.length} queries to ${OUTPUT} (${md.length} chars)`);
