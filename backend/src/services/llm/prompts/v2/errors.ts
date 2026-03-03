export type PromptRegistryErrorCode =
  | "PROMPT_BANK_MISSING"
  | "PROMPT_BANK_DISABLED"
  | "PROMPT_BANK_LOAD"
  | "PROMPT_BANK_VALIDATION"
  | "PROMPT_TEMPLATE_SELECTION"
  | "PROMPT_TEMPLATE_NO_MATCH"
  | "PROMPT_PLACEHOLDER_UNRESOLVED"
  | "PROMPT_REGISTRY_CONFIG"
  | "PROMPT_ROLE_INVALID";

export class PromptRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: PromptRegistryErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PromptRegistryError";
  }
}

export class PromptBankMissingError extends PromptRegistryError {
  constructor(bankId: string, details?: Record<string, unknown>) {
    super(
      `required prompt bank is missing: ${bankId}`,
      "PROMPT_BANK_MISSING",
      { bankId, ...(details || {}) },
    );
    this.name = "PromptBankMissingError";
  }
}

export class PromptBankDisabledError extends PromptRegistryError {
  constructor(bankId: string, details?: Record<string, unknown>) {
    super(
      `required prompt bank is disabled: ${bankId}`,
      "PROMPT_BANK_DISABLED",
      { bankId, ...(details || {}) },
    );
    this.name = "PromptBankDisabledError";
  }
}

export class PromptBankLoadError extends PromptRegistryError {
  constructor(bankId: string, details?: Record<string, unknown>) {
    super(
      `prompt bank load failed: ${bankId}`,
      "PROMPT_BANK_LOAD",
      { bankId, ...(details || {}) },
    );
    this.name = "PromptBankLoadError";
  }
}

export class PromptBankValidationError extends PromptRegistryError {
  constructor(bankId: string, details?: Record<string, unknown>) {
    super(
      `prompt bank validation failed: ${bankId}`,
      "PROMPT_BANK_VALIDATION",
      { bankId, ...(details || {}) },
    );
    this.name = "PromptBankValidationError";
  }
}

export class PromptTemplateSelectionError extends PromptRegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PROMPT_TEMPLATE_SELECTION", details);
    this.name = "PromptTemplateSelectionError";
  }
}

export class PromptNoTemplateMatchError extends PromptRegistryError {
  constructor(bankId: string, details?: Record<string, unknown>) {
    super(
      `no prompt template matched context: ${bankId}`,
      "PROMPT_TEMPLATE_NO_MATCH",
      { bankId, ...(details || {}) },
    );
    this.name = "PromptNoTemplateMatchError";
  }
}

export class PromptPlaceholderResolutionError extends PromptRegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PROMPT_PLACEHOLDER_UNRESOLVED", details);
    this.name = "PromptPlaceholderResolutionError";
  }
}

export class PromptRegistryConfigError extends PromptRegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PROMPT_REGISTRY_CONFIG", details);
    this.name = "PromptRegistryConfigError";
  }
}

export class PromptRoleValidationError extends PromptRegistryError {
  constructor(role: unknown, details?: Record<string, unknown>) {
    super(
      `invalid prompt role: ${String(role)}`,
      "PROMPT_ROLE_INVALID",
      { role: String(role), ...(details || {}) },
    );
    this.name = "PromptRoleValidationError";
  }
}
