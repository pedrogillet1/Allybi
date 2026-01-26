import OpenAI from 'openai';
import { config } from '../config/env';
import { getContainer } from '../bootstrap/container';


// Use V3 LanguageDetectorService for language instructions
const createLanguageInstruction = (lang: string) => getContainer().getLanguageDetector().createLanguageInstruction(lang);

// Minimal context manager stub
const contextManager = {
  optimizeContext: (context: string, maxTokens: number = 4000) => context.substring(0, maxTokens * 4),
  buildOptimizedContext: (params: any) => {
    const { systemPrompt, documentContext, conversationHistory } = params;
    // Build messages array from conversation history
    const messages = conversationHistory ? conversationHistory.map((msg: { role: string; content: string }) => ({
      role: msg.role,
      content: msg.content
    })) : [];
    return {
      systemPrompt,
      documentContext,
      conversationHistory,
      messages,
      tokenUsage: {
        systemPrompt: 0,
        documentContext: 0,
        conversationHistory: 0,
        total: 0,
        utilizationPercentage: 0
      }
    };
  }
};

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

// KODA System Prompt
const KODA_SYSTEM_PROMPT = `You are KODA, a friendly AI personal assistant for document management.

**FORMATTING REQUIREMENTS:**
- Always use Markdown formatting
- Use **bold** for important information (names, dates, amounts)
- Add blank lines between paragraphs
- Use bullet points for lists
- Use numbered lists for steps
- Keep responses scannable and easy to read

**YOUR CAPABILITIES:**
1. **Document Analysis** - Read and understand any document format (PDF, Word, Excel, PowerPoint, images)
2. **Auto-Organization** - Automatically categorize documents into folders
3. **Smart Reminders** - Detect important dates and create notifications
4. **File Navigation** - Show users where documents are located in their folders
5. **Search & Retrieval** - Find information across all documents
6. **Research Mode** (when enabled) - Search the web for current information beyond user documents

**PROACTIVE BEHAVIOR:**
- When you see an expiration date, offer to create a reminder
- When a document is uploaded, it's automatically categorized
- When user asks for a document, use send_document_copy function to show its location
- Always look for opportunities to organize and help
- Ask follow-up questions to better assist the user
- Confirm actions before executing them

**RESPONSE STYLE:**
- Conversational and friendly
- Use the user's first name when available
- Be proactive, not just reactive
- Address the user warmly
- Keep responses concise but complete
- NEVER use filler phrases like "please hold on", "let me check", "one moment"
- Generate responses directly and continuously without interruption
- Provide complete answers immediately - do not break up responses unnecessarily

**CRITICAL: ANTI-HALLUCINATION RULES - NEVER VIOLATE THESE:**

1. **NEVER MAKE UP INFORMATION**
   - If you don't find specific information in the document, say "I cannot find [information] in this document"
   - NEVER guess dates, numbers, names, or any factual data
   - NEVER use phrases like "approximately", "around", "likely", "probably" for factual data from documents
   - It is ALWAYS better to say "I don't know" than to provide incorrect information

2. **ALWAYS QUOTE DIRECTLY FROM SOURCE**
   - When providing dates, numbers, or IDs, copy them EXACTLY as they appear in the extracted text
   - Use quotation marks to show you're quoting: The expiry date is **"20 JUL 2027"**
   - If the document says "R$ 2,500.00", you MUST say "R$ 2,500.00" - NOT "R$ 500" or "approximately R$ 2,500"
   - Never reformat, interpret, or paraphrase numbers and dates

3. **ALWAYS CITE YOUR SOURCE**
   - Show WHERE you found the information: "According to the extracted text: [exact quote]"
   - If multiple values exist (e.g., multiple dates), specify which one you're referring to
   - Example: "I found several dates. The expiry date specifically is '20 JUL 2027'"

4. **HANDLE AMBIGUITY EXPLICITLY**
   - If multiple possible answers exist, list them all
   - If you're uncertain, say so: "I see two dates that could be the expiry date: '15 JAN 2024' and '20 JUL 2027'. Which field do you need?"
   - Never pick one value when multiple exist without explaining why

5. **VALIDATE BEFORE RESPONDING**
   - Check if extracted data matches expected patterns (dates look like dates, amounts have currency symbols)
   - Flag suspicious extractions: "I found '20 JUL 2027' which appears to be the expiry date"
   - If a value seems wrong, ask for confirmation

**EXAMPLES OF CORRECT RESPONSES:**

❌ WRONG: "Your passport expires on May 15, 2025"
✅ RIGHT: "The expiry date is **'20 JUL 2027'** (found in the document's 'Date of Expiry' field)"

❌ WRONG: "The total is around $1,200"
✅ RIGHT: "The invoice total is **'$1,234.56'** (shown in the 'Total Amount Due' line)"

❌ WRONG: "The contract ends in 2027"
✅ RIGHT: "I found two dates in the contract: **'01/15/2024'** (start date) and **'01/15/2027'** (end date). The contract end date is **'01/15/2027'**"

**WHEN YOU CANNOT FIND INFORMATION:**
- "I cannot find an expiry date in this document"
- "The document doesn't contain a clear total amount. I see these numbers: [list all numbers found with context]"
- "I need you to clarify which date you're looking for. I found these dates: [list dates with their labels/context]"

**PASSPORT AND ID DOCUMENT EXTRACTION - CRITICAL RULES:**
Passports, licenses, and ID documents contain MULTIPLE dates and fields with specific labels. You MUST carefully distinguish between them by reading the field labels.

**ALL Date Fields in Passports/IDs (with their labels):**
- **Date of Birth** / **DOB** / **Data de Nascimento** / **Né(e) le** - When the person was born
- **Date of Issue** / **Issued On** / **Data de Emissão** / **Délivré le** - When the document was issued/created
- **Date of Expiry** / **Expiration Date** / **Expiry** / **Valid Until** / **Data de Validade** / **Date d'expiration** - When the document expires/becomes invalid
- **Date of Entry** - Entry date to a country (on visas/stamps)
- **Date of Exit** - Exit date from a country (on visas/stamps)
- **Valid From** - Start date of document validity
- **Valid To** - End date of document validity

**Other Common Passport/ID Fields:**
- **Passport Number** / **Document Number** / **Número do Passaporte** / **Numéro**
- **Nationality** / **Nacionalidade** / **Citoyenneté**
- **Full Name** / **Surname/Given Names** / **Nome** / **Nom**
- **Sex** / **Gender** / **Sexo** / **Sexe**
- **Place of Birth** / **Local de Nascimento** / **Lieu de naissance**
- **Authority** / **Issuing Authority** / **Autoridade** - Who issued the document
- **Type** / **Type of Document** - P (Passport), ID (Identity Card), etc.
- **Country Code** - 3-letter country code (PRT, USA, FRA, etc.)

**CRITICAL EXTRACTION RULES:**
1. **ALWAYS READ THE FIELD LABEL FIRST** - Every field in a passport has a clear label above or beside it
2. **MATCH THE USER'S QUESTION TO THE CORRECT FIELD:**
   - "When does my passport expire?" → Look for "Date of Expiry" / "Expiration Date" / "Valid Until"
   - "When was I born?" / "What's my birth date?" → Look for "Date of Birth" / "DOB"
   - "When was my passport issued?" → Look for "Date of Issue" / "Issued On"
   - "What's my passport number?" → Look for "Passport No" / "Document Number"
3. **NEVER MIX UP DATES** - Each date has a different purpose and different label
4. **QUOTE EXACTLY AS WRITTEN** - Dates appear in various formats: "17 OUT 2004", "20 JUL 2027", "15/03/2025", etc.
5. **CITE THE FIELD LABEL IN YOUR RESPONSE** - Always say which field you're reading from
6. **IF MULTIPLE DATES LOOK SIMILAR** - List all dates with their labels and let the user confirm

**EXAMPLES OF CORRECT EXTRACTION:**
❌ WRONG: User asks "when does my passport expire?" → AI returns "17 OUT 2001" (this is birth date, not expiry!)
✅ RIGHT: User asks "when does my passport expire?" → AI says "Your passport expiry date is **'20 JUL 2027'** (found in the 'Date of Expiry' field)"

❌ WRONG: User asks "when was my passport issued?" → AI returns expiry date
✅ RIGHT: User asks "when was my passport issued?" → AI says "Your passport was issued on **'21 JUL 2017'** (found in the 'Date of Issue' field)"

❌ WRONG: "Your passport date is 17 OUT 2001"
✅ RIGHT: "I found several dates on your passport:
- **Date of Birth**: '17 OUT 2004'
- **Date of Issue**: '21 JUL 2017'
- **Date of Expiry**: '20 JUL 2027'

Which date do you need?"

**SPECIAL NOTE ON DATE ACCURACY:**
- OCR might misread years (e.g., 2004 vs 2001, 2027 vs 2021)
- If a date seems unusual (e.g., passport expiry before issue date, birth date in the future), FLAG IT
- Always verify the field label to ensure you're reading the correct date type

**FUNCTION CALLING:**
You have access to these functions:
- create_folder(folderName, parentFolderId) - Create new folders
- move_document_to_folder(documentId, folderId) - Move documents
- schedule_reminder(title, dueDate, description) - Create reminders
- send_document_copy(documentId) - Show document location
- list_documents() - See all user documents
- search_documents(query) - Search by name or content
- get_document_info(documentId) - Get document details
- analyze_document(documentId) - Analyze document content

**DATE DETECTION & AUTOMATIC REMINDERS:**
- ALWAYS look for important dates in documents when analyzing them
- Proactively detect: expiration dates, due dates, deadlines, appointments, renewals
- When you find an important date, IMMEDIATELY suggest creating a reminder
- Format: "I noticed [document name] has [event] on **[date]**. Would you like me to set a reminder?"
- If user agrees (says yes, sure, okay, etc.), call schedule_reminder function
- Common date types to watch for:
  * Expiration dates (licenses, passports, subscriptions, memberships)
  * Due dates (bills, invoices, taxes, rent, loan payments)
  * Appointment dates (medical, dental, meetings, events)
  * Renewal dates (insurance, contracts, warranties)
  * Deadlines (project deadlines, submission dates)
  * Important events (birthdays, anniversaries)
- Always extract the exact date and create a clear, descriptive reminder title

**DOCUMENT NAVIGATION:**
- When user asks for a document (e.g., "show me [document]" or "where is [document]"):
  1. Use search_documents or list_documents to find the document
  2. Call send_document_copy with the document ID
  3. You will receive the document location in the response
  4. Present it conversationally: "You can find **[document name]** in your Documents."
- The system will automatically show a clickable card that navigates to the document's location

**MULTI-DOCUMENT SEARCH:**
- When user asks to "find", "search", or "locate" documents, use search_documents function
- Search works across ALL documents (filenames and content)
- Results include excerpts with highlighted matches in **bold**
- Examples of search queries:
  * "Find all documents mentioning insurance"
  * "Search for contract documents"
  * "Where are my tax documents?"
- Present results as a numbered list with excerpts
- If no results found, suggest alternative search terms

**SMART TAGS:**
- Documents are automatically tagged upon upload (e.g., #tax, #2024, #medical)
- When user searches with # (e.g., "Show me all #medical documents"), use search_by_tag function
- When user asks to add tags, use add_tag_to_document function
- Tags are lowercase, single words or short phrases
- Always display tags with # prefix (e.g., #tax #2024 #financial)
- Tags help users organize and quickly find documents

**DOCUMENT SUMMARIZATION:**
- When user asks to "summarize", "explain", or "what's in this document", use summarize_document function
- Choose summary type based on user request:
  * "Quick summary" or "brief" → use "brief" type (2-3 sentences)
  * "Detailed summary" or "break it down" → use "detailed" type (structured with bullet points)
  * Default → use "standard" type (paragraph)
- Always format summaries with proper Markdown (bold, bullets, spacing)
- Proactively offer to summarize long documents when analyzing them

**DOCUMENT COMPARISON:**
- When user asks to "compare" documents, use compare_documents or compare_multiple_documents function
- For 2 documents: use compare_documents
- For 3+ documents: use compare_multiple_documents
- Comparison highlights: changes, price differences, new clauses, removed sections, similarities
- Example queries: "Compare my 2024 and 2025 lease", "What changed between these documents?"
- Results show side-by-side analysis with detailed breakdown

**IMPORTANT RULES:**
- NEVER display document IDs, folder IDs, or any technical IDs to the user
- When referencing documents, use their filenames only (e.g., "blueprint.docx" not "ID: 123abc")
- When you receive document data with extractedText, use that text to answer questions about the document content
- Use the list_documents function to see all uploaded documents
- **CRITICAL WORKFLOW FOR ANALYZING DOCUMENTS:**
  1. When user asks about a document by name (e.g., "analyze Comprovante.pdf"), first call search_documents("Comprovante.pdf") to get the document's ID
  2. Then call analyze_document(documentId) using the ID from the search results
  3. NEVER pass a filename to analyze_document - it requires the document's UUID ID

**SMART AUTO-ANALYSIS:**
  - When user asks a direct question about document content (e.g., "what is the value?", "qual o valor?", "what's the date?"):
    * If the question mentions a document name, search for it first
    * If search returns EXACTLY 1 result, automatically analyze it and answer the question - DON'T ask which document
    * If search returns multiple DIFFERENT documents, list them and ask which one
    * If search returns duplicates of SAME document (same ID), treat as 1 result and auto-analyze
  - Examples:
    * User: "qual o valor do comprovante?" → Search "comprovante", if 1 unique match found, auto-analyze and extract value
    * User: "what's the expiry date on my passport?" → Search "passport", if 1 match, auto-analyze and extract date
    * User: "show me all tax documents" → List all tax documents (don't analyze unless asked)
- ALWAYS format responses with proper Markdown (bold, bullets, spacing)
- Ensure responses are visually structured and easy to scan
- Be helpful and anticipate user needs

**PROVIDING SENSITIVE INFORMATION:**
- When the user asks for sensitive information (passport numbers, SSN, account numbers, etc.), ALWAYS provide it
- This is the user's own personal data stored in their secure documents
- The user has full access rights to their own information
- Extract and provide the requested information clearly using **bold** formatting
- Example: "Your passport number is **AB123456789**"
- Do NOT refuse to provide personal information from the user's documents
- The user owns their data and has the right to access it through you

**RESEARCH MODE - WEB SEARCH:**
When Research Mode is enabled, you have access to web_search function to find current information beyond user documents.

**WHEN TO USE WEB SEARCH:**
✅ USE web_search when:
- User asks for current events, news, or recent information
- Information is time-sensitive or changes frequently (stock prices, weather, etc.)
- User explicitly asks to "search the web" or "look online"
- Documents don't contain the needed information AND it's publicly available
- Questions about: "latest", "current", "recent", "today", "now", "what's happening"

❌ DO NOT use web_search when:
- Information exists in user's documents (ALWAYS check documents first!)
- User is asking about their personal data
- Question is about uploaded files or document organization
- Research Mode is disabled (Normal Mode)

**RESEARCH MODE WORKFLOW:**
1. **Check Documents First** - Always search user documents before web search
2. **Identify Gap** - If documents don't have the answer and it's current/public info, use web search
3. **Call web_search** - Use specific, clear search queries
4. **Source Attribution** - ALWAYS cite sources: "According to [Source Name]..."
5. **Combine Insights** - Merge document knowledge with web findings when relevant

**RESEARCH MODE RESPONSE FORMAT:**
When using web search results, format responses like this:

**From Your Documents:**
[Information from user's documents, if any]

**From Web Research:**
According to **[Source Name]** ([reliability badge]):
[Information with exact quotes]

**Source Attribution:**
- 🌐 Web sources: [List sources with reliability: High/Medium]
- 📄 Document sources: [List document names]

**EXAMPLES:**

❌ WRONG (no source attribution):
"The latest iPhone costs $999"

✅ RIGHT (with source attribution):
"According to **Apple's website** (High reliability), the latest iPhone 15 Pro starts at **$999**."

❌ WRONG (searched web without checking documents):
User asks "What's my passport number?" → Uses web_search
✅ RIGHT:
User asks "What's my passport number?" → Uses analyze_document or search_documents

Use these capabilities proactively to help users stay organized!`;

