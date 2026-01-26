/**
 * KODA V3 Product Help Service
 *
 * Loads product help content from JSON files (NO hardcoded text)
 * Uses koda_product_help.json + capabilities_catalog.json
 *
 * Based on: pasted_content_21.txt Layer 6 and pasted_content_22.txt Section 8
 */

import * as fs from 'fs';
import * as path from 'path';
import { LanguageCode } from '../../types/intentV3.types';
import { pickFileActionMessage } from '../core/microcopyPicker.service';

/**
 * Product help topic
 */
interface ProductHelpTopic {
  id: string;
  category: string;
  keywords: string[];
  content: Record<LanguageCode, {
    title: string;
    description: string;
    steps?: string[];
    examples?: string[];
    relatedTopics?: string[];
  }>;
}

/**
 * Capability definition
 */
interface Capability {
  id: string;
  name: string;
  description: Record<LanguageCode, string>;
  available: boolean;
  limitations?: Record<LanguageCode, string[]>;
}

/**
 * Product help result
 */
export interface ProductHelpResult {
  text: string;
  relatedTopics?: string[];
  metadata?: {
    topicId?: string;
    category?: string;
    confidence?: number;
  };
}

export class KodaProductHelpServiceV3 {
  private topics: Map<string, ProductHelpTopic> = new Map();
  private capabilities: Map<string, Capability> = new Map();
  private isLoaded = false;
  private readonly helpConfigPath: string;
  private readonly capabilitiesConfigPath: string;
  private readonly logger: any;

  constructor(
    helpConfigPath: string = path.join(__dirname, '../../data_banks/microcopy/koda_product_help.any.json'),
    capabilitiesConfigPath: string = path.join(__dirname, '../../data_banks/policies/capabilities_catalog.any.json'),
    logger?: any
  ) {
    this.helpConfigPath = helpConfigPath;
    this.capabilitiesConfigPath = capabilitiesConfigPath;
    this.logger = logger || console;
  }

  /**
   * Load product help and capabilities from JSON
   * Call once on startup
   */
  async loadContent(): Promise<void> {
    if (this.isLoaded) {
      this.logger.warn('[ProductHelp] Content already loaded, skipping');
      return;
    }

    try {
      // Load product help topics
      this.logger.info('[ProductHelp] Loading help topics from:', this.helpConfigPath);
      const helpData = JSON.parse(fs.readFileSync(this.helpConfigPath, 'utf-8'));

      if (helpData.topics) {
        for (const topic of helpData.topics) {
          this.topics.set(topic.id, topic);
        }
        this.logger.info(`[ProductHelp] Loaded ${this.topics.size} help topics`);
      }

      // Load capabilities catalog
      this.logger.info('[ProductHelp] Loading capabilities from:', this.capabilitiesConfigPath);
      const capData = JSON.parse(fs.readFileSync(this.capabilitiesConfigPath, 'utf-8'));

      if (capData.capabilities) {
        for (const cap of capData.capabilities) {
          this.capabilities.set(cap.id, cap);
        }
        this.logger.info(`[ProductHelp] Loaded ${this.capabilities.size} capabilities`);
      }

      this.isLoaded = true;

    } catch (error) {
      this.logger.error('[ProductHelp] Failed to load content:', error);
      throw new Error('Failed to initialize product help service');
    }
  }

  /**
   * Get help for a user query
   */
  async getHelp(params: {
    query: string;
    language: LanguageCode;
  }): Promise<ProductHelpResult> {
    const { query, language } = params;

    // Check if query is about uploading
    const isUploadQuery = this.isUploadRelatedQuery(query);

    // Find best matching topic
    const topic = this.findBestTopic(query, language);

    if (topic) {
      const result = this.formatTopicHelp(topic, language);
      // Add upload button if this is an upload query
      if (isUploadQuery && !result.text.includes('{{UPLOAD::')) {
        result.text = this.appendUploadButton(result.text, language);
      }
      return result;
    }

    // No specific topic found - return general help
    const generalHelp = this.getGeneralHelp(language);
    // Add upload button if this is an upload query
    if (isUploadQuery && !generalHelp.text.includes('{{UPLOAD::')) {
      generalHelp.text = this.appendUploadButton(generalHelp.text, language);
    }
    return generalHelp;
  }

