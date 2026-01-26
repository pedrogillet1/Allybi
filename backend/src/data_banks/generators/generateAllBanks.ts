/**
 * Data Bank Generator - Generates all banks per manifest
 * Run: npx ts-node src/data_banks/generators/generateAllBanks.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_BANKS_ROOT = path.join(__dirname, '..');

// ============================================================================
// TRIGGER GENERATORS
// ============================================================================

function generatePrimaryIntents(lang: 'en' | 'pt' | 'es'): object {
  const intents = ['documents', 'file_actions', 'help', 'edit', 'conversation', 'reasoning', 'excel', 'finance', 'legal', 'accounting', 'medical', 'doc_stats'];

  const patterns: Record<string, any> = {};

  for (const intent of intents) {
    patterns[intent] = generateIntentTriggers(intent, lang);
  }

  return {
    bank_id: 'primary_intents',
    language: lang,
    generated: new Date().toISOString(),
    intents: patterns
  };
}

function generateIntentTriggers(intent: string, lang: 'en' | 'pt' | 'es'): object {
  const triggers: string[] = [];
  const patterns: string[] = [];

  // Base triggers per intent
  const baseTriggers: Record<string, Record<string, string[]>> = {
    documents: {
      en: ['summarize', 'summary', 'explain', 'what does', 'tell me about', 'analyze', 'extract', 'key points', 'main ideas', 'overview', 'describe', 'break down', 'highlight', 'outline', 'recap', 'digest', 'brief', 'synopsis', 'gist', 'essence', 'core points', 'takeaways', 'insights', 'findings', 'conclusions', 'what is', 'define', 'meaning of', 'interpretation', 'understanding'],
      pt: ['resumir', 'resumo', 'explicar', 'o que diz', 'fale sobre', 'analisar', 'extrair', 'pontos principais', 'ideias principais', 'visão geral', 'descrever', 'detalhar', 'destacar', 'esboçar', 'recapitular', 'síntese', 'breve', 'sinopse', 'essência', 'pontos-chave', 'conclusões', 'insights', 'achados', 'o que é', 'definir', 'significado de', 'interpretação', 'entendimento'],
      es: ['resumir', 'resumen', 'explicar', 'qué dice', 'cuéntame sobre', 'analizar', 'extraer', 'puntos principales', 'ideas principales', 'visión general', 'describir', 'detallar', 'destacar', 'esbozar', 'recapitular', 'síntesis', 'breve', 'sinopsis', 'esencia', 'puntos clave', 'conclusiones', 'insights', 'hallazgos', 'qué es', 'definir', 'significado de', 'interpretación', 'entendimiento']
    },
    file_actions: {
      en: ['open', 'show', 'where is', 'find file', 'locate', 'list files', 'my files', 'documents list', 'show me', 'display', 'open file', 'where can i find', 'which folder', 'path to', 'open it', 'show it', 'filter by', 'only pdf', 'only excel', 'sort by', 'newest', 'largest', 'oldest', 'smallest', 'group by', 'organize by', 'files in folder', 'folder contents'],
      pt: ['abrir', 'mostrar', 'onde está', 'encontrar arquivo', 'localizar', 'listar arquivos', 'meus arquivos', 'lista de documentos', 'me mostre', 'exibir', 'abrir arquivo', 'onde posso encontrar', 'qual pasta', 'caminho para', 'abra isso', 'mostre isso', 'filtrar por', 'apenas pdf', 'apenas excel', 'ordenar por', 'mais recente', 'maior', 'mais antigo', 'menor', 'agrupar por', 'organizar por', 'arquivos na pasta', 'conteúdo da pasta'],
      es: ['abrir', 'mostrar', 'dónde está', 'encontrar archivo', 'localizar', 'listar archivos', 'mis archivos', 'lista de documentos', 'muéstrame', 'mostrar', 'abrir archivo', 'dónde puedo encontrar', 'qué carpeta', 'ruta a', 'ábrelo', 'muéstralo', 'filtrar por', 'solo pdf', 'solo excel', 'ordenar por', 'más reciente', 'más grande', 'más antiguo', 'más pequeño', 'agrupar por', 'organizar por', 'archivos en carpeta', 'contenido de carpeta']
    },
    help: {
      en: ['how do i', 'how to', 'can you help', 'what can you do', 'capabilities', 'features', 'tutorial', 'guide', 'instructions', 'help me', 'assist', 'support', 'walkthrough', 'getting started', 'how does', 'explain how', 'teach me', 'show me how'],
      pt: ['como faço', 'como', 'pode me ajudar', 'o que você pode fazer', 'capacidades', 'recursos', 'tutorial', 'guia', 'instruções', 'me ajude', 'assistir', 'suporte', 'passo a passo', 'começando', 'como funciona', 'explique como', 'me ensine', 'mostre como'],
      es: ['cómo hago', 'cómo', 'puedes ayudarme', 'qué puedes hacer', 'capacidades', 'características', 'tutorial', 'guía', 'instrucciones', 'ayúdame', 'asistir', 'soporte', 'paso a paso', 'comenzando', 'cómo funciona', 'explica cómo', 'enséñame', 'muéstrame cómo']
    },
    edit: {
      en: ['rewrite', 'rephrase', 'simplify', 'expand', 'shorten', 'translate', 'make it shorter', 'make it longer', 'make it simpler', 'paraphrase', 'reword', 'revise', 'edit this', 'improve', 'polish', 'refine', 'condense', 'elaborate'],
      pt: ['reescrever', 'reformular', 'simplificar', 'expandir', 'encurtar', 'traduzir', 'faça mais curto', 'faça mais longo', 'faça mais simples', 'parafrasear', 'reformular', 'revisar', 'editar isso', 'melhorar', 'polir', 'refinar', 'condensar', 'elaborar'],
      es: ['reescribir', 'reformular', 'simplificar', 'expandir', 'acortar', 'traducir', 'hazlo más corto', 'hazlo más largo', 'hazlo más simple', 'parafrasear', 'reformular', 'revisar', 'editar esto', 'mejorar', 'pulir', 'refinar', 'condensar', 'elaborar']
    },
    finance: {
      en: ['ebitda', 'net income', 'revenue', 'profit', 'margin', 'gross margin', 'operating income', 'cash flow', 'balance sheet', 'income statement', 'p&l', 'profit and loss', 'financial', 'quarterly', 'annual', 'ytd', 'year to date', 'mtd', 'month to date', 'variance', 'budget vs actual', 'forecast', 'projection'],
      pt: ['ebitda', 'lucro líquido', 'receita', 'lucro', 'margem', 'margem bruta', 'lucro operacional', 'fluxo de caixa', 'balanço', 'demonstração de resultados', 'dre', 'resultado', 'financeiro', 'trimestral', 'anual', 'acumulado no ano', 'acumulado no mês', 'variação', 'orçado vs realizado', 'previsão', 'projeção'],
      es: ['ebitda', 'ingreso neto', 'ingresos', 'ganancia', 'margen', 'margen bruto', 'ingreso operativo', 'flujo de caja', 'balance', 'estado de resultados', 'pyg', 'resultado', 'financiero', 'trimestral', 'anual', 'acumulado del año', 'acumulado del mes', 'variación', 'presupuestado vs real', 'pronóstico', 'proyección']
    },
    excel: {
      en: ['spreadsheet', 'worksheet', 'sheet', 'column', 'row', 'cell', 'formula', 'pivot', 'chart', 'graph', 'table', 'sum', 'average', 'vlookup', 'filter', 'sort', 'range', 'data', 'total', 'subtotal', 'excel file'],
      pt: ['planilha', 'folha', 'aba', 'coluna', 'linha', 'célula', 'fórmula', 'tabela dinâmica', 'gráfico', 'tabela', 'soma', 'média', 'procv', 'filtrar', 'ordenar', 'intervalo', 'dados', 'total', 'subtotal', 'arquivo excel'],
      es: ['hoja de cálculo', 'hoja', 'pestaña', 'columna', 'fila', 'celda', 'fórmula', 'tabla dinámica', 'gráfico', 'tabla', 'suma', 'promedio', 'buscarv', 'filtrar', 'ordenar', 'rango', 'datos', 'total', 'subtotal', 'archivo excel']
    },
    legal: {
      en: ['clause', 'contract', 'agreement', 'term', 'condition', 'liability', 'penalty', 'termination', 'indemnification', 'warranty', 'confidentiality', 'obligation', 'breach', 'force majeure', 'jurisdiction', 'governing law', 'dispute', 'arbitration', 'amendment', 'effective date'],
      pt: ['cláusula', 'contrato', 'acordo', 'termo', 'condição', 'responsabilidade', 'penalidade', 'rescisão', 'indenização', 'garantia', 'confidencialidade', 'obrigação', 'violação', 'força maior', 'jurisdição', 'lei aplicável', 'disputa', 'arbitragem', 'emenda', 'data de vigência'],
      es: ['cláusula', 'contrato', 'acuerdo', 'término', 'condición', 'responsabilidad', 'penalidad', 'terminación', 'indemnización', 'garantía', 'confidencialidad', 'obligación', 'incumplimiento', 'fuerza mayor', 'jurisdicción', 'ley aplicable', 'disputa', 'arbitraje', 'enmienda', 'fecha efectiva']
    },
    accounting: {
      en: ['general ledger', 'trial balance', 'journal entry', 'accounts payable', 'accounts receivable', 'depreciation', 'amortization', 'accrual', 'deferred', 'prepaid', 'reconciliation', 'audit', 'posting', 'debit', 'credit', 'chart of accounts', 'gl', 'ap', 'ar'],
      pt: ['razão geral', 'balancete', 'lançamento', 'contas a pagar', 'contas a receber', 'depreciação', 'amortização', 'provisão', 'diferido', 'antecipado', 'conciliação', 'auditoria', 'lançamento', 'débito', 'crédito', 'plano de contas'],
      es: ['libro mayor', 'balance de comprobación', 'asiento contable', 'cuentas por pagar', 'cuentas por cobrar', 'depreciación', 'amortización', 'devengo', 'diferido', 'anticipado', 'conciliación', 'auditoría', 'registro', 'débito', 'crédito', 'plan de cuentas']
    },
    medical: {
      en: ['diagnosis', 'symptom', 'medication', 'prescription', 'lab result', 'vital signs', 'blood pressure', 'heart rate', 'temperature', 'allergy', 'procedure', 'treatment', 'dosage', 'patient', 'condition', 'history', 'examination', 'test result'],
      pt: ['diagnóstico', 'sintoma', 'medicamento', 'receita', 'resultado de exame', 'sinais vitais', 'pressão arterial', 'frequência cardíaca', 'temperatura', 'alergia', 'procedimento', 'tratamento', 'dosagem', 'paciente', 'condição', 'histórico', 'exame', 'resultado de teste'],
      es: ['diagnóstico', 'síntoma', 'medicamento', 'receta', 'resultado de laboratorio', 'signos vitales', 'presión arterial', 'frecuencia cardíaca', 'temperatura', 'alergia', 'procedimiento', 'tratamiento', 'dosis', 'paciente', 'condición', 'historial', 'examen', 'resultado de prueba']
    },
    conversation: {
      en: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you', 'thanks', 'thank you', 'bye', 'goodbye', 'see you', 'nice', 'great', 'cool', 'awesome', 'ok', 'okay', 'sure', 'yes', 'no', 'maybe'],
      pt: ['olá', 'oi', 'e aí', 'bom dia', 'boa tarde', 'boa noite', 'como você está', 'obrigado', 'tchau', 'até logo', 'legal', 'ótimo', 'beleza', 'ok', 'sim', 'não', 'talvez'],
      es: ['hola', 'hey', 'buenos días', 'buenas tardes', 'buenas noches', 'cómo estás', 'gracias', 'adiós', 'hasta luego', 'genial', 'excelente', 'ok', 'sí', 'no', 'quizás']
    },
    reasoning: {
      en: ['why', 'explain why', 'reason', 'because', 'therefore', 'thus', 'hence', 'logic', 'logical', 'step by step', 'breakdown', 'analyze', 'deduce', 'infer', 'conclude', 'implication', 'consequence', 'pros and cons', 'advantages', 'disadvantages'],
      pt: ['por que', 'explique por que', 'razão', 'porque', 'portanto', 'assim', 'logo', 'lógica', 'lógico', 'passo a passo', 'decompor', 'analisar', 'deduzir', 'inferir', 'concluir', 'implicação', 'consequência', 'prós e contras', 'vantagens', 'desvantagens'],
      es: ['por qué', 'explica por qué', 'razón', 'porque', 'por lo tanto', 'así', 'luego', 'lógica', 'lógico', 'paso a paso', 'desglosar', 'analizar', 'deducir', 'inferir', 'concluir', 'implicación', 'consecuencia', 'pros y contras', 'ventajas', 'desventajas']
    },
    doc_stats: {
      en: ['how many pages', 'page count', 'word count', 'number of pages', 'how long is', 'document length', 'slides', 'sheets', 'rows', 'columns', 'file size', 'metadata', 'created date', 'modified date', 'author', 'properties'],
      pt: ['quantas páginas', 'contagem de páginas', 'contagem de palavras', 'número de páginas', 'qual o tamanho', 'tamanho do documento', 'slides', 'planilhas', 'linhas', 'colunas', 'tamanho do arquivo', 'metadados', 'data de criação', 'data de modificação', 'autor', 'propriedades'],
      es: ['cuántas páginas', 'conteo de páginas', 'conteo de palabras', 'número de páginas', 'qué tan largo es', 'longitud del documento', 'diapositivas', 'hojas', 'filas', 'columnas', 'tamaño del archivo', 'metadatos', 'fecha de creación', 'fecha de modificación', 'autor', 'propiedades']
    }
  };

  // Get base triggers for this intent and language
  const base = baseTriggers[intent]?.[lang] || [];
  triggers.push(...base);

  // Generate variations
  for (const trigger of base) {
    // Add question forms
    if (lang === 'en') {
      patterns.push(`\\b${trigger}\\b`);
      triggers.push(`can you ${trigger}`);
      triggers.push(`please ${trigger}`);
      triggers.push(`i want to ${trigger}`);
      triggers.push(`i need to ${trigger}`);
    } else if (lang === 'pt') {
      patterns.push(`\\b${trigger}\\b`);
      triggers.push(`pode ${trigger}`);
      triggers.push(`por favor ${trigger}`);
      triggers.push(`quero ${trigger}`);
      triggers.push(`preciso ${trigger}`);
    } else {
      patterns.push(`\\b${trigger}\\b`);
      triggers.push(`puedes ${trigger}`);
      triggers.push(`por favor ${trigger}`);
      triggers.push(`quiero ${trigger}`);
      triggers.push(`necesito ${trigger}`);
    }
  }

  return {
    triggers: [...new Set(triggers)],
    patterns: [...new Set(patterns)],
    count: triggers.length + patterns.length
  };
}

// ============================================================================
// SUBINTENT TRIGGER GENERATORS
// ============================================================================

function generateDocumentsSubintents(lang: 'en' | 'pt' | 'es'): object {
  const subintents: Record<string, Record<string, string[]>> = {
    factual: {
      en: ['what is', 'what are', 'who is', 'who are', 'when was', 'when did', 'where is', 'where was', 'how much', 'how many', 'tell me', 'give me', 'whats the', 'name of', 'value of', 'amount of', 'date of', 'number of', 'percentage of', 'rate of'],
      pt: ['o que é', 'o que são', 'quem é', 'quem são', 'quando foi', 'quando', 'onde está', 'onde foi', 'quanto', 'quantos', 'me diga', 'me dê', 'qual o', 'nome de', 'valor de', 'quantidade de', 'data de', 'número de', 'porcentagem de', 'taxa de'],
      es: ['qué es', 'qué son', 'quién es', 'quiénes son', 'cuándo fue', 'cuándo', 'dónde está', 'dónde fue', 'cuánto', 'cuántos', 'dime', 'dame', 'cuál es el', 'nombre de', 'valor de', 'cantidad de', 'fecha de', 'número de', 'porcentaje de', 'tasa de']
    },
    summary: {
      en: ['summarize', 'summary', 'overview', 'brief', 'recap', 'gist', 'synopsis', 'digest', 'highlights', 'key points', 'main points', 'main ideas', 'takeaways', 'essence', 'core', 'nutshell', 'bottom line', 'high level', 'executive summary', 'tl;dr'],
      pt: ['resumir', 'resumo', 'visão geral', 'breve', 'recapitular', 'essência', 'sinopse', 'digestão', 'destaques', 'pontos-chave', 'pontos principais', 'ideias principais', 'conclusões', 'essencial', 'núcleo', 'em poucas palavras', 'linha de fundo', 'alto nível', 'resumo executivo'],
      es: ['resumir', 'resumen', 'visión general', 'breve', 'recapitular', 'esencia', 'sinopsis', 'digest', 'aspectos destacados', 'puntos clave', 'puntos principales', 'ideas principales', 'conclusiones', 'esencial', 'núcleo', 'en pocas palabras', 'línea de fondo', 'alto nivel', 'resumen ejecutivo']
    },
    compare: {
      en: ['compare', 'comparison', 'versus', 'vs', 'differ', 'difference', 'contrast', 'similarities', 'common', 'between', 'against', 'relative to', 'compared to', 'side by side', 'head to head', 'benchmark', 'match up'],
      pt: ['comparar', 'comparação', 'versus', 'vs', 'diferir', 'diferença', 'contrastar', 'semelhanças', 'comum', 'entre', 'contra', 'relativo a', 'comparado a', 'lado a lado', 'frente a frente', 'benchmark', 'confrontar'],
      es: ['comparar', 'comparación', 'versus', 'vs', 'diferir', 'diferencia', 'contrastar', 'similitudes', 'común', 'entre', 'contra', 'relativo a', 'comparado con', 'lado a lado', 'cara a cara', 'benchmark', 'confrontar']
    },
    extract: {
      en: ['extract', 'pull out', 'get', 'grab', 'find', 'identify', 'list', 'enumerate', 'pick out', 'gather', 'collect', 'retrieve', 'isolate', 'pinpoint', 'spot', 'highlight', 'cite', 'quote'],
      pt: ['extrair', 'tirar', 'obter', 'pegar', 'encontrar', 'identificar', 'listar', 'enumerar', 'selecionar', 'reunir', 'coletar', 'recuperar', 'isolar', 'identificar', 'destacar', 'destacar', 'citar', 'cotar'],
      es: ['extraer', 'sacar', 'obtener', 'tomar', 'encontrar', 'identificar', 'listar', 'enumerar', 'seleccionar', 'reunir', 'recoger', 'recuperar', 'aislar', 'identificar', 'destacar', 'resaltar', 'citar', 'cotizar']
    },
    search: {
      en: ['search', 'find', 'look for', 'locate', 'where does', 'mention', 'reference', 'talk about', 'discuss', 'address', 'cover', 'contain', 'include', 'speak about', 'refer to'],
      pt: ['pesquisar', 'buscar', 'procurar', 'localizar', 'onde fala', 'mencionar', 'referência', 'falar sobre', 'discutir', 'abordar', 'cobrir', 'conter', 'incluir', 'falar sobre', 'referir a'],
      es: ['buscar', 'encontrar', 'buscar', 'localizar', 'dónde habla', 'mencionar', 'referencia', 'hablar de', 'discutir', 'abordar', 'cubrir', 'contener', 'incluir', 'hablar de', 'referirse a']
    },
    analytics: {
      en: ['analyze', 'analysis', 'insight', 'trend', 'pattern', 'distribution', 'breakdown', 'statistics', 'metrics', 'performance', 'assessment', 'evaluation', 'review', 'examine', 'study'],
      pt: ['analisar', 'análise', 'insight', 'tendência', 'padrão', 'distribuição', 'desdobramento', 'estatísticas', 'métricas', 'desempenho', 'avaliação', 'avaliação', 'revisão', 'examinar', 'estudar'],
      es: ['analizar', 'análisis', 'insight', 'tendencia', 'patrón', 'distribución', 'desglose', 'estadísticas', 'métricas', 'rendimiento', 'evaluación', 'evaluación', 'revisión', 'examinar', 'estudiar']
    },
    explain: {
      en: ['explain', 'clarify', 'elaborate', 'describe', 'define', 'meaning', 'interpret', 'break down', 'simplify', 'what does it mean', 'help me understand', 'in other words', 'put simply'],
      pt: ['explicar', 'esclarecer', 'elaborar', 'descrever', 'definir', 'significado', 'interpretar', 'decompor', 'simplificar', 'o que significa', 'me ajude a entender', 'em outras palavras', 'de forma simples'],
      es: ['explicar', 'aclarar', 'elaborar', 'describir', 'definir', 'significado', 'interpretar', 'desglosar', 'simplificar', 'qué significa', 'ayúdame a entender', 'en otras palabras', 'de forma simple']
    },
    locate_in_doc: {
      en: ['where in the document', 'which page', 'which section', 'find where', 'locate where', 'part of document', 'which paragraph', 'where does it say', 'where is it mentioned'],
      pt: ['onde no documento', 'qual página', 'qual seção', 'encontrar onde', 'localizar onde', 'parte do documento', 'qual parágrafo', 'onde diz', 'onde é mencionado'],
      es: ['dónde en el documento', 'qué página', 'qué sección', 'encontrar dónde', 'localizar dónde', 'parte del documento', 'qué párrafo', 'dónde dice', 'dónde se menciona']
    }
  };

  const result: Record<string, any> = {};
  for (const [subintent, triggers] of Object.entries(subintents)) {
    result[subintent] = {
      triggers: triggers[lang] || [],
      patterns: (triggers[lang] || []).map(t => `\\b${escapeRegex(t)}\\b`),
      count: (triggers[lang] || []).length
    };
  }

  return {
    bank_id: 'documents_subintents',
    language: lang,
    generated: new Date().toISOString(),
    subintents: result,
    total_count: Object.values(result).reduce((acc: number, s: any) => acc + s.count, 0)
  };
}

function generateFileActionsSubintents(lang: 'en' | 'pt' | 'es'): object {
  const subintents: Record<string, Record<string, string[]>> = {
    open: {
      en: ['open', 'open file', 'open the', 'open it', 'launch', 'start', 'view', 'preview', 'display'],
      pt: ['abrir', 'abrir arquivo', 'abrir o', 'abra isso', 'lançar', 'iniciar', 'visualizar', 'prévia', 'exibir'],
      es: ['abrir', 'abrir archivo', 'abrir el', 'ábrelo', 'lanzar', 'iniciar', 'ver', 'vista previa', 'mostrar']
    },
    show: {
      en: ['show', 'show me', 'display', 'present', 'reveal', 'let me see', 'can i see', 'show it'],
      pt: ['mostrar', 'me mostre', 'exibir', 'apresentar', 'revelar', 'deixe-me ver', 'posso ver', 'mostre isso'],
      es: ['mostrar', 'muéstrame', 'mostrar', 'presentar', 'revelar', 'déjame ver', 'puedo ver', 'muéstralo']
    },
    locate: {
      en: ['where is', 'where are', 'find', 'locate', 'which folder', 'path to', 'location of', 'where can i find', 'directory of'],
      pt: ['onde está', 'onde estão', 'encontrar', 'localizar', 'qual pasta', 'caminho para', 'localização de', 'onde posso encontrar', 'diretório de'],
      es: ['dónde está', 'dónde están', 'encontrar', 'localizar', 'qué carpeta', 'ruta a', 'ubicación de', 'dónde puedo encontrar', 'directorio de']
    },
    list: {
      en: ['list', 'list files', 'show all', 'all files', 'my files', 'my documents', 'what files', 'files i have', 'inventory'],
      pt: ['listar', 'listar arquivos', 'mostrar todos', 'todos os arquivos', 'meus arquivos', 'meus documentos', 'quais arquivos', 'arquivos que tenho', 'inventário'],
      es: ['listar', 'listar archivos', 'mostrar todos', 'todos los archivos', 'mis archivos', 'mis documentos', 'qué archivos', 'archivos que tengo', 'inventario']
    },
    filter: {
      en: ['only', 'just', 'filter', 'filter by', 'only show', 'only pdf', 'only excel', 'only images', 'only documents', 'type is'],
      pt: ['apenas', 'só', 'filtrar', 'filtrar por', 'mostrar apenas', 'apenas pdf', 'apenas excel', 'apenas imagens', 'apenas documentos', 'tipo é'],
      es: ['solo', 'sólo', 'filtrar', 'filtrar por', 'mostrar solo', 'solo pdf', 'solo excel', 'solo imágenes', 'solo documentos', 'tipo es']
    },
    sort: {
      en: ['sort', 'sort by', 'order by', 'newest', 'oldest', 'largest', 'smallest', 'alphabetical', 'most recent', 'by date', 'by size', 'by name'],
      pt: ['ordenar', 'ordenar por', 'ordenar por', 'mais recente', 'mais antigo', 'maior', 'menor', 'alfabético', 'mais recente', 'por data', 'por tamanho', 'por nome'],
      es: ['ordenar', 'ordenar por', 'ordenar por', 'más reciente', 'más antiguo', 'más grande', 'más pequeño', 'alfabético', 'más reciente', 'por fecha', 'por tamaño', 'por nombre']
    },
    group: {
      en: ['group', 'group by', 'organize by', 'categorize', 'by folder', 'by type', 'by extension', 'folders'],
      pt: ['agrupar', 'agrupar por', 'organizar por', 'categorizar', 'por pasta', 'por tipo', 'por extensão', 'pastas'],
      es: ['agrupar', 'agrupar por', 'organizar por', 'categorizar', 'por carpeta', 'por tipo', 'por extensión', 'carpetas']
    },
    topic_search: {
      en: ['files about', 'documents about', 'related to', 'concerning', 'regarding', 'on topic', 'about topic', 'containing'],
      pt: ['arquivos sobre', 'documentos sobre', 'relacionado a', 'concernente', 'referente', 'sobre o tópico', 'sobre o tema', 'contendo'],
      es: ['archivos sobre', 'documentos sobre', 'relacionado con', 'concerniente', 'referente', 'sobre el tema', 'sobre el tema', 'conteniendo']
    },
    disambiguate: {
      en: ['which one', 'which file', 'the first', 'the second', 'this one', 'that one', 'the one called', 'the one named'],
      pt: ['qual', 'qual arquivo', 'o primeiro', 'o segundo', 'este', 'aquele', 'o chamado', 'o nomeado'],
      es: ['cuál', 'qué archivo', 'el primero', 'el segundo', 'este', 'ese', 'el llamado', 'el nombrado']
    },
    count: {
      en: ['how many', 'count', 'number of', 'total files', 'total documents', 'file count', 'quantity'],
      pt: ['quantos', 'contar', 'número de', 'total de arquivos', 'total de documentos', 'contagem de arquivos', 'quantidade'],
      es: ['cuántos', 'contar', 'número de', 'total de archivos', 'total de documentos', 'conteo de archivos', 'cantidad']
    }
  };

  const result: Record<string, any> = {};
  for (const [subintent, triggers] of Object.entries(subintents)) {
    result[subintent] = {
      triggers: triggers[lang] || [],
      patterns: (triggers[lang] || []).map(t => `\\b${escapeRegex(t)}\\b`),
      count: (triggers[lang] || []).length
    };
  }

  return {
    bank_id: 'file_actions_subintents',
    language: lang,
    generated: new Date().toISOString(),
    subintents: result,
    total_count: Object.values(result).reduce((acc: number, s: any) => acc + s.count, 0)
  };
}

function generateDomainSubintents(domain: string, lang: 'en' | 'pt' | 'es'): object {
  const domainSubintents: Record<string, Record<string, Record<string, string[]>>> = {
    excel: {
      sheets: { en: ['sheet', 'worksheet', 'tab', 'spreadsheet'], pt: ['planilha', 'aba', 'folha'], es: ['hoja', 'pestaña', 'hoja de cálculo'] },
      columns: { en: ['column', 'columns', 'field', 'header'], pt: ['coluna', 'colunas', 'campo', 'cabeçalho'], es: ['columna', 'columnas', 'campo', 'encabezado'] },
      formulas: { en: ['formula', 'function', 'calculate', 'computation'], pt: ['fórmula', 'função', 'calcular', 'cálculo'], es: ['fórmula', 'función', 'calcular', 'cálculo'] },
      totals: { en: ['total', 'sum', 'subtotal', 'grand total'], pt: ['total', 'soma', 'subtotal', 'total geral'], es: ['total', 'suma', 'subtotal', 'total general'] },
      pivots: { en: ['pivot', 'pivot table', 'cross-tab'], pt: ['tabela dinâmica', 'pivot', 'tabulação cruzada'], es: ['tabla dinámica', 'pivot', 'tabulación cruzada'] },
      charts: { en: ['chart', 'graph', 'visualization', 'plot'], pt: ['gráfico', 'visualização', 'plotagem'], es: ['gráfico', 'visualización', 'diagrama'] },
      filters: { en: ['filter', 'autofilter', 'sort', 'filtered'], pt: ['filtro', 'autofiltro', 'ordenar', 'filtrado'], es: ['filtro', 'autofiltro', 'ordenar', 'filtrado'] },
      ranges: { en: ['range', 'cell', 'selection', 'area'], pt: ['intervalo', 'célula', 'seleção', 'área'], es: ['rango', 'celda', 'selección', 'área'] }
    },
    finance: {
      ebitda: { en: ['ebitda', 'earnings before interest', 'operating cash flow proxy'], pt: ['ebitda', 'lajida', 'lucro antes de juros'], es: ['ebitda', 'beneficio antes de intereses'] },
      net_income: { en: ['net income', 'net profit', 'bottom line', 'profit after tax'], pt: ['lucro líquido', 'resultado líquido', 'lucro final'], es: ['ingreso neto', 'ganancia neta', 'beneficio neto'] },
      revenue: { en: ['revenue', 'sales', 'top line', 'income', 'turnover'], pt: ['receita', 'vendas', 'faturamento'], es: ['ingresos', 'ventas', 'facturación'] },
      trends: { en: ['trend', 'growth', 'decline', 'trajectory', 'direction'], pt: ['tendência', 'crescimento', 'declínio', 'trajetória'], es: ['tendencia', 'crecimiento', 'declive', 'trayectoria'] },
      outliers: { en: ['outlier', 'anomaly', 'unusual', 'spike', 'deviation'], pt: ['outlier', 'anomalia', 'incomum', 'pico', 'desvio'], es: ['atípico', 'anomalía', 'inusual', 'pico', 'desviación'] },
      ratios: { en: ['ratio', 'multiple', 'proportion', 'percentage'], pt: ['razão', 'múltiplo', 'proporção', 'porcentagem'], es: ['ratio', 'múltiplo', 'proporción', 'porcentaje'] },
      margins: { en: ['margin', 'gross margin', 'operating margin', 'net margin'], pt: ['margem', 'margem bruta', 'margem operacional', 'margem líquida'], es: ['margen', 'margen bruto', 'margen operativo', 'margen neto'] },
      cashflow: { en: ['cash flow', 'cash position', 'liquidity', 'free cash flow'], pt: ['fluxo de caixa', 'posição de caixa', 'liquidez'], es: ['flujo de caja', 'posición de caja', 'liquidez'] }
    },
    legal: {
      clauses: { en: ['clause', 'provision', 'section', 'article'], pt: ['cláusula', 'disposição', 'seção', 'artigo'], es: ['cláusula', 'disposición', 'sección', 'artículo'] },
      penalties: { en: ['penalty', 'fine', 'fee', 'liquidated damages'], pt: ['penalidade', 'multa', 'taxa', 'danos liquidados'], es: ['penalidad', 'multa', 'tarifa', 'daños liquidados'] },
      termination: { en: ['termination', 'cancellation', 'end', 'expiration'], pt: ['rescisão', 'cancelamento', 'término', 'expiração'], es: ['terminación', 'cancelación', 'fin', 'expiración'] },
      liability: { en: ['liability', 'responsibility', 'obligation', 'duty'], pt: ['responsabilidade', 'obrigação', 'dever'], es: ['responsabilidad', 'obligación', 'deber'] },
      indemnification: { en: ['indemnification', 'indemnity', 'hold harmless'], pt: ['indenização', 'compensação', 'manter indemne'], es: ['indemnización', 'compensación', 'exención de responsabilidad'] },
      warranties: { en: ['warranty', 'guarantee', 'representation'], pt: ['garantia', 'representação'], es: ['garantía', 'representación'] },
      confidentiality: { en: ['confidentiality', 'nda', 'non-disclosure', 'secrecy'], pt: ['confidencialidade', 'sigilo', 'não divulgação'], es: ['confidencialidad', 'secreto', 'no divulgación'] },
      jurisdiction: { en: ['jurisdiction', 'venue', 'governing law', 'forum'], pt: ['jurisdição', 'foro', 'lei aplicável'], es: ['jurisdicción', 'fuero', 'ley aplicable'] }
    },
    accounting: {
      general_ledger: { en: ['general ledger', 'gl', 'ledger', 'main book'], pt: ['razão geral', 'livro razão', 'razão'], es: ['libro mayor', 'libro diario', 'mayor'] },
      trial_balance: { en: ['trial balance', 'tb', 'balance verification'], pt: ['balancete', 'verificação de saldo'], es: ['balance de comprobación', 'balanza de comprobación'] },
      reconciliation: { en: ['reconciliation', 'recon', 'matching', 'balancing'], pt: ['conciliação', 'confronto', 'balanceamento'], es: ['conciliación', 'cuadre', 'balance'] },
      journal_entries: { en: ['journal entry', 'posting', 'entry', 'transaction'], pt: ['lançamento', 'registro', 'transação'], es: ['asiento', 'registro', 'transacción'] },
      accounts_payable: { en: ['accounts payable', 'ap', 'payables', 'creditors'], pt: ['contas a pagar', 'fornecedores'], es: ['cuentas por pagar', 'proveedores'] },
      accounts_receivable: { en: ['accounts receivable', 'ar', 'receivables', 'debtors'], pt: ['contas a receber', 'clientes'], es: ['cuentas por cobrar', 'clientes'] },
      depreciation: { en: ['depreciation', 'amortization', 'write-off'], pt: ['depreciação', 'amortização', 'baixa'], es: ['depreciación', 'amortización', 'baja'] }
    },
    medical: {
      symptoms: { en: ['symptom', 'complaint', 'presenting', 'signs'], pt: ['sintoma', 'queixa', 'apresentação', 'sinais'], es: ['síntoma', 'queja', 'presentación', 'signos'] },
      labs: { en: ['lab', 'laboratory', 'test result', 'blood work'], pt: ['exame', 'laboratório', 'resultado', 'hemograma'], es: ['laboratorio', 'análisis', 'resultado', 'hemograma'] },
      vitals: { en: ['vitals', 'vital signs', 'bp', 'pulse', 'temperature'], pt: ['sinais vitais', 'pressão', 'pulso', 'temperatura'], es: ['signos vitales', 'presión', 'pulso', 'temperatura'] },
      medications: { en: ['medication', 'drug', 'prescription', 'medicine'], pt: ['medicamento', 'remédio', 'prescrição', 'medicação'], es: ['medicamento', 'medicina', 'prescripción', 'fármaco'] },
      diagnoses: { en: ['diagnosis', 'dx', 'condition', 'assessment'], pt: ['diagnóstico', 'condição', 'avaliação'], es: ['diagnóstico', 'condición', 'evaluación'] },
      procedures: { en: ['procedure', 'surgery', 'operation', 'intervention'], pt: ['procedimento', 'cirurgia', 'operação', 'intervenção'], es: ['procedimiento', 'cirugía', 'operación', 'intervención'] },
      allergies: { en: ['allergy', 'allergic', 'reaction', 'sensitivity'], pt: ['alergia', 'alérgico', 'reação', 'sensibilidade'], es: ['alergia', 'alérgico', 'reacción', 'sensibilidad'] },
      history: { en: ['history', 'past medical', 'pmh', 'background'], pt: ['histórico', 'antecedentes', 'passado médico'], es: ['historia', 'antecedentes', 'historial médico'] }
    }
  };

  const subintents = domainSubintents[domain] || {};
  const result: Record<string, any> = {};

  for (const [subintent, langs] of Object.entries(subintents)) {
    result[subintent] = {
      triggers: langs[lang] || [],
      patterns: (langs[lang] || []).map(t => `\\b${escapeRegex(t)}\\b`),
      count: (langs[lang] || []).length
    };
  }

  return {
    bank_id: `${domain}_subintents`,
    language: lang,
    generated: new Date().toISOString(),
    subintents: result,
    total_count: Object.values(result).reduce((acc: number, s: any) => acc + s.count, 0)
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// NEGATIVE GENERATORS
// ============================================================================

function generateNegatives(bankId: string, lang: 'en' | 'pt' | 'es'): object {
  const negatives: Record<string, Record<string, string[]>> = {
    not_file_actions: {
      en: ['summarize', 'explain', 'analyze', 'what does it say', 'tell me about', 'extract', 'compare', 'contrast', 'meaning', 'interpretation', 'understand', 'key points', 'main ideas', 'conclusion', 'findings', 'describe the content', 'what is discussed', 'give me insights', 'break down', 'elaborate'],
      pt: ['resumir', 'explicar', 'analisar', 'o que diz', 'fale sobre', 'extrair', 'comparar', 'contrastar', 'significado', 'interpretação', 'entender', 'pontos principais', 'ideias principais', 'conclusão', 'achados', 'descrever o conteúdo', 'o que é discutido', 'dê-me insights', 'decompor', 'elaborar'],
      es: ['resumir', 'explicar', 'analizar', 'qué dice', 'cuéntame sobre', 'extraer', 'comparar', 'contrastar', 'significado', 'interpretación', 'entender', 'puntos principales', 'ideas principales', 'conclusión', 'hallazgos', 'describir el contenido', 'qué se discute', 'dame insights', 'desglosar', 'elaborar']
    },
    not_help: {
      en: ['in the document', 'in this file', 'according to', 'based on', 'from the', 'extract from', 'find in', 'locate in', 'mentioned in', 'stated in', 'the contract says', 'the report shows', 'in my files', 'from my documents', 'the spreadsheet contains'],
      pt: ['no documento', 'neste arquivo', 'de acordo com', 'baseado em', 'do arquivo', 'extrair de', 'encontrar em', 'localizar em', 'mencionado em', 'declarado em', 'o contrato diz', 'o relatório mostra', 'nos meus arquivos', 'dos meus documentos', 'a planilha contém'],
      es: ['en el documento', 'en este archivo', 'según', 'basado en', 'del archivo', 'extraer de', 'encontrar en', 'localizar en', 'mencionado en', 'declarado en', 'el contrato dice', 'el informe muestra', 'en mis archivos', 'de mis documentos', 'la hoja contiene']
    },
    not_conversation: {
      en: ['document', 'file', 'pdf', 'spreadsheet', 'contract', 'report', 'presentation', 'analyze', 'summarize', 'extract', 'find', 'show me', 'what does', 'according to', 'in the', 'from the', 'my files'],
      pt: ['documento', 'arquivo', 'pdf', 'planilha', 'contrato', 'relatório', 'apresentação', 'analisar', 'resumir', 'extrair', 'encontrar', 'me mostre', 'o que diz', 'de acordo com', 'no', 'do', 'meus arquivos'],
      es: ['documento', 'archivo', 'pdf', 'hoja de cálculo', 'contrato', 'informe', 'presentación', 'analizar', 'resumir', 'extraer', 'encontrar', 'muéstrame', 'qué dice', 'según', 'en el', 'del', 'mis archivos']
    },
    not_reasoning: {
      en: ['in the document', 'according to the file', 'what does it say', 'extract', 'find', 'locate', 'show', 'list', 'summarize the document', 'from the spreadsheet', 'simple lookup', 'just tell me'],
      pt: ['no documento', 'de acordo com o arquivo', 'o que diz', 'extrair', 'encontrar', 'localizar', 'mostrar', 'listar', 'resumir o documento', 'da planilha', 'consulta simples', 'apenas me diga'],
      es: ['en el documento', 'según el archivo', 'qué dice', 'extraer', 'encontrar', 'localizar', 'mostrar', 'listar', 'resumir el documento', 'de la hoja de cálculo', 'consulta simple', 'solo dime']
    },
    not_excel_finance: {
      en: ['summarize', 'explain', 'what is', 'describe', 'tell me about', 'general', 'overview', 'main points', 'key takeaways', 'meaning of', 'define'],
      pt: ['resumir', 'explicar', 'o que é', 'descrever', 'fale sobre', 'geral', 'visão geral', 'pontos principais', 'conclusões-chave', 'significado de', 'definir'],
      es: ['resumir', 'explicar', 'qué es', 'describir', 'cuéntame sobre', 'general', 'visión general', 'puntos principales', 'conclusiones clave', 'significado de', 'definir']
    },
    not_inventory_when_doc_stats: {
      en: ['word count', 'page count', 'how long', 'length of', 'sections in', 'metadata', 'properties of', 'file info', 'document info'],
      pt: ['contagem de palavras', 'contagem de páginas', 'qual o tamanho', 'comprimento de', 'seções em', 'metadados', 'propriedades de', 'info do arquivo', 'info do documento'],
      es: ['conteo de palabras', 'conteo de páginas', 'qué tan largo', 'longitud de', 'secciones en', 'metadatos', 'propiedades de', 'info del archivo', 'info del documento']
    },
    not_filename_when_locator: {
      en: ['where does it mention', 'which part talks about', 'find where it says', 'locate the section', 'in which paragraph'],
      pt: ['onde menciona', 'qual parte fala sobre', 'encontrar onde diz', 'localizar a seção', 'em qual parágrafo'],
      es: ['dónde menciona', 'qué parte habla de', 'encontrar dónde dice', 'localizar la sección', 'en qué párrafo']
    },
    force_clarify: {
      en: ['it', 'that', 'this', 'the file', 'the document'],
      pt: ['isso', 'aquilo', 'este', 'o arquivo', 'o documento'],
      es: ['eso', 'aquello', 'este', 'el archivo', 'el documento']
    },
    force_disambiguate: {
      en: ['the one', 'which one', 'that file', 'this one', 'the other'],
      pt: ['aquele', 'qual', 'esse arquivo', 'este', 'o outro'],
      es: ['ese', 'cuál', 'ese archivo', 'este', 'el otro']
    }
  };

  const triggers = negatives[bankId]?.[lang] || [];
  const patterns = triggers.map(t => `\\b${escapeRegex(t)}\\b`);

  return {
    bank_id: bankId,
    language: lang,
    generated: new Date().toISOString(),
    blocks: bankId.replace('not_', '').replace('force_', ''),
    triggers,
    patterns,
    count: triggers.length
  };
}

// ============================================================================
// LEXICON GENERATORS
// ============================================================================

function generateLexicon(domain: string, lang: 'en' | 'pt' | 'es'): object {
  const lexicons: Record<string, Record<string, Array<{canonical: string, aliases: string[]}>>> = {
    finance: {
      en: [
        { canonical: 'revenue', aliases: ['sales', 'income', 'top line', 'gross sales', 'net sales'] },
        { canonical: 'ebitda', aliases: ['earnings before interest taxes depreciation amortization', 'operating profit plus depreciation'] },
        { canonical: 'net_income', aliases: ['net profit', 'bottom line', 'net earnings', 'profit after tax'] },
        { canonical: 'gross_margin', aliases: ['gross profit margin', 'gpm', 'gross profit percentage'] },
        { canonical: 'operating_income', aliases: ['operating profit', 'ebit', 'operating earnings'] },
        { canonical: 'cash_flow', aliases: ['cash movement', 'liquidity', 'cash position'] },
        { canonical: 'balance_sheet', aliases: ['statement of financial position', 'financial position'] },
        { canonical: 'income_statement', aliases: ['p&l', 'profit and loss', 'statement of operations', 'earnings statement'] },
        { canonical: 'accounts_receivable', aliases: ['ar', 'receivables', 'trade receivables', 'debtors'] },
        { canonical: 'accounts_payable', aliases: ['ap', 'payables', 'trade payables', 'creditors'] }
      ],
      pt: [
        { canonical: 'receita', aliases: ['vendas', 'faturamento', 'receita bruta', 'receita líquida'] },
        { canonical: 'ebitda', aliases: ['lajida', 'lucro antes de juros impostos depreciação amortização'] },
        { canonical: 'lucro_liquido', aliases: ['resultado líquido', 'lucro final', 'resultado do exercício'] },
        { canonical: 'margem_bruta', aliases: ['margem de lucro bruto', 'percentual de lucro bruto'] },
        { canonical: 'lucro_operacional', aliases: ['resultado operacional', 'ebit', 'lajir'] },
        { canonical: 'fluxo_de_caixa', aliases: ['movimentação de caixa', 'liquidez', 'posição de caixa'] },
        { canonical: 'balanço_patrimonial', aliases: ['balanço', 'demonstração da posição financeira'] },
        { canonical: 'demonstração_de_resultados', aliases: ['dre', 'demonstração do resultado do exercício'] },
        { canonical: 'contas_a_receber', aliases: ['recebíveis', 'clientes', 'duplicatas a receber'] },
        { canonical: 'contas_a_pagar', aliases: ['fornecedores', 'duplicatas a pagar', 'obrigações'] }
      ],
      es: [
        { canonical: 'ingresos', aliases: ['ventas', 'facturación', 'ingresos brutos', 'ingresos netos'] },
        { canonical: 'ebitda', aliases: ['beneficio antes de intereses impuestos depreciación amortización'] },
        { canonical: 'utilidad_neta', aliases: ['resultado neto', 'ganancia neta', 'beneficio neto'] },
        { canonical: 'margen_bruto', aliases: ['margen de utilidad bruta', 'porcentaje de utilidad bruta'] },
        { canonical: 'utilidad_operativa', aliases: ['resultado operativo', 'ebit', 'beneficio operativo'] },
        { canonical: 'flujo_de_caja', aliases: ['movimiento de efectivo', 'liquidez', 'posición de caja'] },
        { canonical: 'balance_general', aliases: ['estado de situación financiera', 'balance'] },
        { canonical: 'estado_de_resultados', aliases: ['pyg', 'cuenta de pérdidas y ganancias'] },
        { canonical: 'cuentas_por_cobrar', aliases: ['deudores', 'clientes', 'cartera'] },
        { canonical: 'cuentas_por_pagar', aliases: ['proveedores', 'acreedores', 'obligaciones'] }
      ]
    },
    legal: {
      en: [
        { canonical: 'contract', aliases: ['agreement', 'pact', 'covenant', 'deed'] },
        { canonical: 'clause', aliases: ['provision', 'section', 'article', 'term'] },
        { canonical: 'liability', aliases: ['responsibility', 'obligation', 'accountability'] },
        { canonical: 'indemnification', aliases: ['indemnity', 'compensation', 'reimbursement'] },
        { canonical: 'termination', aliases: ['cancellation', 'end', 'cessation', 'dissolution'] },
        { canonical: 'breach', aliases: ['violation', 'infringement', 'non-compliance'] },
        { canonical: 'force_majeure', aliases: ['act of god', 'unforeseeable circumstances', 'extraordinary event'] },
        { canonical: 'confidentiality', aliases: ['non-disclosure', 'secrecy', 'privacy'] },
        { canonical: 'warranty', aliases: ['guarantee', 'assurance', 'representation'] },
        { canonical: 'jurisdiction', aliases: ['venue', 'forum', 'legal authority'] }
      ],
      pt: [
        { canonical: 'contrato', aliases: ['acordo', 'pacto', 'convênio', 'instrumento'] },
        { canonical: 'cláusula', aliases: ['disposição', 'seção', 'artigo', 'termo'] },
        { canonical: 'responsabilidade', aliases: ['obrigação', 'dever', 'compromisso'] },
        { canonical: 'indenização', aliases: ['compensação', 'reembolso', 'ressarcimento'] },
        { canonical: 'rescisão', aliases: ['cancelamento', 'término', 'dissolução'] },
        { canonical: 'violação', aliases: ['infração', 'descumprimento', 'inadimplência'] },
        { canonical: 'força_maior', aliases: ['caso fortuito', 'circunstâncias imprevistas'] },
        { canonical: 'confidencialidade', aliases: ['sigilo', 'não divulgação', 'privacidade'] },
        { canonical: 'garantia', aliases: ['caução', 'fiança', 'aval'] },
        { canonical: 'jurisdição', aliases: ['foro', 'competência', 'autoridade legal'] }
      ],
      es: [
        { canonical: 'contrato', aliases: ['acuerdo', 'pacto', 'convenio', 'instrumento'] },
        { canonical: 'cláusula', aliases: ['disposición', 'sección', 'artículo', 'término'] },
        { canonical: 'responsabilidad', aliases: ['obligación', 'deber', 'compromiso'] },
        { canonical: 'indemnización', aliases: ['compensación', 'reembolso', 'resarcimiento'] },
        { canonical: 'terminación', aliases: ['cancelación', 'rescisión', 'disolución'] },
        { canonical: 'incumplimiento', aliases: ['violación', 'infracción', 'falta'] },
        { canonical: 'fuerza_mayor', aliases: ['caso fortuito', 'circunstancias imprevistas'] },
        { canonical: 'confidencialidad', aliases: ['secreto', 'no divulgación', 'privacidad'] },
        { canonical: 'garantía', aliases: ['caución', 'fianza', 'aval'] },
        { canonical: 'jurisdicción', aliases: ['fuero', 'competencia', 'autoridad legal'] }
      ]
    }
  };

  const terms = lexicons[domain]?.[lang] || [];

  return {
    bank_id: `lexicon_${domain}`,
    language: lang,
    generated: new Date().toISOString(),
    domain,
    terms,
    count: terms.reduce((acc, t) => acc + 1 + t.aliases.length, 0)
  };
}

// ============================================================================
// TEMPLATE GENERATORS
// ============================================================================

function generateTemplates(bankId: string, lang: 'en' | 'pt' | 'es'): object {
  const templates: Record<string, Record<string, object[]>> = {
    answer_styles: {
      en: [
        { style: 'definition', template: '{term} is {definition}.' },
        { style: 'summary', template: 'The document covers the following key points:\n{points}' },
        { style: 'extraction', template: 'Based on the document:\n{content}' },
        { style: 'comparison', template: 'Comparing {a} and {b}:\n{differences}' },
        { style: 'list', template: 'Here are the {items}:\n{list}' },
        { style: 'count', template: 'There are {count} {items}.' }
      ],
      pt: [
        { style: 'definition', template: '{term} é {definition}.' },
        { style: 'summary', template: 'O documento aborda os seguintes pontos:\n{points}' },
        { style: 'extraction', template: 'Com base no documento:\n{content}' },
        { style: 'comparison', template: 'Comparando {a} e {b}:\n{differences}' },
        { style: 'list', template: 'Aqui estão os {items}:\n{list}' },
        { style: 'count', template: 'Existem {count} {items}.' }
      ],
      es: [
        { style: 'definition', template: '{term} es {definition}.' },
        { style: 'summary', template: 'El documento cubre los siguientes puntos:\n{points}' },
        { style: 'extraction', template: 'Basado en el documento:\n{content}' },
        { style: 'comparison', template: 'Comparando {a} y {b}:\n{differences}' },
        { style: 'list', template: 'Aquí están los {items}:\n{list}' },
        { style: 'count', template: 'Hay {count} {items}.' }
      ]
    },
    file_actions_microcopy: {
      en: [
        { action: 'list', template: 'Here are your files:' },
        { action: 'filter', template: 'Found {count} {type} files:' },
        { action: 'locate', template: 'Here it is:' },
        { action: 'not_found', template: "I couldn't find a file matching \"{query}\"." },
        { action: 'disambiguate', template: 'I found multiple matches. Which one do you mean?' },
        { action: 'count', template: 'You have {count} files.' }
      ],
      pt: [
        { action: 'list', template: 'Aqui estão seus arquivos:' },
        { action: 'filter', template: 'Encontrei {count} arquivos {type}:' },
        { action: 'locate', template: 'Aqui está:' },
        { action: 'not_found', template: 'Não encontrei um arquivo correspondente a "{query}".' },
        { action: 'disambiguate', template: 'Encontrei várias correspondências. Qual você quer dizer?' },
        { action: 'count', template: 'Você tem {count} arquivos.' }
      ],
      es: [
        { action: 'list', template: 'Aquí están tus archivos:' },
        { action: 'filter', template: 'Encontré {count} archivos {type}:' },
        { action: 'locate', template: 'Aquí está:' },
        { action: 'not_found', template: 'No encontré un archivo que coincida con "{query}".' },
        { action: 'disambiguate', template: 'Encontré varias coincidencias. ¿Cuál quieres decir?' },
        { action: 'count', template: 'Tienes {count} archivos.' }
      ]
    },
    error_templates: {
      en: [
        { error: 'not_found', template: "I couldn't find information about that in your documents." },
        { error: 'no_documents', template: "You don't have any documents uploaded yet." },
        { error: 'processing', template: 'There was an issue processing your request. Please try again.' },
        { error: 'ambiguous', template: "I'm not sure what you're asking. Could you clarify?" },
        { error: 'low_evidence', template: "I don't have enough information to answer that confidently." }
      ],
      pt: [
        { error: 'not_found', template: 'Não encontrei informações sobre isso nos seus documentos.' },
        { error: 'no_documents', template: 'Você ainda não tem documentos enviados.' },
        { error: 'processing', template: 'Houve um problema ao processar sua solicitação. Tente novamente.' },
        { error: 'ambiguous', template: 'Não tenho certeza do que você está perguntando. Pode esclarecer?' },
        { error: 'low_evidence', template: 'Não tenho informações suficientes para responder com confiança.' }
      ],
      es: [
        { error: 'not_found', template: 'No encontré información sobre eso en tus documentos.' },
        { error: 'no_documents', template: 'Aún no tienes documentos subidos.' },
        { error: 'processing', template: 'Hubo un problema al procesar tu solicitud. Por favor intenta de nuevo.' },
        { error: 'ambiguous', template: 'No estoy seguro de lo que preguntas. ¿Podrías aclarar?' },
        { error: 'low_evidence', template: 'No tengo suficiente información para responder con confianza.' }
      ]
    }
  };

  const items = templates[bankId]?.[lang] || [];

  return {
    bank_id: bankId,
    language: lang,
    generated: new Date().toISOString(),
    templates: items,
    count: items.length
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

async function generateAllBanks() {
  console.log('Starting data bank generation...\n');

  const languages: ('en' | 'pt' | 'es')[] = ['en', 'pt', 'es'];
  let totalFiles = 0;

  // Generate Triggers
  console.log('=== Generating Triggers ===');
  for (const lang of languages) {
    const data = generatePrimaryIntents(lang);
    const filePath = path.join(DATA_BANKS_ROOT, 'triggers', `primary_intents.${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  Created: ${filePath}`);
    totalFiles++;
  }

  // Generate Negatives
  console.log('\n=== Generating Negatives ===');
  const negativeIds = ['not_file_actions', 'not_help', 'not_conversation', 'not_reasoning', 'not_excel_finance'];
  for (const bankId of negativeIds) {
    for (const lang of languages) {
      const data = generateNegatives(bankId, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'negatives', `${bankId}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  Created: ${filePath}`);
      totalFiles++;
    }
  }

  // Generate Lexicons
  console.log('\n=== Generating Lexicons ===');
  const domains = ['finance', 'legal'];
  for (const domain of domains) {
    for (const lang of languages) {
      const data = generateLexicon(domain, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'lexicons', `${domain}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  Created: ${filePath}`);
      totalFiles++;
    }
  }

  // Generate Templates
  console.log('\n=== Generating Templates ===');
  const templateIds = ['answer_styles', 'file_actions_microcopy', 'error_templates'];
  for (const bankId of templateIds) {
    for (const lang of languages) {
      const data = generateTemplates(bankId, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'templates', `${bankId}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  Created: ${filePath}`);
      totalFiles++;
    }
  }

  console.log(`\n✅ Generated ${totalFiles} data bank files`);
  console.log('Run additional generators for remaining banks as needed.');
}

// ============================================================================
// OVERLAY GENERATORS
// ============================================================================

function generateOverlay(bankId: string, lang: 'en' | 'pt' | 'es' | 'shared'): object {
  const overlays: Record<string, Record<string, any>> = {
    followup_inherit: {
      en: { triggers: ['it', 'that', 'this', 'the same', 'them', 'those', 'these', 'the one', 'again'], patterns: ['\\bit\\b', '\\bthat\\b', '\\bthis\\b', '\\bthe same\\b'] },
      pt: { triggers: ['isso', 'isto', 'aquilo', 'o mesmo', 'eles', 'esses', 'estes', 'aquele', 'de novo'], patterns: ['\\bisso\\b', '\\bisto\\b', '\\baquilo\\b'] },
      es: { triggers: ['eso', 'esto', 'aquello', 'lo mismo', 'ellos', 'esos', 'estos', 'aquel', 'de nuevo'], patterns: ['\\beso\\b', '\\besto\\b', '\\baquello\\b'] }
    },
    followup_file_actions: {
      en: { triggers: ['open it', 'show it', 'where is it', 'show me again', 'open that', 'display it'], patterns: ['open\\s+it', 'show\\s+it', 'where\\s+is\\s+it'] },
      pt: { triggers: ['abra isso', 'mostre isso', 'onde está', 'mostre de novo', 'abra aquele', 'exiba isso'], patterns: ['abr[ae]\\s+isso', 'mostr[ea]\\s+isso'] },
      es: { triggers: ['ábrelo', 'muéstralo', 'dónde está', 'muéstrame de nuevo', 'abre eso', 'muéstralo'], patterns: ['[áa]br[ea]lo', 'mu[ée]str[ae]lo'] }
    },
    format_request: {
      en: { triggers: ['in bullets', 'as bullets', 'bullet points', 'numbered list', 'as a table', 'in a table', 'exactly 5', 'in 3 sentences', 'one paragraph', 'keep it short', 'be brief', 'detailed'], patterns: ['\\d+\\s*(bullet|point|item|sentence|paragraph)', 'as\\s+(a\\s+)?table', 'in\\s+(a\\s+)?table'] },
      pt: { triggers: ['em tópicos', 'como tópicos', 'lista numerada', 'em tabela', 'numa tabela', 'exatamente 5', 'em 3 frases', 'um parágrafo', 'seja breve', 'resumido', 'detalhado'], patterns: ['\\d+\\s*(tópico|ponto|item|frase|parágrafo)', 'em\\s+tabela', 'numa\\s+tabela'] },
      es: { triggers: ['en viñetas', 'como viñetas', 'lista numerada', 'en tabla', 'en una tabla', 'exactamente 5', 'en 3 oraciones', 'un párrafo', 'sé breve', 'resumido', 'detallado'], patterns: ['\\d+\\s*(viñeta|punto|item|oración|párrafo)', 'en\\s+(una\\s+)?tabla'] }
    },
    clarify_required: {
      en: { triggers: ['the file', 'my document', 'the report', 'that thing', 'something', 'the spreadsheet'], patterns: ['the\\s+(file|document|report|spreadsheet)(?!\\s+\\w)'] },
      pt: { triggers: ['o arquivo', 'meu documento', 'o relatório', 'aquela coisa', 'algo', 'a planilha'], patterns: ['[oa]\\s+(arquivo|documento|relatório|planilha)(?!\\s+\\w)'] },
      es: { triggers: ['el archivo', 'mi documento', 'el informe', 'esa cosa', 'algo', 'la hoja'], patterns: ['[ela]\\s+(archivo|documento|informe|hoja)(?!\\s+\\w)'] }
    },
    drift_detectors: {
      shared: {
        patterns: [
          'as an ai', 'i cannot', 'i don\'t have access', 'i\'m not able', 'i apologize', 'sorry but',
          'according to my training', 'my knowledge cutoff', 'i was trained', 'language model',
          'based on general knowledge', 'typically', 'generally speaking', 'in most cases'
        ],
        severity: { high: ['as an ai', 'language model', 'my training'], medium: ['i cannot', 'i apologize'], low: ['typically', 'generally'] }
      }
    },
    scope_rules: {
      shared: {
        single_doc: ['this document', 'the document', 'this file', 'in this', 'from this'],
        multi_doc: ['all documents', 'all files', 'my documents', 'across', 'compare'],
        patterns: { single: 'this\\s+(document|file)', multi: '(all|my)\\s+(document|file)s' }
      }
    }
  };

  const data = overlays[bankId]?.[lang] || overlays[bankId]?.shared || {};

  return {
    bank_id: bankId,
    language: lang,
    generated: new Date().toISOString(),
    ...data,
    count: Array.isArray(data.triggers) ? data.triggers.length : Object.keys(data).length
  };
}

// ============================================================================
// NORMALIZER GENERATORS
// ============================================================================

function generateNormalizer(bankId: string): object {
  const normalizers: Record<string, object> = {
    language_indicators: {
      en: { weight: 1.0, indicators: ['the', 'is', 'are', 'and', 'or', 'in', 'of', 'to', 'for', 'with', 'what', 'how', 'why', 'when', 'where', 'which'] },
      pt: { weight: 1.0, indicators: ['o', 'a', 'os', 'as', 'é', 'são', 'e', 'ou', 'em', 'de', 'para', 'com', 'que', 'como', 'por que', 'quando', 'onde', 'qual'] },
      es: { weight: 1.0, indicators: ['el', 'la', 'los', 'las', 'es', 'son', 'y', 'o', 'en', 'de', 'para', 'con', 'qué', 'cómo', 'por qué', 'cuándo', 'dónde', 'cuál'] }
    },
    filename: {
      patterns: [
        { regex: '\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|png|jpg|jpeg)$', type: 'extension' },
        { regex: '^[\\w\\-\\.]+$', type: 'valid_filename' },
        { regex: '\\s+', replacement: '_', type: 'space_to_underscore' }
      ],
      normalize: ['lowercase', 'trim', 'remove_special']
    },
    filetypes: {
      mappings: {
        'pdf': { canonical: 'pdf', aliases: ['pdf file', 'adobe', 'portable document'] },
        'excel': { canonical: 'xlsx', aliases: ['spreadsheet', 'xls', 'excel file', 'planilha', 'hoja de cálculo'] },
        'word': { canonical: 'docx', aliases: ['doc', 'word file', 'documento', 'documento de word'] },
        'powerpoint': { canonical: 'pptx', aliases: ['ppt', 'presentation', 'slides', 'apresentação', 'presentación'] },
        'image': { canonical: 'image', aliases: ['png', 'jpg', 'jpeg', 'gif', 'imagem', 'imagen', 'photo', 'foto'] }
      }
    },
    months: {
      en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
      pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
      es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
      mappings: { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 }
    },
    quarters: {
      patterns: ['q1', 'q2', 'q3', 'q4', '1q', '2q', '3q', '4q', 'first quarter', 'second quarter', 'third quarter', 'fourth quarter'],
      pt: ['1t', '2t', '3t', '4t', 'primeiro trimestre', 'segundo trimestre', 'terceiro trimestre', 'quarto trimestre'],
      es: ['1t', '2t', '3t', '4t', 'primer trimestre', 'segundo trimestre', 'tercer trimestre', 'cuarto trimestre'],
      mappings: { 'q1': { months: [1,2,3] }, 'q2': { months: [4,5,6] }, 'q3': { months: [7,8,9] }, 'q4': { months: [10,11,12] } }
    },
    time_windows: {
      en: ['today', 'yesterday', 'last week', 'this week', 'last month', 'this month', 'last year', 'this year', 'past 24 hours', 'past 7 days', 'past 30 days'],
      pt: ['hoje', 'ontem', 'semana passada', 'esta semana', 'mês passado', 'este mês', 'ano passado', 'este ano', 'últimas 24 horas', 'últimos 7 dias', 'últimos 30 dias'],
      es: ['hoy', 'ayer', 'semana pasada', 'esta semana', 'mes pasado', 'este mes', 'año pasado', 'este año', 'últimas 24 horas', 'últimos 7 días', 'últimos 30 días']
    },
    numbers_currency: {
      formats: ['1,000.00', '1.000,00', '1 000,00'],
      currencies: ['$', '€', '£', 'R$', 'USD', 'EUR', 'GBP', 'BRL'],
      patterns: ['\\$[\\d,]+\\.?\\d*', '€[\\d.]+,?\\d*', 'R\\$[\\d.]+,?\\d*']
    },
    typos: {
      common: {
        'sumary': 'summary', 'sumarize': 'summarize', 'documnet': 'document', 'spredsheet': 'spreadsheet',
        'excell': 'excel', 'analize': 'analyze', 'comparisson': 'comparison', 'extrat': 'extract'
      }
    },
    diacritics_pt: {
      mappings: { 'ã': 'a', 'á': 'a', 'à': 'a', 'â': 'a', 'é': 'e', 'ê': 'e', 'í': 'i', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ú': 'u', 'ç': 'c' }
    },
    diacritics_es: {
      mappings: { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u' }
    },
    abbreviations_finance: {
      mappings: {
        'ytd': 'year to date', 'mtd': 'month to date', 'qtd': 'quarter to date',
        'cagr': 'compound annual growth rate', 'roi': 'return on investment', 'ebitda': 'earnings before interest taxes depreciation amortization',
        'p&l': 'profit and loss', 'bs': 'balance sheet', 'cf': 'cash flow'
      }
    },
    abbreviations_legal: {
      mappings: {
        'nda': 'non-disclosure agreement', 'ip': 'intellectual property', 'tos': 'terms of service',
        'eula': 'end user license agreement', 'sla': 'service level agreement', 'mou': 'memorandum of understanding'
      }
    },
    abbreviations_medical: {
      mappings: {
        'bp': 'blood pressure', 'hr': 'heart rate', 'bpm': 'beats per minute', 'rx': 'prescription',
        'dx': 'diagnosis', 'tx': 'treatment', 'hx': 'history', 'pmh': 'past medical history'
      }
    }
  };

  return {
    bank_id: bankId,
    generated: new Date().toISOString(),
    ...(normalizers[bankId] || {}),
    count: Object.keys(normalizers[bankId] || {}).length
  };
}

// ============================================================================
// FORMATTING GENERATORS
// ============================================================================

function generateFormatting(bankId: string): object {
  const formatting: Record<string, object> = {
    constraints: {
      bullet_patterns: {
        en: ['\\d+\\s*bullets?', 'exactly\\s*\\d+', '\\d+\\s*points?', '\\d+\\s*items?'],
        pt: ['\\d+\\s*tópicos?', 'exatamente\\s*\\d+', '\\d+\\s*pontos?', '\\d+\\s*itens?'],
        es: ['\\d+\\s*viñetas?', 'exactamente\\s*\\d+', '\\d+\\s*puntos?', '\\d+\\s*items?']
      },
      table_patterns: {
        en: ['as a table', 'in table format', 'in a table', 'table with'],
        pt: ['em tabela', 'formato de tabela', 'numa tabela', 'tabela com'],
        es: ['como tabla', 'en formato tabla', 'en una tabla', 'tabla con']
      },
      length_patterns: {
        en: ['keep it short', 'be brief', 'concise', 'detailed', 'in depth', 'comprehensive'],
        pt: ['seja breve', 'resumido', 'conciso', 'detalhado', 'em profundidade', 'abrangente'],
        es: ['sé breve', 'resumido', 'conciso', 'detallado', 'en profundidad', 'completo']
      }
    },
    validators: {
      bullet_count: { min: 1, max: 20, pattern: '^[\\s]*[-•*]' },
      numbered_count: { min: 1, max: 20, pattern: '^[\\s]*\\d+[.)]' },
      table_structure: { min_rows: 2, min_cols: 2, header_required: true },
      max_length: { characters: 10000, lines: 500 }
    },
    repair_rules: {
      bullet_repair: [
        { from: '^(\\d+)[.)]\\s*', to: '• ', condition: 'when_bullets_expected' },
        { from: '^[-]\\s*', to: '• ', condition: 'normalize_bullet_style' }
      ],
      numbered_repair: [
        { from: '^[•*-]\\s*', to: '1. ', condition: 'when_numbered_expected', increment: true }
      ],
      table_repair: [
        { action: 'add_header_separator', condition: 'missing_separator' },
        { action: 'align_columns', condition: 'uneven_columns' }
      ]
    },
    readability_rules: {
      max_sentence_length: 150,
      max_paragraph_length: 500,
      require_breaks_after: 3,
      wall_of_text_threshold: 800,
      actions: {
        long_sentence: 'split_at_conjunction',
        long_paragraph: 'add_line_break',
        wall_of_text: 'add_bullets_or_headers'
      }
    }
  };

  return {
    bank_id: bankId,
    generated: new Date().toISOString(),
    ...(formatting[bankId] || {}),
    count: Object.keys(formatting[bankId] || {}).length
  };
}

// ============================================================================
// EXTENDED LEXICON GENERATORS
// ============================================================================

function generateExtendedLexicon(domain: string, lang: 'en' | 'pt' | 'es'): object {
  const lexicons: Record<string, Record<string, Array<{canonical: string, aliases: string[]}>>> = {
    accounting: {
      en: [
        { canonical: 'general_ledger', aliases: ['gl', 'ledger', 'main book', 'book of accounts'] },
        { canonical: 'trial_balance', aliases: ['tb', 'balance verification', 'verification balance'] },
        { canonical: 'journal_entry', aliases: ['je', 'entry', 'posting', 'transaction'] },
        { canonical: 'accounts_payable', aliases: ['ap', 'payables', 'trade payables', 'creditors'] },
        { canonical: 'accounts_receivable', aliases: ['ar', 'receivables', 'trade receivables', 'debtors'] },
        { canonical: 'depreciation', aliases: ['depr', 'write-off', 'wear and tear'] },
        { canonical: 'amortization', aliases: ['amort', 'intangible write-off'] },
        { canonical: 'accrual', aliases: ['accrued expense', 'provision', 'reserve'] }
      ],
      pt: [
        { canonical: 'razao_geral', aliases: ['razão', 'livro razão', 'livro de contas'] },
        { canonical: 'balancete', aliases: ['verificação de saldos', 'balancete de verificação'] },
        { canonical: 'lancamento', aliases: ['registro', 'lançamento contábil', 'entrada'] },
        { canonical: 'contas_a_pagar', aliases: ['fornecedores', 'obrigações', 'passivo circulante'] },
        { canonical: 'contas_a_receber', aliases: ['clientes', 'duplicatas', 'ativo circulante'] },
        { canonical: 'depreciacao', aliases: ['desgaste', 'baixa patrimonial'] },
        { canonical: 'amortizacao', aliases: ['baixa de intangível'] },
        { canonical: 'provisao', aliases: ['reserva', 'acumulado'] }
      ],
      es: [
        { canonical: 'libro_mayor', aliases: ['mayor', 'libro de cuentas', 'libro principal'] },
        { canonical: 'balance_comprobacion', aliases: ['verificación de saldos', 'balanza'] },
        { canonical: 'asiento', aliases: ['registro', 'entrada contable', 'transacción'] },
        { canonical: 'cuentas_por_pagar', aliases: ['proveedores', 'obligaciones', 'pasivo corriente'] },
        { canonical: 'cuentas_por_cobrar', aliases: ['clientes', 'deudores', 'activo corriente'] },
        { canonical: 'depreciacion', aliases: ['desgaste', 'baja patrimonial'] },
        { canonical: 'amortizacion', aliases: ['baja de intangible'] },
        { canonical: 'provision', aliases: ['reserva', 'acumulado'] }
      ]
    },
    medical: {
      en: [
        { canonical: 'blood_pressure', aliases: ['bp', 'systolic', 'diastolic', 'hypertension'] },
        { canonical: 'heart_rate', aliases: ['hr', 'pulse', 'bpm', 'cardiac rhythm'] },
        { canonical: 'diagnosis', aliases: ['dx', 'condition', 'finding', 'assessment'] },
        { canonical: 'prescription', aliases: ['rx', 'medication order', 'drug order'] },
        { canonical: 'lab_result', aliases: ['labs', 'blood work', 'test result', 'panel'] },
        { canonical: 'vital_signs', aliases: ['vitals', 'v/s', 'measurements'] },
        { canonical: 'medication', aliases: ['med', 'drug', 'pharmaceutical', 'medicine'] },
        { canonical: 'allergy', aliases: ['allergic reaction', 'sensitivity', 'intolerance'] }
      ],
      pt: [
        { canonical: 'pressao_arterial', aliases: ['pa', 'pressão', 'sistólica', 'diastólica', 'hipertensão'] },
        { canonical: 'frequencia_cardiaca', aliases: ['fc', 'pulso', 'bpm', 'batimentos'] },
        { canonical: 'diagnostico', aliases: ['dx', 'condição', 'achado', 'avaliação'] },
        { canonical: 'receita', aliases: ['rx', 'prescrição', 'medicação'] },
        { canonical: 'resultado_exame', aliases: ['exames', 'hemograma', 'resultado'] },
        { canonical: 'sinais_vitais', aliases: ['vitais', 'ssvv', 'medidas'] },
        { canonical: 'medicamento', aliases: ['med', 'remédio', 'fármaco', 'droga'] },
        { canonical: 'alergia', aliases: ['reação alérgica', 'sensibilidade', 'intolerância'] }
      ],
      es: [
        { canonical: 'presion_arterial', aliases: ['pa', 'presión', 'sistólica', 'diastólica', 'hipertensión'] },
        { canonical: 'frecuencia_cardiaca', aliases: ['fc', 'pulso', 'lpm', 'latidos'] },
        { canonical: 'diagnostico', aliases: ['dx', 'condición', 'hallazgo', 'evaluación'] },
        { canonical: 'receta', aliases: ['rx', 'prescripción', 'medicación'] },
        { canonical: 'resultado_laboratorio', aliases: ['labs', 'hemograma', 'resultado'] },
        { canonical: 'signos_vitales', aliases: ['vitales', 'sv', 'medidas'] },
        { canonical: 'medicamento', aliases: ['med', 'medicina', 'fármaco', 'droga'] },
        { canonical: 'alergia', aliases: ['reacción alérgica', 'sensibilidad', 'intolerancia'] }
      ]
    },
    excel: {
      en: [
        { canonical: 'spreadsheet', aliases: ['sheet', 'worksheet', 'workbook', 'excel file'] },
        { canonical: 'cell', aliases: ['cell reference', 'box', 'field'] },
        { canonical: 'formula', aliases: ['function', 'calculation', 'expression'] },
        { canonical: 'pivot_table', aliases: ['pivot', 'cross-tab', 'summary table'] },
        { canonical: 'chart', aliases: ['graph', 'visualization', 'plot', 'diagram'] },
        { canonical: 'filter', aliases: ['autofilter', 'data filter', 'selection'] },
        { canonical: 'vlookup', aliases: ['lookup', 'search function', 'reference'] },
        { canonical: 'range', aliases: ['selection', 'area', 'cell range'] }
      ],
      pt: [
        { canonical: 'planilha', aliases: ['folha', 'pasta de trabalho', 'arquivo excel'] },
        { canonical: 'celula', aliases: ['referência de célula', 'caixa', 'campo'] },
        { canonical: 'formula', aliases: ['função', 'cálculo', 'expressão'] },
        { canonical: 'tabela_dinamica', aliases: ['pivot', 'tabulação cruzada', 'tabela resumo'] },
        { canonical: 'grafico', aliases: ['visualização', 'plotagem', 'diagrama'] },
        { canonical: 'filtro', aliases: ['autofiltro', 'filtro de dados', 'seleção'] },
        { canonical: 'procv', aliases: ['busca', 'função de busca', 'referência'] },
        { canonical: 'intervalo', aliases: ['seleção', 'área', 'faixa de células'] }
      ],
      es: [
        { canonical: 'hoja_calculo', aliases: ['hoja', 'libro de trabajo', 'archivo excel'] },
        { canonical: 'celda', aliases: ['referencia de celda', 'casilla', 'campo'] },
        { canonical: 'formula', aliases: ['función', 'cálculo', 'expresión'] },
        { canonical: 'tabla_dinamica', aliases: ['pivot', 'tabulación cruzada', 'tabla resumen'] },
        { canonical: 'grafico', aliases: ['gráfica', 'visualización', 'diagrama'] },
        { canonical: 'filtro', aliases: ['autofiltro', 'filtro de datos', 'selección'] },
        { canonical: 'buscarv', aliases: ['búsqueda', 'función de búsqueda', 'referencia'] },
        { canonical: 'rango', aliases: ['selección', 'área', 'rango de celdas'] }
      ]
    },
    project_agile: {
      en: [
        { canonical: 'sprint', aliases: ['iteration', 'cycle', 'timebox'] },
        { canonical: 'backlog', aliases: ['product backlog', 'sprint backlog', 'task list'] },
        { canonical: 'scrum', aliases: ['agile methodology', 'scrum framework'] },
        { canonical: 'kanban', aliases: ['kanban board', 'visual board', 'task board'] },
        { canonical: 'user_story', aliases: ['story', 'feature', 'requirement'] },
        { canonical: 'epic', aliases: ['large feature', 'initiative', 'theme'] },
        { canonical: 'velocity', aliases: ['team velocity', 'sprint capacity', 'throughput'] },
        { canonical: 'retrospective', aliases: ['retro', 'sprint review', 'lessons learned'] }
      ],
      pt: [
        { canonical: 'sprint', aliases: ['iteração', 'ciclo', 'timebox'] },
        { canonical: 'backlog', aliases: ['backlog do produto', 'backlog da sprint', 'lista de tarefas'] },
        { canonical: 'scrum', aliases: ['metodologia ágil', 'framework scrum'] },
        { canonical: 'kanban', aliases: ['quadro kanban', 'quadro visual', 'quadro de tarefas'] },
        { canonical: 'historia_usuario', aliases: ['história', 'funcionalidade', 'requisito'] },
        { canonical: 'epico', aliases: ['grande funcionalidade', 'iniciativa', 'tema'] },
        { canonical: 'velocidade', aliases: ['velocidade do time', 'capacidade da sprint', 'throughput'] },
        { canonical: 'retrospectiva', aliases: ['retro', 'revisão da sprint', 'lições aprendidas'] }
      ],
      es: [
        { canonical: 'sprint', aliases: ['iteración', 'ciclo', 'timebox'] },
        { canonical: 'backlog', aliases: ['backlog del producto', 'backlog del sprint', 'lista de tareas'] },
        { canonical: 'scrum', aliases: ['metodología ágil', 'framework scrum'] },
        { canonical: 'kanban', aliases: ['tablero kanban', 'tablero visual', 'tablero de tareas'] },
        { canonical: 'historia_usuario', aliases: ['historia', 'funcionalidad', 'requisito'] },
        { canonical: 'epica', aliases: ['gran funcionalidad', 'iniciativa', 'tema'] },
        { canonical: 'velocidad', aliases: ['velocidad del equipo', 'capacidad del sprint', 'throughput'] },
        { canonical: 'retrospectiva', aliases: ['retro', 'revisión del sprint', 'lecciones aprendidas'] }
      ]
    },
    ui_navigation: {
      en: [
        { canonical: 'button', aliases: ['btn', 'click', 'tap', 'press'] },
        { canonical: 'menu', aliases: ['dropdown', 'navigation', 'nav'] },
        { canonical: 'modal', aliases: ['dialog', 'popup', 'overlay'] },
        { canonical: 'tab', aliases: ['panel', 'section', 'page'] },
        { canonical: 'sidebar', aliases: ['side panel', 'drawer', 'left panel'] },
        { canonical: 'search_bar', aliases: ['search box', 'search field', 'find'] },
        { canonical: 'scroll', aliases: ['scroll down', 'scroll up', 'navigate'] },
        { canonical: 'click', aliases: ['tap', 'press', 'select', 'choose'] }
      ],
      pt: [
        { canonical: 'botao', aliases: ['btn', 'clicar', 'tocar', 'pressionar'] },
        { canonical: 'menu', aliases: ['dropdown', 'navegação', 'nav'] },
        { canonical: 'modal', aliases: ['diálogo', 'popup', 'sobreposição'] },
        { canonical: 'aba', aliases: ['painel', 'seção', 'página'] },
        { canonical: 'barra_lateral', aliases: ['painel lateral', 'gaveta', 'painel esquerdo'] },
        { canonical: 'barra_busca', aliases: ['caixa de busca', 'campo de busca', 'encontrar'] },
        { canonical: 'rolar', aliases: ['rolar para baixo', 'rolar para cima', 'navegar'] },
        { canonical: 'clicar', aliases: ['tocar', 'pressionar', 'selecionar', 'escolher'] }
      ],
      es: [
        { canonical: 'boton', aliases: ['btn', 'hacer clic', 'tocar', 'presionar'] },
        { canonical: 'menu', aliases: ['dropdown', 'navegación', 'nav'] },
        { canonical: 'modal', aliases: ['diálogo', 'popup', 'superposición'] },
        { canonical: 'pestana', aliases: ['panel', 'sección', 'página'] },
        { canonical: 'barra_lateral', aliases: ['panel lateral', 'cajón', 'panel izquierdo'] },
        { canonical: 'barra_busqueda', aliases: ['caja de búsqueda', 'campo de búsqueda', 'encontrar'] },
        { canonical: 'desplazar', aliases: ['desplazar abajo', 'desplazar arriba', 'navegar'] },
        { canonical: 'hacer_clic', aliases: ['tocar', 'presionar', 'seleccionar', 'elegir'] }
      ]
    }
  };

  const terms = lexicons[domain]?.[lang] || [];

  return {
    bank_id: `lexicon_${domain}`,
    language: lang,
    generated: new Date().toISOString(),
    domain,
    terms,
    count: terms.reduce((acc, t) => acc + 1 + t.aliases.length, 0)
  };
}

// ============================================================================
// TEMPLATE GENERATORS (EXTENDED)
// ============================================================================

function generateExtendedTemplates(bankId: string, lang: 'en' | 'pt' | 'es'): object {
  const templates: Record<string, Record<string, object[]>> = {
    clarify_templates: {
      en: [
        { type: 'ambiguous_file', template: 'Which file do you mean? I found multiple matches.' },
        { type: 'ambiguous_action', template: "What would you like me to do with that?" },
        { type: 'missing_context', template: "Could you provide more context?" },
        { type: 'unclear_scope', template: "Should I look at all your documents or a specific one?" },
        { type: 'multiple_options', template: "I found several options. Which one do you prefer?" }
      ],
      pt: [
        { type: 'ambiguous_file', template: 'Qual arquivo você quer dizer? Encontrei várias correspondências.' },
        { type: 'ambiguous_action', template: 'O que você gostaria que eu fizesse com isso?' },
        { type: 'missing_context', template: 'Poderia fornecer mais contexto?' },
        { type: 'unclear_scope', template: 'Devo olhar todos os seus documentos ou um específico?' },
        { type: 'multiple_options', template: 'Encontrei várias opções. Qual você prefere?' }
      ],
      es: [
        { type: 'ambiguous_file', template: '¿Qué archivo quieres decir? Encontré varias coincidencias.' },
        { type: 'ambiguous_action', template: '¿Qué te gustaría que hiciera con eso?' },
        { type: 'missing_context', template: '¿Podrías proporcionar más contexto?' },
        { type: 'unclear_scope', template: '¿Debo mirar todos tus documentos o uno específico?' },
        { type: 'multiple_options', template: 'Encontré varias opciones. ¿Cuál prefieres?' }
      ]
    }
  };

  const items = templates[bankId]?.[lang] || [];

  return {
    bank_id: bankId,
    language: lang,
    generated: new Date().toISOString(),
    templates: items,
    count: items.length
  };
}

// ============================================================================
// MAIN GENERATOR (EXTENDED)
// ============================================================================

async function generateAllBanks() {
  console.log('Starting comprehensive data bank generation...\n');

  const languages: ('en' | 'pt' | 'es')[] = ['en', 'pt', 'es'];
  let totalFiles = 0;

  // ========== TRIGGERS ==========
  console.log('=== Generating Triggers ===');

  // Primary intents (existing)
  for (const lang of languages) {
    const data = generatePrimaryIntents(lang);
    const filePath = path.join(DATA_BANKS_ROOT, 'triggers', `primary_intents.${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  // Documents subintents
  for (const lang of languages) {
    const data = generateDocumentsSubintents(lang);
    const filePath = path.join(DATA_BANKS_ROOT, 'triggers', `documents_subintents.${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  // File actions subintents
  for (const lang of languages) {
    const data = generateFileActionsSubintents(lang);
    const filePath = path.join(DATA_BANKS_ROOT, 'triggers', `file_actions_subintents.${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  // Domain subintents
  const domains = ['excel', 'finance', 'legal', 'accounting', 'medical'];
  for (const domain of domains) {
    for (const lang of languages) {
      const data = generateDomainSubintents(domain, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'triggers', `${domain}_subintents.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  ✓ ${filePath}`);
      totalFiles++;
    }
  }

  // ========== NEGATIVES ==========
  console.log('\n=== Generating Negatives ===');
  const negativeIds = ['not_file_actions', 'not_help', 'not_conversation', 'not_reasoning', 'not_excel_finance', 'not_inventory_when_doc_stats', 'not_filename_when_locator', 'force_clarify', 'force_disambiguate'];
  for (const bankId of negativeIds) {
    for (const lang of languages) {
      const data = generateNegatives(bankId, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'negatives', `${bankId}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  ✓ ${filePath}`);
      totalFiles++;
    }
  }

  // ========== OVERLAYS ==========
  console.log('\n=== Generating Overlays ===');
  const overlayIds = ['followup_inherit', 'followup_file_actions', 'format_request', 'clarify_required'];
  for (const bankId of overlayIds) {
    for (const lang of languages) {
      const data = generateOverlay(bankId, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'overlays', `${bankId}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  ✓ ${filePath}`);
      totalFiles++;
    }
  }
  // Shared overlays
  const sharedOverlays = ['drift_detectors', 'scope_rules'];
  for (const bankId of sharedOverlays) {
    const data = generateOverlay(bankId, 'shared');
    const filePath = path.join(DATA_BANKS_ROOT, 'overlays', `${bankId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  // ========== FORMATTING ==========
  console.log('\n=== Generating Formatting ===');
  const formattingIds = ['constraints', 'validators', 'repair_rules', 'readability_rules'];
  for (const bankId of formattingIds) {
    const data = generateFormatting(bankId);
    const filePath = path.join(DATA_BANKS_ROOT, 'formatting', `${bankId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  // ========== NORMALIZERS ==========
  console.log('\n=== Generating Normalizers ===');
  const normalizerIds = ['language_indicators', 'filename', 'filetypes', 'months', 'quarters', 'time_windows', 'numbers_currency', 'typos', 'diacritics_pt', 'diacritics_es', 'abbreviations_finance', 'abbreviations_legal', 'abbreviations_medical'];
  for (const bankId of normalizerIds) {
    const data = generateNormalizer(bankId);
    const filePath = path.join(DATA_BANKS_ROOT, 'normalizers', `${bankId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  // ========== LEXICONS ==========
  console.log('\n=== Generating Lexicons ===');
  const lexiconDomains = ['finance', 'legal', 'accounting', 'medical', 'excel', 'project_agile', 'ui_navigation'];
  for (const domain of lexiconDomains) {
    for (const lang of languages) {
      const data = domain === 'finance' || domain === 'legal'
        ? generateLexicon(domain, lang)
        : generateExtendedLexicon(domain, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'lexicons', `${domain}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  ✓ ${filePath}`);
      totalFiles++;
    }
  }

  // ========== TEMPLATES ==========
  console.log('\n=== Generating Templates ===');
  const templateIds = ['answer_styles', 'file_actions_microcopy', 'error_templates'];
  for (const bankId of templateIds) {
    for (const lang of languages) {
      const data = generateTemplates(bankId, lang);
      const filePath = path.join(DATA_BANKS_ROOT, 'templates', `${bankId}.${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  ✓ ${filePath}`);
      totalFiles++;
    }
  }
  // Clarify templates
  for (const lang of languages) {
    const data = generateExtendedTemplates('clarify_templates', lang);
    const filePath = path.join(DATA_BANKS_ROOT, 'templates', `clarify_templates.${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✓ ${filePath}`);
    totalFiles++;
  }

  console.log(`\n✅ Generated ${totalFiles} data bank files`);
  console.log('All manifest-specified banks have been created.');
}

// Run
generateAllBanks().catch(console.error);
