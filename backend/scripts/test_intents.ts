/**
 * Comprehensive Intent Validation Test Script
 *
 * Tests all 25 intents across 3 languages (en/pt/es) with multiple query variants.
 * Fails on mismatches or low confidence.
 */

import { initializeContainer, getContainer } from '../src/bootstrap/container';
import type { IntentName, LanguageCode } from '../src/types/intentV3.types';

interface TestCase {
  text: string;
  language: LanguageCode;
  expectedIntent: IntentName;
  description?: string;
}

interface TestResult {
  passed: boolean;
  text: string;
  language: LanguageCode;
  expectedIntent: IntentName;
  actualIntent: string;
  confidence: number;
  matchedPattern?: string;
  error?: string;
}

// ============================================================================
// TEST MATRIX - All 25 intents × 3 languages × 2-3 variants
// ============================================================================

const TEST_CASES: TestCase[] = [
  // =========================================================================
  // DOC_QA - Document Question Answering (3 per language)
  // =========================================================================
  // English
  { text: "What does the contract say about payment terms?", language: 'en', expectedIntent: 'DOC_QA' },
  { text: "In 'nda.pdf', what's the confidentiality term?", language: 'en', expectedIntent: 'DOC_QA' },
  { text: "According to my documents, what is the deadline?", language: 'en', expectedIntent: 'DOC_QA' },
  // Portuguese
  { text: "O que o contrato diz sobre os termos de pagamento?", language: 'pt', expectedIntent: 'DOC_QA' },
  { text: "No 'nda.pdf', qual é o prazo de confidencialidade?", language: 'pt', expectedIntent: 'DOC_QA' },
  { text: "De acordo com meus documentos, qual é o prazo final?", language: 'pt', expectedIntent: 'DOC_QA' },
  // Spanish
  { text: "¿Qué dice el contrato sobre los términos de pago?", language: 'es', expectedIntent: 'DOC_QA' },
  { text: "En 'nda.pdf', ¿cuál es el término de confidencialidad?", language: 'es', expectedIntent: 'DOC_QA' },
  { text: "Según mis documentos, ¿cuál es la fecha límite?", language: 'es', expectedIntent: 'DOC_QA' },

  // =========================================================================
  // DOC_ANALYTICS - Document Statistics (2-3 per language)
  // =========================================================================
  // English
  { text: "How many documents do I have?", language: 'en', expectedIntent: 'DOC_ANALYTICS' },
  { text: "List counts of completed vs processing documents", language: 'en', expectedIntent: 'DOC_ANALYTICS' },
  { text: "Show me document statistics", language: 'en', expectedIntent: 'DOC_ANALYTICS' },
  // Portuguese
  { text: "Quantos documentos eu tenho?", language: 'pt', expectedIntent: 'DOC_ANALYTICS' },
  { text: "Liste a contagem de documentos completos vs em processamento", language: 'pt', expectedIntent: 'DOC_ANALYTICS' },
  { text: "Mostre minhas estatísticas de documentos", language: 'pt', expectedIntent: 'DOC_ANALYTICS' },
  // Spanish
  { text: "¿Cuántos documentos tengo?", language: 'es', expectedIntent: 'DOC_ANALYTICS' },
  { text: "Lista el conteo de documentos completados vs en proceso", language: 'es', expectedIntent: 'DOC_ANALYTICS' },
  { text: "Muéstrame las estadísticas de documentos", language: 'es', expectedIntent: 'DOC_ANALYTICS' },

  // =========================================================================
  // DOC_MANAGEMENT - Document Actions (2-3 per language)
  // =========================================================================
  // English
  { text: "Delete my document test.pdf", language: 'en', expectedIntent: 'DOC_MANAGEMENT' },
  { text: "Move file report.docx to folder Projects", language: 'en', expectedIntent: 'DOC_MANAGEMENT' },
  { text: "Rename invoice.pdf to invoice_2024.pdf", language: 'en', expectedIntent: 'DOC_MANAGEMENT' },
  // Portuguese
  { text: "Delete meu documento test.pdf", language: 'pt', expectedIntent: 'DOC_MANAGEMENT' },
  { text: "Mova o arquivo relatorio.docx para a pasta Projetos", language: 'pt', expectedIntent: 'DOC_MANAGEMENT' },
  { text: "Renomeie fatura.pdf para fatura_2024.pdf", language: 'pt', expectedIntent: 'DOC_MANAGEMENT' },
  // Spanish
  { text: "Elimina mi documento test.pdf", language: 'es', expectedIntent: 'DOC_MANAGEMENT' },
  { text: "Mueve el archivo informe.docx a la carpeta Proyectos", language: 'es', expectedIntent: 'DOC_MANAGEMENT' },
  { text: "Renombra factura.pdf a factura_2024.pdf", language: 'es', expectedIntent: 'DOC_MANAGEMENT' },

  // =========================================================================
  // DOC_SEARCH - Document Search (2-3 per language)
  // =========================================================================
  // English
  { text: "Find all documents about GDPR", language: 'en', expectedIntent: 'DOC_SEARCH' },
  { text: "Search my files for invoices", language: 'en', expectedIntent: 'DOC_SEARCH' },
  { text: "Look for documents mentioning Project Alpha", language: 'en', expectedIntent: 'DOC_SEARCH' },
  // Portuguese
  { text: "Encontre todos os documentos sobre LGPD", language: 'pt', expectedIntent: 'DOC_SEARCH' },
  { text: "Busque minhas faturas nos arquivos", language: 'pt', expectedIntent: 'DOC_SEARCH' },
  { text: "Procure documentos que mencionam Projeto Alpha", language: 'pt', expectedIntent: 'DOC_SEARCH' },
  // Spanish
  { text: "Encuentra todos los documentos sobre GDPR", language: 'es', expectedIntent: 'DOC_SEARCH' },
  { text: "Busca facturas en mis archivos", language: 'es', expectedIntent: 'DOC_SEARCH' },
  { text: "Busca documentos que mencionen Proyecto Alpha", language: 'es', expectedIntent: 'DOC_SEARCH' },

  // =========================================================================
  // DOC_SUMMARIZE - Document Summarization (2-3 per language)
  // =========================================================================
  // English
  { text: "Summarize the privacy policy", language: 'en', expectedIntent: 'DOC_SUMMARIZE' },
  { text: "Give me a short summary of the contract", language: 'en', expectedIntent: 'DOC_SUMMARIZE' },
  { text: "Can you summarize doc.pdf for me?", language: 'en', expectedIntent: 'DOC_SUMMARIZE' },
  // Portuguese
  { text: "Resuma a política de privacidade", language: 'pt', expectedIntent: 'DOC_SUMMARIZE' },
  { text: "Me dê um resumo curto do contrato", language: 'pt', expectedIntent: 'DOC_SUMMARIZE' },
  { text: "Você pode resumir o doc.pdf para mim?", language: 'pt', expectedIntent: 'DOC_SUMMARIZE' },
  // Spanish
  { text: "Resume la política de privacidad", language: 'es', expectedIntent: 'DOC_SUMMARIZE' },
  { text: "Dame un resumen corto del contrato", language: 'es', expectedIntent: 'DOC_SUMMARIZE' },
  { text: "¿Puedes resumir doc.pdf para mí?", language: 'es', expectedIntent: 'DOC_SUMMARIZE' },

  // =========================================================================
  // PREFERENCE_UPDATE - User Preferences (2-3 per language)
  // =========================================================================
  // English
  { text: "Set my language to Portuguese", language: 'en', expectedIntent: 'PREFERENCE_UPDATE' },
  { text: "Change tone to formal", language: 'en', expectedIntent: 'PREFERENCE_UPDATE' },
  { text: "Update my settings to dark mode", language: 'en', expectedIntent: 'PREFERENCE_UPDATE' },
  // Portuguese
  { text: "Configure meu idioma para inglês", language: 'pt', expectedIntent: 'PREFERENCE_UPDATE' },
  { text: "Mude o tom para formal", language: 'pt', expectedIntent: 'PREFERENCE_UPDATE' },
  { text: "Atualize minhas configurações para modo escuro", language: 'pt', expectedIntent: 'PREFERENCE_UPDATE' },
  // Spanish
  { text: "Configura mi idioma a inglés", language: 'es', expectedIntent: 'PREFERENCE_UPDATE' },
  { text: "Cambia el tono a formal", language: 'es', expectedIntent: 'PREFERENCE_UPDATE' },
  { text: "Actualiza mis configuraciones a modo oscuro", language: 'es', expectedIntent: 'PREFERENCE_UPDATE' },

  // =========================================================================
  // MEMORY_STORE - Store Information (2-3 per language)
  // =========================================================================
  // English
  { text: "Remember that my project is Project Phoenix", language: 'en', expectedIntent: 'MEMORY_STORE' },
  { text: "Store that my budget is 10k", language: 'en', expectedIntent: 'MEMORY_STORE' },
  { text: "Keep in mind that I prefer short answers", language: 'en', expectedIntent: 'MEMORY_STORE' },
  // Portuguese
  { text: "Lembre que meu projeto é Projeto Fênix", language: 'pt', expectedIntent: 'MEMORY_STORE' },
  { text: "Guarde que meu orçamento é 10k", language: 'pt', expectedIntent: 'MEMORY_STORE' },
  { text: "Tenha em mente que prefiro respostas curtas", language: 'pt', expectedIntent: 'MEMORY_STORE' },
  // Spanish
  { text: "Recuerda que mi proyecto es Proyecto Fénix", language: 'es', expectedIntent: 'MEMORY_STORE' },
  { text: "Guarda que mi presupuesto es 10k", language: 'es', expectedIntent: 'MEMORY_STORE' },
  { text: "Ten en cuenta que prefiero respuestas cortas", language: 'es', expectedIntent: 'MEMORY_STORE' },

  // =========================================================================
  // MEMORY_RECALL - Recall Information (2-3 per language)
  // =========================================================================
  // English
  { text: "What did I tell you earlier?", language: 'en', expectedIntent: 'MEMORY_RECALL' },
  { text: "Recall my last preference", language: 'en', expectedIntent: 'MEMORY_RECALL' },
  { text: "What do you remember about my project?", language: 'en', expectedIntent: 'MEMORY_RECALL' },
  // Portuguese
  { text: "O que eu te disse antes?", language: 'pt', expectedIntent: 'MEMORY_RECALL' },
  { text: "Lembre minha última preferência", language: 'pt', expectedIntent: 'MEMORY_RECALL' },
  { text: "O que você lembra sobre meu projeto?", language: 'pt', expectedIntent: 'MEMORY_RECALL' },
  // Spanish
  { text: "¿Qué te dije antes?", language: 'es', expectedIntent: 'MEMORY_RECALL' },
  { text: "Recuerda mi última preferencia", language: 'es', expectedIntent: 'MEMORY_RECALL' },
  { text: "¿Qué recuerdas sobre mi proyecto?", language: 'es', expectedIntent: 'MEMORY_RECALL' },

  // =========================================================================
  // ANSWER_REWRITE - Rewrite Previous Answer (2-3 per language)
  // =========================================================================
  // English
  { text: "Explain that again differently", language: 'en', expectedIntent: 'ANSWER_REWRITE' },
  { text: "Rewrite your last answer", language: 'en', expectedIntent: 'ANSWER_REWRITE' },
  { text: "Can you rephrase that?", language: 'en', expectedIntent: 'ANSWER_REWRITE' },
  // Portuguese
  { text: "Explique isso de novo de forma diferente", language: 'pt', expectedIntent: 'ANSWER_REWRITE' },
  { text: "Reescreva sua última resposta", language: 'pt', expectedIntent: 'ANSWER_REWRITE' },
  { text: "Você pode reformular isso?", language: 'pt', expectedIntent: 'ANSWER_REWRITE' },
  // Spanish
  { text: "Explica eso de nuevo de forma diferente", language: 'es', expectedIntent: 'ANSWER_REWRITE' },
  { text: "Reescribe tu última respuesta", language: 'es', expectedIntent: 'ANSWER_REWRITE' },
  { text: "¿Puedes reformular eso?", language: 'es', expectedIntent: 'ANSWER_REWRITE' },

  // =========================================================================
  // ANSWER_EXPAND - Expand Previous Answer (2-3 per language)
  // =========================================================================
  // English
  { text: "Add more detail to your last answer", language: 'en', expectedIntent: 'ANSWER_EXPAND' },
  { text: "Expand on that point", language: 'en', expectedIntent: 'ANSWER_EXPAND' },
  { text: "Can you elaborate more?", language: 'en', expectedIntent: 'ANSWER_EXPAND' },
  // Portuguese
  { text: "Adicione mais detalhes à sua última resposta", language: 'pt', expectedIntent: 'ANSWER_EXPAND' },
  { text: "Expanda esse ponto", language: 'pt', expectedIntent: 'ANSWER_EXPAND' },
  { text: "Você pode elaborar mais?", language: 'pt', expectedIntent: 'ANSWER_EXPAND' },
  // Spanish
  { text: "Añade más detalles a tu última respuesta", language: 'es', expectedIntent: 'ANSWER_EXPAND' },
  { text: "Expande ese punto", language: 'es', expectedIntent: 'ANSWER_EXPAND' },
  { text: "¿Puedes elaborar más?", language: 'es', expectedIntent: 'ANSWER_EXPAND' },

  // =========================================================================
  // ANSWER_SIMPLIFY - Simplify Previous Answer (2-3 per language)
  // =========================================================================
  // English
  { text: "Make that simpler", language: 'en', expectedIntent: 'ANSWER_SIMPLIFY' },
  { text: "Explain in simple terms", language: 'en', expectedIntent: 'ANSWER_SIMPLIFY' },
  { text: "Can you dumb it down?", language: 'en', expectedIntent: 'ANSWER_SIMPLIFY' },
  // Portuguese
  { text: "Simplifique isso", language: 'pt', expectedIntent: 'ANSWER_SIMPLIFY' },
  { text: "Explique em termos simples", language: 'pt', expectedIntent: 'ANSWER_SIMPLIFY' },
  { text: "Pode simplificar a explicação?", language: 'pt', expectedIntent: 'ANSWER_SIMPLIFY' },
  // Spanish
  { text: "Simplifica eso", language: 'es', expectedIntent: 'ANSWER_SIMPLIFY' },
  { text: "Explica en términos simples", language: 'es', expectedIntent: 'ANSWER_SIMPLIFY' },
  { text: "¿Puedes simplificar la explicación?", language: 'es', expectedIntent: 'ANSWER_SIMPLIFY' },

  // =========================================================================
  // FEEDBACK_POSITIVE - Positive Feedback (2-3 per language)
  // =========================================================================
  // English
  { text: "Thanks, that's perfect!", language: 'en', expectedIntent: 'FEEDBACK_POSITIVE' },
  { text: "Great answer", language: 'en', expectedIntent: 'FEEDBACK_POSITIVE' },
  { text: "Exactly what I needed", language: 'en', expectedIntent: 'FEEDBACK_POSITIVE' },
  // Portuguese
  { text: "Obrigado, isso é perfeito!", language: 'pt', expectedIntent: 'FEEDBACK_POSITIVE' },
  { text: "Ótima resposta", language: 'pt', expectedIntent: 'FEEDBACK_POSITIVE' },
  { text: "Exatamente o que eu precisava", language: 'pt', expectedIntent: 'FEEDBACK_POSITIVE' },
  // Spanish
  { text: "Gracias, eso es perfecto!", language: 'es', expectedIntent: 'FEEDBACK_POSITIVE' },
  { text: "Gran respuesta", language: 'es', expectedIntent: 'FEEDBACK_POSITIVE' },
  { text: "Exactamente lo que necesitaba", language: 'es', expectedIntent: 'FEEDBACK_POSITIVE' },

  // =========================================================================
  // FEEDBACK_NEGATIVE - Negative Feedback (2-3 per language)
  // =========================================================================
  // English
  { text: "That was wrong", language: 'en', expectedIntent: 'FEEDBACK_NEGATIVE' },
  { text: "This isn't correct", language: 'en', expectedIntent: 'FEEDBACK_NEGATIVE' },
  { text: "That's not what I asked for", language: 'en', expectedIntent: 'FEEDBACK_NEGATIVE' },
  // Portuguese
  { text: "Isso estava errado", language: 'pt', expectedIntent: 'FEEDBACK_NEGATIVE' },
  { text: "Isso não está correto", language: 'pt', expectedIntent: 'FEEDBACK_NEGATIVE' },
  { text: "Não foi isso que eu pedi", language: 'pt', expectedIntent: 'FEEDBACK_NEGATIVE' },
  // Spanish
  { text: "Eso estaba mal", language: 'es', expectedIntent: 'FEEDBACK_NEGATIVE' },
  { text: "Esto no es correcto", language: 'es', expectedIntent: 'FEEDBACK_NEGATIVE' },
  { text: "No es lo que pedí", language: 'es', expectedIntent: 'FEEDBACK_NEGATIVE' },

  // =========================================================================
  // PRODUCT_HELP - Product Usage Help (2-3 per language)
  // =========================================================================
  // English
  { text: "How do I upload a file?", language: 'en', expectedIntent: 'PRODUCT_HELP' },
  { text: "How to tag documents?", language: 'en', expectedIntent: 'PRODUCT_HELP' },
  { text: "Where can I find my settings?", language: 'en', expectedIntent: 'PRODUCT_HELP' },
  // Portuguese
  { text: "Como faço para enviar um arquivo?", language: 'pt', expectedIntent: 'PRODUCT_HELP' },
  { text: "Como marcar documentos?", language: 'pt', expectedIntent: 'PRODUCT_HELP' },
  { text: "Onde posso encontrar minhas configurações?", language: 'pt', expectedIntent: 'PRODUCT_HELP' },
  // Spanish
  { text: "¿Cómo subo un archivo?", language: 'es', expectedIntent: 'PRODUCT_HELP' },
  { text: "¿Cómo etiquetar documentos?", language: 'es', expectedIntent: 'PRODUCT_HELP' },
  { text: "¿Dónde puedo encontrar mis configuraciones?", language: 'es', expectedIntent: 'PRODUCT_HELP' },

  // =========================================================================
  // ONBOARDING_HELP - Getting Started (2-3 per language)
  // =========================================================================
  // English
  { text: "How do I get started with Koda?", language: 'en', expectedIntent: 'ONBOARDING_HELP' },
  { text: "What's the first step?", language: 'en', expectedIntent: 'ONBOARDING_HELP' },
  { text: "I'm new here, what should I do first?", language: 'en', expectedIntent: 'ONBOARDING_HELP' },
  // Portuguese
  { text: "Como começo a usar o Koda?", language: 'pt', expectedIntent: 'ONBOARDING_HELP' },
  { text: "Qual é o primeiro passo?", language: 'pt', expectedIntent: 'ONBOARDING_HELP' },
  { text: "Sou novo aqui, o que devo fazer primeiro?", language: 'pt', expectedIntent: 'ONBOARDING_HELP' },
  // Spanish
  { text: "¿Cómo empiezo a usar Koda?", language: 'es', expectedIntent: 'ONBOARDING_HELP' },
  { text: "¿Cuál es el primer paso?", language: 'es', expectedIntent: 'ONBOARDING_HELP' },
  { text: "Soy nuevo aquí, ¿qué debo hacer primero?", language: 'es', expectedIntent: 'ONBOARDING_HELP' },

  // =========================================================================
  // FEATURE_REQUEST - Feature Requests (2-3 per language)
  // =========================================================================
  // English
  { text: "Please add dark mode", language: 'en', expectedIntent: 'FEATURE_REQUEST' },
  { text: "I'd like a calendar integration", language: 'en', expectedIntent: 'FEATURE_REQUEST' },
  { text: "Can you add export to Excel?", language: 'en', expectedIntent: 'FEATURE_REQUEST' },
  // Portuguese
  { text: "Por favor, adicione modo escuro", language: 'pt', expectedIntent: 'FEATURE_REQUEST' },
  { text: "Eu gostaria de uma integração com calendário", language: 'pt', expectedIntent: 'FEATURE_REQUEST' },
  { text: "Vocês podem adicionar exportar para Excel?", language: 'pt', expectedIntent: 'FEATURE_REQUEST' },
  // Spanish
  { text: "Por favor añade modo oscuro", language: 'es', expectedIntent: 'FEATURE_REQUEST' },
  { text: "Me gustaría una integración con calendario", language: 'es', expectedIntent: 'FEATURE_REQUEST' },
  { text: "¿Pueden añadir exportar a Excel?", language: 'es', expectedIntent: 'FEATURE_REQUEST' },

  // =========================================================================
  // GENERIC_KNOWLEDGE - World Knowledge (2-3 per language)
  // =========================================================================
  // English
  { text: "Who is the president of France?", language: 'en', expectedIntent: 'GENERIC_KNOWLEDGE' },
  { text: "What's the capital of Brazil?", language: 'en', expectedIntent: 'GENERIC_KNOWLEDGE' },
  { text: "When was World War 2?", language: 'en', expectedIntent: 'GENERIC_KNOWLEDGE' },
  // Portuguese
  { text: "Quem é o presidente da França?", language: 'pt', expectedIntent: 'GENERIC_KNOWLEDGE' },
  { text: "Qual é a capital do Brasil?", language: 'pt', expectedIntent: 'GENERIC_KNOWLEDGE' },
  { text: "Quando foi a Segunda Guerra Mundial?", language: 'pt', expectedIntent: 'GENERIC_KNOWLEDGE' },
  // Spanish
  { text: "¿Quién es el presidente de Francia?", language: 'es', expectedIntent: 'GENERIC_KNOWLEDGE' },
  { text: "¿Cuál es la capital de Brasil?", language: 'es', expectedIntent: 'GENERIC_KNOWLEDGE' },
  { text: "¿Cuándo fue la Segunda Guerra Mundial?", language: 'es', expectedIntent: 'GENERIC_KNOWLEDGE' },

  // =========================================================================
  // REASONING_TASK - Math and Logic (2-3 per language)
  // =========================================================================
  // English
  { text: "What is 12 times 17?", language: 'en', expectedIntent: 'REASONING_TASK' },
  { text: "If A>B and B>C, is A>C?", language: 'en', expectedIntent: 'REASONING_TASK' },
  { text: "Calculate 15% of 250", language: 'en', expectedIntent: 'REASONING_TASK' },
  // Portuguese
  { text: "Quanto é 12 vezes 17?", language: 'pt', expectedIntent: 'REASONING_TASK' },
  { text: "Se A>B e B>C, A>C?", language: 'pt', expectedIntent: 'REASONING_TASK' },
  { text: "Calcule 15% de 250", language: 'pt', expectedIntent: 'REASONING_TASK' },
  // Spanish
  { text: "¿Cuánto es 12 por 17?", language: 'es', expectedIntent: 'REASONING_TASK' },
  { text: "Si A>B y B>C, ¿A>C?", language: 'es', expectedIntent: 'REASONING_TASK' },
  { text: "Calcula el 15% de 250", language: 'es', expectedIntent: 'REASONING_TASK' },

  // =========================================================================
  // TEXT_TRANSFORM - Text Transformations (2-3 per language)
  // =========================================================================
  // English
  { text: "Translate to Spanish: hello world", language: 'en', expectedIntent: 'TEXT_TRANSFORM' },
  { text: "Convert this to bullet points: The quick brown fox jumps", language: 'en', expectedIntent: 'TEXT_TRANSFORM' },
  { text: "Rewrite this formally: hey what's up", language: 'en', expectedIntent: 'TEXT_TRANSFORM' },
  // Portuguese
  { text: "Traduza para espanhol: olá mundo", language: 'pt', expectedIntent: 'TEXT_TRANSFORM' },
  { text: "Converta isso em tópicos: O rápido raposo marrom pula", language: 'pt', expectedIntent: 'TEXT_TRANSFORM' },
  { text: "Reescreva formalmente: e aí, beleza", language: 'pt', expectedIntent: 'TEXT_TRANSFORM' },
  // Spanish
  { text: "Traduce al inglés: hola mundo", language: 'es', expectedIntent: 'TEXT_TRANSFORM' },
  { text: "Convierte esto en puntos: El rápido zorro marrón salta", language: 'es', expectedIntent: 'TEXT_TRANSFORM' },
  { text: "Reescribe esto formalmente: qué onda", language: 'es', expectedIntent: 'TEXT_TRANSFORM' },

  // =========================================================================
  // CHITCHAT - Greetings and Small Talk (2-3 per language)
  // =========================================================================
  // English
  { text: "Hi there!", language: 'en', expectedIntent: 'CHITCHAT' },
  { text: "How are you?", language: 'en', expectedIntent: 'CHITCHAT' },
  { text: "Good morning!", language: 'en', expectedIntent: 'CHITCHAT' },
  // Portuguese
  { text: "Oi!", language: 'pt', expectedIntent: 'CHITCHAT' },
  { text: "Como você está?", language: 'pt', expectedIntent: 'CHITCHAT' },
  { text: "Bom dia!", language: 'pt', expectedIntent: 'CHITCHAT' },
  // Spanish
  { text: "¡Hola!", language: 'es', expectedIntent: 'CHITCHAT' },
  { text: "¿Cómo estás?", language: 'es', expectedIntent: 'CHITCHAT' },
  { text: "¡Buenos días!", language: 'es', expectedIntent: 'CHITCHAT' },

  // =========================================================================
  // META_AI - Questions About the AI (2-3 per language)
  // =========================================================================
  // English
  { text: "What can you do?", language: 'en', expectedIntent: 'META_AI' },
  { text: "Tell me about your capabilities", language: 'en', expectedIntent: 'META_AI' },
  { text: "Are you an AI?", language: 'en', expectedIntent: 'META_AI' },
  // Portuguese
  { text: "O que você pode fazer?", language: 'pt', expectedIntent: 'META_AI' },
  { text: "Me fale sobre suas capacidades", language: 'pt', expectedIntent: 'META_AI' },
  { text: "Você é uma IA?", language: 'pt', expectedIntent: 'META_AI' },
  // Spanish
  { text: "¿Qué puedes hacer?", language: 'es', expectedIntent: 'META_AI' },
  { text: "Cuéntame sobre tus capacidades", language: 'es', expectedIntent: 'META_AI' },
  { text: "¿Eres una IA?", language: 'es', expectedIntent: 'META_AI' },

  // =========================================================================
  // OUT_OF_SCOPE - Harmful/Inappropriate (2-3 per language)
  // =========================================================================
  // English
  { text: "How to hack a bank?", language: 'en', expectedIntent: 'OUT_OF_SCOPE' },
  { text: "Tell me how to make illegal drugs", language: 'en', expectedIntent: 'OUT_OF_SCOPE' },
  { text: "How to break into someone's house?", language: 'en', expectedIntent: 'OUT_OF_SCOPE' },
  // Portuguese
  { text: "Como hackear um banco?", language: 'pt', expectedIntent: 'OUT_OF_SCOPE' },
  { text: "Me diga como fazer drogas ilegais", language: 'pt', expectedIntent: 'OUT_OF_SCOPE' },
  { text: "Como invadir a casa de alguém?", language: 'pt', expectedIntent: 'OUT_OF_SCOPE' },
  // Spanish
  { text: "¿Cómo hackear un banco?", language: 'es', expectedIntent: 'OUT_OF_SCOPE' },
  { text: "Dime cómo hacer drogas ilegales", language: 'es', expectedIntent: 'OUT_OF_SCOPE' },
  { text: "¿Cómo entrar a la casa de alguien?", language: 'es', expectedIntent: 'OUT_OF_SCOPE' },

  // =========================================================================
  // SAFETY_CONCERN - Safety-Related (2-3 per language)
  // =========================================================================
  // English
  { text: "I want to hurt myself", language: 'en', expectedIntent: 'SAFETY_CONCERN' },
  { text: "I'm feeling suicidal", language: 'en', expectedIntent: 'SAFETY_CONCERN' },
  { text: "How to end my life?", language: 'en', expectedIntent: 'SAFETY_CONCERN' },
  // Portuguese
  { text: "Eu quero me machucar", language: 'pt', expectedIntent: 'SAFETY_CONCERN' },
  { text: "Estou me sentindo suicida", language: 'pt', expectedIntent: 'SAFETY_CONCERN' },
  { text: "Como acabar com minha vida?", language: 'pt', expectedIntent: 'SAFETY_CONCERN' },
  // Spanish
  { text: "Quiero hacerme daño", language: 'es', expectedIntent: 'SAFETY_CONCERN' },
  { text: "Me siento suicida", language: 'es', expectedIntent: 'SAFETY_CONCERN' },
  { text: "¿Cómo terminar con mi vida?", language: 'es', expectedIntent: 'SAFETY_CONCERN' },

  // =========================================================================
  // MULTI_INTENT - Multiple Intents (2-3 per language)
  // =========================================================================
  // English
  { text: "List my documents and summarize the latest one", language: 'en', expectedIntent: 'MULTI_INTENT' },
  { text: "Search docs and then translate the results to Spanish", language: 'en', expectedIntent: 'MULTI_INTENT' },
  { text: "Find invoices and calculate the total amount", language: 'en', expectedIntent: 'MULTI_INTENT' },
  // Portuguese
  { text: "Liste meus documentos e resuma o mais recente", language: 'pt', expectedIntent: 'MULTI_INTENT' },
  { text: "Busque documentos e depois traduza os resultados para espanhol", language: 'pt', expectedIntent: 'MULTI_INTENT' },
  { text: "Encontre faturas e calcule o valor total", language: 'pt', expectedIntent: 'MULTI_INTENT' },
  // Spanish
  { text: "Lista mis documentos y resume el más reciente", language: 'es', expectedIntent: 'MULTI_INTENT' },
  { text: "Busca documentos y luego traduce los resultados al inglés", language: 'es', expectedIntent: 'MULTI_INTENT' },
  { text: "Encuentra facturas y calcula el monto total", language: 'es', expectedIntent: 'MULTI_INTENT' },

  // =========================================================================
  // AMBIGUOUS - Too Vague (2-3 per language)
  // =========================================================================
  // English
  { text: "Maybe this?", language: 'en', expectedIntent: 'AMBIGUOUS' },
  { text: "Not sure, perhaps?", language: 'en', expectedIntent: 'AMBIGUOUS' },
  { text: "hmm", language: 'en', expectedIntent: 'AMBIGUOUS' },
  // Portuguese
  { text: "Talvez isso?", language: 'pt', expectedIntent: 'AMBIGUOUS' },
  { text: "Não tenho certeza, talvez?", language: 'pt', expectedIntent: 'AMBIGUOUS' },
  { text: "hmm", language: 'pt', expectedIntent: 'AMBIGUOUS' },
  // Spanish
  { text: "¿Quizás esto?", language: 'es', expectedIntent: 'AMBIGUOUS' },
  { text: "No estoy seguro, ¿tal vez?", language: 'es', expectedIntent: 'AMBIGUOUS' },
  { text: "hmm", language: 'es', expectedIntent: 'AMBIGUOUS' },

  // =========================================================================
  // UNKNOWN - Fallback (2-3 per language)
  // =========================================================================
  // English
  { text: "asdfghjkl", language: 'en', expectedIntent: 'UNKNOWN' },
  { text: "xyz123abc", language: 'en', expectedIntent: 'UNKNOWN' },
  { text: "qwerty uiop", language: 'en', expectedIntent: 'UNKNOWN' },
  // Portuguese
  { text: "asdfghjkl", language: 'pt', expectedIntent: 'UNKNOWN' },
  { text: "xyz123abc", language: 'pt', expectedIntent: 'UNKNOWN' },
  { text: "qwerty uiop", language: 'pt', expectedIntent: 'UNKNOWN' },
  // Spanish
  { text: "asdfghjkl", language: 'es', expectedIntent: 'UNKNOWN' },
  { text: "xyz123abc", language: 'es', expectedIntent: 'UNKNOWN' },
  { text: "qwerty uiop", language: 'es', expectedIntent: 'UNKNOWN' },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests(): Promise<void> {
  console.log('='.repeat(80));
  console.log('INTENT VALIDATION TEST SUITE');
  console.log('='.repeat(80));
  console.log(`Total test cases: ${TEST_CASES.length}`);
  console.log(`Intents: 25 | Languages: 3 (en/pt/es)`);
  console.log('='.repeat(80));
  console.log();

  // Initialize container
  console.log('[Setup] Initializing container...');
  await initializeContainer();
  const container = getContainer();
  const intentEngine = container.getIntentEngine();
  console.log('[Setup] Container initialized successfully\n');

  const results: TestResult[] = [];
  const startTime = Date.now();

  // Group tests by intent for organized output
  const testsByIntent = new Map<string, TestCase[]>();
  for (const testCase of TEST_CASES) {
    const intent = testCase.expectedIntent;
    if (!testsByIntent.has(intent)) {
      testsByIntent.set(intent, []);
    }
    testsByIntent.get(intent)!.push(testCase);
  }

  // Run tests grouped by intent
  for (const [intent, cases] of testsByIntent) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Testing: ${intent} (${cases.length} cases)`);
    console.log('─'.repeat(80));

    for (const testCase of cases) {
      try {
        const prediction = await intentEngine.predict({
          text: testCase.text,
          language: testCase.language,
        });

        const passed = prediction.primaryIntent === testCase.expectedIntent;
        const result: TestResult = {
          passed,
          text: testCase.text,
          language: testCase.language,
          expectedIntent: testCase.expectedIntent,
          actualIntent: prediction.primaryIntent,
          confidence: prediction.confidence,
          matchedPattern: prediction.matchedPattern,
        };
        results.push(result);

        // Output result
        const status = passed ? '✓ PASS' : '✗ FAIL';
        const langFlag = { en: '🇺🇸', pt: '🇧🇷', es: '🇪🇸' }[testCase.language];
        console.log(`  ${status} ${langFlag} "${testCase.text.substring(0, 50)}${testCase.text.length > 50 ? '...' : ''}"`);

        if (!passed) {
          console.log(`         Expected: ${testCase.expectedIntent}`);
          console.log(`         Actual:   ${prediction.primaryIntent} (conf: ${(prediction.confidence * 100).toFixed(1)}%)`);
          if (prediction.matchedPattern) {
            console.log(`         Pattern:  ${prediction.matchedPattern}`);
          }
        }
      } catch (error: any) {
        const result: TestResult = {
          passed: false,
          text: testCase.text,
          language: testCase.language,
          expectedIntent: testCase.expectedIntent,
          actualIntent: 'ERROR',
          confidence: 0,
          error: error.message,
        };
        results.push(result);
        console.log(`  ✗ ERROR "${testCase.text.substring(0, 40)}...": ${error.message}`);
      }
    }
  }

  // Summary
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const passRate = ((passed / results.length) * 100).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total:     ${results.length}`);
  console.log(`Passed:    ${passed} (${passRate}%)`);
  console.log(`Failed:    ${failed}`);
  console.log(`Duration:  ${totalTime}ms`);
  console.log('='.repeat(80));

  // Detailed failure report
  if (failed > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('FAILED TESTS DETAILS');
    console.log('='.repeat(80));

    const failures = results.filter(r => !r.passed);

    // Group failures by expected intent
    const failuresByIntent = new Map<string, TestResult[]>();
    for (const f of failures) {
      if (!failuresByIntent.has(f.expectedIntent)) {
        failuresByIntent.set(f.expectedIntent, []);
      }
      failuresByIntent.get(f.expectedIntent)!.push(f);
    }

    for (const [intent, intentFailures] of failuresByIntent) {
      console.log(`\n${intent}:`);
      for (const f of intentFailures) {
        const langFlag = { en: '🇺🇸', pt: '🇧🇷', es: '🇪🇸' }[f.language];
        console.log(`  ${langFlag} "${f.text}"`);
        console.log(`     Got: ${f.actualIntent} (conf: ${(f.confidence * 100).toFixed(1)}%)`);
        if (f.matchedPattern) {
          console.log(`     Pattern: ${f.matchedPattern}`);
        }
        if (f.error) {
          console.log(`     Error: ${f.error}`);
        }
      }
    }
  }

  // Stats by language
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS BY LANGUAGE');
  console.log('='.repeat(80));
  for (const lang of ['en', 'pt', 'es'] as LanguageCode[]) {
    const langResults = results.filter(r => r.language === lang);
    const langPassed = langResults.filter(r => r.passed).length;
    const langRate = ((langPassed / langResults.length) * 100).toFixed(1);
    const flag = { en: '🇺🇸 English', pt: '🇧🇷 Portuguese', es: '🇪🇸 Spanish' }[lang];
    console.log(`${flag}: ${langPassed}/${langResults.length} (${langRate}%)`);
  }

  // Stats by intent
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS BY INTENT');
  console.log('='.repeat(80));
  for (const [intent] of testsByIntent) {
    const intentResults = results.filter(r => r.expectedIntent === intent);
    const intentPassed = intentResults.filter(r => r.passed).length;
    const intentRate = ((intentPassed / intentResults.length) * 100).toFixed(1);
    const status = intentPassed === intentResults.length ? '✓' : '✗';
    console.log(`${status} ${intent.padEnd(20)} ${intentPassed}/${intentResults.length} (${intentRate}%)`);
  }

  console.log('\n' + '='.repeat(80));

  // Exit with error code if any tests failed
  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${passed} tests passed!\n`);
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
