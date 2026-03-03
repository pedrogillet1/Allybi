import * as crypto from "crypto";

import {
  PromptBankDisabledError,
  PromptRegistryError,
  PromptTemplateSelectionError,
} from "./errors";
import {
  applyGlobalGuards,
  applyNavPillsGuard,
  minimalSafePrompt,
} from "./guard-injector";
import {
  buildSlots,
  isProd,
  isPromptCoverageStrictEnabled,
  safeStr,
  uniq,
} from "./helpers";
import {
  assertPromptRegistryLayersValid,
  resolveBankIdsForKind,
  resolveRequiredFlags,
} from "./layer-resolver";
import {
  loadPromptBank,
  loadRequiredPromptBank,
} from "./registry-loader";
import {
  GlobalGuardsBankSchema,
  MinimalSafePromptBankSchema,
  NavPillsGuardBankSchema,
  PromptRegistryBankSchema,
} from "./schemas";
import { createDefaultPromptRegistryTelemetry } from "./telemetry";
import {
  compileMessagesFromTemplate,
  selectTemplate,
} from "./template-compiler";
import type {
  BankLoader,
  PromptBundle,
  PromptContext,
  PromptKind,
  PromptMessage,
  PromptRegistryBank,
  PromptRegistryMeta,
  PromptRegistryTelemetry,
  PromptTraceEntry,
} from "./types";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function getErrorCode(error: unknown): string {
  if (error instanceof PromptRegistryError) return error.code;
  if (error instanceof Error) return error.name || "ERROR";
  return "UNKNOWN";
}

export class PromptRegistryServiceV2 {
  private validatedRegistrySignature: string | null = null;

  private static readonly STRICT_COMPOSE_MODES = new Set([
    "doc_grounded_single",
    "doc_grounded_multi",
    "doc_grounded_quote",
    "doc_grounded_table",
    "help_steps",
  ]);

  constructor(
    private readonly bankLoader: BankLoader,
    private readonly telemetry: PromptRegistryTelemetry = createDefaultPromptRegistryTelemetry(),
  ) {}

