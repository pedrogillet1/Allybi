/**
 * Koda Retrieval Engine V3 - Production Ready
 *
 * Responsible for retrieving relevant document chunks using hybrid search
 * (vector embeddings + BM25 keyword search).
 *
 * Features:
 * - Hybrid retrieval (vector + keyword)
 * - Intent-aware filtering
 * - Document boosting
 * - Context budgeting
 * - Multilingual support
 * - Query-level caching (Phase 5)
 *
 * Performance: Optimized for low latency with caching
 */

import NodeCache from 'node-cache';
import crypto from 'crypto';
import prisma from '../../config/database';

import type {
  IntentClassificationV3,
  RetrievedChunk,
  RetrievalResult,
} from '../../types/ragV3.types';

import type { EmbeddingService } from '../embedding.service';
import type { PineconeService } from '../pinecone.service';
import { KodaHybridSearchService } from '../retrieval/kodaHybridSearch.service';
import { DynamicDocBoostService, DocumentBoostMap } from '../retrieval/dynamicDocBoost.service';
import { KodaRetrievalRankingService } from '../retrieval/kodaRetrievalRanking.service';
import {
  getTokenBudgetEstimator,
  getContextWindowBudgeting,
} from '../utils';
import {
  detectPageQuery,
  retrieveByPage,
  type LocationChunk,
  type PageQueryResult,
} from '../retrieval/locationAwareRetrieval.service';

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_CHECK_PERIOD = 60; // Check for expired entries every 60s
const CACHE_MAX_KEYS = 500; // Max cached queries

interface CachedRetrievalResult {
  chunks: RetrievedChunk[];
  usedHybrid: boolean;
  boostMap: DocumentBoostMap;
  timestamp: number;
}

type LanguageCode = 'en' | 'pt' | 'es';

// ============================================================================
// TYPES
// ============================================================================

export interface RetrieveParams {
  userId: string;
  query: string;
  intent: IntentClassificationV3;
  context?: any;
  language: LanguageCode;
  documentIds?: string[];
  folderIds?: string[];
  maxChunks?: number;
  /**
   * P0 FIX: Document IDs from previous conversation turns.
   * When present, these documents get boosted to maintain context continuity.
   * This enables follow-up queries like "based on that file" to stay grounded
   * in the same document(s) from the previous turn.
   */
  lastDocumentIds?: string[];
}

// ============================================================================
// KODA RETRIEVAL ENGINE V3
// ============================================================================

export interface RetrievalEngineDependencies {
  hybridSearch: KodaHybridSearchService;
  dynamicDocBoost: DynamicDocBoostService;
  retrievalRanking: KodaRetrievalRankingService;
  embedding: EmbeddingService;
  pinecone: PineconeService;
}

export class KodaRetrievalEngineV3 {
  private defaultMaxChunks = 6; // PHASE 6: Hard limit reduced from 10 to 6
  private maxContextTokens = 3500; // PHASE 6: Hard token budget
  private hybridSearch: KodaHybridSearchService;
  private dynamicDocBoost: DynamicDocBoostService;
  private retrievalRanking: KodaRetrievalRankingService;
  private embedding: EmbeddingService;
  private pinecone: PineconeService;

  // PHASE 5: Query-level retrieval cache
  private retrievalCache: NodeCache;

  constructor(deps: RetrievalEngineDependencies) {
    this.hybridSearch = deps.hybridSearch;
    this.dynamicDocBoost = deps.dynamicDocBoost;
    this.retrievalRanking = deps.retrievalRanking;
    this.embedding = deps.embedding;
    this.pinecone = deps.pinecone;

    // Initialize cache with TTL and max keys
    this.retrievalCache = new NodeCache({
      stdTTL: CACHE_TTL_SECONDS,
      checkperiod: CACHE_CHECK_PERIOD,
      maxKeys: CACHE_MAX_KEYS,
      useClones: false, // Performance: don't clone cached objects
    });

    console.log(`[RetrievalEngine] Cache initialized: TTL=${CACHE_TTL_SECONDS}s, maxKeys=${CACHE_MAX_KEYS}`);
  }

