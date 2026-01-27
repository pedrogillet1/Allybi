/**
 * ContentGuard Service - Bank-Driven Implementation with Two-Signal Fallback
 *
 * SINGLE SOURCE OF TRUTH for detecting content-based questions.
 * This guard MUST be called by ALL intercepts that could route to file_actions:
 * - tryInventoryQuery (fileSearch.service.ts parseInventoryQuery)
 * - tryFileActionQuery (orchestrator detectFileActionQuery)
 * - routingPriority adjustScores
 * - decision tree operator selection
 *
 * A content question asks ABOUT document content, not FOR document navigation.
 * Examples:
 *   CONTENT: "What topics does the Project Management Presentation cover?" → documents
 *   FILE:    "Show me the Project Management Presentation" → file_actions
 *
 * Two-Signal Rule:
 * - Content guard triggers ONLY when query has BOTH:
 *   (A) Content Intent Signal: topics, summary, main points, argue, claims, mentions
 *   (B) Document Object Signal: document, file, presentation, deck, report, slides
 */

import * as fs from 'fs';
import * as path from 'path';

export type LanguageCode = 'en' | 'pt' | 'es';

// Bank file paths
const BANK_BASE = path.join(__dirname, '../../data_banks');

interface ContentGuardBank {
  _meta: {
    version: string;
    generated: string;
    purpose: string;
    totalPatterns: number;
    twoSignalRule?: string;
  };
  families: {
    [key: string]: {
      name: string;
      weight: number;
      description: string;
      patterns: string[];
    };
  };
  documentObjects?: {
    objects: string[];
    anchorNouns: string[];
  };
}

interface NegativeGuardBank {
  _meta: {
    version: string;
    generated: string;
    purpose: string;
    totalPatterns: number;
  };
  families: {
    [key: string]: {
      name: string;
      weight: number;
      description: string;
      patterns: string[];
    };
  };
}

// Cached compiled patterns
let contentPatternsEN: RegExp[] | null = null;
let contentPatternsPT: RegExp[] | null = null;
let negativePatternsEN: RegExp[] | null = null;
let negativePatternsPT: RegExp[] | null = null;

// Bank load status
let bankLoadStatus = {
  enContentLoaded: 0,
  ptContentLoaded: 0,
  enNegativeLoaded: 0,
  ptNegativeLoaded: 0,
};

/**
 * Normalize text for matching - removes diacritics
 */
function foldDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Escape special regex characters for literal matching
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a pattern string to regex
 * - If it contains regex meta-characters (.+, ?, etc.), treat as regex
 * - Otherwise, treat as substring match
 */
function patternToRegex(pattern: string): RegExp {
  // Check if pattern looks like it has regex syntax
  const hasRegexSyntax = /[.+*?^${}()|[\]\\]/.test(pattern);

  if (hasRegexSyntax) {
    return new RegExp(pattern, 'i');
  } else {
    const escaped = escapeRegex(pattern);
    return new RegExp(escaped, 'i');
  }
}

/**
 * Load and compile patterns from bank file
 */
function loadBankPatterns(bankPath: string): RegExp[] {
  try {
    if (!fs.existsSync(bankPath)) {
      console.warn(`[ContentGuard] Bank file not found: ${bankPath}`);
      return [];
    }

    const bankData = JSON.parse(fs.readFileSync(bankPath, 'utf-8'));
    const patterns: RegExp[] = [];

    if (bankData.families) {
      for (const familyKey of Object.keys(bankData.families)) {
        const family = bankData.families[familyKey];
        if (family.patterns && Array.isArray(family.patterns)) {
          for (const pattern of family.patterns) {
            try {
              patterns.push(patternToRegex(pattern));
            } catch (e) {
              console.warn(`[ContentGuard] Invalid pattern in ${bankPath}: ${pattern}`);
            }
          }
        }
      }
    }

    return patterns;
  } catch (e) {
    console.error(`[ContentGuard] Failed to load bank: ${bankPath}`, e);
    return [];
  }
}

/**
 * Initialize pattern caches from banks
 */
function initializePatterns(): void {
  if (contentPatternsEN === null) {
    contentPatternsEN = loadBankPatterns(path.join(BANK_BASE, 'triggers/content_guard.en.json'));
    bankLoadStatus.enContentLoaded = contentPatternsEN.length;
    console.log(`[ContentGuard] Loaded ${contentPatternsEN.length} EN content patterns`);
  }

  if (contentPatternsPT === null) {
    contentPatternsPT = loadBankPatterns(path.join(BANK_BASE, 'triggers/content_guard.pt.json'));
    bankLoadStatus.ptContentLoaded = contentPatternsPT.length;
    console.log(`[ContentGuard] Loaded ${contentPatternsPT.length} PT content patterns`);
  }

  if (negativePatternsEN === null) {
    negativePatternsEN = loadBankPatterns(path.join(BANK_BASE, 'negatives/not_content_guard.en.json'));
    bankLoadStatus.enNegativeLoaded = negativePatternsEN.length;
    console.log(`[ContentGuard] Loaded ${negativePatternsEN.length} EN negative patterns`);
  }

  if (negativePatternsPT === null) {
    negativePatternsPT = loadBankPatterns(path.join(BANK_BASE, 'negatives/not_content_guard.pt.json'));
    bankLoadStatus.ptNegativeLoaded = negativePatternsPT.length;
    console.log(`[ContentGuard] Loaded ${negativePatternsPT.length} PT negative patterns`);
  }
}

// ============================================================================
// TWO-SIGNAL FALLBACK VOCABULARY (ChatGPT-like behavior)
// ============================================================================