// Define available functions for OpenAI to call
export const kodaFunctions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: 'Create a new folder to organize documents',
      parameters: {
        type: 'object',
        properties: {
          folderName: {
            type: 'string',
            description: 'Name of the folder to create',
          },
          parentFolderId: {
            type: 'string',
            description: 'ID of the parent folder (optional, for subfolders)',
          },
        },
        required: ['folderName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_document_to_folder',
      description: 'Move a document to a specific folder',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'ID of the document to move',
          },
          folderId: {
            type: 'string',
            description: 'ID of the destination folder',
          },
        },
        required: ['documentId', 'folderId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_reminder',
      description: 'Create a reminder for a specific date and time',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the reminder',
          },
          description: {
            type: 'string',
            description: 'Optional description or additional details',
          },
          dueDate: {
            type: 'string',
            description: 'Due date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss)',
          },
        },
        required: ['title', 'dueDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description: 'List all documents uploaded by the user',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: 'Search across all user documents for a specific term or phrase. Use when user asks to find, search, or locate documents.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to find documents by name or content',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 10)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_info',
      description: 'Get detailed information about a specific document',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'ID of the document to retrieve information for',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_document',
      description: 'Analyze a document to extract its full text content and answer questions about it. IMPORTANT: Requires the document UUID (not filename). Use search_documents first to get the document ID if you only have the filename.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'UUID of the document to analyze (e.g., "abc123-def456-..."). NOT the filename. Get this from search_documents or list_documents.',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_document_copy',
      description: 'Send a copy of a document to the user with a download link',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'ID of the document to send',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_document',
      description: 'Generate a summary of a document. Use when user asks to summarize, explain, or get key points from a document.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'ID of the document to summarize',
          },
          summaryType: {
            type: 'string',
            enum: ['brief', 'standard', 'detailed'],
            description: 'Type of summary: brief (2-3 sentences), standard (paragraph), or detailed (structured with bullet points)',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_by_tag',
      description: 'Find documents by tag. Use when user searches with # or asks for documents with specific tags.',
      parameters: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'The tag to search for (without #)',
          },
        },
        required: ['tag'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag_to_document',
      description: 'Add a custom tag to a document',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'ID of the document',
          },
          tag: {
            type: 'string',
            description: 'Tag to add (lowercase, without #)',
          },
        },
        required: ['documentId', 'tag'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_documents',
      description: 'Compare two documents to identify differences, changes, and similarities. Use when user asks to compare, contrast, or find differences between documents.',
      parameters: {
        type: 'object',
        properties: {
          documentId1: {
            type: 'string',
            description: 'ID of the first document',
          },
          documentId2: {
            type: 'string',
            description: 'ID of the second document',
          },
        },
        required: ['documentId1', 'documentId2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_multiple_documents',
      description: 'Compare 3 or more documents to create a comparison matrix. Use when user wants to compare multiple documents at once.',
      parameters: {
        type: 'object',
        properties: {
          documentIds: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of document IDs to compare (minimum 3)',
          },
        },
        required: ['documentIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_verified_data',
      description: 'Extract specific factual data from a document with 100% accuracy guarantee using two-pass verification. Use when user asks for specific factual information (dates, numbers, amounts, IDs, names). This ensures ZERO hallucinations.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'UUID of the document to extract from',
          },
          fieldsToExtract: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of field names to extract (e.g., ["expiry date", "passport number", "total amount", "invoice date"])',
          },
        },
        required: ['documentId', 'fieldsToExtract'],
      },
    },
  },
  // Live Data Functions
  {
    type: 'function',
    function: {
      name: 'get_stock_quote',
      description: 'Get real-time stock market quote for a specific ticker symbol. Use when user asks about stock prices, market data, or company valuation.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Stock ticker symbol (e.g., "AAPL", "GOOGL", "MSFT", "TSLA")',
          },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_stock_symbol',
      description: 'Search for stock ticker symbols by company name. Use when user mentions a company name but not the ticker symbol.',
      parameters: {
        type: 'object',
        properties: {
          companyName: {
            type: 'string',
            description: 'Company name or keywords to search for (e.g., "Apple", "Tesla", "Microsoft")',
          },
        },
        required: ['companyName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_currency_exchange',
      description: 'Get current currency exchange rate between two currencies. Use when user asks about currency conversion, forex rates, or international money transfers.',
      parameters: {
        type: 'object',
        properties: {
          fromCurrency: {
            type: 'string',
            description: 'Source currency code (e.g., "USD", "EUR", "GBP", "JPY", "BRL")',
          },
          toCurrency: {
            type: 'string',
            description: 'Target currency code (e.g., "USD", "EUR", "GBP", "JPY", "BRL")',
          },
        },
        required: ['fromCurrency', 'toCurrency'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_economic_indicator',
      description: 'Get latest economic data from FRED (Federal Reserve Economic Data). Use for GDP, unemployment, inflation, interest rates, and other economic metrics.',
      parameters: {
        type: 'object',
        properties: {
          indicator: {
            type: 'string',
            enum: ['GDP', 'UNRATE', 'CPIAUCSL', 'DFF', 'MORTGAGE30US', 'DEXUSEU'],
            description: 'Economic indicator: GDP (Gross Domestic Product), UNRATE (Unemployment Rate), CPIAUCSL (Inflation/CPI), DFF (Federal Funds Rate), MORTGAGE30US (30-Year Mortgage Rate), DEXUSEU (USD/EUR Exchange Rate)',
          },
        },
        required: ['indicator'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_economic_snapshot',
      description: 'Get a comprehensive snapshot of key economic indicators (GDP, unemployment, inflation, interest rates) in one call. Use when user asks for general economic overview.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reliable_news',
      description: 'Get latest news from verified, reliable sources only (Reuters, AP, BBC, Bloomberg, WSJ, etc.). Use when user asks for current events, news updates, or recent information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for news (optional, leave empty for top headlines)',
          },
          category: {
            type: 'string',
            enum: ['business', 'technology', 'science', 'health', 'general'],
            description: 'News category to filter by (optional)',
          },
          limit: {
            type: 'number',
            description: 'Number of articles to retrieve (default: 5, max: 10)',
          },
        },
      },
    },
  },
  // Research Mode - Web Search
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information, recent events, or data not in user documents. ONLY use when Research Mode is enabled AND information is not in documents. Use for: news, current events, recent data, public information, real-time facts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for web search (be specific and clear)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of web results to return (default: 5, max: 10)',
          },
          reliableOnly: {
            type: 'boolean',
            description: 'Only return results from reliable sources (Reuters, BBC, Bloomberg, etc.). Default: true',
          },
        },
        required: ['query'],
      },
    },
  },
  // Presentation Generation
  {
    type: 'function',
    function: {
      name: 'create_presentation',
      description: 'Create a professional presentation with multiple slides using Manus-style design system. Use when user asks to create, make, or generate a presentation, slide deck, or PowerPoint.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the presentation',
          },
          description: {
            type: 'string',
            description: 'Brief description of the presentation topic',
          },
          outline: {
            type: 'array',
            description: 'Array of slides to create',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Unique identifier for the slide (e.g., "slide-1", "slide-2")',
                },
                title: {
                  type: 'string',
                  description: 'Title of the slide',
                },
                summary: {
                  type: 'string',
                  description: 'Brief summary of slide content (1-2 sentences)',
                },
                layout: {
                  type: 'string',
                  enum: ['title', 'content', 'two-column', 'chart', 'image'],
                  description: 'Layout type for the slide',
                },
              },
              required: ['id', 'title', 'summary'],
            },
          },
        },
        required: ['title', 'outline'],
      },
    },
  },
];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

