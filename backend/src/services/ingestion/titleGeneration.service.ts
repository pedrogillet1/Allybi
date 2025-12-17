/**
 * Title Generation Service
 *
 * Generates warm, specific, engaging titles for:
 * 1. Conversation titles (sidebar)
 * 2. Answer titles and section headings
 * 3. Document titles (file listing)
 *
 * Uses Gemini 2.5 Flash for fast, cost-effective title generation.
 */

import geminiGateway from '../geminiGateway.service';

export type TitleMode =
  | 'chat_title'
  | 'answer_title'
  | 'answer_sections'
  | 'document_title';

export interface TitleParams {
  mode: TitleMode;
  language: 'pt' | 'en' | string;
  userMessage?: string;
  assistantPreview?: string;
  answerDraft?: string;
  documentText?: string;
  filename?: string;
  domainHint?: 'finance' | 'accounting' | 'legal' | 'medical' | 'education' | 'research' | 'general';
}

export interface TitleResult {
  chatTitle?: string;
  answerTitle?: string;
  sectionHeadings?: string[];
  documentTitle?: string;
}

/**
 * Main title generation function
 */
export async function generateTitleArtifacts(params: TitleParams): Promise<TitleResult> {
  const { mode } = params;

  switch (mode) {
    case 'chat_title':
      return { chatTitle: await generateChatTitle(params) };

    case 'answer_title':
      return { answerTitle: await generateAnswerTitle(params) };

    case 'answer_sections':
      return { sectionHeadings: await generateSectionHeadings(params) };

    case 'document_title':
      return { documentTitle: await generateDocumentTitle(params) };

    default:
      throw new Error(`Unknown title mode: ${mode}`);
  }
}

/**
 * Generate conversation title (for sidebar)
 *
 * Rules:
 * - 6-8 words maximum
 * - Warm, specific, engaging
 * - Same language as user
 * - No quotes, no emojis
 */
