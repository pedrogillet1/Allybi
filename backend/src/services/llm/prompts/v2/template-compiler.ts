import {
  PromptPlaceholderResolutionError,
  PromptRegistryConfigError,
} from "./errors";
import {
  asStringArray,
  hasUnresolvedTemplateToken,
  interpolate,
  localizedText,
  matchesWhen,
  normalizeWs,
  parseLlmRole,
  resolveLocalizedBlock,
  safeStr,
  toArrayMessage,
} from "./helpers";
import type {
  LlmRole,
  PromptContext,
  PromptKind,
  PromptMessage,
  PromptRegistryMeta,
} from "./types";

export interface TemplateSelection {
  templateId: string;
  messages: Array<Record<string, unknown>>;
}

function blocksToMessages(
  blocks: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const b of blocks) {
    const role = b?.role ?? "system";
    const text =
      typeof b?.text === "string"
        ? b.text
        : Array.isArray(b?.lines)
          ? (b.lines as string[]).join("\n")
          : "";
    out.push({ role, content: text });
  }
  return out;
}

function convertToolEntriesToTemplates(
  tools: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return tools
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const appliesTo = (entry.appliesTo as Record<string, unknown>) || {};
      const appliesToKeys = Object.keys(appliesTo);
      const supportedKeys = new Set([
        "operators",
        "answerMode",
        "intentFamily",
        "uiSurface",
        "usedBy",
        "signalsAny",
      ]);
      const unsupported = appliesToKeys.filter((key) => !supportedKeys.has(key));
      if (unsupported.length > 0) {
        throw new PromptRegistryConfigError(
          `prompt_tool_applies_to_unsupported_keys:${safeStr(entry.id || `tool_template_${index + 1}`)}:${unsupported
            .sort()
            .join(",")}`,
          {
            id: safeStr(entry.id || `tool_template_${index + 1}`),
            unsupported,
          },
        );
      }

      const when: Record<string, unknown> = {};
      const operators = asStringArray(appliesTo.operators);
      if (operators.length > 0) {
        when.operators = operators;
      }
      const answerModes = asStringArray(appliesTo.answerMode);
      if (answerModes.length === 1) {
        when.answerModeEquals = answerModes[0];
      } else if (answerModes.length > 1) {
        when.answerModes = answerModes;
      }
      const intentFamilies = asStringArray(appliesTo.intentFamily);
      if (intentFamilies.length > 0) {
        when.intentFamilies = intentFamilies;
      }
      const uiSurfaces = asStringArray(appliesTo.uiSurface);
      if (uiSurfaces.length === 1) {
        when.uiSurfaceEquals = uiSurfaces[0];
      } else if (uiSurfaces.length > 1) {
        when.uiSurfaces = uiSurfaces;
      }
      const usedBy = asStringArray(appliesTo.usedBy);
      if (usedBy.length > 0) {
        when.usedByAny = usedBy;
      }
      const signalsAny = asStringArray(appliesTo.signalsAny);
      if (signalsAny.length > 0) {
        when.signalsAny = signalsAny;
      }

      const localized: Record<string, string> = {};
      const system = entry.system;
      if (system && typeof system === "object") {
        for (const [lang, raw] of Object.entries(system)) {
          if (Array.isArray(raw)) localized[lang] = raw.join("\n");
          else if (typeof raw === "string") localized[lang] = raw;
        }
      }

      const content =
        Object.keys(localized).length > 0
          ? localized
          : safeStr(entry.prompt || entry.text || "");

      return {
        id: safeStr(entry.id || `tool_template_${index + 1}`),
        priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 50,
        when,
        messages: [{ role: "system", content }],
      };
    });
}

function resolveTemplateEntries(
  bank: Record<string, unknown>,
): Array<Record<string, unknown>> | null {
  if (Array.isArray(bank?.templates)) {
    return bank.templates as Array<Record<string, unknown>>;
  }
  if (Array.isArray(bank?.rules)) {
    return bank.rules as Array<Record<string, unknown>>;
  }
  if (Array.isArray(bank?.tools)) {
    return convertToolEntriesToTemplates(bank.tools as Array<Record<string, unknown>>);
  }
  return null;
}