export interface GeminiResponse {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
}

/**
 * Send a message to OpenAI with STREAMING for real-time responses
 * Callback receives chunks as they arrive
 */
export const sendMessageToGeminiStreaming = async (
  message: string,
  conversationHistory: ChatMessage[] = [],
  userName?: string,
  documentContext?: string,
  onChunk?: (chunk: string) => void,
  detectedLanguage?: string,
  useResearch?: boolean,
  customTemperature?: number,
  customPersonaPrompt?: string
): Promise<GeminiResponse> => {
  // 🔍 DIAGNOSTIC: Track overall timing
  const startTime = Date.now();
  console.log('🚀 [STREAM START]', new Date().toISOString());

  try {
    // Build system prompt
    console.time('⏱️ [1] Build Prompt');

    // Use custom persona prompt if provided, otherwise use default KODA prompt
    let systemPrompt = customPersonaPrompt || (userName
      ? KODA_SYSTEM_PROMPT.replace('the user', userName)
      : KODA_SYSTEM_PROMPT);

    // Add language instruction if language detected
    if (detectedLanguage) {
      systemPrompt += createLanguageInstruction(detectedLanguage);
    }

    // ✅ FIX: Skip expensive context optimization for simple queries
    const isSimpleQuery =
      message.split(/\s+/).length <= 10 && // 10 words or less
      conversationHistory.length <= 4 && // 2 message pairs or less
      (!documentContext || documentContext.length < 500); // No or minimal context

    let optimizedContext;
    if (isSimpleQuery) {
      console.log('⚡ [CONTEXT OPTIMIZATION] Skipping optimization for simple query (2-3s saved)');
      // Build simple context without expensive optimization
      optimizedContext = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        ],
        tokenUsage: {
          systemPrompt: 0,
          documentContext: 0,
          conversationHistory: 0,
          total: 0,
          utilizationPercentage: 0
        }
      };
    } else {
      // Use optimized context manager to maximize token usage
      optimizedContext = contextManager.buildOptimizedContext({
        systemPrompt,
        documentContext: documentContext || '',
        conversationHistory,
        maxContextTokens: 128000, // gpt-4o-mini max context
        maxOutputTokens: 16000, // gpt-4o-mini max output
      });
    }
    console.timeEnd('⏱️ [1] Build Prompt');

    // Log token usage for monitoring
    console.log('📊 Token optimization:', {
      systemPrompt: optimizedContext.tokenUsage.systemPrompt,
      documentContext: optimizedContext.tokenUsage.documentContext,
      conversationHistory: optimizedContext.tokenUsage.conversationHistory,
      total: optimizedContext.tokenUsage.total,
      utilization: `${optimizedContext.tokenUsage.utilizationPercentage}%`,
    });

    // Add current user message to optimized messages
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...optimizedContext.messages.map((msg: { role: string; content: string }) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    console.log('🤖 Sending STREAMING message to OpenAI API with optimized context...');

    // Detect if this is a document analysis request
    const isDocumentAnalysis = documentContext && documentContext.length > 0;

    // Determine temperature to use
    // Priority: customTemperature > document analysis (0) > default (0.7)
    let temperature = 0.7; // Default
    if (customTemperature !== undefined) {
      temperature = customTemperature;
      console.log(`🎨 [CREATIVITY ENGINE] Using custom temperature: ${temperature}`);
    } else if (isDocumentAnalysis) {
      temperature = 0; // Precise for document analysis
      console.log(`📄 [DOCUMENT MODE] Using temperature: 0 (precise)`);
    } else {
      console.log(`💬 [CHAT MODE] Using default temperature: 0.7`);
    }

    // Filter functions based on research mode - remove web_search if research is disabled
    const availableFunctions = useResearch === false
      ? kodaFunctions.filter(fn => fn.type === 'function' && fn.function.name !== 'web_search')
      : kodaFunctions;

    console.log(`🔬 Research mode: ${useResearch ? 'ENABLED' : 'DISABLED'} | Functions available: ${availableFunctions.length}`);

    // 🔍 DIAGNOSTIC: Track API request timing
    console.time('⏱️ [2] OpenAI API Request');
    const apiStartTime = Date.now();

    // Create streaming request with gpt-4o-mini with 20-second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI streaming request timed out after 20 seconds')), 20000);
    });

    const stream = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: availableFunctions,
        temperature: temperature,
        max_tokens: 16000, // Maximize output tokens
        stream: true, // Enable streaming
      }),
      timeoutPromise
    ]) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    console.timeEnd('⏱️ [2] OpenAI API Request');

    let fullText = '';
    let functionCall: any = null;
    let firstChunk = true;
    let chunkCount = 0;

    // 🔍 DIAGNOSTIC: Track first token timing
    console.time('⏱️ [3] First Token');

    // Process stream chunks
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle text content
      if (delta?.content) {
        // 🔍 DIAGNOSTIC: Log first token received
        if (firstChunk) {
          console.timeEnd('⏱️ [3] First Token');
          const firstTokenTime = Date.now() - apiStartTime;
          console.log(`⚡ First token in ${firstTokenTime}ms`);
          firstChunk = false;
        }

        chunkCount++;
        fullText += delta.content;

        // Call the chunk callback for real-time streaming
        if (onChunk) {
          onChunk(delta.content);
        }
      }

      // Handle function calls
      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function) {
            if (!functionCall) {
              functionCall = {
                name: toolCall.function.name || '',
                arguments: toolCall.function.arguments || '',
              };
            } else {
              functionCall.arguments += toolCall.function.arguments || '';
            }
          }
        }
      }
    }

    // 🔍 DIAGNOSTIC: Log completion stats
    const totalTime = Date.now() - startTime;
    console.log('✅ OpenAI streaming complete');
    console.log(`📊 Stream stats: ${chunkCount} chunks | ${fullText.length} chars | ${totalTime}ms total | ${(totalTime/1000).toFixed(1)}s`);

    // If we got a function call, parse it
    if (functionCall && functionCall.arguments) {
      try {
        const args = JSON.parse(functionCall.arguments);
        return {
          text: fullText,
          functionCall: {
            name: functionCall.name,
            args,
          },
        };
      } catch (e) {
        console.error('Failed to parse function arguments:', e);
      }
    }

    return {
      text: fullText,
    };
  } catch (error: any) {
    console.error('❌ Error calling OpenAI streaming API:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    throw new Error('Failed to get streaming response from AI assistant. Please try again.');
  }
};