// Content intent signals - verbs and nouns that indicate asking ABOUT content
const CONTENT_VERBS_EN = new Set([
  'summarize', 'summarise', 'explain', 'describe', 'cover', 'discuss', 'mention',
  'define', 'argue', 'claim', 'state', 'conclude', 'analyze', 'analyse', 'compare',
  'contrast', 'extract', 'outline', 'detail', 'elaborate', 'clarify', 'interpret',
  'review', 'recap', 'highlight', 'identify', 'address', 'talk about', 'go over',
  'break down', 'walk through', 'point out', 'bring up', 'touch on', 'delve into'
]);

const CONTENT_VERBS_PT = new Set([
  'resumir', 'resuma', 'resumir', 'explicar', 'explique', 'descrever', 'descreva',
  'cobrir', 'cobre', 'discutir', 'discute', 'mencionar', 'menciona', 'definir',
  'defina', 'argumentar', 'argumenta', 'afirmar', 'afirma', 'concluir', 'conclui',
  'analisar', 'analise', 'comparar', 'compare', 'extrair', 'extraia', 'detalhar',
  'detalhe', 'elaborar', 'elabore', 'clarificar', 'clarifique', 'interpretar',
  'interprete', 'revisar', 'revise', 'destacar', 'destaque', 'identificar',
  'identifique', 'abordar', 'aborda', 'falar sobre', 'tratar de', 'dizer sobre'
]);

const CONTENT_NOUNS_EN = new Set([
  'topics', 'topic', 'themes', 'theme', 'points', 'point', 'takeaways', 'takeaway',
  'findings', 'finding', 'conclusions', 'conclusion', 'arguments', 'argument',
  'claims', 'claim', 'thesis', 'summary', 'overview', 'gist', 'essence', 'meaning',
  'insights', 'insight', 'highlights', 'highlight', 'key points', 'main points',
  'key takeaways', 'main takeaways', 'key findings', 'main findings', 'ideas', 'idea',
  'concepts', 'concept', 'sections', 'section', 'chapters', 'chapter', 'analysis',
  'content', 'message', 'messages', 'information', 'data', 'details', 'differences',
  // Domain-specific content nouns - FINANCE
  'expense', 'expenses', 'revenue', 'revenues', 'categories', 'category',
  'amount', 'amounts', 'profit', 'profits', 'loss', 'losses', 'margin', 'margins',
  'budget', 'budgets', 'forecast', 'forecasts', 'ebitda', 'income', 'cost', 'costs',
  'cash flow', 'balance', 'liabilities', 'assets', 'equity', 'roi', 'npv', 'irr',
  // Domain-specific content nouns - LEGAL
  'clause', 'clauses', 'liability', 'termination', 'penalty', 'penalties',
  'indemnity', 'warranty', 'warranties', 'obligation', 'obligations', 'provision', 'provisions',
  'terms', 'conditions', 'force majeure', 'compliance', 'regulation', 'regulations',
  // Domain-specific content nouns - MEDICAL
  'diagnosis', 'diagnoses', 'treatment', 'treatments', 'symptom', 'symptoms',
  'medication', 'medications', 'prescription', 'prescriptions', 'dosage', 'dosages',
  // Domain-specific content nouns - PROJECT
  'stakeholder', 'stakeholders', 'requirement', 'requirements', 'milestone', 'milestones',
  'risk', 'risks', 'deliverable', 'deliverables', 'timeline', 'scope', 'sprint', 'sprints'
]);

const CONTENT_NOUNS_PT = new Set([
  'tópicos', 'tópico', 'temas', 'tema', 'pontos', 'ponto', 'conclusões', 'conclusão',
  'argumentos', 'argumento', 'afirmações', 'afirmação', 'tese', 'resumo', 'síntese',
  'visão geral', 'essência', 'significado', 'insights', 'insight', 'destaques',
  'destaque', 'pontos principais', 'pontos chave', 'pontos-chave', 'achados',
  'achado', 'descobertas', 'descoberta', 'ideias', 'ideia', 'conceitos', 'conceito',
  'seções', 'seção', 'capítulos', 'capítulo', 'análise', 'conteúdo', 'mensagens',
  'mensagem', 'informações', 'informação', 'dados', 'detalhes', 'diferenças',
  // Domain-specific content nouns - FINANCE
  'despesa', 'despesas', 'receita', 'receitas', 'categorias', 'categoria',
  'valor', 'valores', 'lucro', 'lucros', 'prejuízo', 'prejuízos', 'margem', 'margens',
  'orçamento', 'orçamentos', 'previsão', 'previsões', 'ebitda', 'renda', 'custo', 'custos',
  'fluxo de caixa', 'balanço', 'passivo', 'passivos', 'ativo', 'ativos', 'patrimônio',
  // Domain-specific content nouns - LEGAL
  'cláusula', 'cláusulas', 'responsabilidade', 'rescisão', 'penalidade', 'penalidades',
  'indenização', 'garantia', 'garantias', 'obrigação', 'obrigações', 'disposição', 'disposições',
  'termos', 'condições', 'força maior', 'conformidade', 'regulamento', 'regulamentos',
  // Domain-specific content nouns - MEDICAL
  'diagnóstico', 'diagnósticos', 'tratamento', 'tratamentos', 'sintoma', 'sintomas',
  'medicação', 'medicações', 'prescrição', 'prescrições', 'dosagem', 'dosagens',
  // Domain-specific content nouns - PROJECT
  'stakeholder', 'stakeholders', 'requisito', 'requisitos', 'marco', 'marcos',
  'risco', 'riscos', 'entregável', 'entregáveis', 'cronograma', 'escopo', 'sprint', 'sprints'
]);