  // ============================================================================
  // CROSS-LINGUAL QUERY EXPANSION (Category 5 Fix)
  // Translates Portuguese/Spanish terms to English equivalents across ALL domains
  // This ensures non-English queries can find English document content
  // ============================================================================
  private static readonly CROSS_LINGUAL_TERMS: Record<string, string> = {
    // ═══════════════════════════════════════════════════════════════════════════
    // FINANCE DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'receita': 'revenue income',
    'receitas': 'revenue income',
    'despesa': 'expense cost',
    'despesas': 'expenses costs',
    'lucro': 'profit earnings',
    'prejuízo': 'loss deficit',
    'margem': 'margin',
    'custo': 'cost expense',
    'custos': 'costs expenses',
    'faturamento': 'billing revenue sales',
    'orçamento': 'budget forecast',
    'previsão': 'forecast projection',
    'trimestre': 'quarter Q1 Q2 Q3 Q4',
    'trimestral': 'quarterly',
    'mensal': 'monthly',
    'anual': 'annual yearly',
    'balanço': 'balance sheet',
    'patrimônio': 'equity net worth',
    'ativo': 'asset',
    'ativos': 'assets',
    'passivo': 'liability',
    'passivos': 'liabilities',
    'caixa': 'cash',
    'fluxo': 'flow',
    'fluxo de caixa': 'cash flow',
    'dívida': 'debt liability',
    'investimento': 'investment',
    'investimentos': 'investments',
    'retorno': 'return ROI',
    'rendimento': 'yield return',
    'juros': 'interest rate',
    'taxa': 'rate fee',
    'impostos': 'taxes',
    'tributos': 'taxes duties',
    'capital': 'capital equity',
    'ação': 'stock share',
    'ações': 'stocks shares',
    'dividendo': 'dividend',
    'dividendos': 'dividends',
    'ebitda': 'EBITDA',
    'resultado': 'result income profit',
    'demonstração': 'statement report',
    'dre': 'income statement P&L',

    // ═══════════════════════════════════════════════════════════════════════════
    // FINANCE DOMAIN (Spanish → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'ingresos': 'revenue income',
    'gastos': 'expenses costs',
    'ganancia': 'profit gain',
    'ganancias': 'profits earnings',
    'pérdida': 'loss',
    'pérdidas': 'losses',
    'presupuesto': 'budget',
    'deuda': 'debt',
    'inversión': 'investment',
    'inversiones': 'investments',
    'activo': 'asset',
    'activos': 'assets',
    'pasivo': 'liability',
    'pasivos': 'liabilities',
    'impuestos': 'taxes',
    'efectivo': 'cash',

    // ═══════════════════════════════════════════════════════════════════════════
    // LEGAL DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'contrato': 'contract agreement',
    'contratos': 'contracts agreements',
    'cláusula': 'clause provision',
    'cláusulas': 'clauses provisions',
    'rescisão': 'termination cancellation',
    'término': 'termination end',
    'prazo': 'term deadline period',
    'vigência': 'validity term period',
    'vencimento': 'expiration maturity due date',
    'assinatura': 'signature execution',
    'partes': 'parties',
    'acordo': 'agreement deal',
    'multa': 'penalty fine',
    'penalidade': 'penalty',
    'indenização': 'indemnity compensation',
    'responsabilidade': 'liability responsibility',
    'garantia': 'warranty guarantee',
    'obrigação': 'obligation duty',
    'obrigações': 'obligations duties',
    'direito': 'right entitlement',
    'direitos': 'rights',
    'propriedade': 'property ownership',
    'licença': 'license permit',
    'confidencialidade': 'confidentiality NDA',
    'não concorrência': 'non-compete',
    'exclusividade': 'exclusivity',
    'arbitragem': 'arbitration',
    'litígio': 'litigation dispute',
    'jurisdição': 'jurisdiction',
    'lei aplicável': 'governing law applicable law',
    'força maior': 'force majeure',
    'notificação': 'notice notification',
    'aditivo': 'amendment addendum',
    'renovação': 'renewal',

    // ═══════════════════════════════════════════════════════════════════════════
    // LEGAL DOMAIN (Spanish → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'contrato': 'contract agreement',
    'cláusula': 'clause provision',
    'rescisión': 'termination',
    'plazo': 'term deadline',
    'vigencia': 'validity term',
    'firma': 'signature',
    'acuerdo': 'agreement',
    'multa': 'penalty fine',
    'garantía': 'warranty guarantee',
    'obligación': 'obligation',
    'derecho': 'right',
    'derechos': 'rights',
    'propiedad': 'property',
    'licencia': 'license',

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCOUNTING DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'débito': 'debit',
    'crédito': 'credit',
    'lançamento': 'entry posting',
    'razão': 'ledger',
    'livro razão': 'general ledger',
    'diário': 'journal',
    'conta': 'account',
    'contas': 'accounts',
    'plano de contas': 'chart of accounts',
    'depreciação': 'depreciation',
    'amortização': 'amortization',
    'provisão': 'provision allowance',
    'provisões': 'provisions allowances',
    'reserva': 'reserve',
    'reservas': 'reserves',
    'conciliação': 'reconciliation',
    'auditoria': 'audit',
    'parecer': 'opinion report',
    'nota fiscal': 'invoice tax invoice',
    'fatura': 'invoice bill',
    'boleto': 'payment slip invoice',
    'recibo': 'receipt',
    'comprovante': 'receipt voucher',
    'extrato': 'statement extract',
    'saldo': 'balance',
    'fechamento': 'closing',
    'encerramento': 'closing period end',

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCOUNTING DOMAIN (Spanish → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'débito': 'debit',
    'crédito': 'credit',
    'asiento': 'entry posting',
    'libro mayor': 'general ledger',
    'cuenta': 'account',
    'cuentas': 'accounts',
    'depreciación': 'depreciation',
    'amortización': 'amortization',
    'provisión': 'provision',
    'auditoría': 'audit',
    'factura': 'invoice',
    'recibo': 'receipt',
    'saldo': 'balance',

    // ═══════════════════════════════════════════════════════════════════════════
    // MEDICAL DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'diagnóstico': 'diagnosis',
    'tratamento': 'treatment therapy',
    'paciente': 'patient',
    'pacientes': 'patients',
    'sintoma': 'symptom',
    'sintomas': 'symptoms',
    'prescrição': 'prescription',
    'medicamento': 'medication drug',
    'medicamentos': 'medications drugs',
    'dosagem': 'dosage dose',
    'posologia': 'dosage regimen',
    'exame': 'exam test examination',
    'exames': 'exams tests',
    'resultado': 'result finding',
    'resultados': 'results findings',
    'prontuário': 'medical record chart',
    'histórico': 'history medical history',
    'cirurgia': 'surgery operation',
    'procedimento': 'procedure',
    'procedimentos': 'procedures',
    'internação': 'hospitalization admission',
    'alta': 'discharge',
    'consulta': 'consultation appointment',
    'consultas': 'consultations appointments',
    'alergia': 'allergy',
    'alergias': 'allergies',
    'vacina': 'vaccine vaccination',
    'vacinas': 'vaccines vaccinations',
    'doença': 'disease illness',
    'doenças': 'diseases illnesses',
    'infecção': 'infection',
    'infecções': 'infections',
    'febre': 'fever',
    'dor': 'pain',
    'pressão': 'pressure blood pressure',
    'glicemia': 'blood sugar glucose',
    'colesterol': 'cholesterol',
    'hemograma': 'blood count CBC',

    // ═══════════════════════════════════════════════════════════════════════════
    // MEDICAL DOMAIN (Spanish → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'diagnóstico': 'diagnosis',
    'tratamiento': 'treatment',
    'paciente': 'patient',
    'síntoma': 'symptom',
    'síntomas': 'symptoms',
    'prescripción': 'prescription',
    'medicamento': 'medication',
    'dosis': 'dose dosage',
    'examen': 'exam test',
    'cirugía': 'surgery',
    'enfermedad': 'disease illness',
    'infección': 'infection',
    'fiebre': 'fever',
    'dolor': 'pain',

    // ═══════════════════════════════════════════════════════════════════════════
    // EXCEL/SPREADSHEET DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'planilha': 'spreadsheet worksheet',
    'planilhas': 'spreadsheets worksheets',
    'célula': 'cell',
    'células': 'cells',
    'coluna': 'column',
    'colunas': 'columns',
    'linha': 'row',
    'linhas': 'rows',
    'tabela': 'table',
    'tabelas': 'tables',
    'gráfico': 'chart graph',
    'gráficos': 'charts graphs',
    'soma': 'sum total',
    'média': 'average mean',
    'total': 'total sum',
    'fórmula': 'formula',
    'fórmulas': 'formulas',
    'filtro': 'filter',
    'filtrar': 'filter',
    'ordenar': 'sort order',
    'classificar': 'sort classify',

    // ═══════════════════════════════════════════════════════════════════════════
    // PROJECT MANAGEMENT DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'projeto': 'project',
    'projetos': 'projects',
    'tarefa': 'task',
    'tarefas': 'tasks',
    'prazo': 'deadline due date',
    'prazos': 'deadlines',
    'entrega': 'delivery deliverable',
    'entregas': 'deliverables',
    'marco': 'milestone',
    'marcos': 'milestones',
    'risco': 'risk',
    'riscos': 'risks',
    'escopo': 'scope',
    'cronograma': 'schedule timeline',
    'equipe': 'team',
    'recurso': 'resource',
    'recursos': 'resources',
    'sprint': 'sprint',
    'backlog': 'backlog',
    'reunião': 'meeting',
    'reuniões': 'meetings',
    'status': 'status',
    'progresso': 'progress',
    'atualização': 'update',

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERAL/DOCUMENT DOMAIN (Portuguese → English)
    // ═══════════════════════════════════════════════════════════════════════════
    'documento': 'document file',
    'documentos': 'documents files',
    'arquivo': 'file document',
    'arquivos': 'files documents',
    'pasta': 'folder directory',
    'pastas': 'folders directories',
    'página': 'page',
    'páginas': 'pages',
    'seção': 'section',
    'seções': 'sections',
    'capítulo': 'chapter',
    'anexo': 'attachment annex',
    'anexos': 'attachments annexes',
    'resumo': 'summary abstract',
    'relatório': 'report',
    'relatórios': 'reports',
    'apresentação': 'presentation',
    'apresentações': 'presentations',
    'imagem': 'image picture',
    'imagens': 'images pictures',
    'foto': 'photo picture',
    'fotos': 'photos pictures',
    'figura': 'figure',
    'figuras': 'figures',
    'título': 'title heading',
    'conteúdo': 'content',
    'índice': 'index table of contents',
    'referência': 'reference',
    'referências': 'references',
    'autor': 'author',
    'autores': 'authors',
    'data': 'date',
    'versão': 'version',
    'atualizado': 'updated',
    'criado': 'created',
    'enviado': 'uploaded sent',
  };

  /**
   * Expand query with English equivalents for cross-lingual retrieval.
   * Appends English terms to the query for hybrid search to find English docs.
   */
  private expandQueryForCrossLingual(query: string, language: LanguageCode): string {
    if (language === 'en') {
      return query; // No expansion needed for English queries
    }

    const queryLower = query.toLowerCase();
    const expansions: string[] = [];

    for (const [term, english] of Object.entries(KodaRetrievalEngineV3.CROSS_LINGUAL_TERMS)) {
      // Check if term appears as a word (not substring)
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(queryLower)) {
        expansions.push(english);
      }
    }

    if (expansions.length > 0) {
      const uniqueExpansions = [...new Set(expansions)];
      const expandedQuery = `${query} ${uniqueExpansions.join(' ')}`;
      console.log(`[CrossLingual] Expanded query: "${query.substring(0, 40)}..." → added: [${uniqueExpansions.join(', ')}]`);
      return expandedQuery;
    }

    return query;
  }