/**
 * Send a message to OpenAI and get a response (NON-STREAMING - for compatibility)
 */
export const sendMessageToGemini = async (
  message: string,
  conversationHistory: ChatMessage[] = [],
  userName?: string,
  documentContext?: string,
  detectedLanguage?: string
): Promise<GeminiResponse> => {
  try {
    // Build system prompt
    let systemPrompt = userName
      ? KODA_SYSTEM_PROMPT.replace('the user', userName)
      : KODA_SYSTEM_PROMPT;

    // Add language instruction if language detected
    if (detectedLanguage) {
      systemPrompt += createLanguageInstruction(detectedLanguage);
    }

    // Build messages array with system prompt, document context, conversation history
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system' as const,
        content: systemPrompt + (documentContext ? `\n\n**DOCUMENT CONTEXT:**\n${documentContext}` : ''),
      },
      ...conversationHistory,
      {
        role: 'user' as const,
        content: message,
      },
    ];

    console.log('🤖 Sending message to OpenAI API with optimized context...');

    // Detect if this is a document analysis request (requires maximum accuracy)
    const isDocumentAnalysis = documentContext && documentContext.length > 0;

    // Send to OpenAI with timeout (20 seconds for complex requests)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out after 20 seconds')), 20000);
    });

    const result = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: kodaFunctions,
        temperature: isDocumentAnalysis ? 0 : 0.7, // 0 = maximum accuracy for documents, 0.7 = creative for chat
        max_tokens: 16000, // Maximize output tokens
      }),
      timeoutPromise
    ]) as OpenAI.Chat.Completions.ChatCompletion;

    console.log('✅ OpenAI API response received');

    const choice = result.choices[0];

    // Check if it's a function call
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.type === 'function') {
        return {
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        };
      }
    }

    // Otherwise, return the text response
    return {
      text: choice.message.content || 'I apologize, but I couldn\'t generate a response.',
    };
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Provide more specific error messages
    if (error.message?.includes('timeout')) {
      throw new Error('AI assistant is taking too long to respond. Please try again.');
    }
    if (error.message?.includes('API key') || error.code === 'invalid_api_key') {
      console.warn('⚠️  OpenAI API not accessible. Returning fallback response.');
      return {
        text: "Hello! I'm KODA, your AI assistant. However, I'm currently unable to connect to my AI service. Please check your OpenAI API key configuration.",
      };
    }

    throw new Error('Failed to get response from AI assistant. Please try again.');
  }
};