// Anchor nouns - indicate asking about specific parts of document (content question)
const ANCHOR_NOUNS_EN = new Set([
  'page', 'pages', 'slide', 'slides', 'tab', 'tabs', 'sheet', 'sheets',
  'cell', 'cells', 'section', 'sections', 'chapter', 'chapters', 'paragraph',
  'paragraphs', 'row', 'rows', 'column', 'columns', 'table', 'tables',
  'figure', 'figures', 'chart', 'charts', 'graph', 'graphs', 'appendix'
]);

const ANCHOR_NOUNS_PT = new Set([
  'página', 'páginas', 'slide', 'slides', 'aba', 'abas', 'planilha', 'planilhas',
  'célula', 'células', 'seção', 'seções', 'capítulo', 'capítulos', 'parágrafo',
  'parágrafos', 'linha', 'linhas', 'coluna', 'colunas', 'tabela', 'tabelas',
  'figura', 'figuras', 'gráfico', 'gráficos', 'apêndice'
]);

// Document object nouns - the "what" being asked about
const DOCUMENT_OBJECTS_EN = new Set([
  'document', 'documents', 'file', 'files', 'pdf', 'pdfs', 'presentation',
  'presentations', 'spreadsheet', 'spreadsheets', 'report', 'reports',
  'contract', 'contracts', 'paper', 'papers', 'article', 'articles',
  'deck', 'decks', 'slides', 'slide', 'workbook', 'workbooks', 'memo',
  'memos', 'letter', 'letters', 'proposal', 'proposals', 'agreement',
  'agreements', 'invoice', 'invoices', 'statement', 'statements'
]);

const DOCUMENT_OBJECTS_PT = new Set([
  'documento', 'documentos', 'arquivo', 'arquivos', 'pdf', 'pdfs',
  'apresentação', 'apresentações', 'planilha', 'planilhas', 'relatório',
  'relatórios', 'contrato', 'contratos', 'artigo', 'artigos', 'proposta',
  'propostas', 'acordo', 'acordos', 'fatura', 'faturas', 'extrato', 'extratos'
]);

// File action signals - verbs that indicate file navigation/management
const FILE_ACTION_VERBS_EN = new Set([
  'open', 'show', 'list', 'display', 'view', 'preview', 'filter', 'sort',
  'group', 'find', 'locate', 'search', 'look for', 'move', 'delete', 'rename',
  'copy', 'download', 'upload', 'share', 'archive', 'remove', 'create',
  'navigate', 'go to', 'back to', 'pull up', 'bring up', 'give me', 'get'
]);

const FILE_ACTION_VERBS_PT = new Set([
  'abrir', 'abra', 'mostrar', 'mostre', 'listar', 'liste', 'exibir', 'exiba',
  'ver', 'veja', 'visualizar', 'visualize', 'filtrar', 'filtre', 'ordenar',
  'ordene', 'agrupar', 'agrupe', 'encontrar', 'encontre', 'localizar', 'localize',
  'procurar', 'procure', 'buscar', 'busque', 'mover', 'mova', 'deletar', 'delete',
  'apagar', 'apague', 'renomear', 'renomeie', 'copiar', 'copie', 'baixar', 'baixe',
  'enviar', 'envie', 'compartilhar', 'compartilhe', 'arquivar', 'arquive',
  'remover', 'remova', 'criar', 'crie', 'navegar', 'navegue', 'ir para', 'vá para',
  'voltar', 'puxar', 'puxe', 'trazer', 'traga', 'me dê', 'dê-me'
]);

// File/folder nouns - the "what" for file actions
const FILE_NOUNS_EN = new Set([
  'files', 'file', 'documents', 'document', 'pdfs', 'pdf', 'folder', 'folders',
  'directory', 'directories', 'spreadsheets', 'spreadsheet', 'presentations',
  'presentation', 'images', 'image', 'photos', 'photo', 'pictures', 'picture',
  'uploads', 'upload', 'downloads', 'download', 'attachments', 'attachment',
  'excel', 'word', 'powerpoint', 'pptx', 'xlsx', 'docx', 'csv', 'txt', 'png', 'jpg'
]);

const FILE_NOUNS_PT = new Set([
  'arquivos', 'arquivo', 'documentos', 'documento', 'pdfs', 'pdf', 'pasta', 'pastas',
  'diretório', 'diretórios', 'planilhas', 'planilha', 'apresentações', 'apresentação',
  'imagens', 'imagem', 'fotos', 'foto', 'uploads', 'upload', 'downloads', 'download',
  'anexos', 'anexo', 'excel', 'word', 'powerpoint', 'pptx', 'xlsx', 'docx', 'csv', 'txt'
]);