  /**
   * Build cache key from query parameters
   * Key = hash(normalized_query + userId + intent + domain + maxChunks + docCount)
   *
   * IMPORTANT: docCount is included to auto-invalidate cache when user uploads/deletes docs
   */
  private buildCacheKey(params: RetrieveParams, docCount: number): string {
    const normalized = params.query.toLowerCase().trim();
    const keyData = {
      query: normalized,
      userId: params.userId,
      intent: params.intent.primaryIntent,
      domain: params.intent.domain,
      maxChunks: params.maxChunks || this.defaultMaxChunks,
      // P2 FIX: Use spread to copy arrays BEFORE sorting to avoid mutating original order
      // The original order is critical for conversation continuity - first doc = most important
      documentIds: params.documentIds ? [...params.documentIds].sort().join(',') : '',
      docCount, // Cache invalidates when doc count changes
      // P1 FIX: Include lastDocumentIds in cache key to prevent conversation context bypass
      // Without this, follow-up queries (q16, q40) would return cached results without boost
      // P2 FIX: Copy array before sorting to preserve priority order (first = most important)
      lastDocumentIds: params.lastDocumentIds ? [...params.lastDocumentIds].sort().join(',') : '',
    };
    const hash = crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');

    // P1 DEBUG: Log when lastDocumentIds affects cache key
    if (params.lastDocumentIds && params.lastDocumentIds.length > 0) {
      console.log(`[CACHE_KEY] lastDocumentIds included: ${params.lastDocumentIds.length} docs → key=${hash.slice(-8)}`);
    }

    return `retrieval:${hash}`;
  }