/**
 * Send a message to OpenAI WITHOUT function calling enabled
 * Used for getting final responses after function execution to prevent infinite loops
 */
export const sendMessageToGeminiWithoutFunctions = async (
  message: string,
  conversationHistory: ChatMessage[] = [],
  userName?: string,
  documentContext?: string,
  detectedLanguage?: string
): Promise<GeminiResponse> => {
  try {
    // Build system prompt
    let systemPrompt = userName
      ? KODA_SYSTEM_PROMPT.replace('the user', userName)
      : KODA_SYSTEM_PROMPT;

    // Add language instruction if language detected
    if (detectedLanguage) {
      systemPrompt += createLanguageInstruction(detectedLanguage);
    }

    // Use optimized context manager to maximize token usage
    const optimizedContext = contextManager.buildOptimizedContext({
      systemPrompt,
      documentContext: documentContext || '',
      conversationHistory,
      maxContextTokens: 128000, // gpt-4o-mini max context
      maxOutputTokens: 16000, // gpt-4o-mini max output
    });

    // Add current user message to optimized messages
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...optimizedContext.messages.map((msg: { role: string; content: string }) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    console.log('🤖 Sending message to OpenAI API (without functions)...');

    // Send to OpenAI WITHOUT function calling enabled
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out after 30 seconds')), 30000);
    });

    // Detect if this is a document analysis request (requires maximum accuracy)
    const isDocumentAnalysis = documentContext && documentContext.length > 0;

    const result = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        // NO tools parameter - function calling disabled
        temperature: isDocumentAnalysis ? 0 : 0.7, // 0 = maximum accuracy for documents
        max_tokens: 16000, // Maximize output tokens
      }),
      timeoutPromise
    ]) as OpenAI.Chat.Completions.ChatCompletion;

    console.log('✅ OpenAI API response received (without functions)');

    const choice = result.choices[0];

    // Return the text response
    return {
      text: choice.message.content || 'I apologize, but I couldn\'t generate a response.',
    };
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Provide more specific error messages
    if (error.message?.includes('timeout')) {
      throw new Error('AI assistant is taking too long to respond. Please try again.');
    }
    if (error.message?.includes('API key') || error.code === 'invalid_api_key') {
      console.warn('⚠️  OpenAI API not accessible. Returning fallback response.');
      return {
        text: "Hello! I'm KODA, your AI assistant. However, I'm currently unable to connect to my AI service. Please check your OpenAI API key configuration.",
      };
    }

    throw new Error('Failed to get response from AI assistant. Please try again.');
  }
};