// Strong content frames - these are definitive content questions
const STRONG_CONTENT_FRAMES_EN: RegExp[] = [
  /\bwhat\s+(?:topics?|themes?|points?|ideas?)\s+(?:does|do|did|are|is)\s+.+?\s+(?:cover|discuss|mention|address|include)/i,
  /\bwhat\s+(?:is|are)\s+(?:discussed|covered|mentioned|explained|addressed)\s+(?:in|by)/i,
  /\b(?:topics?|themes?|points?)\s+(?:covered|discussed|mentioned)\s+(?:in|by)/i,
  /\bwhere\s+(?:does\s+it|do\s+they|is\s+it|are\s+they)\s+mention/i,
  /\bwhich\s+(?:page|slide|section|tab|sheet|cell)\s+(?:has|contains|shows|mentions|covers)/i,
  /\bon\s+(?:what|which)\s+page/i,
  /\bin\s+(?:what|which)\s+(?:section|part|chapter)/i,
  /\bwhat\s+(?:are|is)\s+the\s+(?:main|key|primary|major|important)\s+(?:points?|takeaways?|findings?|conclusions?|arguments?|themes?)/i,
  /\bwhat\s+does\s+(?:the|this)\s+.+?\s+(?:say|state|claim|argue|conclude)\s+(?:about|regarding)/i,
  /\bsummarize\s+(?:the|this)/i,
  /\bgive\s+(?:me\s+)?(?:a\s+)?(?:summary|overview|synopsis)\s+(?:of|for)/i,
  /\bexplain\s+(?:the|this|what)/i,
  /\bwhat\s+(?:information|data|content)\s+(?:is|are)\s+(?:in|contained)/i,
  /\bcompare\s+(?:the|these|both)/i,
  /\bwhat\s+(?:are\s+)?(?:the\s+)?differences?\s+(?:between|among)/i,
  /\bextract\s+(?:the\s+)?(?:main|key)/i,
  /\bwhat\s+does\s+(?:it|the\s+\w+)\s+(?:contain|have|include)/i,
  // Additional EN content frames
  /\banalyze\s+(?:the\s+)?(?:\w+\s+)?(?:data|report|document|information|results)/i,
  /\banalysis\s+(?:of\s+)?(?:the\s+)?(?:results|data|document|report)/i,
  /\bshow\s+me\s+what\s+(?:the\s+)?.+?\s+(?:says?|mentions?|discusses?|covers?)\s+(?:about|regarding)/i,
  /\bfind\s+(?:all\s+)?mentions?\s+of\s+.+?\s+(?:in\s+)?(?:my\s+)?(?:documents?|files?|reports?)/i,
  /\bwhat\s+(?:information|data)\s+(?:can\s+you\s+)?extract/i,
];

const STRONG_CONTENT_FRAMES_PT: RegExp[] = [
  /\bquais?\s+(?:tópicos?|temas?|pontos?|ideias?)\s+(?:o|a|os|as)?\s*.+?\s+(?:cobre|cobrem|aborda|abordam|discute|discutem|menciona|mencionam)/i,
  /\bo\s+que\s+(?:é|são)\s+(?:discutido|coberto|mencionado|explicado|abordado)\s+(?:n[oa]|pel[oa])/i,
  /\b(?:tópicos?|temas?|pontos?)\s+(?:cobertos?|discutidos?|mencionados?|abordados?)\s+(?:n[oa]|pel[oa])/i,
  /\bonde\s+(?:é\s+)?(?:menciona(?:do|da)?|aparece|consta|fala)/i,
  /\b(?:em\s+)?qual\s+(?:página|slide|seção|aba|planilha|célula)\s+(?:tem|contém|mostra|menciona|está)/i,
  /\bem\s+(?:que|qual)\s+(?:página|parte|seção|capítulo)/i,
  /\bquais?\s+(?:são|sao)\s+(?:os?\s+)?(?:principais?|pontos?)?\s*(?:pontos?|aprendizados?|conclusões?|argumentos?)/i,
  /\bo\s+que\s+(?:o|a|os|as)\s+.+?\s+(?:diz|dizem|fala|falam|afirma|afirmam|conclui|concluem)\s+(?:sobre|a\s+respeito)/i,
  /\b(?:resuma|resumir)\s+(?:o|a|os|as|isto|este|esta)/i,
  /\b(?:me\s+)?(?:dê|de)\s+(?:um\s+)?(?:resumo|síntese|visão\s+geral)\s+(?:d[oa]|sobre)/i,
  /\b(?:explique|explicar)\s+(?:o|a|os|as|isto|o\s+que)/i,
  /\bque\s+(?:informações?|dados?|conteúdo)\s+(?:tem|há|existe|contém)\s+(?:n[oa]|no)/i,
  /\bcompar[ae]\s+(?:os?|as?|esses?|essas?|ambos)/i,
  /\bquais?\s+(?:são\s+)?(?:as?\s+)?diferenças?\s+(?:entre|dentre)/i,
  /\bextra(?:ia|ir)\s+(?:os?\s+)?(?:principais?)/i,
  /\bo\s+que\s+(?:ele|ela|o\s+\w+|a\s+\w+)\s+(?:contém|tem|inclui)/i,
  /\bsobre\s+(?:o\s+)?que\s+(?:é|trata|fala|aborda)/i,
  /\bdo\s+que\s+(?:se\s+)?trata/i,
  // Additional PT content frames for specific patterns
  /\b(?:me\s+)?d[êe]\s+(?:um\s+)?resumo\s+(?:d[oa]\s+)?(?:relatório|documento|apresentação|contrato|planilha)/i,
  /\bliste?\s+(?:os?\s+)?pontos[- ]?chave/i,
  /\bprincipal(?:is)?\s+(?:achados?|mensagens?|pontos?|conclus[õo]es?)\s+(?:d[oa]\s+)?/i,
  /\bconclusões?[- ]?chave/i,
  /\bpontos?[- ]?(?:principais?|chave)/i,
  /\banalise?\s+(?:os?\s+)?(?:dados|resultados|documento|relatório)/i,
  /\bcompar[ae]\s+(?:os?\s+)?(?:dois|duas|relatórios?|documentos?)/i,
  /\bextra(?:ia|ir)\s+(?:os?\s+)?(?:principais?\s+)?(?:argumentos?|pontos?|conclus[õo]es?)/i,
  /\bo\s+que\s+(?:o|a)\s+(?:pdf|documento|arquivo|relatório|planilha|apresentação)\s+(?:diz|fala|menciona)\s+sobre/i,
  /\bme\s+conte\s+sobre\s+(?:o\s+)?(?:conteúdo|documento|relatório|apresentação)/i,
  /\bo\s+que\s+(?:é\s+)?(?:coberto|abordado)\s+(?:n[oa]|no)\s+(?:relatório|documento|apresentação)/i,
  /\bvisão\s+geral\s+(?:d[oa]s?\s+)?(?:termos?|conteúdo|documento|relatório|contrato)/i,
  /\bdetalhe?\s+(?:o|a)\s+(?:relatório|documento|apresentação|contrato)/i,
  /\bo\s+que\s+(?:essa?|est[ae])\s+(?:apresentação|documento|relatório|planilha)\s+(?:contém|tem|inclui)/i,
  /\bo\s+que\s+(?:aparece|consta)\s+(?:n[oa]|no)\s+(?:relatório|documento|apresentação)/i,
  /\bme\s+mostre\s+(?:o\s+)?que\s+(?:o|a)\s+(?:relatório|documento)\s+(?:diz|fala|menciona)/i,
  /\bque\s+informaç(?:ão|ões)\s+(?:você\s+)?(?:pode\s+)?extra(?:ir|ia)/i,
  /\bqual\s+(?:é\s+)?(?:sua\s+)?análise\s+(?:d[oa]s?\s+)?(?:resultados?|documento|relatório)/i,
  /\bsobre\s+o\s+que\s+(?:a|o)\s+(?:apresentação|documento|relatório)\s+(?:fala|trata|aborda)/i,
  /\bo\s+que\s+(?:é\s+)?abordado\s+(?:n[oa]|na|no)\s+(?:apresentação|documento)/i,
  /\bideia\s+principal\s+(?:d[oa]\s+)?(?:texto|documento|relatório|apresentação)/i,
  /\bsíntese\s+(?:d[oa]\s+)?(?:relatório|documento|apresentação|texto)/i,
  /\bque\s+afirmaç(?:ão|ões)\s+(?:o\s+)?(?:autor|documento)\s+(?:faz|fazem)/i,
  /\bdescreva?\s+(?:a\s+)?(?:metodologia|abordagem|estrutura)/i,
];