  /**
   * Get user's document count for cache key (fast query)
   */
  private async getUserDocCount(userId: string): Promise<number> {
    try {
      const count = await prisma.document.count({ where: { userId } });
      return count;
    } catch {
      return 0; // On error, return 0 (cache will still work, just less precise)
    }
  }

  /**
   * Invalidate all cache entries for a user (call on document upload/delete)
   */
  public invalidateUserCache(userId: string): void {
    const keys = this.retrievalCache.keys();
    let invalidated = 0;
    for (const key of keys) {
      if (key.includes(userId)) {
        this.retrievalCache.del(key);
        invalidated++;
      }
    }
    if (invalidated > 0) {
      console.log(`[CACHE] Invalidated ${invalidated} entries for user ${userId}`);
    }
  }

  /**
   * Retrieve relevant document chunks for a query.
   * Returns an array of RetrievedChunk objects.
   */
  public async retrieve(params: RetrieveParams): Promise<RetrievedChunk[]> {
    const {
      userId,
      query,
      intent,
      documentIds,
      maxChunks = this.defaultMaxChunks,
    } = params;

    if (!userId || !query) {
      return [];
    }

    // Check if we need RAG based on intent
    if (!intent.requiresRAG) {
      return [];
    }

    try {
      // Perform hybrid retrieval using Pinecone vector search
      // with document boosting and context budgeting
      const chunks = await this.performHybridRetrieval(params);

      // Return all budgeted chunks - NO post-budget truncation
      return chunks;
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Retrieval failed:', error);
      return [];
    }
  }

  /**
   * Full retrieval result with metadata (for advanced use cases).
   * FIXED: usedHybrid now reflects actual retrieval path (not hardcoded)
   * FIXED: appliedBoosts now comes directly from boost service (not chunk metadata)
   */
  public async retrieveWithMetadata(params: RetrieveParams): Promise<RetrievalResult> {
    const { result, usedHybrid, boostMap } = await this.retrieveWithHybridFlag(params);

    // Convert boost map to appliedBoosts array (only include non-neutral boosts)
    const appliedBoosts = Object.values(boostMap)
      .filter(boost => boost.factor !== 1.0)
      .map(boost => ({
        documentId: boost.documentId,
        boostFactor: boost.factor,
        reason: boost.reason,
      }));

    return {
      chunks: result,
      usedHybrid,  // FIXED: Now reflects actual retrieval path
      hybridDetails: {
        vectorTopK: params.maxChunks ? params.maxChunks * 2 : 20,
        bm25TopK: usedHybrid ? (params.maxChunks ? params.maxChunks * 2 : 20) : 0,
        mergeStrategy: 'weighted',
      },
      appliedBoosts,
    };
  }

