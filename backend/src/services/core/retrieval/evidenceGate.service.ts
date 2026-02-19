/**
 * Evidence Gate Service
 *
 * ANTI-HALLUCINATION: Prevents Koda from inventing details when no document evidence exists.
 *
 * ChatGPT-quality requires that factual claims are either:
 * 1. Directly quoted from documents
 * 2. Logically derived from document content
 * 3. Or honestly stated as "not found"
 *
 * This gate runs AFTER retrieval but BEFORE answer generation.
 */

export interface EvidenceCheckResult {
  hasEvidence: boolean;
  evidenceStrength: "strong" | "moderate" | "weak" | "none";
  suggestedAction: "answer" | "hedge" | "clarify" | "apologize";
  missingEvidence: string[]; // What facts are needed but missing
  foundEvidence: string[]; // What facts were found
  clarifyQuestion?: string; // If action is 'clarify', what to ask
  hedgePrefix?: string; // If action is 'hedge', what prefix to use
}

interface EvidenceGateConfig {
  logger?: Pick<Console, "info" | "warn" | "debug">;
}

/**
 * Patterns that indicate the query is asking for specific facts that MUST be in documents
 */
const FACT_REQUIRING_PATTERNS = {
  // Dates/years
  dates: [
    /\b(when|quando|em que ano|what year|founded|fundad[oa]|surgiu|criou|started)\b/i,
    /\b(in|em)\s+\d{4}\b/i,
  ],
  // Numbers/amounts
  numbers: [
    /\b(how much|quanto|custo|price|valor|amount|quantidad)\b/i,
    /\b(percentage|percentual|porcentagem|%)\b/i,
  ],
  // Names/entities
  names: [
    /\b(who|quem|founder|fundador|owner|dono|CEO|presidente)\b/i,
    /\b(where|onde|location|localiza[çc][ãa]o|endere[çc]o|address)\b/i,
  ],
  // Specific details
  specifics: [
    /\b(exactly|exatamente|specifically|especificamente)\b/i,
    /\b(precise|preciso|exact|exato)\b/i,
  ],
};

/**
 * Phrases that indicate narrative/story building - high hallucination risk
 */
const NARRATIVE_RISK_PATTERNS = [
  /\b(history|história|story|trajetória)\b/i,
  /\b(evolution|evolu[çc][ãa]o|growth|crescimento)\b/i,
  /\b(mission|missão|vision|visão|values|valores)\b/i,
  /\b(culture|cultura|philosophy|filosofia)\b/i,
];

/**
 * Evidence keywords that indicate we found real content
 */
const EVIDENCE_KEYWORDS = {
  dates: /\b(19|20)\d{2}\b/, // Years like 2012, 2024
  numbers: /\b\d+([.,]\d+)?(%|R\$|\$|€|£)?\b/, // Numbers, currencies
  names: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Proper names
  quotes: /[""][^""]+[""]/, // Quoted text
  specifics: /\b(artigo|cláusula|seção|slide|página|row|column|cell)\s+\d+/i,
};

export class EvidenceGateService {
  private logger: Pick<Console, "info" | "warn" | "debug">;

  constructor(config: EvidenceGateConfig = {}) {
    this.logger = config.logger || console;
  }

  /**
   * Main entry point: Check if retrieved chunks provide sufficient evidence for the query
   */
  checkEvidence(
    query: string,
    chunks: Array<{ text: string; metadata?: Record<string, unknown> }>,
    language: string,
  ): EvidenceCheckResult {
    const queryLower = query.toLowerCase();

    // Step 1: Determine what kind of facts the query requires
    const requiredFactTypes = this.detectRequiredFacts(query);
    const isNarrativeRisk = NARRATIVE_RISK_PATTERNS.some((p) =>
      p.test(queryLower),
    );

    // Step 2: Analyze chunks for evidence
    const combinedText = chunks.map((c) => c.text).join("\n");
    const foundEvidence = this.findEvidence(combinedText, requiredFactTypes);

    // Step 3: Calculate evidence strength
    const evidenceStrength = this.calculateStrength(
      requiredFactTypes,
      foundEvidence,
      chunks.length,
    );

    // Step 4: Determine action
    const result = this.determineAction(
      evidenceStrength,
      requiredFactTypes,
      foundEvidence,
      isNarrativeRisk,
      language,
    );

    this.logger.debug("[EvidenceGate] Check result", {
      query: query.substring(0, 50),
      requiredFactTypes,
      foundEvidence,
      evidenceStrength,
      action: result.suggestedAction,
      isNarrativeRisk,
    });

    return result;
  }

  /**
   * Detect what types of facts the query is asking for
   */
  private detectRequiredFacts(query: string): string[] {
    const required: string[] = [];

    for (const [factType, patterns] of Object.entries(
      FACT_REQUIRING_PATTERNS,
    )) {
      if (patterns.some((p) => p.test(query))) {
        required.push(factType);
      }
    }

    return required;
  }