// Strong file action frames - these are definitive file actions
const STRONG_FILE_ACTION_FRAMES_EN: RegExp[] = [
  /^(?:show|list|display|give\s+me)\s+(?:me\s+)?(?:all\s+)?(?:my\s+)?(?:the\s+)?(?:files?|documents?|pdfs?|folders?)/i,
  /^(?:open|preview|view)\s+(?:the\s+)?(?:file|document|pdf|spreadsheet|presentation)/i,
  /^(?:open|show|preview)\s+it\b/i,
  /\b(?:show|list|filter)\s+(?:only|just)\s+(?:pdfs?|excel|xlsx?|images?|spreadsheets?|presentations?|pptx?)/i,
  /\bhow\s+many\s+(?:files?|documents?|pdfs?)\s+(?:do\s+I\s+have|are\s+there)/i,
  /\b(?:count|number\s+of)\s+(?:my\s+)?(?:files?|documents?|pdfs?)/i,
  /\b(?:sort|order|arrange)\s+(?:by|files?\s+by)\s+(?:date|size|name|type)/i,
  /\b(?:newest|oldest|largest|smallest|recent)\s+(?:files?|documents?)/i,
  /\b(?:files?|documents?)\s+(?:from\s+)?(?:today|yesterday|this\s+week|last\s+week)/i,
  /^(?:find|locate|search\s+for|look\s+for)\s+(?:the\s+)?(?:file|document)\s+/i,
  /\bwhere\s+(?:is|are)\s+(?:my\s+)?(?:the\s+)?\w+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt)\b/i,
  /^(?:delete|remove|rename|move|copy|download|upload|share|archive)\s+(?:the\s+)?(?:file|document)/i,
  /\b(?:go\s+to|navigate\s+to|back\s+to)\s+(?:the\s+)?(?:folder|files?|documents?)/i,
  /\bwhich\s+folder\s+(?:has|contains|is)/i,
  /\b(?:show|list)\s+(?:the\s+)?folders?\b/i,
];

