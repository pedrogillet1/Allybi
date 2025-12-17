# KODA AI - COMPLETE FORMAT STRUCTURE & UNIVERSAL RULES

Generated: 2025-10-29
Updated: 2025-12-09 (Koda Markdown Contract Integration)

---

## TABLE OF CONTENTS

1. [Response Format Types](#response-format-types)
2. [Format Structure Breakdown](#format-structure-breakdown)
3. [Universal Rules](#universal-rules)
4. [Bold Formatting Rules](#bold-formatting-rules)
5. [Language Rules](#language-rules)
6. [Source Attribution Rules](#source-attribution-rules)
7. [Examples by Query Type](#examples-by-query-type)
8. [Prompt Template Structure](#prompt-template-structure)
9. [Koda Markdown Contract](#koda-markdown-contract) *(NEW)*
10. [Koda Memory Engine 4.0](#koda-memory-engine-40-new---2025-12-09) *(NEW)*

---

## KODA MARKDOWN CONTRACT (NEW - 2025-12-09)

The Koda Markdown Contract is a strict frontend/backend agreement for ChatGPT-like formatting.

### Core Principle
- **Backend** = semantic markdown only (what it is, not how it looks)
- **Frontend** = visual spacing only (how it looks, not what it is)

### Contract Rules
1. **Max 2 newlines** between blocks (never 3+)
2. **No blank lines** inside lists
3. Use **## for titles** (not # - avoids huge H1 margins)
4. Normalize bullets to **-** (not • or *)
5. **Selective bolding** only (key terms, not all numbers/dates)
6. No duplicate content
7. Fix broken markdown (unbalanced `**` and ` ``` `)
8. Remove artifacts (`[THINKING]`, `[SYSTEM]` tags)

### Files Involved
- **Backend**: `kodaMarkdownContract.service.ts` - Core contract implementation
- **Backend**: `masterAnswerFormatter.service.ts` - Uses contract by default
- **Frontend**: `koda-markdown.css` - Chat-sized CSS styling
- **Frontend**: `StreamingMarkdown.jsx` - Uses `.koda-markdown` class

### CSS Specifications
- `h2`: 16px (chat-sized, not huge)
- `h3`: 15px
- Lists: 2px spacing between items (tight)
- Paragraphs: 12px bottom margin

---

## KODA MEMORY ENGINE 4.0 (NEW - 2025-12-09)

ChatGPT-style conversation memory with 3 layers for context persistence.

### Memory Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KODA MEMORY ENGINE 4.0                           │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 1: SHORT-TERM BUFFER                                        │
│  - Last 50 messages (user + assistant)                             │
│  - Full text, no compression                                       │
│  - Loaded from database on each request                            │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 2: ROLLING SUMMARY + CONVERSATION STATE                     │
│  - Generated every 10 turns (background)                           │
│  - 1-3 sentence summary                                            │
│  - Tracks: userGoal, currentDocument, currentTopic                 │
│  - Tracks: knownSections, knownDocuments                           │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 3: INFINITE MEMORY (Optional)                               │
│  - Semantic search over old conversations                          │
│  - Triggered by recall queries ("do you remember", "earlier")      │
│  - Returns relevant snippets from past discussions                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `getConversationMemory()` | Load all 3 layers at start of request |
| `updateConversationMemory()` | Update state after each answer |
| `isMemoryRecallQuery()` | Detect queries that need infinite memory |
| `isFollowUpQuery()` | Detect follow-up questions (pronouns) |
| `inferTopicFromQuery()` | Auto-detect current topic |
| `inferUserGoalFromQuery()` | Auto-detect user's goal |
| `buildFormattedContext()` | Build LLM prompt context string |

### Files Involved

- **Backend**: `kodaMemoryEngine.service.ts` - Main memory engine (3 layers)
- **Backend**: `rollingConversationSummary.service.ts` - Rolling summary generation
- **Backend**: `infiniteConversationMemory.service.ts` - Semantic search memory
- **Backend**: `rag.service.ts` - Integration points (loads/updates memory)
- **Database**: `ConversationState` table (Prisma schema)

### Integration in RAG Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│ generateAnswerStream()                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Load Memory (getConversationMemory)                             │
│    ↓                                                                │
│ 2. Fast path checks (greetings, doc count)                         │
│    ↓                                                                │
│ 3. Intent detection (with memory context)                          │
│    ↓                                                                │
│ 4. Document retrieval                                               │
│    ↓                                                                │
│ 5. Answer generation (memory in prompt)                            │
│    ↓                                                                │
│ 6. Update Memory (updateConversationMemory)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### ConversationState Schema

```prisma
model ConversationState {
  id                     String   @id @default(cuid())
  conversationId         String   @unique
  userId                 String
  userGoal               String   @default("Exploring documents")
  currentDocument        String?
  currentTopic           String   @default("General inquiry")
  knownSections          String[] @default([])
  knownDocuments         String[] @default([])
  lastSummaryAt          DateTime @default(now())
  turnsSinceLastSummary  Int      @default(0)
  summary                String   @default("Conversation just started.")
}
```

---

## RESPONSE FORMAT TYPES

KODA uses **3 different response formats** based on query type:

### Type 1: SPECIFIC FACT QUERIES
**When to use:** User asks for a single specific piece of information (cell value, date, name, number)
**Trigger words:** "what is", "when was", "how much", "who", specific cell references

### Type 2: FILE LISTING QUERIES
**When to use:** User asks about what files exist
**Trigger words:** "what files", "do I have", "which documents", "where is file"

### Type 3: GENERAL INFORMATION QUERIES
**When to use:** User asks for explanations, summaries, or complex information
**Trigger words:** "tell me about", "explain", "what does X say", "summarize"

---

## FORMAT STRUCTURE BREAKDOWN

### TYPE 1: SPECIFIC FACT QUERIES

**Structure:**
```
[Location] contains/is [value].
```

**Rules:**
- ✅ Answer in **1 sentence only**
- ✅ Bold **ONLY** the value/number (e.g., "The value is **25**")
- ✅ **NO** follow-up questions
- ✅ **NO** extra sections, headers, or bullet points
- ✅ **NO** additional context or explanation
- ✅ Format: "[Location] contains/is **[value]**." PERIOD. STOP.

**Template:**
```
[Subject/Location] [verb] **[value]**.
```

**Examples:**

Query: "what is cell B9 in sheet 2"
Answer: "Cell B9 in Sheet 2 of the Lista_9 Excel spreadsheet contains the value **25**."

Query: "when was document X created"
Answer: "Document X was created on **March 15, 2024**."

Query: "what is the total in cell C5"
Answer: "Cell C5 contains the value **$1,250**."

Query: "who is the author of the report"
Answer: "The author of the report is **John Smith**."

Query: "how many pages does the PDF have"
Answer: "The PDF has **47 pages**."

---

### TYPE 2: FILE LISTING QUERIES

**Structure:**
```
You have X file(s):
• filename1.ext
• filename2.ext
• filename3.ext
```

**Rules:**
- ✅ Keep response **under 5 lines** for simple queries
- ✅ Use **simple bullet list** with bullets (•)
- ✅ **NO** file sizes (unless specifically asked)
- ✅ **NO** file type labels ("PDF", "JPEG", etc. - extension shows this)
- ✅ **NO** emojis (📄, 📁, 📊, etc.)
- ✅ **NO** totals ("Total: X files")
- ✅ **NO** prompts ("Click on any file..." or "Let me know if...")
- ✅ **NO** detailed breakdowns (sheet contents, cell data, page counts)
- ✅ **NO** extra spacing (single line between items)

**Template:**
```
You have [number] file(s):
• [filename1].[ext]
• [filename2].[ext]
• [filename3].[ext]
```

**Examples:**

Query: "What PDF files do I have?"
Answer:
```
You have 3 PDF files:
• Business Plan 2024.pdf
• Financial Report Q1.pdf
• Marketing Strategy.pdf
```

Query: "Do I have Excel files?"
Answer:
```
You have 2 Excel files:
• Sales Data.xlsx
• Budget 2024.xlsx
```

---

### TYPE 3: GENERAL INFORMATION QUERIES

**Structure:**
```
## [Document Name]

[2-3 sentences providing comprehensive, detailed answer with specific information. Extract actual data, numbers, facts, and details - NOT generic statements.]

**Key Points:**
- [Specific detail - bold only the actual numbers/values]
- [Supporting facts with concrete information - bold only specific values]
- [Additional relevant details from the documents]
- [More points as needed - be thorough]

[One helpful follow-up question related to the topic.]
```

**Rules:**
- ✅ Start with `## [Document Name]` (NO emoji, just document name)
- ✅ Extract **SPECIFIC** information (numbers, dates, percentages, names)
- ✅ **DO NOT** give vague answers like "The document outlines..."
- ✅ If information exists, **EXTRACT IT** and present it
- ✅ Be comprehensive - include **ALL** relevant details
- ✅ Bold **ONLY** the actual values/numbers (not entire sentences)
- ✅ End with **one** follow-up question

**Template:**
```
## [Document Name]

[Comprehensive answer with specific data: [value] and [value].]

**Key Points:**
- [Detail]: **[value]**
- [Detail]: **[value]**
- [Detail]: **[value]**
- [Detail]: **[value]**

[Follow-up question?]
```

**Example:**

Query: "What does the business plan say about revenue?"
Answer:
```
## Koda Business Plan

The business plan outlines aggressive revenue growth over three years, starting with **$670,800** in Year 1, scaling to **$2,395,000** in Year 2, and reaching **$6,240,000** in Year 3. The model is based on a tiered pricing structure with three subscription levels and projected customer acquisition rates.

**Key Points:**
- Year 1 targets **280 users** with revenue of **$670,800**
- Year 2 projects **995 users** generating **$2,395,000**
- Year 3 forecasts **2,600 users** producing **$6,240,000** in revenue
- Growth is driven by a **95% retention rate** and increasing market penetration
- Pricing tiers: Basic (**$15/mo**), Professional (**$45/mo**), Enterprise (**$125/mo**)

Would you like to see the cost projections or profitability metrics?
```

---

### SPECIAL CASE: FINANCIAL/NUMERICAL QUERIES

**Enhanced Rules for Financial Data:**
When asked about projections, revenue, costs, metrics, or ANY numerical data:

- ✅ **YOU MUST** extract and list **ALL** specific numbers, dollar amounts, percentages, timeframes
- ✅ Format numbers prominently: "Year 1: **$670,800**, Year 2: **$2,395,000**, Year 3: **$6,240,000**"
- ✅ Include associated context (user counts, growth rates, margins, etc.)
- ✅ **NEVER** summarize as "significant growth" - give **ACTUAL** figures

**Example:**

Query: "What are the revenue projections?"
Answer:
```
## Koda Business Plan - Revenue Projections

The revenue model projects exponential growth from **$670,800** in Year 1 to **$6,240,000** by Year 3, representing a **830% increase** over three years.

**Key Points:**
- **Year 1:** **$670,800** from **280 users** (**$200/user/year** average)
- **Year 2:** **$2,395,000** from **995 users** (**257% YoY growth**)
- **Year 3:** **$6,240,000** from **2,600 users** (**161% YoY growth**)
- Gross margins improve from **65%** to **78%** by Year 3
- Break-even projected at **Month 18** with **450 users**

Would you like to see the cost breakdown or user acquisition strategy?
```

---

## UNIVERSAL RULES

These rules apply to **ALL** response types:

### 1. LANGUAGE MATCHING
```
✅ **ALWAYS** respond in the EXACT SAME LANGUAGE as the user's query
✅ **NEVER** respond in a different language than the query
✅ **NEVER** use Estonian unless the query is in Estonian
```

**Examples:**
- Query in English → Answer in English
- Query in Portuguese → Answer in Portuguese
- Query in Spanish → Answer in Spanish

---

### 2. HONESTY RULE

**If documents DO NOT contain the answer:**

English Response:
```
I am unable to locate relevant information about [query] in the retrieved documents.
```

Portuguese Response:
```
Não consigo localizar informações relevantes sobre [query] nos documentos recuperados.
```

**Rules:**
- ✅ **DO NOT** reference documents that don't contain the answer
- ✅ **DO NOT** try to extract unrelated information
- ✅ **DO NOT** make up information or hallucinate

---

### 3. DATA EXTRACTION REQUIREMENT

**When documents DO contain the answer:**

**DO NOT write:**
```
❌ "The document outlines revenue projections..."
❌ "It likely includes information about..."
❌ "The document discusses..."
❌ "The file contains details regarding..."
```

**INSTEAD, write:**
```
✅ Extract SPECIFIC numbers, dates, values, and facts
✅ Quote actual text from the documents when relevant
✅ If information exists, PRESENT IT directly
✅ If asking for numbers, LIST THE ACTUAL FIGURES
```

**Example:**

Bad (Generic):
```
❌ "The document discusses revenue projections showing significant growth over multiple years."
```

Good (Specific):
```
✅ "Revenue grows from **$670,800** in Year 1 to **$6,240,000** in Year 3."
```

---

## BOLD FORMATTING RULES

**Current System Rule:**
```
Only bold the actual values/numbers themselves (e.g., "profit of **67%**"),
NOT entire sentences or paragraphs
```

### What to Bold:

✅ **Numbers:** "The total is **25**"
✅ **Currency:** "Revenue of **$1.2M**"
✅ **Percentages:** "Growth rate of **15%**"
✅ **Dates:** "Created on **March 15, 2024**"
✅ **Names:** "The author is **John Smith**"
✅ **Key values:** "Status: **Active**"

### What NOT to Bold:

❌ **Entire sentences:** "**The hotel has a profit margin of 67.08%**"
❌ **Paragraphs:** "**The document outlines...**"
❌ **Descriptive text:** "**According to the report**, the value is 25"
❌ **Document names in headers:** "## **Business Plan**" (should be "## Business Plan")

### Examples:

**CORRECT:**
```
✅ "The hotel has a profit margin of **67.08%** and occupancy of **66%**"
✅ "According to the Business Plan, revenue is **$670K**"
✅ "Cell B9 contains the value **25**"
```

**WRONG:**
```
❌ "**The hotel has a profit margin of 67.08% and occupancy of 66%**"
❌ "**According to the Business Plan, revenue is $670K**"
❌ "**Cell B9 contains the value 25**"
```

---

## SOURCE ATTRIBUTION RULES

### Rule: MULTI-DOCUMENT vs SINGLE-DOCUMENT

**When answering from MULTIPLE documents:**
```
⚠️ You MUST clearly attribute each fact to its source document
```

**When answering from a SINGLE document:**
```
⚠️ NO need for attribution - just provide the information directly
```

### Multi-Document Attribution Format:

**Template:**
```
According to the **[Document Name]**, [fact with **value**]. The **[Other Document]** shows [fact with **value**].
```

**Examples:**

**CORRECT (Multi-Document):**
```
✅ "According to the **Koda Business Plan**, the revenue projection for Year 1 is **$670,800**. The **2024 Financial Report** shows actual revenue of **$450,000**, indicating we're tracking behind projections."
```

**WRONG (No Attribution):**
```
❌ "The projected revenue is $670,800 and actual revenue is $450,000."
```
*Problem: Doesn't tell the user which number came from which document!*

**CORRECT (Single Document):**
```
✅ "The revenue projection for Year 1 is **$670,800**, with projected user count of **280 users**."
```
*Note: No need to repeat "According to the Business Plan" multiple times when all information is from the same document*

---

## EXAMPLES BY QUERY TYPE

### Specific Fact Queries

**Cell Value Query:**
```
Q: "what is cell B9 in sheet 2"
A: "Cell B9 in Sheet 2 of the Lista_9 Excel spreadsheet contains the value **25**."
```

**Date Query:**
```
Q: "when was the business plan created"
A: "The business plan was created on **January 15, 2024**."
```

**Financial Query:**
```
Q: "what is the total revenue in Q1"
A: "The total revenue in Q1 is **$450,000**."
```

**Name Query:**
```
Q: "who is the CEO"
A: "The CEO is **Pedro Silva**."
```

---

### File Listing Queries

**Basic File List:**
```
Q: "What PDF files do I have?"
A: "You have 5 PDF files:
• Business Plan 2024.pdf
• Financial Report Q1.pdf
• Marketing Strategy.pdf
• Employee Handbook.pdf
• Technical Specifications.pdf"
```

**File Type Query:**
```
Q: "Do I have Excel files?"
A: "You have 3 Excel files:
• Sales Data.xlsx
• Budget 2024.xlsx
• Customer List.xlsx"
```

**Location Query:**
```
Q: "Which documents are in the Finance folder?"
A: "You have 2 documents in Finance:
• Budget 2024.xlsx
• Financial Report Q1.pdf"
```

---

### General Information Queries

**Business Query:**
```
Q: "What does the business plan say about our target market?"
A: "## Koda Business Plan

The business plan identifies enterprise organizations and professional services firms as the primary target market, focusing on companies with 50-500 employees that handle large volumes of unstructured documents. The strategy emphasizes initial penetration in legal, consulting, and financial services sectors.

**Key Points:**
- Target market size: **12,000 companies** in North America
- Initial focus on legal firms (**35%** of target) and consulting (**28%**)
- Average contract value: **$5,400** per year
- Market penetration goal: **2.5%** by Year 3

Would you like to see the competitive analysis or go-to-market strategy?"
```

**Technical Query:**
```
Q: "Explain the authentication system"
A: "## Technical Architecture Document

The authentication system uses JWT (JSON Web Tokens) with refresh token rotation for secure user sessions. Authentication is handled through a dedicated microservice that integrates with OAuth 2.0 providers (Google, Microsoft) and supports enterprise SSO via SAML 2.0.

**Key Points:**
- Token lifetime: Access tokens expire after **15 minutes**, refresh tokens after **7 days**
- Security: **AES-256** encryption for stored refresh tokens
- Rate limiting: **5 failed attempts** triggers **15-minute** lockout
- Session management: Maximum **3 concurrent sessions** per user
- Password requirements: Minimum **12 characters** with complexity rules

Would you like to see the API authentication flow or security audit details?"
```

**Financial Analysis Query:**
```
Q: "What are the cost projections?"
A: "## Koda Business Plan - Cost Structure

The cost model projects total operating expenses growing from **$890,000** in Year 1 to **$2,750,000** by Year 3, with gross margins improving from **65%** to **78%** as the business scales.

**Key Points:**
- **Year 1 Costs:** **$890,000** (COGS: **$235,000**, OpEx: **$655,000**)
- **Year 2 Costs:** **$1,650,000** (COGS: **$475,000**, OpEx: **$1,175,000**)
- **Year 3 Costs:** **$2,750,000** (COGS: **$686,000**, OpEx: **$2,064,000**)
- Largest expense: Engineering (**45%** of OpEx) and cloud infrastructure (**15%**)
- Break-even: **Month 18** at **450 users** and **$540K** monthly revenue

Would you like to see the headcount plan or cash flow projections?"
```

---

## PROMPT TEMPLATE STRUCTURE

### System Prompt Structure

**Location:** `backend/src/services/rag.service.ts:1579-1735`

```
# KODA AI - Document Intelligence Assistant

## WHO YOU ARE:
[Identity and core purpose]

## RESPONSE FORMAT RULES:
### FOR SPECIFIC FACT QUERIES:
[Rules for Type 1]

### FOR FILE LISTING QUERIES:
[Rules for Type 2]

### FOR GENERAL INFORMATION QUERIES:
[Rules for Type 3]

## CRITICAL RULES:
[Universal rules]

## SOURCE ATTRIBUTION:
[Attribution rules]

## YOUR WORKSPACE CONTEXT:
[Dynamic context about user's documents]
```

---

### User Prompt Structure

**Location:** `backend/src/services/rag.service.ts:1741-1844`

```
# USER QUERY:
[User's question]

# RETRIEVED DOCUMENTS:
[Document chunks with content]

# CRITICAL INSTRUCTIONS - READ CAREFULLY:

⚠️ HONESTY RULE: If documents don't contain the answer...

⚠️ WHEN DOCUMENTS DO CONTAIN THE ANSWER - EXTRACT ACTUAL DATA:
[Data extraction requirements]

[If multi-document query]
# TASK #12: MULTI-DOCUMENT ATTRIBUTION REQUIREMENT
[Attribution rules]
```

---

### No Documents Response

**Location:** `backend/src/services/rag.service.ts:1850-1857`

**When NO documents are retrieved:**

English:
```
I don't have any documents that match your query about "[query]".
Please try rephrasing your question or check if the relevant documents have been uploaded.
```

Portuguese:
```
Não tenho nenhum documento que corresponda à sua consulta sobre "[query]".
Por favor, tente reformular sua pergunta ou verifique se os documentos relevantes foram carregados.
```

---

### Conversation Summary Prompt

**Location:** `backend/src/services/rag.service.ts:2009-2028`

Used to summarize conversation history for context:

```
Summarize this conversation between user and KODA assistant.
Focus on:
- What documents were discussed
- What information was extracted
- Key questions asked
- Important details mentioned

Keep it concise (2-3 sentences max).
```

---

## FORMATTING ISSUES TO FIX

### Current Problem: Excessive Bold Usage

**Location:** `backend/src/services/rag.service.ts:1623, 1709-1718`

**Current Instruction (CAUSING PROBLEM):**
```
✅ **USE BOLD ONLY FOR VALUES** - Bold only numbers, dates, and key values
**BOLD FORMATTING** - Only bold the actual values/numbers themselves
```

**Result:** AI is bolding values throughout responses

**User Feedback:** "the ai is still using bold for answers is not good"

---

### Recommended Fix:

**Option 1: Remove All Bold Formatting**
```
✅ **FORMATTING** - Use plain text for all responses. Do not use bold, italics, or other markdown formatting except for document names in headers (##).
```

**Option 2: Minimal Bold (Headers Only)**
```
✅ **FORMATTING** - Use markdown formatting ONLY for:
- Document names as headers: ## [Document Name]
- Key Points section header: **Key Points:**
- Do NOT bold numbers, values, dates, or any other content
```

**Option 3: Bold for Document Names in Attribution Only**
```
✅ **FORMATTING** - Use plain text for all content. Only bold document names when attributing information from multiple sources (e.g., "According to the **Business Plan**...").
```

---

## SUMMARY: DECISION POINTS

### Decision 1: Bold Formatting
**Current:** Bold all values (numbers, dates, names)
**Issue:** User finds it excessive
**Options:**
- A) Remove all bold formatting
- B) Keep bold only for document headers
- C) Keep bold only for multi-document attribution

### Decision 2: Response Length
**Current:** General queries can be detailed with multiple key points
**Options:**
- A) Keep current detailed format
- B) Shorten to 1-2 key points maximum
- C) Make length adaptive based on query complexity

### Decision 3: Follow-up Questions
**Current:** End general queries with a follow-up question
**Options:**
- A) Keep follow-up questions
- B) Remove follow-up questions
- C) Make them optional based on query type

---

**END OF FORMAT STRUCTURE DOCUMENT**
