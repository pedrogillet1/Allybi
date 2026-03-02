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

function parseOrdinalIndex(
  instruction: string,
  labels: string[],
): number | null {
  const labelGroup = labels.map((label) => label.replace(/\s+/g, "\\s+")).join("|");
  const rx = new RegExp(
    `\\b(?:${labelGroup})\\s*(?:#|n(?:o|º)?\\.?\\s*)?(\\d{1,3})\\b`,
    "i",
  );
  const match = String(instruction || "").match(rx);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function parseTableDimensions(instruction: string): {
  rows?: number;
  cols?: number;
} {
  const text = String(instruction || "");
  const rowsMatch = text.match(/\b(?:rows?|linhas?)\s*(?:=|:)?\s*(\d{1,2})\b/i);
  const colsMatch = text.match(
    /\b(?:cols?|columns?|colunas?)\s*(?:=|:)?\s*(\d{1,2})\b/i,
  );
  const compactMatch = text.match(/\b(\d{1,2})\s*(?:x|by)\s*(\d{1,2})\b/i);
  const rows = rowsMatch?.[1]
    ? Number(rowsMatch[1])
    : compactMatch?.[1]
      ? Number(compactMatch[1])
      : undefined;
  const cols = colsMatch?.[1]
    ? Number(colsMatch[1])
    : compactMatch?.[2]
      ? Number(compactMatch[2])
      : undefined;
  return { rows, cols };
}

function parseTablePosition(instruction: string): string | null {
  const low = String(instruction || "").toLowerCase();
  if (/\b(?:top|start|beginning|in[ií]cio)\b/.test(low)) return "top";
  if (/\b(?:end|bottom|append|fim)\b/.test(low)) return "end";
  if (/\b(?:before|antes)\b/.test(low)) return "before";
  if (/\b(?:after|depois)\b/.test(low)) return "after";
  return null;
}

function normalizePositiveInt(
  value: unknown,
  fallback: number,
  bounds?: { min?: number; max?: number },
): number {
  const min = Number.isFinite(Number(bounds?.min)) ? Number(bounds!.min) : 1;
  const max = Number.isFinite(Number(bounds?.max)) ? Number(bounds!.max) : 99;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
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

    if (canonical === "DOCX_UPDATE_TOC") {
      return {
        ok: true,
        generated: true,
        proposedText: JSON.stringify({
          patches: [{ kind: "docx_update_toc" }],
        }),
      };
    }

    if (canonical === "DOCX_CREATE_TABLE") {
      const metadata = ((input.plan as any)?.metadata || {}) as Record<
        string,
        unknown
      >;
      const dims = parseTableDimensions(input.plan.normalizedInstruction);
      const rows = normalizePositiveInt(
        metadata.rows ?? metadata.rowCount ?? dims.rows,
        3,
        { min: 1, max: 50 },
      );
      const cols = normalizePositiveInt(
        metadata.cols ?? metadata.colCount ?? dims.cols,
        3,
        { min: 1, max: 20 },
      );
      const headerRow =
        metadata.headerRow == null ? true : Boolean(metadata.headerRow);
      const targetId = String(
        metadata.targets ?? metadata.targetId ?? metadata.paragraphId ?? "",
      ).trim();

      return {
        ok: true,
        generated: true,
        proposedText: JSON.stringify({
          patches: [
            {
              kind: "docx_create_table",
              ...(targetId ? { paragraphId: targetId } : {}),
              rows,
              cols,
              headerRow,
            },
          ],
        }),
      };
    }

    if (canonical === "DOCX_ADD_TABLE_ROW") {
      const metadata = ((input.plan as any)?.metadata || {}) as Record<
        string,
        unknown
      >;
      const tableIndex =
        normalizePositiveInt(
          metadata.tableIndex ??
            parseOrdinalIndex(input.plan.normalizedInstruction, [
              "table",
              "tabela",
            ]),
          1,
          { min: 1, max: 500 },
        ) || 1;
      const parsedRowIndex = parseOrdinalIndex(input.plan.normalizedInstruction, [
        "row",
        "linha",
      ]);
      const rowIndexRaw =
        metadata.rowIndex != null ? Number(metadata.rowIndex) : parsedRowIndex;
      const position =
        String(metadata.position || parseTablePosition(input.plan.normalizedInstruction) || "end")
          .trim()
          .toLowerCase();

      return {
        ok: true,
        generated: true,
        proposedText: JSON.stringify({
          patches: [
            {
              kind: "docx_add_table_row",
              tableIndex,
              ...(typeof rowIndexRaw === "number" &&
              Number.isFinite(rowIndexRaw) &&
              rowIndexRaw > 0
                ? { rowIndex: Math.floor(rowIndexRaw) }
                : {}),
              position,
            },
          ],
        }),
      };
    }

    if (canonical === "DOCX_DELETE_TABLE_ROW") {
      const metadata = ((input.plan as any)?.metadata || {}) as Record<
        string,
        unknown
      >;
      const tableIndex = normalizePositiveInt(
        metadata.tableIndex ??
          parseOrdinalIndex(input.plan.normalizedInstruction, ["table", "tabela"]),
        1,
        { min: 1, max: 500 },
      );
      const rowIndex = normalizePositiveInt(
        metadata.rowIndex ??
          parseOrdinalIndex(input.plan.normalizedInstruction, ["row", "linha"]),
        0,
        { min: 0, max: 5000 },
      );
      if (rowIndex <= 0) {
        return {
          ok: false,
          error:
            "DOCX_DELETE_TABLE_ROW requires an explicit row index (for example: delete row 2 in table 1).",
        };
      }
      return {
        ok: true,
        generated: true,
        proposedText: JSON.stringify({
          patches: [
            {
              kind: "docx_delete_table_row",
              tableIndex,
              rowIndex,
            },
          ],
        }),
      };
    }

    if (canonical === "DOCX_SET_TABLE_CELL") {
      const metadata = ((input.plan as any)?.metadata || {}) as Record<
        string,
        unknown
      >;
      const tableIndex = normalizePositiveInt(
        metadata.tableIndex ??
          parseOrdinalIndex(input.plan.normalizedInstruction, ["table", "tabela"]),
        1,
        { min: 1, max: 500 },
      );
      const rowIndex = normalizePositiveInt(
        metadata.rowIndex ??
          parseOrdinalIndex(input.plan.normalizedInstruction, ["row", "linha"]),
        0,
        { min: 0, max: 5000 },
      );
      const colIndex = normalizePositiveInt(
        metadata.colIndex ??
          parseOrdinalIndex(input.plan.normalizedInstruction, [
            "column",
            "col",
            "coluna",
          ]),
        0,
        { min: 0, max: 5000 },
      );
      const textValue =
        String(metadata.text || extractQuotedValues(input.plan.normalizedInstruction)[0] || "")
          .trim();
      if (rowIndex <= 0 || colIndex <= 0 || !textValue) {
        return {
          ok: false,
          error:
            'DOCX_SET_TABLE_CELL requires row, column, and text (for example: set table 1 row 2 column 3 to "Revenue").',
        };
      }
      return {
        ok: true,
        generated: true,
        proposedText: JSON.stringify({
          patches: [
            {
              kind: "docx_set_table_cell",
              tableIndex,
              rowIndex,
              colIndex,
              text: textValue,
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
