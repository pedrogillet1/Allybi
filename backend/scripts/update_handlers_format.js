/**
 * Script to update handlers to use formatting
 */
const fs = require('fs');
const path = require('path');

const orchestratorPath = path.join(__dirname, '../src/services/core/kodaOrchestratorV3.service.ts');
let content = fs.readFileSync(orchestratorPath, 'utf-8');

// Track changes
let changes = 0;

// 1. Update handleChitchat - make it async and use formatSimple
if (content.includes('private async handleChitchat(context: HandlerContext): Promise<IntentHandlerResponse>')) {
  // Already async, update the return statements to use formatting
  const chitchatPattern = /private async handleChitchat\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return \{[\s\S]*?\};\s*\}/;

  content = content.replace(chitchatPattern, `private async handleChitchat(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Simple chitchat responses
    const greetingPatterns = ['hello', 'hi', 'hey', 'olá', 'oi', 'hola'];
    const isGreeting = greetingPatterns.some(p => request.text.toLowerCase().includes(p));

    let responseText: string;
    if (isGreeting) {
      const greetings: Record<LanguageCode, string> = {
        en: "Hello! I'm Koda, your document assistant. How can I help you today?",
        pt: "Olá! Sou o Koda, seu assistente de documentos. Como posso ajudá-lo hoje?",
        es: "¡Hola! Soy Koda, tu asistente de documentos. ¿Cómo puedo ayudarte hoy?",
      };
      responseText = greetings[language] || greetings['en'];
    } else {
      const responses: Record<LanguageCode, string> = {
        en: "I'm here to help with your documents! Feel free to ask me anything about them.",
        pt: "Estou aqui para ajudar com seus documentos! Fique à vontade para me perguntar qualquer coisa sobre eles.",
        es: "¡Estoy aquí para ayudar con tus documentos! No dudes en preguntarme cualquier cosa sobre ellos.",
      };
      responseText = responses[language] || responses['en'];
    }

    const formatted = await this.formatSimple(responseText, 'CHITCHAT', language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true },
    };
  }`);
  changes++;
  console.log('Updated handleChitchat');
}

// 2. Update handleMetaAI
const metaAIPattern = /private async handleMetaAI\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return \{[\s\S]*?\};\s*\}/;
if (content.match(metaAIPattern)) {
  content = content.replace(metaAIPattern, `private async handleMetaAI(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "I'm Koda, an AI assistant specialized in helping you work with your documents. I use advanced language models to understand your questions and find answers in your uploaded files.",
      pt: "Sou Koda, um assistente de IA especializado em ajudá-lo a trabalhar com seus documentos. Uso modelos de linguagem avançados para entender suas perguntas e encontrar respostas em seus arquivos enviados.",
      es: "Soy Koda, un asistente de IA especializado en ayudarte a trabajar con tus documentos. Utilizo modelos de lenguaje avanzados para entender tus preguntas y encontrar respuestas en tus archivos subidos.",
    };

    const responseText = responses[language] || responses['en'];
    const formatted = await this.formatSimple(responseText, 'META_AI', language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true },
    };
  }`);
  changes++;
  console.log('Updated handleMetaAI');
}

// 3. Update handlePreferenceUpdate
const prefUpdatePattern = /private async handlePreferenceUpdate\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return \{[\s\S]*?\};\s*\}/;
if (content.match(prefUpdatePattern)) {
  content = content.replace(prefUpdatePattern, `private async handlePreferenceUpdate(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const confirmationMessages: Record<LanguageCode, string> = {
      en: "I've noted your preference. Settings will be updated in a future release.",
      pt: "Anotei sua preferência. As configurações serão atualizadas em uma versão futura.",
      es: "He anotado tu preferencia. La configuración se actualizará en una versión futura.",
    };

    const responseText = confirmationMessages[language] || confirmationMessages['en'];
    const formatted = await this.formatSimple(responseText, 'PREFERENCE_UPDATE', language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true },
    };
  }`);
  changes++;
  console.log('Updated handlePreferenceUpdate');
}

// 4. Update handleMemoryStore
const memStorePattern = /private async handleMemoryStore\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return \{[\s\S]*?\};\s*\}/;
if (content.match(memStorePattern)) {
  content = content.replace(memStorePattern, `private async handleMemoryStore(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Add to conversation memory via addMessage (if conversation exists)
    if (request.conversationId) {
      await this.conversationMemory.addMessage(
        request.conversationId,
        'user',
        request.text
      );
    }

    const confirmationMessages: Record<LanguageCode, string> = {
      en: "I'll remember that!",
      pt: "Vou me lembrar disso!",
      es: "¡Lo recordaré!",
    };

    const responseText = confirmationMessages[language] || confirmationMessages['en'];
    const formatted = await this.formatSimple(responseText, 'MEMORY_STORE', language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true },
    };
  }`);
  changes++;
  console.log('Updated handleMemoryStore');
}

// 5. Update handleMemoryRecall
const memRecallPattern = /private async handleMemoryRecall\(context: HandlerContext\): Promise<IntentHandlerResponse> \{[\s\S]*?return \{[\s\S]*?\};\s*\n  \}/;
if (content.match(memRecallPattern)) {
  content = content.replace(memRecallPattern, `private async handleMemoryRecall(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    if (request.conversationId) {
      const conversationContext = await this.conversationMemory.getContext(request.conversationId);

      if (conversationContext && conversationContext.messages.length > 0) {
        // Get recent context summary
        const recentMessages = conversationContext.messages.slice(-5);
        const summary = recentMessages
          .map(m => \`\${m.role}: \${m.content.substring(0, 100)}...\`)
          .join('\\n');

        const recallMessages: Record<LanguageCode, string> = {
          en: \`Here's what I remember from our recent conversation:\\n\${summary}\`,
          pt: \`Aqui está o que lembro da nossa conversa recente:\\n\${summary}\`,
          es: \`Esto es lo que recuerdo de nuestra conversación reciente:\\n\${summary}\`,
        };

        const responseText = recallMessages[language] || recallMessages['en'];
        const formatted = await this.formatSimple(responseText, 'MEMORY_RECALL', language);
        return {
          answer: formatted,
          formatted,
          metadata: { _formatted: true },
        };
      }
    }

    const noMemoryMessages: Record<LanguageCode, string> = {
      en: "I don't have any previous conversation context to recall.",
      pt: "Não tenho nenhum contexto de conversa anterior para lembrar.",
      es: "No tengo ningún contexto de conversación anterior que recordar.",
    };

    const responseText = noMemoryMessages[language] || noMemoryMessages['en'];
    const formatted = await this.formatSimple(responseText, 'MEMORY_RECALL', language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true },
    };
  }`);
  changes++;
  console.log('Updated handleMemoryRecall');
}

fs.writeFileSync(orchestratorPath, content);
console.log(`Done. Made ${changes} handler updates.`);
