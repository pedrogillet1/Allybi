import { randomUUID } from "crypto";
import { getBankLoaderInstance } from "../core/banks/bankLoader.service";
import { logger } from "../../utils/logger";
import { LLMClientFactory } from "../llm/core/llmClientFactory";
import LlmGatewayService from "../llm/core/llmGateway.service";
import { LlmRequestBuilderService } from "../llm/core/llmRequestBuilder.service";
import { LlmRouterService } from "../llm/core/llmRouter.service";
import { loadGeminiConfig } from "../llm/providers/gemini/geminiConfig";
import { PromptRegistryService } from "../llm/prompts/promptRegistry.service";
import type { EditExecutionContext, EditPlan } from "./editing.types";

type PromptTaskId =
  | "rewrite_paragraph"
  | "rewrite_span"
  | "docx_translate_single"
  | "paragraph_to_bullets"
  | "docx_list_to_paragraph"
  | "docx_section_to_paragraph";

type GenerationTask = {
  taskId: PromptTaskId;
  args: Record<string, unknown>;
};

type GenerationOk = {
  ok: true;
  proposedText: string;
  generated: boolean;
  taskId?: PromptTaskId;
  telemetry?: Record<string, unknown>;
};

type GenerationFail = {
  ok: false;
  error: string;
};