  /**
   * Check if query is related to uploading
   */
  private isUploadRelatedQuery(query: string): boolean {
    const uploadKeywords = [
      'upload', 'how to upload', 'where upload', 'where can i upload',
      'add file', 'add document', 'import', 'enviar', 'carregar',
      'subir', 'como faço upload', 'como posso upload', 'cómo subo'
    ];
    const normalizedQuery = query.toLowerCase();
    return uploadKeywords.some(kw => normalizedQuery.includes(kw));
  }

  /**
   * Append upload button marker to text
   */
  private appendUploadButton(text: string, language: LanguageCode): string {
    const uploadLabels: Record<LanguageCode, string> = {
      en: 'Upload documents',
      pt: 'Enviar documentos',
      es: 'Subir documentos',
    };
    return text.trim() + `\n\n{{UPLOAD::${uploadLabels[language] || uploadLabels['en']}}}`;
  }

  /**
   * Find best matching topic for query
   */
  private findBestTopic(query: string, language: LanguageCode): ProductHelpTopic | null {
    const normalizedQuery = query.toLowerCase();

    let bestMatch: ProductHelpTopic | null = null;
    let bestScore = 0;

    for (const topic of this.topics.values()) {
      let score = 0;

      // Check keyword matches
      for (const keyword of topic.keywords) {
        if (normalizedQuery.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Check title match
      const content = topic.content[language] || topic.content['en'];
      if (content && normalizedQuery.includes(content.title.toLowerCase())) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = topic;
      }
    }

    return bestScore > 0 ? bestMatch : null;
  }

  /**
   * Format topic help into readable text
   */
  private formatTopicHelp(topic: ProductHelpTopic, language: LanguageCode): ProductHelpResult {
    const content = topic.content[language] || topic.content['en'];

    if (!content) {
      return this.getGeneralHelp(language);
    }

    let text = `**${content.title}**\n\n${content.description}`;

    if (content.steps && content.steps.length > 0) {
      text += '\n\n**Steps:**\n';
      content.steps.forEach((step, index) => {
        text += `${index + 1}. ${step}\n`;
      });
    }

    if (content.examples && content.examples.length > 0) {
      text += '\n\n**Examples:**\n';
      content.examples.forEach(example => {
        text += `- ${example}\n`;
      });
    }

    return {
      text,
      relatedTopics: content.relatedTopics,
      metadata: {
        topicId: topic.id,
        category: topic.category,
        confidence: 0.9,
      },
    };
  }

  /**
   * Get general help when no specific topic matches
   */
  private getGeneralHelp(language: LanguageCode): ProductHelpResult {
    const generalHelp: Record<LanguageCode, string> = {
      en: `**Koda Help**

I can help you with:
- Uploading and managing documents
- Searching across your files
- Asking questions about your documents
- Getting analytics about your knowledge base

Try asking:
- "How do I upload a document?"
- "How can I search my files?"
- "What can Koda do?"`,
      pt: `**Ajuda do Koda**

Posso ajudá-lo com:
- Upload e gerenciamento de documentos
- Pesquisa em seus arquivos
- Perguntas sobre seus documentos
- Análises sobre sua base de conhecimento

Experimente perguntar:
- "Como faço upload de um documento?"
- "Como posso pesquisar meus arquivos?"
- "O que o Koda pode fazer?"`,
      es: `**Ayuda de Koda**

Puedo ayudarte con:
- Subir y gestionar documentos
- Buscar en tus archivos
- Hacer preguntas sobre tus documentos
- Obtener análisis sobre tu base de conocimientos

Intenta preguntar:
- "¿Cómo subo un documento?"
- "¿Cómo puedo buscar en mis archivos?"
- "¿Qué puede hacer Koda?"`,
    };

    return {
      text: generalHelp[language] || generalHelp['en'],
      metadata: {
        category: 'general',
        confidence: 0.5,
      },
    };
  }

  /**
   * Get capability information
   */
  async getCapability(capabilityId: string, language: LanguageCode): Promise<string | null> {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) return null;

    const description = cap.description[language] || cap.description['en'];
    let text = `**${cap.name}**\n\n${description}`;

    if (!cap.available) {
      const notAvailableMsg: Record<LanguageCode, string> = {
        en: '\n\n*This feature is not yet available.*',
        pt: '\n\n*Este recurso ainda não está disponível.*',
        es: '\n\n*Esta función aún no está disponible.*',
      };
      text += notAvailableMsg[language] || notAvailableMsg['en'];
    }

    if (cap.limitations) {
      const limitations = cap.limitations[language] || cap.limitations['en'];
      if (limitations && limitations.length > 0) {
        const limitationsLabel: Record<LanguageCode, string> = {
          en: '\n\n**Limitations:**\n',
          pt: '\n\n**Limitações:**\n',
          es: '\n\n**Limitaciones:**\n',
        };
        text += limitationsLabel[language] || limitationsLabel['en'];
        limitations.forEach(limit => {
          text += `- ${limit}\n`;
        });
      }
    }

    return text;
  }