  /**
   * Find evidence in the combined chunk text
   */
  private findEvidence(text: string, requiredTypes: string[]): string[] {
    const found: string[] = [];

    for (const [evidenceType, pattern] of Object.entries(EVIDENCE_KEYWORDS)) {
      if (pattern.test(text)) {
        found.push(evidenceType);
      }
    }

    // Check for general content richness
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 100) {
      found.push("rich_content");
    }

    return found;
  }

  /**
   * Calculate evidence strength based on what's required vs found
   */
  private calculateStrength(
    required: string[],
    found: string[],
    chunkCount: number,
  ): "strong" | "moderate" | "weak" | "none" {
    // If no specific facts required, any content is good
    if (required.length === 0 && chunkCount > 0) {
      return found.includes("rich_content") ? "strong" : "moderate";
    }

    // Check how many required types we found evidence for
    const matchedRequired = required.filter((r) => {
      // Map required fact types to evidence types
      if (r === "dates" && found.includes("dates")) return true;
      if (r === "numbers" && found.includes("numbers")) return true;
      if (r === "names" && found.includes("names")) return true;
      if (
        r === "specifics" &&
        (found.includes("quotes") || found.includes("specifics"))
      )
        return true;
      return false;
    });

    const matchRatio =
      required.length > 0 ? matchedRequired.length / required.length : 0;

    if (matchRatio >= 0.8) return "strong";
    if (matchRatio >= 0.5) return "moderate";
    if (matchRatio > 0 || found.includes("rich_content")) return "weak";
    return "none";
  }

  /**
   * Determine what action to take based on evidence strength
   */
  private determineAction(
    strength: "strong" | "moderate" | "weak" | "none",
    requiredTypes: string[],
    foundEvidence: string[],
    isNarrativeRisk: boolean,
    language: string,
  ): EvidenceCheckResult {
    const missingEvidence = requiredTypes.filter(
      (r) => !foundEvidence.some((f) => f.includes(r)),
    );

    // Base result
    const result: EvidenceCheckResult = {
      hasEvidence: strength !== "none",
      evidenceStrength: strength,
      suggestedAction: "answer",
      missingEvidence,
      foundEvidence,
    };

    // Decision logic
    if (strength === "none") {
      result.suggestedAction = "apologize";
      return result;
    }

    if (strength === "weak") {
      if (isNarrativeRisk) {
        // High risk of hallucination - ask for clarification
        result.suggestedAction = "clarify";
        result.clarifyQuestion =
          language === "pt"
            ? "Não encontrei detalhes específicos sobre isso nos seus documentos. Você pode me dizer qual arquivo devo verificar?"
            : "I couldn't find specific details about this in your documents. Can you tell me which file I should check?";
      } else {
        // Low narrative risk - hedge but answer
        result.suggestedAction = "hedge";
        result.hedgePrefix =
          language === "pt"
            ? "Com base nas informações limitadas disponíveis, "
            : "Based on the limited information available, ";
      }
      return result;
    }

    if (strength === "moderate" && isNarrativeRisk) {
      // Moderate evidence + narrative = hedge
      result.suggestedAction = "hedge";
      result.hedgePrefix =
        language === "pt"
          ? "De acordo com os documentos disponíveis, "
          : "According to the available documents, ";
      return result;
    }

    // Strong evidence or moderate without narrative risk = answer normally
    result.suggestedAction = "answer";
    return result;
  }

  /**
   * Apply the gate decision to modify the answer generation context
   * Returns modified system prompt additions based on evidence check
   */
  getPromptModification(result: EvidenceCheckResult, language: string): string {
    switch (result.suggestedAction) {
      case "apologize":
        return language === "pt"
          ? "\n\nIMPORTANTE: Não encontrei informações suficientes nos documentos para responder esta pergunta. Diga isso honestamente ao usuário sem inventar detalhes."
          : "\n\nIMPORTANT: I could not find sufficient information in the documents to answer this question. Tell the user this honestly without inventing details.";

      case "clarify":
        return language === "pt"
          ? `\n\nIMPORTANTE: A evidência é limitada. Pergunte: "${result.clarifyQuestion}" ao invés de inventar detalhes.`
          : `\n\nIMPORTANT: Evidence is limited. Ask: "${result.clarifyQuestion}" instead of inventing details.`;

      case "hedge":
        return language === "pt"
          ? `\n\nIMPORTANTE: Comece a resposta com: "${result.hedgePrefix}" para indicar incerteza. NÃO invente detalhes como datas de fundação, história da empresa, ou missão a menos que estejam explicitamente citados.`
          : `\n\nIMPORTANT: Start the response with: "${result.hedgePrefix}" to indicate uncertainty. DO NOT invent details like founding dates, company history, or mission statements unless explicitly quoted.`;

      case "answer":
      default:
        return ""; // No modification needed
    }
  }
}

// Singleton instance
let evidenceGateInstance: EvidenceGateService | null = null;

export function getEvidenceGate(): EvidenceGateService {
  if (!evidenceGateInstance) {
    evidenceGateInstance = new EvidenceGateService();
  }
  return evidenceGateInstance;
}
