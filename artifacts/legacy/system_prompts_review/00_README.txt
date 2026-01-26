================================================================================
KODA SYSTEM PROMPTS - REVIEW FOLDER
================================================================================

This folder contains all the system prompts used by Koda for answer generation.
Review these to verify the quality requirements match ChatGPT/Claude standards.

FILES:
------
01_ENGLISH_SYSTEM_PROMPT.txt    - Full English system prompt
02_PORTUGUESE_SYSTEM_PROMPT.txt - Full Portuguese system prompt
03_SPANISH_SYSTEM_PROMPT.txt    - Full Spanish system prompt
04_DYNAMIC_SECTIONS.txt         - Dynamic sections added based on context

================================================================================
KEY QUALITY REQUIREMENTS (enforced in all prompts):
================================================================================

1. REASONING REQUIREMENT
   - Every answer must explain WHY and HOW, not just WHAT
   - Facts must have context and implications
   - Numbers must have significance explained

2. CHATGPT/CLAUDE QUALITY STYLE
   - Clear, conversational, explanatory
   - Direct answer first, then supporting details
   - Each bullet point must have explanation, not just labels

3. FORMATTING RULES
   - Each list item on its own line
   - Short paragraphs (2-4 sentences max)
   - Bold for key numbers and terms
   - Blank lines between sections

4. FORBIDDEN PATTERNS
   - Bullet lists that are just labels (no explanation)
   - Walls of text (>5 sentences in one paragraph)
   - Headers like "Key points:", "Details:", "Summary:"
   - Preambles ("According to...", "Based on...")
   - Robotic closers ("Would you like more details?")
   - Filenames in answer text

================================================================================
GOOD vs BAD EXAMPLES:
================================================================================

✅ GOOD (with reasoning):
"Revenue increased 15% to $2.4M, driven by new enterprise clients"

❌ BAD (no reasoning):
"Revenue was $2.4M"

---

✅ GOOD BULLET (with reasoning):
- **Net Revenue**: $2.4M total for Q1 — this represents a 15% increase from Q4,
  driven by expanded client base in the enterprise segment

❌ BAD BULLET (just label):
- Net Revenue: $2.4M

---

✅ GOOD PARAGRAPH (with reasoning):
The document shows total revenue of **$2.4 million** for Q1 2024. This represents
a significant 15% increase compared to the previous quarter, which can be
attributed to the new enterprise clients acquired in January.

❌ BAD PARAGRAPH (just facts):
The total revenue was $2.4 million. The operating costs were $1.2 million.
The gross margin was 50%. The net income was $600K.

================================================================================
SOURCE FILE:
================================================================================

These prompts are defined in:
/Users/pg/Desktop/koda-webapp/backend/src/services/core/kodaAnswerEngineV3.service.ts

Starting at line ~1142 (buildSystemPrompt method)

================================================================================
