/**
 * PromptRegistry Service
 *
 * Single source of truth for all system prompts.
 * ChatGPT/Claude parity: modular prompt assembly.
 *
 * BANK-DRIVEN: Reads system_prompts.any.json via bankLoader service.
 *
 * Assembly order: BASE + INTENT_FAMILY + OPERATOR + QUALITY_GUARD (optional) + LANGUAGE
 *
 * @version 2.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { getBank } from './bankLoader.service';

// ============================================================================
// TYPES
// ============================================================================

export type LanguageCode = 'en' | 'pt' | 'es';

export type IntentFamily =
  | 'documents'
  | 'file_actions'
  | 'doc_stats'
  | 'help'
  | 'conversation'
  | 'reasoning'
  | 'error';

export type DocumentOperator =
  | 'summarize'
  | 'extract'
  | 'compute'
  | 'compare'
  | 'locate_content'
  | 'explain'
  | 'expand'
  | 'list'
  | 'locate_file'
  | 'stats'
  | 'capabilities'
  | 'how_to'
  | 'unknown';

export interface PromptAssemblyParams {
  language: LanguageCode;
  intentFamily: IntentFamily;
  operator?: string;
  includeQualityGuard?: boolean;
  includeFollowupHint?: boolean;
  regenHint?: string;
}

export interface AssembledPrompt {
  prompt: string;
  keys: string[];  // For logging: ["BASE", "DOCUMENTS", "SUMMARIZE", "QUALITY_GUARD"]
  tokenEstimate: number;
}

interface PromptBank {
  version: string;
  global: {
    base: Record<LanguageCode, string>;
    qualityGuard: Record<LanguageCode, string>;
    followupSuggestions: Record<LanguageCode, string>;
    regenBoost: Record<LanguageCode, string>;
  };
  intentFamilies: Record<string, Record<LanguageCode, string>>;
  operators: Record<string, Record<LanguageCode, string>>;
  languageDirectives: Record<LanguageCode, string>;
}

// ============================================================================
// PROMPT REGISTRY SERVICE
// ============================================================================

class PromptRegistryService {
  private bank: PromptBank | null = null;
  private loadedAt: Date | null = null;
  private bankPath: string;

  constructor() {
    // Primary location: data_banks/policies/
    this.bankPath = path.resolve(__dirname, '../../data_banks/policies/system_prompts.any.json');
  }

  /**
   * Initialize the registry (load prompts from bank)
   */
  public init(): void {
    this.loadBank();
  }

  /**
   * Reload prompts (for dev hot-reload)
   */
  public reload(): void {
    this.bank = null;
    this.loadBank();
    console.log('[PromptRegistry] Reloaded prompts');
  }

  /**
   * Load prompt bank from JSON
   * BANK-DRIVEN: Uses bankLoader service first, falls back to direct file loading
   */
  private loadBank(): void {
    if (this.bank) return;

    // Try bank loader first
    const bankData = getBank<PromptBank>('system_prompts');
    if (bankData) {
      this.bank = bankData;
      this.loadedAt = new Date();
      this.validateBank();
      console.log(`[PromptRegistry] Loaded system_prompts via bankLoader v${this.bank.version}`);
      return;
    }

    // Fallback to direct file loading
    try {
      const raw = fs.readFileSync(this.bankPath, 'utf-8');
      this.bank = JSON.parse(raw) as PromptBank;
      this.loadedAt = new Date();

      // Validate required keys
      this.validateBank();

      console.log(`[PromptRegistry] Loaded prompts v${this.bank.version} from ${path.basename(this.bankPath)} (file fallback)`);
    } catch (error) {
      console.error('[PromptRegistry] Failed to load prompt bank:', error);
      this.bank = this.getFallbackBank();
    }
  }

  /**
   * Validate bank has required keys
   */
  private validateBank(): void {
    if (!this.bank) return;

    const requiredFamilies: IntentFamily[] = ['documents', 'file_actions', 'doc_stats', 'help', 'conversation', 'error'];
    const requiredOperators = ['summarize', 'extract', 'compute', 'compare', 'locate_content', 'explain'];

    for (const family of requiredFamilies) {
      if (!this.bank.intentFamilies[family]) {
        console.warn(`[PromptRegistry] Missing intent family: ${family}`);
      }
    }

    for (const op of requiredOperators) {
      if (!this.bank.operators[op]) {
        console.warn(`[PromptRegistry] Missing operator prompt: ${op}`);
      }
    }
  }

  /**
   * Get fallback bank if loading fails
   */
  private getFallbackBank(): PromptBank {
    return {
      version: 'fallback',
      global: {
        base: {
          en: 'You are Koda, an AI assistant for document Q&A. Answer based only on provided documents. Be clear and structured.',
          pt: 'Você é Koda, um assistente de IA para perguntas sobre documentos. Responda com base apenas nos documentos fornecidos. Seja claro e estruturado.',
          es: 'Eres Koda, un asistente de IA para preguntas sobre documentos. Responde basándote solo en los documentos proporcionados. Sé claro y estructurado.',
        },
        qualityGuard: {
          en: 'Ensure the response is complete, well-structured, and teaches rather than just listing facts.',
          pt: 'Certifique-se de que a resposta está completa, bem estruturada e ensina em vez de apenas listar fatos.',
          es: 'Asegúrate de que la respuesta esté completa, bien estructurada y enseñe en lugar de solo listar hechos.',
        },
        followupSuggestions: {
          en: 'Suggest up to 3 relevant follow-up questions when appropriate.',
          pt: 'Sugira até 3 perguntas de acompanhamento relevantes quando apropriado.',
          es: 'Sugiere hasta 3 preguntas de seguimiento relevantes cuando sea apropiado.',
        },
        regenBoost: {
          en: 'Expand with more context and explanation. Include a short opener and conclusion. Use 2-3 line paragraphs.',
          pt: 'Expanda com mais contexto e explicação. Inclua uma abertura curta e conclusão. Use parágrafos de 2-3 linhas.',
          es: 'Expande con más contexto y explicación. Incluye una apertura corta y conclusión. Usa párrafos de 2-3 líneas.',
        },
      },
      intentFamilies: {
        documents: {
          en: 'Answer using ONLY the provided document content. Start with a direct answer, then add supporting detail.',
          pt: 'Responda usando APENAS o conteúdo dos documentos fornecidos. Comece com uma resposta direta, depois adicione detalhes de apoio.',
          es: 'Responde usando SOLO el contenido de los documentos proporcionados. Empieza con una respuesta directa, luego agrega detalle de apoyo.',
        },
        file_actions: {
          en: 'Respond concisely. Let UI attachments do the work. Do not explain file contents.',
          pt: 'Responda de forma concisa. Deixe os anexos de UI fazerem o trabalho. Não explique conteúdo de arquivos.',
          es: 'Responde de forma concisa. Deja que los adjuntos de UI hagan el trabajo. No expliques contenido de archivos.',
        },
        doc_stats: {
          en: 'Answer with concise numerical results. State the count clearly.',
          pt: 'Responda com resultados numéricos concisos. Declare a contagem claramente.',
          es: 'Responde con resultados numéricos concisos. Declara el conteo claramente.',
        },
        help: {
          en: 'Explain capabilities or provide step-by-step guidance. Use clear bullets or numbered steps.',
          pt: 'Explique capacidades ou forneça orientação passo a passo. Use tópicos claros ou passos numerados.',
          es: 'Explica capacidades o proporciona orientación paso a paso. Usa viñetas claras o pasos numerados.',
        },
        conversation: {
          en: 'Respond conversationally. Friendly, short, human. No document references unless asked.',
          pt: 'Responda de forma conversacional. Amigável, curto, humano. Sem referências a documentos a menos que peçam.',
          es: 'Responde de forma conversacional. Amigable, corto, humano. Sin referencias a documentos a menos que pregunten.',
        },
        reasoning: {
          en: 'Provide thoughtful analysis. Structure reasoning clearly. Cite evidence from documents.',
          pt: 'Forneça análise reflexiva. Estruture o raciocínio claramente. Cite evidências dos documentos.',
          es: 'Proporciona análisis reflexivo. Estructura el razonamiento claramente. Cita evidencia de los documentos.',
        },
        error: {
          en: 'Handle errors clearly. One sentence explaining the issue. One actionable next step.',
          pt: 'Trate erros claramente. Uma frase explicando o problema. Um próximo passo acionável.',
          es: 'Maneja errores claramente. Una oración explicando el problema. Un próximo paso accionable.',
        },
      },
      operators: {
        summarize: {
          en: 'Summarize clearly with overview, key themes, and takeaway. Do not reduce to only bullets.',
          pt: 'Resuma claramente com visão geral, temas-chave e conclusão. Não reduza a apenas tópicos.',
          es: 'Resume claramente con resumen, temas clave y conclusión. No reduzcas a solo viñetas.',
        },
        extract: {
          en: 'Extract specific information directly and precisely. Indicate where it appears.',
          pt: 'Extraia informações específicas direta e precisamente. Indique onde aparecem.',
          es: 'Extrae información específica directa y precisamente. Indica dónde aparece.',
        },
        compute: {
          en: 'Perform calculations using ONLY document values. Show steps clearly.',
          pt: 'Realize cálculos usando APENAS valores dos documentos. Mostre os passos claramente.',
          es: 'Realiza cálculos usando SOLO valores de los documentos. Muestra los pasos claramente.',
        },
        compare: {
          en: 'Compare information across documents. Use tables for structured attributes.',
          pt: 'Compare informações entre documentos. Use tabelas para atributos estruturados.',
          es: 'Compara información entre documentos. Usa tablas para atributos estructurados.',
        },
        locate_content: {
          en: 'Help locate where information appears. Identify section, page, or tab.',
          pt: 'Ajude a localizar onde a informação aparece. Identifique seção, página ou aba.',
          es: 'Ayuda a localizar dónde aparece la información. Identifica sección, página o pestaña.',
        },
        explain: {
          en: 'Explain concepts in depth. Start with core explanation, add context and examples.',
          pt: 'Explique conceitos em profundidade. Comece com explicação central, adicione contexto e exemplos.',
          es: 'Explica conceptos en profundidad. Comienza con explicación central, agrega contexto y ejemplos.',
        },
      },
      languageDirectives: {
        en: 'Respond in English.',
        pt: 'Responda em português brasileiro.',
        es: 'Responde en español.',
      },
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get base prompt (always applied)
   */
  public getBasePrompt(lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.global?.base?.[lang] || this.bank?.global?.base?.['en'] || '';
  }

  /**
   * Get intent family prompt
   */
  public getIntentFamilyPrompt(family: IntentFamily, lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.intentFamilies?.[family]?.[lang]
      || this.bank?.intentFamilies?.[family]?.['en']
      || '';
  }

  /**
   * Get operator-specific prompt (for documents intent family)
   */
  public getOperatorPrompt(operator: string, lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.operators?.[operator]?.[lang]
      || this.bank?.operators?.[operator]?.['en']
      || '';
  }

  /**
   * Get quality guard prompt
   */
  public getQualityGuardPrompt(lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.global?.qualityGuard?.[lang]
      || this.bank?.global?.qualityGuard?.['en']
      || '';
  }

  /**
   * Get followup suggestions prompt
   */
  public getFollowupSuggestionsPrompt(lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.global?.followupSuggestions?.[lang]
      || this.bank?.global?.followupSuggestions?.['en']
      || '';
  }

  /**
   * Get regen boost prompt (used on regen pass)
   */
  public getRegenBoostPrompt(lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.global?.regenBoost?.[lang]
      || this.bank?.global?.regenBoost?.['en']
      || '';
  }

  /**
   * Get language directive
   */
  public getLanguageDirective(lang: LanguageCode): string {
    this.loadBank();
    return this.bank?.languageDirectives?.[lang]
      || this.bank?.languageDirectives?.['en']
      || 'Respond in English.';
  }

  /**
   * Assemble full system prompt from components
   * This is the main entry point for prompt assembly
   */
  public assemblePrompt(params: PromptAssemblyParams): AssembledPrompt {
    const {
      language,
      intentFamily,
      operator,
      includeQualityGuard = false,
      includeFollowupHint = false,
      regenHint,
    } = params;

    const parts: string[] = [];
    const keys: string[] = [];

    // 1. Base prompt (always)
    const base = this.getBasePrompt(language);
    if (base) {
      parts.push(base);
      keys.push('BASE');
    }

    // 2. Intent family prompt
    const familyPrompt = this.getIntentFamilyPrompt(intentFamily, language);
    if (familyPrompt) {
      parts.push(familyPrompt);
      keys.push(intentFamily.toUpperCase());
    }

    // 3. Operator prompt (only for documents intent family)
    if (intentFamily === 'documents' && operator) {
      const operatorPrompt = this.getOperatorPrompt(operator, language);
      if (operatorPrompt) {
        parts.push(operatorPrompt);
        keys.push(`OP_${operator.toUpperCase()}`);
      }
    }

    // 4. Quality guard (optional, recommended for regen)
    if (includeQualityGuard || regenHint) {
      const qualityGuard = this.getQualityGuardPrompt(language);
      if (qualityGuard) {
        parts.push(qualityGuard);
        keys.push('QUALITY_GUARD');
      }
    }

    // 5. Regen boost (if regen pass)
    if (regenHint) {
      const regenBoost = this.getRegenBoostPrompt(language);
      if (regenBoost) {
        parts.push(regenBoost);
        keys.push('REGEN_BOOST');
      }
      // Also add the specific hint
      parts.push(`Additional instruction: ${regenHint}`);
      keys.push('REGEN_HINT');
    }

    // 6. Followup suggestions hint (optional)
    if (includeFollowupHint) {
      const followupHint = this.getFollowupSuggestionsPrompt(language);
      if (followupHint) {
        parts.push(followupHint);
        keys.push('FOLLOWUP_HINT');
      }
    }

    // 7. Language directive (always last)
    const langDirective = this.getLanguageDirective(language);
    if (langDirective) {
      parts.push(langDirective);
      keys.push(`LANG_${language.toUpperCase()}`);
    }

    const prompt = parts.join('\n\n');
    const tokenEstimate = Math.ceil(prompt.length / 4); // Rough estimate

    return { prompt, keys, tokenEstimate };
  }

  /**
   * Get registry stats (for debugging)
   */
  public getStats(): {
    version: string;
    loadedAt: Date | null;
    bankPath: string;
    familyCount: number;
    operatorCount: number;
  } {
    this.loadBank();
    return {
      version: this.bank?.version || 'unknown',
      loadedAt: this.loadedAt,
      bankPath: this.bankPath,
      familyCount: Object.keys(this.bank?.intentFamilies || {}).length,
      operatorCount: Object.keys(this.bank?.operators || {}).length,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: PromptRegistryService | null = null;

export function getPromptRegistry(): PromptRegistryService {
  if (!instance) {
    instance = new PromptRegistryService();
    instance.init();
  }
  return instance;
}

export function resetPromptRegistry(): void {
  if (instance) {
    instance.reload();
  }
}

export default PromptRegistryService;