/**
 * Auto-categorize a document based on its content
 */
export const categorizeDocument = async (
  filename: string,
  extractedText: string
): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a document organization assistant.
Analyze documents and suggest appropriate folders/categories.

Common categories:
- Tax Documents (tax forms, W2s, receipts for deductions)
- Receipts (purchase receipts, invoices)
- Contracts (agreements, leases, employment contracts)
- Medical Records (prescriptions, test results, insurance)
- Financial (bank statements, investment documents)
- Personal ID (licenses, passports, certificates)
- Work Documents (resumes, presentations, reports)
- Legal Documents (court papers, legal notices)
- Insurance (insurance policies, claims)
- Education (transcripts, certificates, diplomas)
- Travel (tickets, itineraries, visas)
- Utilities (bills, statements)
- Personal (letters, photos, miscellaneous)

Respond with ONLY the category name, nothing else.`,
        },
        {
          role: 'user',
          content: `Filename: ${filename}\n\nContent:\n${extractedText.slice(0, 1000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    const category = response.choices[0].message.content?.trim() || 'Uncategorized';
    return category;
  } catch (error) {
    console.error('Error categorizing document:', error);
    return 'Uncategorized';
  }
};

/**
 * Analyze document content with OpenAI
 */
export const analyzeDocumentWithGemini = async (
  documentText: string,
  documentType?: string
): Promise<{
  summary: string;
  keyDates: string[];
  keyEntities: Record<string, any>;
  suggestedCategories: string[];
}> => {
  try {
    const prompt = `Analyze the following document and extract:
1. A brief summary (2-3 sentences)
2. Any important dates mentioned
3. Key entities (names, amounts, organizations)
4. Suggested categories for organization

Document Type: ${documentType || 'Unknown'}

Document Content:
${documentText}

Respond in JSON format with the following structure:
{
  "summary": "...",
  "keyDates": ["..."],
  "keyEntities": {...},
  "suggestedCategories": ["..."]
}`;

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const response = result.choices[0].message.content || '{}';

    // Try to parse the JSON response
    try {
      return JSON.parse(response);
    } catch (parseError) {
      // If parsing fails, return a basic structure
      return {
        summary: response,
        keyDates: [],
        keyEntities: {},
        suggestedCategories: [],
      };
    }
  } catch (error) {
    console.error('Error analyzing document with OpenAI:', error);
    throw new Error('Failed to analyze document');
  }
};

/**
 * Extract text from image using OpenAI Vision
 */
export const extractTextFromImageWithGemini = async (
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> => {
  try {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text from this image. Return only the extracted text, nothing else.',
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    return result.choices[0].message.content || '';
  } catch (error) {
    console.error('Error extracting text with OpenAI Vision:', error);
    throw new Error('Failed to extract text from image');
  }
};

/**
 * Generate a summary of a document
 */
export const summarizeDocumentWithGemini = async (
  documentText: string,
  documentName: string,
  summaryType: 'brief' | 'standard' | 'detailed' = 'standard'
): Promise<string> => {
  try {
    const prompts = {
      brief: 'Summarize this document in 2-3 sentences, focusing on the main purpose and key takeaways.',
      standard: 'Provide a comprehensive paragraph summary of this document, including the main points and important details.',
      detailed: `Provide a detailed summary with:
- **Main Purpose**: What is this document about?
- **Key Points**: Bullet list of important information
- **Important Dates**: Any dates mentioned
- **Action Items**: What needs to be done?
- **Parties Involved**: Who is mentioned?`
    };

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a document summarization expert. Provide clear, accurate summaries using Markdown formatting. Use **bold** for important information.',
        },
        {
          role: 'user',
          content: `${prompts[summaryType]}\n\nDocument: ${documentName}\n\nContent:\n${documentText}`,
        },
      ],
      temperature: 0.3, // Lower temperature for more factual summaries
    });

    return result.choices[0].message.content || 'Unable to generate summary.';
  } catch (error) {
    console.error('Error summarizing document with OpenAI:', error);
    throw new Error('Failed to summarize document');
  }
};

/**
 * Auto-generate relevant tags for a document
 */
export const generateDocumentTags = async (
  filename: string,
  extractedText: string
): Promise<string[]> => {
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Generate 3-7 relevant tags for this document.
Tags should be:
- Single words or short phrases
- Lowercase
- Descriptive and useful for searching
- Include: document type, year, category, key entities

Return ONLY a comma-separated list of tags, nothing else.
Example: tax, 2024, receipt, business, expense`,
        },
        {
          role: 'user',
          content: `Filename: ${filename}\n\nContent:\n${extractedText.substring(0, 1000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const tagsString = result.choices[0].message.content?.trim() || '';
    const tags = tagsString.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);

    return tags;
  } catch (error) {
    console.error('Error generating tags with OpenAI:', error);
    return []; // Return empty array on error
  }
};

/**
 * Transcribe audio using OpenAI Whisper
 */
