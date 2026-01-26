/**
 * Document Reference Detector
 * Extracts document references from natural language queries using pattern matching
 */

/**
 * Represents the result of a document reference detection operation.
 */
export interface DocumentReference {
  hasDocumentReference: boolean;
  documentReference: string | null;
  confidence: number;
  extractionMethod: 'pattern' | 'none';
}

// A list of common words to avoid misidentifying as document names
const STOP_WORDS = new Set([
  'document', 'file', 'pdf', 'docx', 'presentation', 'spreadsheet',
  'documento', 'arquivo', // Portuguese
  'archivo', // Spanish
  'what', 'where', 'how', 'when', 'why', 'tell', 'show', 'find',
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  // Greetings and common phrases
  'hello', 'hi', 'hey', 'good', 'morning', 'afternoon', 'evening',
  'thanks', 'thank', 'please', 'help', 'can', 'could', 'would',
]);

/**
 * Detects a document reference in a user query using pattern matching.
 * @param query The user's query string.
 * @returns A DocumentReference object.
 */
export function detectDocumentReference(query: string): DocumentReference {
  const normalizedQuery = query.toLowerCase().trim();

  // Early exit for very short queries (likely greetings or simple questions)
  if (normalizedQuery.split(/\s+/).length <= 2 && normalizedQuery.length < 15) {
    return {
      hasDocumentReference: false,
      documentReference: null,
      confidence: 0,
      extractionMethod: 'none',
    };
  }

  const patterns = [
    // EN: "tell me about [the] [document name]" - HIGH PRIORITY - captures user's exact query pattern
    /(?:tell me about|tell me what'?s in|show me)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,4})\s*$/i,

    // EN: "what is/what's [the] [document name]" - asking for document summary
    /(?:what\s+is|what'?s)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,4})\s*$/i,

    // EN: "...in [the] [document name]" - match 2-4 words after "in [the]" at end of query - MOST COMMON
    /(?:in|from)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,3})\s*$/i,

    // EN: "the [document name] file/document/pdf" - explicit file type mention
    /\bthe\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,3})\s+(?:document|file|pdf|docx|presentation|spreadsheet|pptx|xlsx)\b/i,

    // EN: "...in the [document name] document"
    /(?:in|from|about|of|regarding)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,3})\s+(?:document|file|pdf|docx)/i,

    // EN: "about [the] [document name]" (general about queries) - ONLY if multi-word
    /(?:about|regarding)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,3})\s*$/i,

    // PT: "...no [document name]"
    /(?:no|do|sobre|em)\s+(?:o\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,4})\s*$/i,

    // ES: "...en [el] [document name]"
    /(?:en|del|sobre|de)\s+(?:el\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,4})\s*$/i,

    // Location-based: "...on slide 3 of [the] [document name]"
    /(?:slide|page|sheet)\s+\d+.*(?:in|of|from)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,3})/i,

    // Direct reference: "what does [document name] say"
    /(?:what\s+does|what's\s+in)\s+(?:the\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){1,3})\s+(?:say|contain|include)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedQuery.match(pattern);
    if (match && match[1]) {
      const documentReference = match[1].trim();

      // Basic validation to avoid short or common words
      if (documentReference.length >= 3 && !STOP_WORDS.has(documentReference)) {
        // Additional validation: should contain at least one meaningful word
        const words = documentReference.split(/\s+/);
        const meaningfulWords = words.filter(w => w.length >= 3 && !STOP_WORDS.has(w));

        // Require at least 2 words OR 1 word that's longer than 8 characters (likely a specific document name)
        if (meaningfulWords.length >= 2 || (meaningfulWords.length === 1 && meaningfulWords[0].length >= 8)) {
          return {
            hasDocumentReference: true,
            documentReference: documentReference,
            confidence: 0.9,
            extractionMethod: 'pattern',
          };
        }
      }
    }
  }

  return {
    hasDocumentReference: false,
    documentReference: null,
    confidence: 0,
    extractionMethod: 'none',
  };
}