const STRONG_FILE_ACTION_FRAMES_PT: RegExp[] = [
  /^(?:mostre|liste|exiba|dê-me|me\s+dê|me\s+mostre)\s+(?:todos?\s+)?(?:os?\s+)?(?:meus?\s+)?(?:arquivos?|documentos?|pdfs?|pastas?)/i,
  /^(?:abra?|abrir|visualiz[ae]r?|ver|veja)\s+(?:o|a)?\s*(?:arquivo|documento|pdf|planilha|apresentação)/i,
  /^(?:abra?|mostre?|visualiz[ae])\s*-?[oa]?\b/i,
  /\b(?:mostre?|liste?|filtr[ae]r?)\s+(?:apenas|só|somente)\s+(?:pdfs?|excel|xlsx?|imagens?|planilhas?|apresentações?|pptx?)/i,
  /\bquantos?\s+(?:arquivos?|documentos?|pdfs?)\s+(?:eu\s+tenho|existem|há)/i,
  /\b(?:cont[ae]r?|número\s+de)\s+(?:meus?\s+)?(?:arquivos?|documentos?|pdfs?)/i,
  /\b(?:orden[ae]r?|organiz[ae]r?)\s+(?:por)\s+(?:data|tamanho|nome|tipo)/i,
  /\b(?:mais\s+)?(?:recentes?|antigos?|maiores?|menores?)\s+(?:arquivos?|documentos?)/i,
  /\b(?:arquivos?|documentos?)\s+(?:de\s+)?(?:hoje|ontem|esta\s+semana|semana\s+passada)/i,
  /^(?:encontr[ae]r?|localiz[ae]r?|procur[ae]r?|busc[ae]r?)\s+(?:o|a)?\s*(?:arquivo|documento)\s+/i,
  /\bonde\s+(?:está|estão|fica)\s+(?:meu|minha|o|a)?\s*(?:\w+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt)|\w+)\b/i,
  /^(?:delet[ae]r?|remov[ae]r?|apag[ae]r?|renome[ae]r?|mov[ae]r?|copi[ae]r?|baix[ae]r?|envi[ae]r?|compartilh[ae]r?|arquiv[ae]r?)\s+(?:o|a)?\s*(?:arquivo|documento)/i,
  /\b(?:ir\s+para|vá\s+para|navegu[ae]r?\s+para|volt[ae]r?\s+para)\s+(?:a\s+)?(?:pasta|arquivos?|documentos?)/i,
  /\bqual\s+pasta\s+(?:tem|contém|está)/i,
  /\b(?:mostre?|liste?|ver)\s+(?:as?\s+)?pastas?\b/i,
  // Additional PT file action frames for specific patterns
  /\bmostre?\s+apenas\s+(?:os?\s+)?(?:pdfs?|excel|imagens?|planilhas?|apresentações?)/i,
  /\blocalize?\s+(?:o\s+)?(?:contrato|documento|arquivo|relatório)(?:\.pdf|\.docx?|\.xlsx?)?/i,
  /\bme\s+mostre?\s+(?:o\s+)?(?:pdf|documento|contrato|arquivo|relatório)/i,
  /\bencontre?\s+(?:os?\s+|as?\s+)?(?:imagens?|fotos?|png|jpg)\b/i,
  /\bordenar\s+por\s+(?:data|tamanho|nome|tipo)/i,
  /\brecentemente\s+(?:enviados?|adicionados?|carregados?)/i,
  /\bbaix[ae]?\s+(?:o\s+)?(?:pdf|documento|arquivo|relatório)/i,
  /\bv[áa]\s+para\s+(?:a\s+)?pasta/i,
  /\bvisualize?\s+(?:o\s+)?(?:contrato|documento|arquivo|relatório|pdf)/i,
  /\bexiba?\s+(?:o\s+)?(?:relatório|documento|arquivo|pdf)/i,
  /\babra?-[oa]\b/i,
  /\bme\s+mostre?\s+(?:o\s+)?(?:contrato|documento|arquivo|pdf)/i,
  /\b(?:s[óo]|apenas|somente)\s+(?:pdfs?|planilhas?|imagens?|excel)\b/i,
  /\bfiltrar\s+para\s+(?:imagens?|pdfs?|planilhas?|excel)/i,
  /\bprocure?\s+(?:o\s+)?(?:contrato|documento|arquivo|relatório)/i,
  /\barquive?\s+(?:o\s+)?(?:relatório|documento|arquivo)/i,
  /\b(?:mostrar|listar|ver)\s+(?:as?\s+)?pastas?\b/i,
  /\bajude?-me\s+(?:a\s+)?enviar\b/i,
  /\bir\s+para\s+(?:a\s+)?pasta\b/i,
];

/**
 * Detect language from query
 */
function detectLanguage(query: string): LanguageCode {
  const q = query.toLowerCase();

  // PT indicators
  if (/\b(quais?|qual|são|está|onde|você|voce|meus?|minha|documentos?|arquivos?|resuma|explique|analise|tópicos?|páginas?|planilhas?)\b/i.test(q)) {
    return 'pt';
  }

  // ES indicators (minimal support)
  if (/\b(qué|cuál|cuáles|dónde|cómo|archivos?|presenta|explica)\b/i.test(q)) {
    return 'es';
  }

  return 'en';
}

/**
 * Check if query contains words from a set (handles multi-word phrases)
 */
function containsFromSet(text: string, wordSet: Set<string>): boolean {
  const normalized = text.toLowerCase();
  const folded = foldDiacritics(text);

  for (const word of wordSet) {
    const wordLower = word.toLowerCase();
    const wordFolded = foldDiacritics(word);

    // Check both normalized and folded versions
    if (normalized.includes(wordLower) || folded.includes(wordFolded)) {
      return true;
    }
  }
  return false;
}

/**
 * Count signals from vocabulary sets
 */
function countSignals(
  text: string,
  verbs: Set<string>,
  nouns: Set<string>,
  anchors: Set<string>,
  docObjects: Set<string>
): { verbCount: number; nounCount: number; anchorCount: number; docObjCount: number } {
  const normalized = text.toLowerCase();
  const folded = foldDiacritics(text);

  let verbCount = 0;
  let nounCount = 0;
  let anchorCount = 0;
  let docObjCount = 0;

  for (const verb of verbs) {
    const v = verb.toLowerCase();
    const vf = foldDiacritics(verb);
    if (normalized.includes(v) || folded.includes(vf)) verbCount++;
  }

  for (const noun of nouns) {
    const n = noun.toLowerCase();
    const nf = foldDiacritics(noun);
    if (normalized.includes(n) || folded.includes(nf)) nounCount++;
  }

  for (const anchor of anchors) {
    const a = anchor.toLowerCase();
    const af = foldDiacritics(anchor);
    if (normalized.includes(a) || folded.includes(af)) anchorCount++;
  }

  for (const doc of docObjects) {
    const d = doc.toLowerCase();
    const df = foldDiacritics(doc);
    if (normalized.includes(d) || folded.includes(df)) docObjCount++;
  }

  return { verbCount, nounCount, anchorCount, docObjCount };
}