export const transcribeAudioWithWhisper = async (
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> => {
  try {
    // Convert buffer to Blob/File-compatible format
    const uint8Array = new Uint8Array(audioBuffer);
    const file = new File([uint8Array], 'audio.webm', { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en', // Can be changed to auto-detect
    });

    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio with Whisper:', error);
    throw new Error('Failed to transcribe audio');
  }
};

/**
 * Compare two documents using OpenAI GPT-4o
 */
export const compareDocuments = async (
  doc1Name: string,
  doc1Text: string,
  doc2Name: string,
  doc2Text: string
): Promise<string> => {
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a document comparison expert.
Compare two documents and provide a detailed analysis.

Format your response with:
**Summary**: Brief overview of the comparison

**Key Differences**:
- List major changes, additions, or removals

**Price/Number Changes**:
- Highlight any numerical differences

**New Content in Document 2**:
- What was added

**Removed from Document 1**:
- What was removed

**Similarities**:
- What remained the same

Use bold and bullet points for clarity.`,
        },
        {
          role: 'user',
          content: `Compare these two documents:

DOCUMENT 1: ${doc1Name}
${doc1Text}

---

DOCUMENT 2: ${doc2Name}
${doc2Text}`,
        },
      ],
      temperature: 0.2, // Low temperature for accuracy
    });

    return result.choices[0].message.content || 'Unable to generate comparison.';
  } catch (error) {
    console.error('Error comparing documents with OpenAI:', error);
    throw new Error('Failed to compare documents');
  }
};

/**
 * Compare multiple documents (3+) using OpenAI GPT-4o
 */
export const compareMultipleDocuments = async (
  documents: Array<{ name: string; text: string }>
): Promise<string> => {
  try {
    const docsText = documents
      .map((doc, i) => `DOCUMENT ${i + 1}: ${doc.name}\n${doc.text}`)
      .join('\n\n---\n\n');

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Compare multiple documents and create a comparison matrix.
Identify common themes, differences, and evolution across documents.

Format your response clearly with:
- **Overview**: Summary of all documents
- **Comparison Matrix**: Side-by-side differences
- **Common Themes**: What all documents share
- **Evolution**: How content changed across documents
- **Notable Differences**: Key variations between documents`,
        },
        {
          role: 'user',
          content: `Compare these documents:\n\n${docsText}`,
        },
      ],
      temperature: 0.2,
    });

    return result.choices[0].message.content || 'Unable to generate comparison.';
  } catch (error) {
    console.error('Error comparing multiple documents with OpenAI:', error);
    throw new Error('Failed to compare multiple documents');
  }
};

/**
 * Extract structured data from document with confidence scores
 * Uses JSON mode for structured extraction and validates patterns
 */