async function generateChatTitle(params: TitleParams): Promise<string> {
  const { language, userMessage, assistantPreview } = params;

  if (!userMessage) {
    throw new Error('userMessage is required for chat_title mode');
  }

  const prompt = `You are Koda's Title Engine.

Your job is to generate **short, engaging conversation titles** for a personal document assistant.

Rules:
* Use the same language as the user: **${language}**
* Maximum **6–8 words**
* No quotes, no emojis
* One line only, **no markdown**
* Make it specific to the user's goal, not generic
* Prefer natural, human phrasing over academic tone

Examples in Portuguese:
* Analisando o ROI do mezanino
* Organizando seus contratos de locação
* Revisando riscos do projeto de expansão
* Comparando cenários financeiros

Examples in English:
* Checking ROI of the mezzanine
* Reviewing your storage contracts
* Analyzing project expansion risks

LANG=${language}

USER_MESSAGE:
"${userMessage}"

${assistantPreview ? `ASSISTANT_PREVIEW:\n"${assistantPreview.substring(0, 200)}..."` : ''}

TASK:
Generate a short, engaging conversation title following the rules above.
Output: return **ONLY** the title text, nothing else.`;

  try {
    const title = await geminiGateway.quickGenerate(prompt, { temperature: 0.7, maxTokens: 30 });

    if (!title) return 'New Conversation';

    // Remove quotes if present
    return title.replace(/^["']|["']$/g, '').replace(/^#+\s*/, '');

  } catch (error) {
    console.error('[TitleGen] Failed to generate chat title:', error);
    // Fallback: extract first few words from user message
    return userMessage.split(' ').slice(0, 5).join(' ') + '...';
  }
}

/**
 * Generate answer title (H1 for the response)
 *
 * Rules:
 * - 7-10 words maximum
 * - Engaging but professional
 * - Same language as user
 * - Should be a question or statement
 */
async function generateAnswerTitle(params: TitleParams): Promise<string> {
  const { language, userMessage, answerDraft } = params;

  if (!userMessage) {
    throw new Error('userMessage is required for answer_title mode');
  }

  const prompt = `You are Koda's Answer Title Generator.

Your job is to generate **engaging H1 titles** for answers.

Rules:
* Use the same language as the user: **${language}**
* Maximum **7–10 words**
* No markdown symbols (no #), just the text
* No quotes, no emojis
* Make it a clear question or statement
* Professional but friendly tone

Examples in Portuguese:
* Vale a pena investir no mezanino?
* Como calcular o ROI do projeto
* Principais riscos do contrato de locação
* Resumo financeiro do mezanino Guarda Bens

Examples in English:
* Is the mezzanine investment worth it?
* How to calculate project ROI
* Main risks in the lease contract

LANG=${language}

USER_QUESTION:
"${userMessage}"

${answerDraft ? `ANSWER_PREVIEW:\n"${answerDraft.substring(0, 300)}..."` : ''}

TASK:
Generate a clear, engaging H1 title for this answer.
Output: return **ONLY** the title text.`;

  try {
    const title = await geminiGateway.quickGenerate(prompt, { temperature: 0.7, maxTokens: 40 });

    if (!title) return 'Answer';

    // Remove markdown symbols and quotes
    return title.replace(/^#+\s*/, '').replace(/^["']|["']$/g, '');

  } catch (error) {
    console.error('[TitleGen] Failed to generate answer title:', error);
    return 'Answer';
  }
}

/**
 * Generate section headings (H2) for structured answers
 *
 * Rules:
 * - 2-5 sections
 * - Clear, informative
 * - Same language as user
 */
async function generateSectionHeadings(params: TitleParams): Promise<string[]> {
  const { language, userMessage, answerDraft, domainHint } = params;

  if (!userMessage || !answerDraft) {
    throw new Error('userMessage and answerDraft are required for answer_sections mode');
  }

  const prompt = `You are Koda's Section Heading Generator.

Your job is to generate **2-5 clear H2 section headings** for a structured answer.

Rules:
* Use the same language as the user: **${language}**
* Each heading: 3-8 words
* No markdown symbols (no ##), just the text
* No quotes, no emojis
* Clear, informative, logical flow
* Return as a JSON object with "headings" array

Examples in Portuguese:
{"headings": ["Cenário atual", "Cenário com mezanino", "ROI e payback", "Conclusão"]}

Examples in English:
{"headings": ["Current scenario", "Scenario with mezzanine", "ROI and payback", "Conclusion"]}

LANG=${language}
${domainHint ? `DOMAIN=${domainHint}` : ''}

USER_QUESTION:
"${userMessage}"

ANSWER_DRAFT:
"${answerDraft.substring(0, 500)}..."

TASK:
Generate 2-5 clear section headings for this answer.
Output: return **ONLY** a JSON object like {"headings": ["...", "..."]}`;

  try {
    const content = await geminiGateway.quickGenerate(prompt, { temperature: 0.7, maxTokens: 150 });

    if (!content) return [];

    const parsed = JSON.parse(content);
    const headings = parsed.headings || parsed.sections || [];

    // Clean up headings
    return headings.map((h: string) =>
      h.replace(/^#+\s*/, '').replace(/^["']|["']$/g, '').trim()
    );

  } catch (error) {
    console.error('[TitleGen] Failed to generate section headings:', error);
    return [];
  }
}

/**
 * Generate document title (for file listing)
 *
 * Rules:
 * - 3-8 words
 * - Descriptive, specific
 * - Same language as document
 * - No file extensions
 */
async function generateDocumentTitle(params: TitleParams): Promise<string> {
  const { language, filename, documentText } = params;

  if (!filename && !documentText) {
    throw new Error('filename or documentText is required for document_title mode');
  }

  const prompt = `You are Koda's Document Title Engine.

Your job is to generate a **short, clear title** for a document based on its content.

Rules:
* Use the same language as the document: **${language}**
* 3–8 words
* No file extensions, no quotes, no emojis
* Be specific: mention the topic
* Only one line, no markdown

Examples in Portuguese:
* Análise financeira mezanino Guarda Bens
* Contrato de locação comercial
* Relatório de exames laboratoriais
* Proposta de expansão do projeto

Examples in English:
* Financial analysis mezzanine storage
* Commercial lease agreement
* Laboratory test report
* Project expansion proposal

LANG=${language}

${filename ? `FILENAME: ${filename}` : ''}

${documentText ? `DOCUMENT_EXCERPT:\n${documentText.substring(0, 2000)}` : ''}

TASK:
Generate a short, descriptive title for this document.
Output: return **ONLY** the title text.`;

  try {
    const title = await geminiGateway.quickGenerate(prompt, { temperature: 0.7, maxTokens: 30 });

    if (!title) return filename || 'Untitled Document';

    // Remove file extensions and quotes
    return title
      .replace(/\.(pdf|docx?|xlsx?|txt|md)$/i, '')
      .replace(/^["']|["']$/g, '')
      .replace(/^#+\s*/, '');

  } catch (error) {
    console.error('[TitleGen] Failed to generate document title:', error);
    return filename || 'Untitled Document';
  }
}

/**
 * Convenience functions for direct use
 */

export async function generateChatTitleOnly(params: {
  userMessage: string;
  assistantPreview?: string;
  language: string;
}): Promise<string> {
  const result = await generateTitleArtifacts({
    mode: 'chat_title',
    ...params
  });
  return result.chatTitle || 'New Conversation';
}

export async function generateAnswerTitleOnly(params: {
  userMessage: string;
  answerDraft?: string;
  language: string;
}): Promise<string> {
  const result = await generateTitleArtifacts({
    mode: 'answer_title',
    ...params
  });
  return result.answerTitle || 'Answer';
}

export async function generateSectionHeadingsOnly(params: {
  userMessage: string;
  answerDraft: string;
  language: string;
  domainHint?: TitleParams['domainHint'];
}): Promise<string[]> {
  const result = await generateTitleArtifacts({
    mode: 'answer_sections',
    ...params
  });
  return result.sectionHeadings || [];
}

export async function generateDocumentTitleOnly(params: {
  filename?: string;
  documentText?: string;
  language: string;
}): Promise<string> {
  const result = await generateTitleArtifacts({
    mode: 'document_title',
    ...params
  });
  return result.documentTitle || params.filename || 'Untitled Document';
}

export default {
  generateTitleArtifacts,
  generateChatTitleOnly,
  generateAnswerTitleOnly,
  generateSectionHeadingsOnly,
  generateDocumentTitleOnly
};