  buildPrompt(kind: PromptKind, ctx: PromptContext): PromptBundle {
    const startedAt = Date.now();
    const answerMode = safeStr(ctx.answerMode || "");

    this.telemetry.recordBuildStart({
      kind,
      env: ctx.env,
      answerMode,
    });

    try {
      const bundle = this.buildPromptInner(kind, ctx, answerMode);
      this.telemetry.recordBuildSuccess({
        kind,
        env: ctx.env,
        answerMode,
        durationMs: Math.max(0, Date.now() - startedAt),
        selectedTemplateCount: bundle.trace.orderedPrompts.length,
        messageCount: bundle.messages.length,
      });
      return bundle;
    } catch (error) {
      this.telemetry.recordBuildFailure({
        kind,
        env: ctx.env,
        answerMode,
        durationMs: Math.max(0, Date.now() - startedAt),
        errorCode: getErrorCode(error),
        errorName: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildPromptInner(
    kind: PromptKind,
    ctx: PromptContext,
    answerMode: string,
  ): PromptBundle {
    const usedBankIds: string[] = [];
    const selectedTemplateIds: string[] = [];
    const slotsFilled: string[] = [];
    const appliedGuards: string[] = [];

    const registry = loadRequiredPromptBank<PromptRegistryBank>({
      bankLoader: this.bankLoader,
      bankId: "prompt_registry",
      kind,
      schema: PromptRegistryBankSchema,
    });

    usedBankIds.push("prompt_registry");
    this.assertRegistryEnabled(registry, "prompt_registry", kind, true);
    this.validateRegistryIfChanged(registry);

    const bankIds = resolveBankIdsForKind(kind, registry);
    const requiredByBankId = resolveRequiredFlags(registry);
    const slots = buildSlots(ctx);

    const orderedPrompts: PromptTraceEntry[] = [];
    let messages: PromptMessage[] = [];

    for (const bankId of bankIds) {
      const required = requiredByBankId.get(bankId) ?? true;
      const bank = loadPromptBank<Record<string, unknown>>({
        bankLoader: this.bankLoader,
        bankId,
        kind,
        required,
      });
      if (!bank) continue;

      this.assertRegistryEnabled(bank, bankId, kind, required);
      usedBankIds.push(bankId);

      const selection = selectTemplate(bank, kind, ctx);
      selectedTemplateIds.push(selection.templateId);

      if (
        kind === "compose_answer" &&
        bankId === "task_answer_with_sources" &&
        isPromptCoverageStrictEnabled() &&
        PromptRegistryServiceV2.STRICT_COMPOSE_MODES.has(answerMode) &&
        (selection.templateId.endsWith(":meta.description") ||
          selection.templateId.endsWith(":no_template_match") ||
          selection.messages.length === 0)
      ) {
        throw new PromptTemplateSelectionError(
          `prompt_contract_uncovered_mode:${answerMode || "unknown"}`,
          { bankId, kind, answerMode },
        );
      }

      const compiled = compileMessagesFromTemplate({
        bankId,
        templateId: selection.templateId,
        outputLanguage: ctx.outputLanguage,
        slots,
        slotsFilled,
        messages: selection.messages,
      });

      if (!compiled.length) continue;
      messages = messages.concat(compiled);

      orderedPrompts.push({
        bankId,
        version: safeStr(
          (bank?._meta as Record<string, unknown> | undefined)?.version || "0.0.0",
        ),
        templateId: selection.templateId,
        hash: sha256(compiled.map((m) => `${m.role}:${m.content}`).join("\n\n")),
      });
    }

    if (!messages.length) {
      const safeBank = loadPromptBank<{
        rules?: string[];
        navPillsAddendum?: string;
      }>({
        bankLoader: this.bankLoader,
        bankId: "llm_minimal_safe_prompt",
        kind,
        required: false,
        schema: MinimalSafePromptBankSchema,
      });

      messages = [
        {
          role: "system",
          content: minimalSafePrompt({
            kind,
            answerMode,
            safeRules: safeBank?.rules || null,
            navPillsAddendum: safeStr(safeBank?.navPillsAddendum || "") || null,
          }),
        },
      ];

      orderedPrompts.push({
        bankId: "fallback_minimal",
        version: "0.0.0",
        templateId: "fallback_minimal",
        hash: sha256(messages[0].content),
      });
    }

    const guardBank = loadPromptBank<{
      rules?: Array<{ id?: string; text?: string; skipWhen?: string[] }>;
    }>({
      bankLoader: this.bankLoader,
      bankId: "llm_global_guards",
      kind,
      required: false,
      schema: GlobalGuardsBankSchema,
    });

    messages = applyGlobalGuards({
      messages,
      ctx,
      applied: appliedGuards,
      guardRules: guardBank?.rules || null,
    });

    if (answerMode === "nav_pills") {
      const navBank = loadPromptBank<{
        rules?: Array<{ id?: string; text?: string }>;
      }>({
        bankLoader: this.bankLoader,
        bankId: "llm_nav_pills_contract",
        kind,
        required: false,
        schema: NavPillsGuardBankSchema,
      });

      messages = applyNavPillsGuard({
        messages,
        applied: appliedGuards,
        navRules: navBank?.rules || null,
      });
    }

    return {
      kind,
      messages,
      trace: {
        orderedPrompts,
        appliedGuards,
        slotsFilled: uniq(slotsFilled),
      },
      debug: isProd(ctx.env)
        ? undefined
        : {
            usedBankIds: uniq(usedBankIds),
            selectedTemplateIds: uniq(selectedTemplateIds),
          },
    };
  }

  private validateRegistryIfChanged(registry: PromptRegistryBank): void {
    const signature = sha256(
      JSON.stringify({
        layersByKind: registry.layersByKind ?? null,
        promptFiles: registry.promptFiles ?? null,
      }),
    );
    if (signature === this.validatedRegistrySignature) return;
    assertPromptRegistryLayersValid(registry);
    this.validatedRegistrySignature = signature;
  }

  private assertRegistryEnabled(
    bank: PromptRegistryMeta,
    bankId: string,
    kind: PromptKind,
    required: boolean,
  ): void {
    const enabled = Boolean(
      (bank?.config as Record<string, unknown> | undefined)?.enabled,
    );
    if (!enabled && required) {
      throw new PromptBankDisabledError(bankId, { kind });
    }
  }
}