/**
 * Two-signal fallback classification
 * Returns: 'content' | 'file_action' | 'unknown'
 */
function twoSignalFallback(query: string, lang: LanguageCode): 'content' | 'file_action' | 'unknown' {
  const normalized = query.toLowerCase().trim();
  const folded = foldDiacritics(query).trim();

  // Check strong content frames first
  const contentFrames = lang === 'pt'
    ? [...STRONG_CONTENT_FRAMES_PT, ...STRONG_CONTENT_FRAMES_EN]
    : STRONG_CONTENT_FRAMES_EN;

  for (const frame of contentFrames) {
    if (frame.test(normalized) || frame.test(folded)) {
      return 'content';
    }
  }

  // Check strong file action frames
  const fileFrames = lang === 'pt'
    ? [...STRONG_FILE_ACTION_FRAMES_PT, ...STRONG_FILE_ACTION_FRAMES_EN]
    : STRONG_FILE_ACTION_FRAMES_EN;

  for (const frame of fileFrames) {
    if (frame.test(normalized) || frame.test(folded)) {
      return 'file_action';
    }
  }

  // Two-signal scoring
  const contentVerbs = lang === 'pt' ? new Set([...CONTENT_VERBS_EN, ...CONTENT_VERBS_PT]) : CONTENT_VERBS_EN;
  const contentNouns = lang === 'pt' ? new Set([...CONTENT_NOUNS_EN, ...CONTENT_NOUNS_PT]) : CONTENT_NOUNS_EN;
  const anchorNouns = lang === 'pt' ? new Set([...ANCHOR_NOUNS_EN, ...ANCHOR_NOUNS_PT]) : ANCHOR_NOUNS_EN;
  const docObjects = lang === 'pt' ? new Set([...DOCUMENT_OBJECTS_EN, ...DOCUMENT_OBJECTS_PT]) : DOCUMENT_OBJECTS_EN;

  const fileVerbs = lang === 'pt' ? new Set([...FILE_ACTION_VERBS_EN, ...FILE_ACTION_VERBS_PT]) : FILE_ACTION_VERBS_EN;
  const fileNouns = lang === 'pt' ? new Set([...FILE_NOUNS_EN, ...FILE_NOUNS_PT]) : FILE_NOUNS_EN;

  const contentSignals = countSignals(query, contentVerbs, contentNouns, anchorNouns, docObjects);
  const fileSignals = countSignals(query, fileVerbs, fileNouns, new Set(), new Set());

  // Content: verb/noun + (doc object OR anchor OR strong content noun)
  const hasContentIntent = contentSignals.verbCount > 0 || contentSignals.nounCount > 0;
  const hasContentObject = contentSignals.docObjCount > 0 || contentSignals.anchorCount > 0;
  // NEW: Domain-specific content nouns (expense, revenue, clause, etc.) are strong enough alone
  const hasStrongContentNoun = contentSignals.nounCount >= 2; // Multiple content nouns = strong content signal
  const isContentQuestion = hasContentIntent && (hasContentObject || hasStrongContentNoun);

  // File action: file verb + file noun
  const hasFileIntent = fileSignals.verbCount > 0;
  const hasFileObject = fileSignals.nounCount > 0;
  const isFileAction = hasFileIntent && hasFileObject;

  // Tie-breaker rules
  if (isContentQuestion && isFileAction) {
    // If starts with file action verb, check for content signals
    const startsWithFileVerb = /^(show|list|open|filter|sort|group|display|find|locate|mostre|liste|abra|filtre|ordene|agrupe|exiba|encontre|localize)\b/i;
    if (startsWithFileVerb.test(normalized)) {
      // If has anchor noun OR strong content nouns, it's content
      if (contentSignals.anchorCount > 0 || contentSignals.nounCount >= 2) {
        return 'content';
      }
      return 'file_action';
    }
    // Otherwise content wins
    return 'content';
  }

  if (isContentQuestion) return 'content';
  if (isFileAction) return 'file_action';

  return 'unknown';
}

/**
 * Test query against pattern list (both normalized and folded)
 */