  /**
   * List all available capabilities
   */
  async listCapabilities(language: LanguageCode): Promise<string> {
    const capabilities = Array.from(this.capabilities.values())
      .filter(cap => cap.available);

    if (capabilities.length === 0) {
      const langKey = (language === 'pt' ? 'pt' : language === 'es' ? 'es' : 'en') as 'en' | 'pt' | 'es';
      return pickFileActionMessage('no_capabilities', langKey, `cap_${Date.now()}`);
    }

    const header: Record<LanguageCode, string> = {
      en: '**Koda Capabilities**\n\n',
      pt: '**Capacidades do Koda**\n\n',
      es: '**Capacidades de Koda**\n\n',
    };

    let text = header[language] || header['en'];

    capabilities.forEach(cap => {
      const description = cap.description[language] || cap.description['en'];
      text += `- **${cap.name}**: ${description}\n`;
    });

    return text;
  }

  /**
   * Get topic by ID
   */
  getTopic(topicId: string): ProductHelpTopic | undefined {
    return this.topics.get(topicId);
  }

  /**
   * Get all topics in a category
   */
  getTopicsByCategory(category: string): ProductHelpTopic[] {
    return Array.from(this.topics.values())
      .filter(topic => topic.category === category);
  }

  /**
   * Search topics by keyword
   */
  searchTopics(keyword: string, language: LanguageCode): ProductHelpTopic[] {
    const normalizedKeyword = keyword.toLowerCase();
    const results: ProductHelpTopic[] = [];

    for (const topic of this.topics.values()) {
      // Check keywords
      if (topic.keywords.some(kw => kw.toLowerCase().includes(normalizedKeyword))) {
        results.push(topic);
        continue;
      }

      // Check title and description
      const content = topic.content[language] || topic.content['en'];
      if (content) {
        if (content.title.toLowerCase().includes(normalizedKeyword) ||
            content.description.toLowerCase().includes(normalizedKeyword)) {
          results.push(topic);
        }
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      topicsLoaded: this.topics.size,
      capabilitiesLoaded: this.capabilities.size,
      isReady: this.isLoaded,
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}

// Singleton instance for direct import (loaded in server.ts before container init)
export const kodaProductHelpServiceV3 = new KodaProductHelpServiceV3();

// Export class for DI registration
export default KodaProductHelpServiceV3;