export type EditingTextGenerationResult = GenerationOk | GenerationFail;

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function splitLines(input: string): string[] {
  return String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeOutput(raw: string): string {
  return String(raw || "")
    .replace(/^```(?:json|txt|text|md)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseTargetLanguage(instruction: string): string {
  const text = String(instruction || "");
  const match =
    text.match(
      /\b(?:to|into|in|para|em)\s+(english|spanish|portuguese|french|german|italian|japanese|chinese|korean)\b/i,
    ) ||
    text.match(
      /\b(ingl[eê]s|espanhol|portugu[eê]s|franc[eê]s|alem[aã]o|italiano|japon[eê]s|chin[eê]s|coreano)\b/i,
    );
  const value = String(match?.[1] || "")
    .trim()
    .toLowerCase();
  if (!value) return "English";
  const map: Record<string, string> = {
    english: "English",
    spanish: "Spanish",
    portuguese: "Portuguese",
    french: "French",
    german: "German",
    italian: "Italian",
    japanese: "Japanese",
    chinese: "Chinese",
    korean: "Korean",
    "ingl[eê]s": "English",
    espanhol: "Spanish",
    "portugu[eê]s": "Portuguese",
    "franc[eê]s": "French",
    "alem[aã]o": "German",
    italiano: "Italian",
    "japon[eê]s": "Japanese",
    "chin[eê]s": "Chinese",
    coreano: "Korean",
  };
  for (const [key, target] of Object.entries(map)) {
    if (new RegExp(`^${key}$`, "i").test(value)) return target;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractQuotedValues(instruction: string): string[] {
  const values: string[] = [];
  const rx = /"([^"]*)"|'([^']*)'/g;
  let match = rx.exec(String(instruction || ""));
  while (match) {
    const value = String(match[1] || match[2] || "").trim();
    if (value) values.push(value);
    match = rx.exec(String(instruction || ""));
  }
  return values;
}

function normalizeFindReplaceValue(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^['"]/, "")
    .replace(/['"]$/, "")
    .trim();
}

function parseFindReplaceDirective(instruction: string): {
  findText: string;
  replaceText: string;
  useRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
} | null {
  const text = String(instruction || "").trim();
  if (!text) return null;
  const low = text.toLowerCase();
  const quoted = extractQuotedValues(text);
  let findText = "";
  let replaceText = "";

  if (quoted.length >= 2) {
    [findText, replaceText] = quoted;
  } else {
    const pair =
      text.match(
        /\b(?:find\s+and\s+replace|replace(?:\s+all)?|substitua(?:\s+tudo)?|substituir)\s+(.+?)\s+(?:with|for|to|por|para)\s+(.+)$/i,
      ) || text.match(/\b(.+?)\s+(?:with|for|to|por|para)\s+(.+)$/i);
    if (pair?.[1] && pair?.[2]) {
      findText = pair[1];
      replaceText = pair[2];
    }
  }

  findText = normalizeFindReplaceValue(findText);
  replaceText = normalizeFindReplaceValue(replaceText);
  if (!findText) return null;

  const useRegex = /\b(regex|regular expression|express[aã]o regular)\b/i.test(
    low,
  );
  const matchCase =
    /\b(case[-\s]?sensitive|match case|mai[uú]sculas|diferenciar mai[uú]sculas)\b/i.test(
      low,
    );
  const wholeWord =
    /\b(whole word|whole-word|palavra inteira|somente palavras inteiras)\b/i.test(
      low,
    );

  return {
    findText,
    replaceText,
    useRegex,
    matchCase,
    wholeWord,
  };
}

function postProcessTaskOutput(taskId: PromptTaskId, rawText: string): string {
  const cleaned = normalizeOutput(rawText);
  if (!cleaned) return "";

  if (
    taskId === "docx_list_to_paragraph" ||
    taskId === "docx_section_to_paragraph"
  ) {
    const parsed = parseJsonObject(cleaned);
    const paragraph =
      typeof parsed?.paragraph === "string"
        ? String(parsed.paragraph).trim()
        : "";
    if (paragraph) return paragraph;
  }

  return cleaned;
}

function inferTask(plan: EditPlan, beforeText: string): GenerationTask {
  const canonical = String(plan.canonicalOperator || "")
    .trim()
    .toUpperCase();
  const instruction = String(plan.normalizedInstruction || "");
  const hasBulletLines = splitLines(beforeText).some((line) =>
    /^[-*•]\s+/.test(line),
  );
  const wantsBullets =
    canonical === "DOCX_SUMMARIZE_TO_BULLETS" ||
    /\b(summary|summarize|bullet|bullets|topicos|tópicos|resumo)\b/i.test(
      instruction,
    );

  if (canonical === "DOCX_TRANSLATE_SCOPE") {
    return {
      taskId: "docx_translate_single",
      args: {
        paragraph: beforeText,
        targetLanguage: parseTargetLanguage(instruction),
      },
    };
  }

  if (
    canonical === "DOCX_LIST_TO_PARAGRAPH" ||
    (hasBulletLines && /\bparagraph|par[aá]grafo\b/i.test(instruction))
  ) {
    return {
      taskId: "docx_list_to_paragraph",
      args: {
        bullets: splitLines(beforeText),
        wantsSummary: /\bsummary|summar/i.test(instruction),
      },
    };
  }

  if (
    canonical === "DOCX_SECTION_TO_PARAGRAPH" ||
    canonical === "DOCX_REWRITE_SECTION"
  ) {
    return {
      taskId: "docx_section_to_paragraph",
      args: {
        lines: splitLines(beforeText),
      },
    };
  }

  if (wantsBullets) {
    return {
      taskId: "paragraph_to_bullets",
      args: {
        paragraph: beforeText,
      },
    };
  }

  if (plan.operator === "EDIT_SPAN" || canonical === "DOCX_REPLACE_SPAN") {
    return {
      taskId: "rewrite_span",
      args: {
        selectedText: beforeText,
        paragraphText: beforeText,
        instruction: plan.normalizedInstruction,
        strict: true,
      },
    };
  }

  return {
    taskId: "rewrite_paragraph",
    args: {
      originalText: beforeText,
      instruction: plan.normalizedInstruction,
    },
  };
}

export class EditingTextGenerationService {
  private static gateway: LlmGatewayService | null = null;
  private static attempted = false;

  async generateProposedText(input: {
    context: EditExecutionContext;
    plan: EditPlan;
    beforeText: string;
    proposedText?: string;
  }): Promise<EditingTextGenerationResult> {
    if (isNonEmpty(input.proposedText)) {
      return {
        ok: true,
        proposedText: input.proposedText.trim(),
        generated: false,
      };
    }

    if (input.plan.domain !== "docx") {
      return {
        ok: false,
        error:
          "Preview/apply requires proposedText for non-DOCX operators in this runtime.",
      };
    }

    const canonical = String(input.plan.canonicalOperator || "")
      .trim()
      .toUpperCase();
    if (canonical === "DOCX_FIND_REPLACE") {
      const directive = parseFindReplaceDirective(
        input.plan.normalizedInstruction,
      );
      if (!directive) {
        return {
          ok: false,
          error:
            'DOCX_FIND_REPLACE requires explicit find/replace terms (e.g. replace "A" with "B").',
        };
      }
      return {
        ok: true,
        generated: true,
        proposedText: JSON.stringify({
          patches: [
            {
              kind: "docx_find_replace",
              ...directive,
            },
          ],
        }),
      };
    }

    const beforeText = String(input.beforeText || "").trim();
    if (!beforeText) {
      return {
        ok: false,
        error:
          "Missing beforeText for DOCX generation. Select text or pass beforeText explicitly.",
      };
    }

    const gateway = this.getGateway();
    if (!gateway) {
      return {
        ok: false,
        error:
          "LLM text generation is unavailable. Set GEMINI_API_KEY or GOOGLE_API_KEY.",
      };
    }

    const task = inferTask(input.plan, beforeText);
    try {
      const out = await gateway.generate({
        traceId: input.context.correlationId || randomUUID(),
        userId: input.context.userId,
        conversationId: input.context.conversationId,
        messages: [
          {
            role: "user",
            content: input.plan.normalizedInstruction,
          },
        ],
        meta: {
          promptTask: task.taskId,
          promptTaskArgs: task.args,
          operator: task.taskId,
          operatorFamily: "file_actions",
          preferredLanguage:
            input.context.language || input.plan.constraints.outputLanguage,
        },
      });

      let proposedText = postProcessTaskOutput(task.taskId, out.text);

      // Repair retry: if first attempt returns empty/invalid, retry once with
      // an explicit repair instruction appended.  Max 1 retry to cap latency.
      if (!proposedText) {
        logger.warn(
          "[EditingTextGeneration] empty_proposal, attempting repair retry",
          {
            operator: input.plan.operator,
            taskId: task.taskId,
          },
        );
        try {
          const repairOut = await gateway.generate({
            traceId: input.context.correlationId || randomUUID(),
            userId: input.context.userId,
            conversationId: input.context.conversationId,
            messages: [
              {
                role: "user",
                content: input.plan.normalizedInstruction,
              },
              {
                role: "assistant",
                content: "(empty response)",
              },
              {
                role: "user",
                content:
                  "Your previous response was empty. Please try again and provide the edited text. Return ONLY the edited text, no explanations.",
              },
            ],
            meta: {
              promptTask: task.taskId,
              promptTaskArgs: task.args,
              operator: task.taskId,
              operatorFamily: "file_actions",
              preferredLanguage:
                input.context.language || input.plan.constraints.outputLanguage,
            },
          });
          proposedText = postProcessTaskOutput(task.taskId, repairOut.text);
        } catch {
          // Repair retry failed — fall through to the empty proposal error below.
        }
      }

      if (!proposedText) {
        return {
          ok: false,
          error: "LLM returned an empty edit proposal.",
        };
      }

      return {
        ok: true,
        proposedText,
        generated: true,
        taskId: task.taskId,
        telemetry: out.telemetry,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "LLM generation failed.";
      logger.warn("[EditingTextGeneration] generation_failed", {
        operator: input.plan.operator,
        canonicalOperator: input.plan.canonicalOperator,
        taskId: task.taskId,
        error: message,
      });
      return {
        ok: false,
        error: `LLM generation failed: ${message}`,
      };
    }
  }

  private getGateway(): LlmGatewayService | null {
    if (EditingTextGenerationService.attempted) {
      return EditingTextGenerationService.gateway;
    }
    EditingTextGenerationService.attempted = true;

    try {
      const envName =
        process.env.NODE_ENV === "production"
          ? "production"
          : process.env.NODE_ENV === "staging"
            ? "staging"
            : process.env.NODE_ENV === "test"
              ? "dev"
              : "local";
      const geminiCfg = loadGeminiConfig(envName as any);
      const hasGeminiKey = Boolean(String(geminiCfg.apiKey || "").trim());
      if (!hasGeminiKey) {
        logger.warn("[EditingTextGeneration] gateway_disabled_no_api_key");
        EditingTextGenerationService.gateway = null;
        return null;
      }

      const factory = new LLMClientFactory({
        defaultProvider: "google",
        providers: {
          google: {
            enabled: true,
            config: {
              apiKey: geminiCfg.apiKey,
              baseUrl:
                geminiCfg.baseUrl ||
                "https://generativelanguage.googleapis.com/v1beta",
              defaults: {
                gemini3: geminiCfg.models.defaultFinal,
                gemini3Flash: geminiCfg.models.defaultDraft,
              },
              timeoutMs: geminiCfg.timeoutMs,
            },
          },
        },
      });

      const llmClient = factory.get();
      const bankLoader = getBankLoaderInstance();
      const promptRegistry = new PromptRegistryService(bankLoader);
      const requestBuilder = new LlmRequestBuilderService(promptRegistry);
      const router = new LlmRouterService(bankLoader);

      EditingTextGenerationService.gateway = new LlmGatewayService(
        llmClient,
        router,
        requestBuilder,
        {
          env: envName as any,
          provider: llmClient.provider,
          modelId: geminiCfg.models.defaultDraft,
          defaultTemperature: 0.2,
          defaultMaxOutputTokens: 900,
        },
      );
      return EditingTextGenerationService.gateway;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown LLM init failure.";
      logger.warn("[EditingTextGeneration] gateway_init_failed", {
        error: message,
      });
      EditingTextGenerationService.gateway = null;
      return null;
    }
  }
}

export default EditingTextGenerationService;