export const extractStructuredDataWithConfidence = async (
  documentText: string,
  documentName: string,
  fieldsToExtract: string[]
): Promise<{
  extractedData: Record<string, { value: string; confidence: number; source: string }>;
  needsVerification: boolean;
}> => {
  try {
    console.log('📊 Extracting structured data with confidence scores...');

    // Build schema for extraction
    const schema = {
      extractedFields: fieldsToExtract.map(field => ({
        fieldName: field,
        value: "The exact value found in the document, or null if not found",
        confidence: "A number between 0.0 and 1.0 indicating confidence",
        source: "The exact quote from the document where this was found",
        pattern: "The pattern this value matches (e.g., 'date', 'currency', 'number', 'text')"
      }))
    };

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a precise data extraction specialist.

**CRITICAL RULES:**
1. ONLY extract information that is EXPLICITLY stated in the document
2. NEVER guess, estimate, or infer values
3. Quote EXACTLY as it appears in the document
4. Assign confidence scores:
   - 1.0 = Value found with perfect clarity
   - 0.8-0.9 = Value found but some ambiguity (e.g., multiple dates)
   - 0.6-0.7 = Value partially found or unclear formatting
   - 0.0-0.5 = Low confidence or not found
5. For missing data, set value to null and confidence to 0.0
6. Always include the exact source text where you found the value

**PATTERN VALIDATION:**
- Dates: Should match common date patterns (DD/MM/YYYY, MM-DD-YYYY, etc.)
- Currency: Should have currency symbol ($, €, R$) or keyword (USD, BRL)
- Numbers: Should be numeric values
- Text: Any text string

Return data in this exact JSON structure:
{
  "extractedFields": [
    {
      "fieldName": "field_name",
      "value": "exact value or null",
      "confidence": 0.0 to 1.0,
      "source": "exact quote from document",
      "pattern": "date|currency|number|text"
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Extract these fields from the document:
${fieldsToExtract.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Document: ${documentName}
Content:
${documentText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0, // Maximum precision for extraction
    });

    const response = JSON.parse(result.choices[0].message.content || '{}');

    // Transform to simplified format
    const extractedData: Record<string, { value: string; confidence: number; source: string }> = {};
    let needsVerification = false;

    for (const field of response.extractedFields || []) {
      extractedData[field.fieldName] = {
        value: field.value,
        confidence: field.confidence,
        source: field.source
      };

      // Flag for verification if confidence < 0.8
      if (field.confidence < 0.8) {
        needsVerification = true;
      }

      // Validate patterns
      if (field.value && field.value !== null) {
        const isValid = validatePattern(field.value, field.pattern);
        if (!isValid) {
          console.warn(`⚠️ Pattern validation failed for ${field.fieldName}: ${field.value} (expected ${field.pattern})`);
          extractedData[field.fieldName].confidence *= 0.7; // Reduce confidence
          needsVerification = true;
        }
      }
    }

    console.log('✅ Structured extraction complete:', {
      fieldsExtracted: Object.keys(extractedData).length,
      needsVerification
    });

    return {
      extractedData,
      needsVerification
    };
  } catch (error) {
    console.error('❌ Error extracting structured data:', error);
    throw new Error('Failed to extract structured data');
  }
};

/**
 * Validate extracted value matches expected pattern
 */
function validatePattern(value: string, pattern: string): boolean {
  if (!value || value === 'null') return true; // Skip validation for missing values

  switch (pattern) {
    case 'date':
      // Check if value contains date-like patterns
      const datePatterns = [
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,  // DD/MM/YYYY or MM-DD-YYYY
        /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,    // YYYY-MM-DD
        /\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, // DD MON YYYY
      ];
      return datePatterns.some(pattern => pattern.test(value));

    case 'currency':
      // Check if value contains currency symbols or amounts
      const currencyPatterns = [
        /[\$\€\£\¥R\$]/,  // Currency symbols
        /\d+[\.,]\d{2}/,   // Decimal amounts (1,000.00 or 1.000,00)
      ];
      return currencyPatterns.some(pattern => pattern.test(value));

    case 'number':
      // Check if value is numeric
      return /\d/.test(value);

    case 'text':
      // Text is always valid
      return true;

    default:
      return true;
  }
}

/**
 * Two-pass verification: Extract data, then verify it's correct
 * Returns verified data with hallucination checks
 */
export const twoPassVerification = async (
  documentText: string,
  documentName: string,
  initialExtraction: Record<string, { value: string; confidence: number; source: string }>
): Promise<{
  verifiedData: Record<string, { value: string; verified: boolean; issues: string[] }>;
  overallAccuracy: number;
}> => {
  try {
    console.log('🔍 Starting two-pass verification...');

    // Build verification prompt
    const fieldsToVerify = Object.entries(initialExtraction).map(([field, data]) => ({
      field,
      extractedValue: data.value,
      source: data.source,
      confidence: data.confidence
    }));

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a verification specialist. Your job is to CHECK if extracted data is correct.

**VERIFICATION RULES:**
1. Look for the EXACT quote in the document
2. Verify the value matches what's in the source quote
3. Check for any discrepancies or inconsistencies
4. Flag if the value appears modified or interpreted
5. Confirm the value exists in the document

For each field, return:
- "verified": true if the value is 100% accurate
- "verified": false if there are ANY issues
- "issues": list of problems found (empty array if verified)

Return JSON in this format:
{
  "verifications": [
    {
      "field": "field_name",
      "verified": true/false,
      "issues": ["issue 1", "issue 2", ...]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Verify these extracted values against the document:

${fieldsToVerify.map((f, i) => `${i + 1}. **${f.field}**
   - Extracted Value: "${f.extractedValue}"
   - Source Quote: "${f.source}"
   - Confidence: ${f.confidence}
`).join('\n')}

Original Document:
${documentText}

Check each extraction for accuracy.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const response = JSON.parse(result.choices[0].message.content || '{}');

    // Build verified data
    const verifiedData: Record<string, { value: string; verified: boolean; issues: string[] }> = {};
    let totalFields = 0;
    let verifiedFields = 0;

    for (const verification of response.verifications || []) {
      const originalValue = initialExtraction[verification.field]?.value;

      verifiedData[verification.field] = {
        value: originalValue,
        verified: verification.verified,
        issues: verification.issues || []
      };

      totalFields++;
      if (verification.verified) {
        verifiedFields++;
      }
    }

    const overallAccuracy = totalFields > 0 ? verifiedFields / totalFields : 0;

    console.log('✅ Two-pass verification complete:', {
      totalFields,
      verifiedFields,
      overallAccuracy: `${(overallAccuracy * 100).toFixed(1)}%`
    });

    return {
      verifiedData,
      overallAccuracy
    };
  } catch (error) {
    console.error('❌ Error in two-pass verification:', error);
    throw new Error('Failed to verify extracted data');
  }
};

/**
 * Simple text generation wrapper for general-purpose AI text generation
 * Used for file creation, content generation, and other non-chat tasks
 */
export async function generateText(params: {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  try {
    // Validate API key is configured
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured in environment variables');
    }

    console.log('🤖 [generateText] Generating content with gpt-4o-mini...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cost-effective for general text generation
      messages: [{ role: 'user', content: params.prompt }],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4000,
    });

    const content = response.choices[0].message.content || '';

    console.log(`✅ [generateText] Generated ${content.length} characters`);

    return content;
  } catch (error: any) {
    console.error('❌ Error in generateText:', error);

    // Provide specific error messages
    if (error.message?.includes('API key')) {
      throw new Error('OpenAI API key is invalid or not configured. Please check your .env file.');
    }
    if (error.message?.includes('model')) {
      throw new Error('AI model not available. Please contact support.');
    }

    throw new Error('Failed to generate text: ' + error.message);
  }
}

/**
 * Generate a smart, concise title for a conversation based on its content
 * Analyzes the conversation context to create a meaningful title (max 50 characters)
 *
 * ✅ FIXED: Now analyzes USER MESSAGE instead of AI RESPONSE
 * ✅ FIXED: Detects fallback responses and returns "New Chat"
 * ✅ FIXED: Never uses greetings or response text as titles
 */
export const generateConversationTitle = async (
  firstMessage: string,
  firstResponse?: string
): Promise<string> => {
  try {
    console.log('📝 Generating AI-powered conversation title...');

    // ✅ NEW: Detect fallback responses and return "New Chat"
    if (firstResponse) {
      const fallbackPatterns = [
        /I cannot answer/i,
        /I'm not confident/i,
        /I don't have enough information/i,
        /I couldn't find/i,
        /I'm unable to/i,
        /I don't know/i,
        /I can't determine/i,
        /I can't provide/i,
        /I don't see/i,
        /I wasn't able to/i,
        /No relevant information/i,
        /I need more context/i,
        /Could you clarify/i,
        /Could you provide more details/i,
      ];

      const isFallback = fallbackPatterns.some(pattern => pattern.test(firstResponse));

      if (isFallback) {
        console.log('⏭️ [TITLE] Detected fallback response, returning "New Chat"');
        return 'New Chat';
      }
    }

    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Generate a short, descriptive title for a conversation based on ACTUAL content.

**CRITICAL RULES:**
1. Maximum 50 characters
2. NEVER use greetings as titles (hi, hello, hey, hi there, etc.)
3. NEVER use the first line of the AI response as the title
4. ONLY create a specific title if there is a clear topic or question
5. Analyze the USER MESSAGE for the topic, not the AI response
6. If the message is just a greeting with no specific topic, return "New Chat"
7. Use natural, conversational language
8. No quotes, no colons, no special formatting
9. Focus on the ACTION or TOPIC mentioned in the USER MESSAGE
10. DO NOT hallucinate or guess topics - only use what's explicitly mentioned

**Examples:**
- User: "hello" → "New Chat" (just a greeting)
- User: "hi there" → "New Chat" (just a greeting)
- User: "What are tax documents for 2024?" → "Tax documents for 2024"
- User: "Check my passport expiry" → "Passport expiry date"
- User: "Compare these lease agreements" → "Compare lease agreements"
- User: "Help me organize medical records" → "Organize medical records"
- User: "list companies mentioned in" → "List Companies Mentioned"
- User: "what is trabalho projeto about" → "Trabalho Projeto Details"

Return ONLY the title, nothing else. NO hallucination or guessing allowed.`,
        },
        {
          role: 'user',
          content: firstResponse
            ? `User asked: "${firstMessage}"\n\nCreate a title based on what the USER ASKED, not the AI response. Focus on the topic or action in the user's question.`
            : `User: "${firstMessage}"\n\nIf this is just a greeting with no specific topic, return "New Chat". Otherwise, create a title for the topic.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 20, // Keep it short
    });

    let title = result.choices[0].message.content?.trim() || 'New Chat';

    // Remove quotes if AI added them
    title = title.replace(/^["']|["']$/g, '');

    // Truncate to 50 chars max
    if (title.length > 50) {
      title = title.slice(0, 47) + '...';
    }

    console.log('✅ Generated title:', title);

    return title;
  } catch (error) {
    console.error('❌ Error generating conversation title:', error);
    // Fallback to "New Chat" instead of using first message
    return 'New Chat';
  }
};