  /**
   * Internal method that returns chunks, whether hybrid was used, and the boost map.
   * PHASE 5: Implements query-level caching for Pinecone results
   */
  private async retrieveWithHybridFlag(params: RetrieveParams): Promise<{ result: RetrievedChunk[], usedHybrid: boolean, boostMap: DocumentBoostMap }> {
    const {
      userId,
      query,
      intent,
      maxChunks = this.defaultMaxChunks,
    } = params;

    if (!userId || !query) {
      return { result: [], usedHybrid: false, boostMap: {} };
    }

    // Check if we need RAG based on intent
    if (!intent.requiresRAG) {
      return { result: [], usedHybrid: false, boostMap: {} };
    }

    // ========================================================================
    // LOCATION-AWARE RETRIEVAL: Check for page-directed queries
    // Patterns: "page 150", "p. 42", "página 150", "pág. 42"
    // ========================================================================
    const pageQueryResult = detectPageQuery(query);
    if (pageQueryResult.detected && pageQueryResult.pageNumber) {
      console.log(`[KodaRetrievalEngineV3] PAGE_LOOKUP mode: page ${pageQueryResult.pageNumber}`);

      try {
        const pageResult = await retrieveByPage({
          userId,
          pageNumber: pageQueryResult.pageNumber,
          documentId: params.documentIds?.[0], // Use first selected doc if any
          maxChunks: maxChunks,
          includeNeighbors: true,
        });

        // Convert LocationChunk[] to RetrievedChunk[]
        const chunks: RetrievedChunk[] = pageResult.chunks.map(chunk => ({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentName: chunk.filename,
          score: chunk.score,
          pageNumber: chunk.pageStart || undefined,
          content: chunk.content,
          metadata: {
            ...chunk.metadata,
            retrievalMethod: 'page-lookup',
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            chunkOrder: chunk.chunkOrder,
            headingPath: chunk.headingPath,
          },
        }));

        console.log(`[KodaRetrievalEngineV3] PAGE_LOOKUP returned ${chunks.length} chunks for page ${pageQueryResult.pageNumber}`);
        return { result: chunks, usedHybrid: false, boostMap: {} };
      } catch (error) {
        console.warn(`[KodaRetrievalEngineV3] PAGE_LOOKUP failed, falling back to hybrid:`, error);
        // Fall through to normal hybrid retrieval
      }
    }

    // PHASE 5: Check cache first (include docCount for auto-invalidation on upload)
    const docCount = await this.getUserDocCount(userId);
    const cacheKey = this.buildCacheKey(params, docCount);
    const cached = this.retrievalCache.get<CachedRetrievalResult>(cacheKey);

    if (cached) {
      const cacheAge = Date.now() - cached.timestamp;
      console.log(`[CACHE] HIT - key=${cacheKey.slice(-8)} age=${Math.round(cacheAge / 1000)}s chunks=${cached.chunks.length}`);
      return { result: cached.chunks, usedHybrid: cached.usedHybrid, boostMap: cached.boostMap };
    }

    console.log(`[CACHE] MISS - key=${cacheKey.slice(-8)}`);

    try {
      // Try hybrid retrieval first
      const { chunks, usedHybrid, boostMap } = await this.performHybridRetrievalWithFlag(params);

      // PHASE 5: Store in cache
      const cacheValue: CachedRetrievalResult = {
        chunks,
        usedHybrid,
        boostMap,
        timestamp: Date.now(),
      };
      this.retrievalCache.set(cacheKey, cacheValue);
      console.log(`[CACHE] SET - key=${cacheKey.slice(-8)} chunks=${chunks.length}`);

      return { result: chunks, usedHybrid, boostMap };
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Retrieval failed:', error);
      return { result: [], usedHybrid: false, boostMap: {} };
    }
  }

  /**
   * Perform hybrid retrieval combining vector search (Pinecone) and BM25 (PostgreSQL).
   * Uses kodaHybridSearchService for combined search with 0.6/0.4 weighting.
   */
  private async performHybridRetrieval(params: RetrieveParams): Promise<RetrievedChunk[]> {
    const { chunks } = await this.performHybridRetrievalWithFlag(params);
    return chunks;
  }

