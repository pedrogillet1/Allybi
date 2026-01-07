/**
 * EXAMPLE: What a 3200-token RAG query actually looks like
 *
 * This shows the REAL content that fills the token budget.
 */

import { getTokenBudgetEstimator } from '../../src/services/utils';

const tokenEstimator = getTokenBudgetEstimator();

// ============================================================================
// 1. SYSTEM PROMPT (~51 tokens)
// ============================================================================

const SYSTEM_PROMPT = `You are Koda, an intelligent document assistant. Your role is to answer questions based ONLY on the provided document context.

CRITICAL RULES:
1. ONLY use information from the provided context
2. If the context doesn't contain the answer, say so clearly
3. Always cite which document the information comes from
4. Be concise but comprehensive
5. Respond in English.

Provide a clear, concise summary of the key points.`;

// ============================================================================
// 2. USER QUERY (~8 tokens)
// ============================================================================

const USER_QUERY = "What are the key financial highlights from Q3 2024?";

// ============================================================================
// 3. RETRIEVED CHUNKS (~1200 tokens = 6 chunks × 200 tokens each)
// ============================================================================

const CHUNK_1 = `[Document: Q3_2024_Financial_Report.pdf, Page 3]
Revenue Performance:
Total revenue for Q3 2024 reached $142.5 million, representing a 15% increase year-over-year.
This growth was primarily driven by strong performance in our enterprise segment, which grew 22%
compared to the same quarter last year. Our SMB segment showed modest growth of 8%, while
international markets contributed 35% of total revenue, up from 30% in Q3 2023.`;

const CHUNK_2 = `[Document: Q3_2024_Financial_Report.pdf, Page 5]
Profitability Metrics:
Gross margin improved to 68.5% from 65.2% in Q3 2023, reflecting operational efficiencies and
favorable product mix. Operating income was $28.4 million with an operating margin of 19.9%.
Net income reached $21.2 million, or $0.85 per diluted share, compared to $16.8 million, or
$0.67 per diluted share in the prior year quarter.`;

const CHUNK_3 = `[Document: Q3_2024_Financial_Report.pdf, Page 7]
Cash Flow and Balance Sheet:
Operating cash flow was $35.2 million, up 18% year-over-year. Free cash flow totaled $29.8 million
after capital expenditures of $5.4 million. The company ended the quarter with $215 million in
cash and short-term investments, with no outstanding debt. Days sales outstanding (DSO) improved
to 42 days from 48 days in the prior year.`;

const CHUNK_4 = `[Document: Q3_2024_Financial_Report.pdf, Page 9]
Segment Performance:
Enterprise Solutions: Revenue of $78.5 million (+22% YoY), driven by large contract wins with
Fortune 500 companies. Average deal size increased 15% to $245,000. Customer retention rate
remained strong at 94%. SMB Solutions: Revenue of $45.2 million (+8% YoY), with 2,400 new
customers acquired during the quarter.`;

const CHUNK_5 = `[Document: Q3_2024_Financial_Report.pdf, Page 11]
Geographic Breakdown:
North America: $92.6 million (65% of total), +12% YoY
Europe: $35.6 million (25% of total), +18% YoY
Asia-Pacific: $14.3 million (10% of total), +28% YoY
The strong growth in APAC reflects our expanded sales presence in Japan and Australia, with
new offices opened in Tokyo and Sydney during Q2 2024.`;

const CHUNK_6 = `[Document: Q3_2024_Financial_Report.pdf, Page 14]
Forward Guidance:
For Q4 2024, management expects revenue in the range of $148-152 million, representing
12-15% year-over-year growth. Full year 2024 revenue is expected to be $545-550 million.
The company raised its operating margin target to 20-21% for the full year, up from the
previous guidance of 19-20%, reflecting continued cost discipline and scale efficiencies.`;

const ALL_CHUNKS = [CHUNK_1, CHUNK_2, CHUNK_3, CHUNK_4, CHUNK_5, CHUNK_6].join('\n\n');

// ============================================================================
// 4. GENERATED ANSWER (~400 tokens - well within 2000 buffer)
// ============================================================================

