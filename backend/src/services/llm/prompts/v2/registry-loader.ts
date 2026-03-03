import type { ZodType } from "zod";

import {
  PromptBankLoadError,
  PromptBankMissingError,
  PromptBankValidationError,
} from "./errors";
import type {
  BankLoader,
  PromptKind,
} from "./types";

interface LoadOptions<T> {
  bankLoader: BankLoader;
  bankId: string;
  kind: PromptKind;
  required: boolean;
  schema?: ZodType<T>;
}

function parseWithSchema<T>(
  bankId: string,
  raw: unknown,
  schema?: ZodType<T>,
): T {
  if (!schema) return raw as T;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new PromptBankValidationError(bankId, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function isMissingBankError(
  bankLoader: BankLoader,
  bankId: string,
  error: unknown,
): boolean {
  if (typeof bankLoader.hasBank === "function") {
    try {
      return bankLoader.hasBank(bankId) === false;
    } catch {
      // ignore classifier failure
    }
  }

  if (typeof bankLoader.getOptionalBank === "function") {
    try {
      return bankLoader.getOptionalBank(bankId) == null;
    } catch {
      // ignore classifier failure
    }
  }

  if (error instanceof PromptBankMissingError) return true;
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === "BANK_NOT_FOUND" || code === "BANK_MISSING") return true;
  }
  if (
    error instanceof Error &&
    error.name === "DataBankError" &&
    error.message.startsWith("Bank not loaded:")
  ) {
    return true;
  }

  return false;
}

export function loadPromptBank<T>(opts: LoadOptions<T>): T | null {
  const { bankLoader, bankId, kind, required, schema } = opts;
  let raw: unknown;

  try {
    raw = bankLoader.getBank(bankId);
  } catch (error) {
    if (!required) return null;
    if (isMissingBankError(bankLoader, bankId, error)) {
      throw new PromptBankMissingError(bankId, {
        kind,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    throw new PromptBankLoadError(bankId, {
      kind,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (raw == null) {
    if (!required) return null;
    throw new PromptBankMissingError(bankId, { kind });
  }

  try {
    return parseWithSchema(bankId, raw, schema);
  } catch (error) {
    if (error instanceof PromptBankValidationError) {
      throw new PromptBankValidationError(bankId, {
        kind,
        ...(error.details || {}),
      });
    }
    if (!required) return null;
    throw new PromptBankLoadError(bankId, {
      kind,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function loadRequiredPromptBank<T>(opts: Omit<LoadOptions<T>, "required">): T {
  const bank = loadPromptBank({ ...opts, required: true });
  if (bank == null) {
    throw new PromptBankMissingError(opts.bankId, { kind: opts.kind });
  }
  return bank;
}