  /**
   * Perform hybrid retrieval with usedHybrid flag tracking.
   * Returns chunks, whether hybrid was actually used, and the applied boost map.
   *
   * GRADE-A FIX #3: Now extracts conversation context from params.context
   * to boost documents referenced in previous turns.
   */
  private async performHybridRetrievalWithFlag(params: RetrieveParams): Promise<{ chunks: RetrievedChunk[], usedHybrid: boolean, boostMap: DocumentBoostMap }> {
    const { userId, query, intent, documentIds, folderIds, maxChunks = this.defaultMaxChunks, context, lastDocumentIds } = params;
    const perfStart = performance.now();

    console.log(`[KodaRetrievalEngineV3] Starting HYBRID retrieval (Vector + BM25) for query: "${query.substring(0, 50)}..."`);

    // ═══════════════════════════════════════════════════════════════════════════
    // P0 FIX: DOCUMENT CONTINUITY BOOST
    // Priority 1: lastDocumentIds from conversation memory (most reliable)
    // Priority 2: context.documents from ConversationContextService
    // Priority 3: Various fallback context fields
    // ═══════════════════════════════════════════════════════════════════════════
    let conversationDocumentIds: string[] = [];

    // P0 FIX: First priority - use lastDocumentIds if passed directly
    if (lastDocumentIds && lastDocumentIds.length > 0) {
      conversationDocumentIds = [...lastDocumentIds];
      console.log(`[KodaRetrievalEngineV3] LAST_DOC_IDS: Using ${conversationDocumentIds.length} document IDs from previous turn for continuity boost`);
    }
    // Second priority: Extract from context
    else if (context) {
      // PRIMARY: Context from ConversationContextService (passed by rag.controller)
      // context.documents is an array of document objects with id/documentId
      if (Array.isArray(context.documents) && context.documents.length > 0) {
        conversationDocumentIds = context.documents
          .map((d: any) => d.id || d.documentId)
          .filter(Boolean);
        console.log(`[KodaRetrievalEngineV3] CONTEXT_DOCS: Found ${conversationDocumentIds.length} docs from context.documents`);
      }
      // FALLBACK: Try various other context fields
      else if (Array.isArray(context.previousDocumentIds)) {
        conversationDocumentIds = context.previousDocumentIds;
      } else if (Array.isArray(context.recentSources)) {
        conversationDocumentIds = context.recentSources
          .filter((s: any) => s.documentId)
          .map((s: any) => s.documentId);
      } else if (Array.isArray(context.conversationHistory)) {
        // Extract doc IDs from conversation history sources
        for (const turn of context.conversationHistory) {
          if (turn.sources && Array.isArray(turn.sources)) {
            for (const source of turn.sources) {
              if (source.documentId) {
                conversationDocumentIds.push(source.documentId);
              }
            }
          }
        }
      } else if (Array.isArray(context.recentMessages)) {
        // Extract doc IDs from recent messages (SSE format)
        for (const msg of context.recentMessages) {
          if (msg.sources && Array.isArray(msg.sources)) {
            for (const source of msg.sources) {
              if (source.documentId) {
                conversationDocumentIds.push(source.documentId);
              }
            }
          }
        }
      }
    }

    // Deduplicate
    conversationDocumentIds = [...new Set(conversationDocumentIds)];
    if (conversationDocumentIds.length > 0) {
      console.log(`[KodaRetrievalEngineV3] DOCUMENT_CONTINUITY_BOOST: Boosting ${conversationDocumentIds.length} documents from previous turn(s)`);
    }

    try {
      // Step 1: Determine document/folder filters from intent
      const targetDocumentIds = documentIds || intent?.target?.documentIds || [];
      const targetFolderIds = folderIds || intent?.target?.folderIds || [];

      // ═══════════════════════════════════════════════════════════════════════════
      // CATEGORY 5 FIX: Cross-lingual query expansion
      // Expand Portuguese/Spanish queries with English equivalents for retrieval
      // This ensures non-English queries can find English document content
      // ═══════════════════════════════════════════════════════════════════════════
      const language = params.language || 'en';
      console.log(`[CrossLingual] Query language: ${language}, query: "${query.substring(0, 50)}..."`);
      const expandedQuery = this.expandQueryForCrossLingual(query, language);
      console.log(`[CrossLingual] Expanded query: "${expandedQuery.substring(0, 80)}..."`);
      console.log(`[CrossLingual] Expansion active: ${expandedQuery !== query}`);

      // Step 2: Perform hybrid search (Vector 0.6 + BM25 0.4)
      // PERF: Reduced topK from maxChunks*2 to maxChunks for faster retrieval
      const t0 = performance.now();
      const hybridResults = await this.hybridSearch.search({
        userId,
        query: expandedQuery,
        filters: {
          userId,
          documentIds: targetDocumentIds,
          folderIds: targetFolderIds,
        },
        vectorTopK: maxChunks,  // PERF: Was maxChunks * 2
        bm25TopK: maxChunks,    // PERF: Was maxChunks * 2
      });
      const hybridSearchMs = performance.now() - t0;
      console.log(`[PERF] hybrid_search_ms: ${hybridSearchMs.toFixed(0)}ms (${hybridResults.length} results)`);

      if (hybridResults.length === 0) {
        console.log('[KodaRetrievalEngineV3] No results from hybrid search');
        return { chunks: [], usedHybrid: true, boostMap: {} };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX for q16/q36/q40: ALWAYS BOOST CONVERSATION DOCS
      // TWO-STAGE APPROACH:
      // 1. Boost existing chunks from conversation docs (3.0x)
      // 2. Inject missing conversation docs if not in results (3.0x)
      // This ensures follow-up queries stay grounded in the right documents
      // ═══════════════════════════════════════════════════════════════════════════
      if (conversationDocumentIds.length > 0) {
        const conversationDocSet = new Set(conversationDocumentIds);
        const retrievedDocIds = new Set(hybridResults.map(c => c.documentId));

        // STAGE 1: Boost ANY existing chunks from conversation docs
        // This ensures conversation docs always rank at top even if retrieved with low score
        let boostCount = 0;
        for (let i = 0; i < hybridResults.length; i++) {
          if (conversationDocSet.has(hybridResults[i].documentId)) {
            hybridResults[i] = {
              ...hybridResults[i],
              score: hybridResults[i].score * 3.0, // Very strong boost (3.0x) for context continuity
              metadata: { ...hybridResults[i].metadata, conversationBoostApplied: true }
            };
            boostCount++;
          }
        }
        if (boostCount > 0) {
          console.log(`[KodaRetrievalEngineV3] CONVERSATION_BOOST: Boosted ${boostCount} existing chunks from conversation docs by 3.0x`);
        }

        // STAGE 2: Inject missing conversation docs (if not in results at all)
        const missingDocIds = conversationDocumentIds.filter(id => !retrievedDocIds.has(id));

        if (missingDocIds.length > 0) {
          console.log(`[KodaRetrievalEngineV3] LAST_DOC_INJECTION: ${missingDocIds.length} conversation docs not in hybrid results, fetching directly`);

          // Fetch chunks for missing documents with high priority
          for (const docId of missingDocIds.slice(0, 2)) { // Limit to top 2 missing docs
            try {
              // First try: Query-based search filtered to this document
              let docChunks = await this.hybridSearch.search({
                userId,
                query,
                filters: {
                  userId,
                  documentIds: [docId], // Filter to just this document
                },
                vectorTopK: 3, // Get top 3 chunks from this doc
                bm25TopK: 3,
              });

              // P1 FIX for q36: If query-based search returns 0 chunks (common for short
              // follow-up queries like "Julho foi um outlier?"), use a generic fallback query
              // This ensures conversation context documents are ALWAYS injected
              if (docChunks.length === 0) {
                console.log(`[KodaRetrievalEngineV3] LAST_DOC_INJECTION: Query "${query.substring(0, 30)}..." returned 0 chunks, trying generic fallback`);
                docChunks = await this.hybridSearch.search({
                  userId,
                  query: 'data content summary overview', // Generic query that matches most doc content
                  filters: {
                    userId,
                    documentIds: [docId],
                  },
                  vectorTopK: 5, // Get more chunks with generic query
                  bm25TopK: 5,
                });
              }

              if (docChunks.length > 0) {
                console.log(`[KodaRetrievalEngineV3] LAST_DOC_INJECTION: Added ${docChunks.length} chunks from doc ${docId.substring(0, 8)}...`);
                // P1 FIX: Very strong boost (3.0x) for conversation continuity docs
                // These are docs from previous turns that the user is likely asking about
                hybridResults.push(...docChunks.map(c => ({
                  ...c,
                  score: c.score * 3.0, // Very strong boost for context continuity
                  metadata: { ...c.metadata, injectedFromLastDoc: true }
                })));
              }
            } catch (err) {
              console.warn(`[KodaRetrievalEngineV3] Failed to fetch chunks for lastDoc ${docId}:`, err);
            }
          }
        }
      }

      // Step 3: Compute dynamic document boosts using dedicated service
      // GRADE-A FIX #3: Pass conversationDocumentIds for context boosting
      const t1 = performance.now();
      const candidateDocumentIds = [...new Set(hybridResults.map(c => c.documentId))];
      const boostMap = await this.dynamicDocBoost.computeBoosts({
        userId,
        intent,
        candidateDocumentIds,
        conversationDocumentIds, // FIX #3: Pass conversation context
      });
      const boostComputeMs = performance.now() - t1;
      console.log(`[PERF] boost_compute_ms: ${boostComputeMs.toFixed(0)}ms (${Object.keys(boostMap).length} docs)`);

      // Step 4: Rank chunks using dedicated ranking service
      const t2 = performance.now();
      const rankedChunks = await this.retrievalRanking.rankChunks({
        query,
        intent,
        chunks: hybridResults.map(chunk => ({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            retrievalMethod: 'hybrid',
          },
        })),
        boostMap,
      });
      const rankingMs = performance.now() - t2;
      console.log(`[PERF] ranking_ms: ${rankingMs.toFixed(0)}ms (${rankedChunks.length} chunks)`);

      // Step 5: Apply context budget to ranked chunks
      const t3 = performance.now();
      const budgetedChunks = this.applyContextBudget(rankedChunks);
      const budgetMs = performance.now() - t3;
      console.log(`[PERF] budget_ms: ${budgetMs.toFixed(0)}ms (${budgetedChunks.length} chunks kept)`);

      // P1 DEBUG: Log final chunk sources to verify context boost worked
      if (conversationDocumentIds.length > 0) {
        const finalDocIds = [...new Set(budgetedChunks.map(c => c.documentId))];
        const contextDocsInFinal = conversationDocumentIds.filter(id => finalDocIds.includes(id));
        const injectedChunks = budgetedChunks.filter(c => c.metadata?.injectedFromLastDoc);
        console.log(`[CONTEXT_BOOST_RESULT] contextDocs: ${conversationDocumentIds.length}, inFinal: ${contextDocsInFinal.length}/${finalDocIds.length}, injected: ${injectedChunks.length}`);
        if (contextDocsInFinal.length === 0 && conversationDocumentIds.length > 0) {
          console.warn(`[CONTEXT_BOOST_WARNING] None of the ${conversationDocumentIds.length} context docs made it to final results!`);
        }
      }

      // Total retrieval time
      const totalRetrievalMs = performance.now() - perfStart;
      console.log(`[PERF] TOTAL_RETRIEVAL_MS: ${totalRetrievalMs.toFixed(0)}ms`);

      return { chunks: budgetedChunks, usedHybrid: true, boostMap };
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Hybrid retrieval failed, falling back to vector-only:', error);
      const vectorChunks = await this.performVectorOnlyRetrieval(params);
      return { chunks: vectorChunks, usedHybrid: false, boostMap: {} };
    }
  }