const GENERATED_ANSWER = `## Q3 2024 Financial Highlights

Based on the Q3 2024 Financial Report, here are the key highlights:

### Revenue & Growth
- **Total Revenue**: $142.5 million (+15% YoY)
- **Enterprise Segment**: $78.5 million (+22% YoY) - main growth driver
- **SMB Segment**: $45.2 million (+8% YoY)
- **International**: 35% of total revenue (up from 30%)

### Profitability
- **Gross Margin**: 68.5% (up from 65.2%)
- **Operating Income**: $28.4 million (19.9% margin)
- **Net Income**: $21.2 million ($0.85 per share vs $0.67 prior year)

### Cash Position
- **Operating Cash Flow**: $35.2 million (+18% YoY)
- **Free Cash Flow**: $29.8 million
- **Cash & Investments**: $215 million (no debt)

### Geographic Performance
| Region | Revenue | Growth |
|--------|---------|--------|
| North America | $92.6M | +12% |
| Europe | $35.6M | +18% |
| Asia-Pacific | $14.3M | +28% |

### Guidance
- Q4 2024 revenue expected: $148-152 million (+12-15% YoY)
- Full year 2024: $545-550 million
- Operating margin target raised to 20-21%

**Sources**: Q3_2024_Financial_Report.pdf (Pages 3, 5, 7, 9, 11, 14)`;

// ============================================================================
// CALCULATE AND DISPLAY
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('EXAMPLE: Complete RAG Query Token Breakdown');
console.log('='.repeat(70) + '\n');

const systemTokens = tokenEstimator.estimateDetailed(SYSTEM_PROMPT, 'en').tokens;
const queryTokens = tokenEstimator.estimateDetailed(USER_QUERY, 'en').tokens;
const contextTokens = tokenEstimator.estimateDetailed(ALL_CHUNKS, 'en').tokens;
const answerTokens = tokenEstimator.estimateDetailed(GENERATED_ANSWER, 'en').tokens;

console.log('─'.repeat(70));
console.log('1. SYSTEM PROMPT');
console.log('─'.repeat(70));
console.log(SYSTEM_PROMPT);
console.log(`\n📊 Tokens: ${systemTokens}\n`);

console.log('─'.repeat(70));
console.log('2. USER QUERY');
console.log('─'.repeat(70));
console.log(USER_QUERY);
console.log(`\n📊 Tokens: ${queryTokens}\n`);

console.log('─'.repeat(70));
console.log('3. RETRIEVED CHUNKS (6 chunks from document)');
console.log('─'.repeat(70));
console.log(ALL_CHUNKS);
console.log(`\n📊 Tokens: ${contextTokens} (${Math.round(contextTokens/6)} avg per chunk)\n`);

console.log('─'.repeat(70));
console.log('4. GENERATED ANSWER');
console.log('─'.repeat(70));
console.log(GENERATED_ANSWER);
console.log(`\n📊 Tokens: ${answerTokens}\n`);

// Summary
console.log('='.repeat(70));
console.log('TOKEN BUDGET SUMMARY');
console.log('='.repeat(70) + '\n');

const inputTokens = systemTokens + queryTokens + contextTokens;
const totalTokens = inputTokens + answerTokens;
const BUDGET = 8000;

console.log('INPUT (sent to LLM):');
console.log(`  System prompt:     ${systemTokens.toString().padStart(5)} tokens`);
console.log(`  User query:        ${queryTokens.toString().padStart(5)} tokens`);
console.log(`  Document chunks:   ${contextTokens.toString().padStart(5)} tokens (6 chunks)`);
console.log(`  ─────────────────────────────`);
console.log(`  Total input:       ${inputTokens.toString().padStart(5)} tokens`);

console.log('\nOUTPUT (generated by LLM):');
console.log(`  Answer:            ${answerTokens.toString().padStart(5)} tokens`);

console.log('\nTOTAL:');
console.log(`  Input + Output:    ${totalTokens.toString().padStart(5)} tokens`);
console.log(`  Budget limit:      ${BUDGET.toString().padStart(5)} tokens`);
console.log(`  Usage:             ${((totalTokens/BUDGET)*100).toFixed(1)}%`);
console.log(`  Headroom:          ${(BUDGET - totalTokens).toString().padStart(5)} tokens remaining`);

console.log('\n' + '─'.repeat(70));
console.log('This is what a REAL query looks like with 6 retrieved chunks.');
console.log('The answer includes citations, tables, and structured formatting.');
console.log('─'.repeat(70) + '\n');