function matchesPatterns(query: string, patterns: RegExp[]): boolean {
  const normalized = query.toLowerCase().trim();
  const folded = foldDiacritics(query).trim();

  for (const pattern of patterns) {
    if (pattern.test(normalized) || pattern.test(folded)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a query is a content question (asks ABOUT document content)
 *
 * @param query - The user's query
 * @param language - Language code (en, pt, es) - auto-detected if not provided
 * @returns true if this is a content question, false if it's a file action or unknown
 */
export function isContentQuestion(query: string, language?: LanguageCode): boolean {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 3) return false;

  initializePatterns();

  const lang = language || detectLanguage(q);

  // First check negatives - if negative matches, NOT a content question
  const negativePatterns = lang === 'pt'
    ? [...(negativePatternsPT || []), ...(negativePatternsEN || [])]
    : (negativePatternsEN || []);

  if (matchesPatterns(query, negativePatterns)) {
    return false;
  }

  // Check content patterns from banks
  const contentPatterns = lang === 'pt'
    ? [...(contentPatternsPT || []), ...(contentPatternsEN || [])]
    : (contentPatternsEN || []);

  if (matchesPatterns(query, contentPatterns)) {
    return true;
  }

  // Two-signal fallback
  const fallbackResult = twoSignalFallback(query, lang);
  return fallbackResult === 'content';
}

/**
 * Check if a query is explicitly a file action (navigation/listing)
 */
export function isFileActionQuery(query: string, language?: LanguageCode): boolean {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 3) return false;

  // Content questions take priority - never route to file_actions
  if (isContentQuestion(query, language)) {
    return false;
  }

  initializePatterns();

  const lang = language || detectLanguage(q);

  // Check negative patterns (which are file action indicators)
  const negativePatterns = lang === 'pt'
    ? [...(negativePatternsPT || []), ...(negativePatternsEN || [])]
    : (negativePatternsEN || []);

  if (matchesPatterns(query, negativePatterns)) {
    return true;
  }

  // Two-signal fallback
  const fallbackResult = twoSignalFallback(query, lang);
  return fallbackResult === 'file_action';
}

/**
 * Get detailed classification result
 */
export interface ContentGuardResult {
  isContentQuestion: boolean;
  isFileAction: boolean;
  matchedPattern: string | null;
  matchedFamily: string | null;
  confidence: 'high' | 'medium' | 'low';
  recommendation: 'use_rag' | 'allow_file_action' | 'unknown';
  language: LanguageCode;
  debug?: {
    bankPatternsChecked: number;
    fallbackUsed: boolean;
  };
}

export function classifyQuery(query: string, language?: LanguageCode): ContentGuardResult {
  const q = query.toLowerCase().trim();
  const lang = language || detectLanguage(q);
  const folded = foldDiacritics(q);

  initializePatterns();

  // Check negatives first (file actions)
  const negativePatterns = lang === 'pt'
    ? [...(negativePatternsPT || []), ...(negativePatternsEN || [])]
    : (negativePatternsEN || []);

  for (let i = 0; i < negativePatterns.length; i++) {
    if (negativePatterns[i].test(q) || negativePatterns[i].test(folded)) {
      return {
        isContentQuestion: false,
        isFileAction: true,
        matchedPattern: negativePatterns[i].source.substring(0, 50),
        matchedFamily: `NG-${Math.floor(i / 40) + 1}`,
        confidence: 'high',
        recommendation: 'allow_file_action',
        language: lang,
        debug: { bankPatternsChecked: negativePatterns.length, fallbackUsed: false },
      };
    }
  }

  // Check content patterns
  const contentPatterns = lang === 'pt'
    ? [...(contentPatternsPT || []), ...(contentPatternsEN || [])]
    : (contentPatternsEN || []);

  for (let i = 0; i < contentPatterns.length; i++) {
    if (contentPatterns[i].test(q) || contentPatterns[i].test(folded)) {
      return {
        isContentQuestion: true,
        isFileAction: false,
        matchedPattern: contentPatterns[i].source.substring(0, 50),
        matchedFamily: `CG-${Math.floor(i / 80) + 1}`,
        confidence: 'high',
        recommendation: 'use_rag',
        language: lang,
        debug: { bankPatternsChecked: contentPatterns.length, fallbackUsed: false },
      };
    }
  }

  // Two-signal fallback
  const fallbackResult = twoSignalFallback(query, lang);

  if (fallbackResult === 'content') {
    return {
      isContentQuestion: true,
      isFileAction: false,
      matchedPattern: 'two-signal-fallback',
      matchedFamily: 'FALLBACK',
      confidence: 'medium',
      recommendation: 'use_rag',
      language: lang,
      debug: { bankPatternsChecked: contentPatterns.length + negativePatterns.length, fallbackUsed: true },
    };
  }

  if (fallbackResult === 'file_action') {
    return {
      isContentQuestion: false,
      isFileAction: true,
      matchedPattern: 'two-signal-fallback',
      matchedFamily: 'FALLBACK',
      confidence: 'medium',
      recommendation: 'allow_file_action',
      language: lang,
      debug: { bankPatternsChecked: contentPatterns.length + negativePatterns.length, fallbackUsed: true },
    };
  }

  // Unknown
  return {
    isContentQuestion: false,
    isFileAction: false,
    matchedPattern: null,
    matchedFamily: null,
    confidence: 'low',
    recommendation: 'unknown',
    language: lang,
    debug: { bankPatternsChecked: contentPatterns.length + negativePatterns.length, fallbackUsed: true },
  };
}

/**
 * Reset pattern caches (for testing)
 */
export function resetPatternCache(): void {
  contentPatternsEN = null;
  contentPatternsPT = null;
  negativePatternsEN = null;
  negativePatternsPT = null;
  bankLoadStatus = {
    enContentLoaded: 0,
    ptContentLoaded: 0,
    enNegativeLoaded: 0,
    ptNegativeLoaded: 0,
  };
}

/**
 * Get bank statistics (for debugging/monitoring)
 */
export function getBankStats(): {
  enContent: number;
  ptContent: number;
  enNegative: number;
  ptNegative: number;
  fallbackContent: number;
  fallbackFileAction: number;
} {
  initializePatterns();
  return {
    enContent: contentPatternsEN?.length || 0,
    ptContent: contentPatternsPT?.length || 0,
    enNegative: negativePatternsEN?.length || 0,
    ptNegative: negativePatternsPT?.length || 0,
    fallbackContent: STRONG_CONTENT_FRAMES_EN.length + STRONG_CONTENT_FRAMES_PT.length,
    fallbackFileAction: STRONG_FILE_ACTION_FRAMES_EN.length + STRONG_FILE_ACTION_FRAMES_PT.length,
  };
}

// Export for testing
export const _testExports = {
  loadBankPatterns,
  detectLanguage,
  twoSignalFallback,
  foldDiacritics,
  STRONG_CONTENT_FRAMES_EN,
  STRONG_CONTENT_FRAMES_PT,
  STRONG_FILE_ACTION_FRAMES_EN,
  STRONG_FILE_ACTION_FRAMES_PT,
};