  /**
   * Fallback to vector-only retrieval if hybrid fails.
   */
  private async performVectorOnlyRetrieval(params: RetrieveParams): Promise<RetrievedChunk[]> {
    const { userId, query, intent, documentIds, folderIds, maxChunks = this.defaultMaxChunks } = params;

    console.log('[KodaRetrievalEngineV3] Falling back to vector-only retrieval...');

    try {
      const embeddingResult = await this.embedding.generateQueryEmbedding(query);
      const queryEmbedding = embeddingResult.embedding;

      if (!queryEmbedding || queryEmbedding.length === 0) {
        return [];
      }

      const targetDocumentId = documentIds?.[0] || intent?.target?.documentIds?.[0];
      const targetFolderId = folderIds?.[0] || intent?.target?.folderIds?.[0];

      const pineconeResults = await this.pinecone.query(queryEmbedding, {
        userId,
        topK: maxChunks * 2,
        minSimilarity: 0.3,
        documentId: targetDocumentId,
        folderId: targetFolderId,
      });

      const chunks: RetrievedChunk[] = pineconeResults.map(result => ({
        chunkId: `${result.documentId}-${result.chunkIndex}`,
        documentId: result.documentId,
        documentName: result.filename || result.metadata?.filename || 'Unknown',
        score: result.similarity,
        pageNumber: result.metadata?.pageNumber,
        slideNumber: result.metadata?.slide,
        content: result.content,
        metadata: {
          ...result.metadata,
          retrievalMethod: 'vector-only',
        },
      }));

      return this.applyContextBudget(chunks.sort((a, b) => b.score - a.score));
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Vector-only retrieval also failed:', error);
      return [];
    }
  }

