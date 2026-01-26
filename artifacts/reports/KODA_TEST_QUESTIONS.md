# KODA Test Questions - Benchmarking Guide

## Overview
This document contains 10 test questions designed to benchmark KODA's capabilities across different query types. Each question includes expected behavior, success criteria, and estimated response time.

---

## Test Questions

### 1. Simple Factual Query (PDF/DOCX)
**Query:** "What is my passport number?"

**Expected Behavior:**
- KODA should search for passport-related documents
- Extract specific passport number from document
- Return direct answer with source citation

**Success Criteria:**
- ✅ Returns correct passport number
- ✅ Cites source document
- ✅ Response time < 5 seconds

**Estimated Time:** 3-5 seconds

---

### 2. Excel Data Extraction
**Query:** "What is the total Room Revenue for January 2025 in Lone Mountain Ranch?"

**Expected Behavior:**
- Locate Excel file (Lone Mountain Ranch P&L 2025)
- Find Sheet with Revenue data
- Extract January 2025 Room Revenue value

**Success Criteria:**
- ✅ Returns correct monetary value
- ✅ Identifies correct Excel file and sheet
- ✅ Cites cell reference if available

**Estimated Time:** 5-8 seconds

**Known Issue:** Excel queries may fail if AgentLoop is still being called. Verify agent-loop.service.ts is archived.

---

### 3. Document Comparison
**Query:** "Compare the key points in Gestão de Processos document with Direito Empresarial document"

**Expected Behavior:**
- Retrieve content from both documents
- Identify key themes in each
- Generate structured comparison

**Success Criteria:**
- ✅ Mentions both documents
- ✅ Identifies at least 3 comparison points
- ✅ Structured response (bullet points or table)

**Estimated Time:** 8-12 seconds

---

### 4. Summary Request
**Query:** "Summarize the main topics in my Customer Experience document"

**Expected Behavior:**
- Locate Customer Experience document
- Extract main sections/topics
- Generate concise summary

**Success Criteria:**
- ✅ Accurate summary of document content
- ✅ Covers main topics (not just first section)
- ✅ Appropriate length (3-5 paragraphs)

**Estimated Time:** 6-10 seconds

---

### 5. File Location Query
**Query:** "Where is Comprovante1.pdf located?"

**Expected Behavior:**
- Query database directly (system query)
- Return folder location
- Fast response (no RAG needed)

**Success Criteria:**
- ✅ Returns correct folder name
- ✅ Uses folder emoji if available
- ✅ Response time < 2 seconds

**Estimated Time:** 1-2 seconds

---

### 6. Multi-Language Query (Portuguese)
**Query:** "Qual é o resumo do documento de Finanças?"

**Expected Behavior:**
- Detect Portuguese language
- Search for Finanças document(s)
- Respond in Portuguese

**Success Criteria:**
- ✅ Response in Portuguese
- ✅ Accurate content from Finanças document
- ✅ Natural language tone

**Estimated Time:** 5-8 seconds

---

### 7. Folder Contents Query
**Query:** "What files are in my Faculdade folder?"

**Expected Behavior:**
- List all documents in specified folder
- Show file count
- Optionally show subfolders

**Success Criteria:**
- ✅ Lists files correctly
- ✅ Shows file count
- ✅ Response time < 3 seconds

**Estimated Time:** 2-3 seconds

---

### 8. Specific Section Query
**Query:** "What does section 3 of the Scrum Framework document say?"

**Expected Behavior:**
- Locate Scrum Framework document
- Find section 3 content
- Return section content

**Success Criteria:**
- ✅ Returns correct section content
- ✅ Indicates section boundaries
- ✅ Cites source

**Estimated Time:** 5-7 seconds

---

### 9. Cross-Document Search
**Query:** "Find all mentions of 'marketing strategy' across my documents"

**Expected Behavior:**
- Search across all user documents
- Find relevant mentions
- List sources with context

**Success Criteria:**
- ✅ Returns multiple sources
- ✅ Shows context for each mention
- ✅ Ranks by relevance

**Estimated Time:** 6-10 seconds

---

### 10. Complex Multi-Part Query
**Query:** "What are the main differences between Q1 and Q2 revenue, and what caused the changes?"

**Expected Behavior:**
- Find revenue data for Q1 and Q2
- Calculate or identify differences
- Analyze causes if mentioned in documents

**Success Criteria:**
- ✅ Identifies Q1 and Q2 figures
- ✅ Notes key differences
- ✅ Attempts to explain causes (or states if not available)

**Estimated Time:** 8-15 seconds

---

## Performance Benchmarks

| Query Type | Target Time | Acceptable Time | Needs Improvement |
|------------|-------------|-----------------|-------------------|
| Simple Factual | < 3s | 3-5s | > 5s |
| Excel Extraction | < 5s | 5-8s | > 8s |
| Document Comparison | < 8s | 8-12s | > 12s |
| Summary | < 6s | 6-10s | > 10s |
| File Location | < 1s | 1-2s | > 2s |
| Multi-Language | < 5s | 5-8s | > 8s |
| Folder Contents | < 2s | 2-3s | > 3s |
| Section Query | < 5s | 5-7s | > 7s |
| Cross-Document | < 6s | 6-10s | > 10s |
| Complex Multi-Part | < 10s | 10-15s | > 15s |

---

## Error Response Testing

### Expected Error Behaviors

1. **No Documents Uploaded**
   - Query: Any question with empty library
   - Expected: Friendly message with upload instructions
   - Should NOT say "Error" or show technical details

2. **Document Not Found**
   - Query: "What does my 2024 Tax Return say?"
   - Expected: Varied "not found" message (from ErrorMessagesService)
   - Should suggest alternatives

3. **Ambiguous Query**
   - Query: "Tell me about the document"
   - Expected: Ask for clarification
   - Should list available documents or suggest specific questions

4. **Excel Read Error**
   - Query: Complex Excel query on corrupted file
   - Expected: Natural error message with suggestions
   - Should NOT show technical stack trace

---

## Testing Checklist

Before each test session:
- [ ] Verify backend is running (port 5000)
- [ ] Verify frontend is running (port 3000)
- [ ] Check Pinecone connection
- [ ] Verify user has test documents uploaded
- [ ] Clear browser cache if needed

After each test:
- [ ] Record actual response time
- [ ] Note any error messages
- [ ] Check source citations
- [ ] Verify answer accuracy
- [ ] Rate response quality (1-5)

---

## Recent Fixes Applied

1. **Copy Button Visibility** - Changed opacity from 0 to 1 in MessageActions.css
2. **Varied Error Messages** - Created ErrorMessagesService with 8+ templates per scenario
3. **AgentLoop Removal** - Archived agent-loop.service.ts to prevent pgvector errors
4. **ErrorHandler Integration** - Updated to use varied messages from ErrorMessagesService

---

## Known Issues

1. **Excel Queries May Fail** - If old server processes are still running with AgentLoop code
   - Solution: Restart backend server after archiving agent-loop.service.ts

2. **"Hi there!" Greeting** - May appear on every message instead of just first
   - Status: Needs investigation in systemPrompts.service.ts

3. **Console.log Statements** - 5,095 statements need removal for production
   - Status: Pending cleanup task

---

*Last Updated: November 25, 2025*
*Version: 1.0*
