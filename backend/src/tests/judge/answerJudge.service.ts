/**
 * LLM-as-Judge Service
 *
 * Evaluates Koda's answers on 8 dimensions:
 * 1. Correctness - Is the answer factually grounded?
 * 2. Completeness - Did it actually answer the question?
 * 3. Formatting - Proper spacing, lists, bolding, no walls of text
 * 4. Tone - Calm, confident, non-robotic
 * 5. Hallucination - Any invented data?
 * 6. UX - Were buttons shown when expected?
 * 7. Location - Correct file/page/folder?
 * 8. Redundancy - No repeated sentences
 *
 * Uses Claude API to grade each response objectively.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface JudgeInput {
  question: string;
  answer: string;
  documentsAvailable?: string[];  // List of docs the user has
  expectedBehavior?: string;      // What we expect (e.g., "file_action", "page_reference")
  context?: string;               // Previous messages for follow-up context
}

export interface JudgeScore {
  correctness: number;      // 0-1: Is answer grounded in documents?
  completeness: number;     // 0-1: Did it answer the question?
  formatting: number;       // 0-1: Proper markdown, spacing, structure
  tone: number;             // 0-1: Calm, confident, helpful
  hallucination: number;    // 0-1: 1 = no hallucination, 0 = hallucinated
  ux: number;               // 0-1: Buttons/actions shown when appropriate
  location: number;         // 0-1: Correct file/page/folder references
  redundancy: number;       // 0-1: 1 = no repetition, 0 = repetitive
}

export interface JudgeResult {
  pass: boolean;
  overallScore: number;
  scores: JudgeScore;
  issues: string[];
  suggestions: string[];
  verdict: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'NEEDS_WORK' | 'FAIL';
}

const JUDGE_PROMPT = `You are an expert QA judge evaluating an AI assistant's answer quality.

Your job is to grade the answer on 8 dimensions, each scored 0.0 to 1.0:

1. **Correctness** (0-1): Is the answer factually accurate and grounded in the user's documents?
   - 1.0 = Completely accurate, directly references document content
   - 0.5 = Mostly accurate but some vague claims
   - 0.0 = Wrong or makes claims not in documents

2. **Completeness** (0-1): Did it actually answer what was asked?
   - 1.0 = Fully answered the question
   - 0.5 = Partially answered
   - 0.0 = Didn't answer or deflected

3. **Formatting** (0-1): Is the response well-formatted?
   - Check: Proper markdown, good spacing, appropriate lists/bullets
   - Check: No wall of text, no excessive newlines
   - Check: Document names in **bold**, proper structure
   - 1.0 = Clean, professional formatting
   - 0.0 = Messy, hard to read

4. **Tone** (0-1): Is the tone appropriate?
   - Good: Calm, confident, helpful, professional
   - Bad: Robotic, overly apologetic, condescending, uncertain
   - 1.0 = Natural, confident helper
   - 0.0 = Robotic or inappropriate

5. **Hallucination** (0-1): Did it invent information?
   - 1.0 = No hallucination, all claims grounded
   - 0.5 = Minor speculation presented as fact
   - 0.0 = Made up data, numbers, or facts

6. **UX** (0-1): Are interactive elements used appropriately?
   - For file/location questions: Should show file buttons (📄) or folder buttons (📁)
   - For content questions: May not need buttons
   - 1.0 = Perfect UX, buttons when needed
   - 0.0 = Missing expected buttons or wrong buttons

7. **Location** (0-1): For location-related questions, is the location correct?
   - Check: Correct file name, folder path, page number
   - 1.0 = Exact location provided
   - 0.5 = Approximate or partial location
   - 0.0 = Wrong location or no location when needed
   - N/A = Score 1.0 if question wasn't about location

8. **Redundancy** (0-1): Is there unnecessary repetition?
   - 1.0 = Concise, no repetition
   - 0.5 = Some redundancy
   - 0.0 = Same information repeated multiple times

CRITICAL FAILURES (automatic 0 overall):
- Asking user to "rephrase" or "be more specific"
- Saying "I don't have access" when documents exist
- Completely wrong file/document
- Obvious hallucination of data

Respond with ONLY valid JSON in this exact format:
{
  "scores": {
    "correctness": <0.0-1.0>,
    "completeness": <0.0-1.0>,
    "formatting": <0.0-1.0>,
    "tone": <0.0-1.0>,
    "hallucination": <0.0-1.0>,
    "ux": <0.0-1.0>,
    "location": <0.0-1.0>,
    "redundancy": <0.0-1.0>
  },
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1"]
}`;

export class AnswerJudgeService {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    });
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const userPrompt = this.buildUserPrompt(input);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          { role: 'user', content: JUDGE_PROMPT + '\n\n' + userPrompt }
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return this.buildResult(parsed, input);
    } catch (error) {
      console.error('[AnswerJudge] Error:', error);
      // Return a failing result on error
      return {
        pass: false,
        overallScore: 0,
        scores: {
          correctness: 0,
          completeness: 0,
          formatting: 0,
          tone: 0,
          hallucination: 0,
          ux: 0,
          location: 0,
          redundancy: 0,
        },
        issues: [`Judge error: ${(error as Error).message}`],
        suggestions: [],
        verdict: 'FAIL',
      };
    }
  }

  private buildUserPrompt(input: JudgeInput): string {
    let prompt = `## Question Asked\n${input.question}\n\n`;
    prompt += `## Answer Given\n${input.answer}\n\n`;

    if (input.documentsAvailable?.length) {
      prompt += `## Documents Available to User\n${input.documentsAvailable.join(', ')}\n\n`;
    }

    if (input.expectedBehavior) {
      prompt += `## Expected Behavior\n${input.expectedBehavior}\n\n`;
    }

    if (input.context) {
      prompt += `## Conversation Context\n${input.context}\n\n`;
    }

    prompt += `Now evaluate the answer and respond with JSON only.`;
    return prompt;
  }

  private buildResult(parsed: any, input: JudgeInput): JudgeResult {
    const scores: JudgeScore = {
      correctness: parsed.scores?.correctness ?? 0,
      completeness: parsed.scores?.completeness ?? 0,
      formatting: parsed.scores?.formatting ?? 0,
      tone: parsed.scores?.tone ?? 0,
      hallucination: parsed.scores?.hallucination ?? 0,
      ux: parsed.scores?.ux ?? 0,
      location: parsed.scores?.location ?? 0,
      redundancy: parsed.scores?.redundancy ?? 0,
    };

    // Check for critical failures in the answer
    const criticalPatterns = [
      /rephrase/i,
      /could you clarify/i,
      /be more specific/i,
      /which (file|document|folder)/i,
      /I don't have access/i,
    ];

    const hasCriticalFailure = criticalPatterns.some(p => p.test(input.answer));
    if (hasCriticalFailure) {
      return {
        pass: false,
        overallScore: 0,
        scores,
        issues: ['CRITICAL: Answer contains fallback/clarification request', ...(parsed.issues || [])],
        suggestions: parsed.suggestions || [],
        verdict: 'FAIL',
      };
    }

    // Calculate overall score (weighted average)
    const weights = {
      correctness: 0.20,
      completeness: 0.15,
      formatting: 0.10,
      tone: 0.10,
      hallucination: 0.20,  // High weight - hallucination is critical
      ux: 0.10,
      location: 0.10,
      redundancy: 0.05,
    };

    const overallScore = Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (scores[key as keyof JudgeScore] * weight);
    }, 0);

    // Determine verdict
    let verdict: JudgeResult['verdict'];
    if (overallScore >= 0.95) verdict = 'EXCELLENT';
    else if (overallScore >= 0.85) verdict = 'GOOD';
    else if (overallScore >= 0.70) verdict = 'ACCEPTABLE';
    else if (overallScore >= 0.50) verdict = 'NEEDS_WORK';
    else verdict = 'FAIL';

    // Pass threshold: 0.70 overall, no critical dimensions below 0.5
    const criticalDimensions = ['correctness', 'hallucination', 'completeness'];
    const hasCriticalLow = criticalDimensions.some(d => scores[d as keyof JudgeScore] < 0.5);

    const pass = overallScore >= 0.70 && !hasCriticalLow;

    return {
      pass,
      overallScore: Math.round(overallScore * 100) / 100,
      scores,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      verdict,
    };
  }
}

export default AnswerJudgeService;