  /**
   * Calculate boosts  /**
   * Calculate boosts for documents based on intent and context.
   */
  private calculateBoosts(
    intent: IntentClassificationV3,
    documentIds?: string[]
  ): Map<string, number> {
    const boosts = new Map<string, number>();

    // Boost explicitly mentioned documents
    if (intent.target.documentIds) {
      for (const docId of intent.target.documentIds) {
        boosts.set(docId, 1.5);
      }
    }

    // Boost documents from UI selection
    if (documentIds) {
      for (const docId of documentIds) {
        const existing = boosts.get(docId) || 1.0;
        boosts.set(docId, existing * 1.3);
      }
    }

    return boosts;
  }

  /**
   * Apply context budgeting to limit total tokens.
   * PHASE 6: Enforces hard limits for stable TTFC and quality
   *
   * Hard limits:
   * - Max chunks: 6 (this.defaultMaxChunks)
   * - Max tokens: 3500 (this.maxContextTokens)
   *
   * @param chunks - Array of retrieved chunks (already sorted by relevance)
   * @param maxTokens - Maximum tokens allowed for chunks (default: this.maxContextTokens)
   * @param language - Language for token estimation
   * @returns Chunks that fit within the token budget
   */
  private applyContextBudget(
    chunks: RetrievedChunk[],
    maxTokens?: number,
    language?: string
  ): RetrievedChunk[] {
    // PHASE 6: Enforce hard limits
    const hardMaxChunks = this.defaultMaxChunks; // 6
    const hardMaxTokens = maxTokens || this.maxContextTokens; // 3500

    // First, hard limit on chunk count
    const chunkLimited = chunks.slice(0, hardMaxChunks);

    // Extract content strings for budget calculation
    const contentStrings = chunkLimited.map(c => c.content);

    // Use the centralized budget selection service
    const budgetingService = getContextWindowBudgeting();
    const budgetResult = budgetingService.selectChunksWithinBudget(contentStrings, hardMaxTokens, language);

    // Map back to chunks (take the first N that fit within token budget)
    const budgetedChunks = chunkLimited.slice(0, budgetResult.chunksIncluded);

    // PHASE 6: Assert-style budget logging for monitoring
    console.log(
      `[BUDGET] ${budgetedChunks.length} chunks, ${budgetResult.tokensUsed}/${hardMaxTokens} tokens ` +
      `(${((budgetResult.tokensUsed / hardMaxTokens) * 100).toFixed(0)}% of budget)` +
      `${budgetResult.wasTruncated ? ` [TRUNCATED: ${budgetResult.chunksExcluded} excluded]` : ''}`
    );

    return budgetedChunks;
  }

  /**
   * Get estimated total tokens for a set of chunks.
   * Uses TokenBudgetEstimatorService for pre-flight checks before LLM calls.
   */
  public estimateChunkTokens(chunks: RetrievedChunk[], language?: string): number {
    const tokenEstimator = getTokenBudgetEstimator();
    return chunks.reduce((total, chunk) => {
      return total + tokenEstimator.estimateDetailed(chunk.content, language).tokens;
    }, 0);
  }
}

export default KodaRetrievalEngineV3;