export function selectTemplate(
  bank: PromptRegistryMeta & Record<string, unknown>,
  kind: PromptKind,
  ctx: PromptContext,
): TemplateSelection {
  const bankConfig = bank?.config as Record<string, unknown> | undefined;
  const bankMeta = bank?._meta as Record<string, unknown> | undefined;

  if (Array.isArray(bankConfig?.messages)) {
    return {
      templateId: `${safeStr(bankMeta?.id || kind)}:config.messages`,
      messages: bankConfig.messages as Array<Record<string, unknown>>,
    };
  }

  const templates = resolveTemplateEntries(bank);
  if (templates && templates.length) {
    const candidates = templates
      .filter((t) => t?.enabled !== false)
      .filter((t) => matchesWhen(t.when, ctx))
      .map((t) => ({
        id: safeStr(t.id || "template"),
        priority: Number.isFinite(Number(t.priority)) ? Number(t.priority) : 50,
        messages: Array.isArray(t.messages)
          ? (t.messages as Array<Record<string, unknown>>)
          : Array.isArray(t.blocks)
            ? blocksToMessages(t.blocks as Array<Record<string, unknown>>)
            : [],
      }))
      .filter((t) => t.messages.length > 0);

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });

    const best = candidates[0];
    if (best) return { templateId: best.id, messages: best.messages };

    return {
      templateId: `${safeStr(bankMeta?.id || kind)}:no_template_match`,
      messages: [],
    };
  }

  const bankTemplates = bank?.templates as Record<string, unknown> | undefined;
  const localized = resolveLocalizedBlock(bankTemplates, ctx.outputLanguage);
  if (localized) {
    const out: PromptMessage[] = [];
    const roles: Array<{ key: string; role: LlmRole }> = [
      { key: "system", role: "system" },
      { key: "developer", role: "developer" },
      { key: "user", role: "user" },
    ];
    for (const { key, role } of roles) {
      const val = localized.block[key];
      if (Array.isArray(val)) {
        out.push(...toArrayMessage(role, val.join("\n")));
      } else if (typeof val === "string") {
        out.push(...toArrayMessage(role, val));
      }
    }
    if (out.length) {
      return {
        templateId: `${safeStr(bankMeta?.id || kind)}:templates.${localized.key}`,
        messages: out as unknown as Array<Record<string, unknown>>,
      };
    }
  }

  const defaultVariant = safeStr(
    bankConfig?.defaultVariant || bank?.defaultVariant || "",
  );
  const bankVariants = bank?.variants as Record<string, unknown> | undefined;
  const variant = defaultVariant
    ? (bankVariants?.[defaultVariant] as Record<string, unknown> | undefined)
    : null;
  if (variant && Array.isArray(variant?.template)) {
    return {
      templateId: `${safeStr(bankMeta?.id || kind)}:variant.${defaultVariant}`,
      messages: [{ role: "system", content: (variant.template as string[]).join("\n") }],
    };
  }

  return {
    templateId: `${safeStr(bankMeta?.id || kind)}:meta.description`,
    messages: [{ role: "system", content: (bankMeta?.description as string) ?? "" }],
  };
}

export function compileMessagesFromTemplate(params: {
  bankId: string;
  templateId: string;
  outputLanguage: PromptContext["outputLanguage"];
  slots: Record<string, unknown>;
  slotsFilled: string[];
  messages: Array<Record<string, unknown>>;
}): PromptMessage[] {
  const { bankId, templateId, outputLanguage, slots, slotsFilled, messages } = params;

  return messages
    .map((m: Record<string, unknown>) => {
      const role: LlmRole = parseLlmRole(m.role, bankId, templateId);
      const contentRaw = localizedText(m.content, outputLanguage);
      const content = normalizeWs(interpolate(contentRaw, slots, slotsFilled));
      if (hasUnresolvedTemplateToken(content)) {
        throw new PromptPlaceholderResolutionError(
          `prompt_unresolved_placeholders:${bankId}:${templateId}`,
          { bankId, templateId },
        );
      }
      return { role, content };
    })
    .filter((m: PromptMessage) => m.content.length > 0);
}
