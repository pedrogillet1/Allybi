import { getOptionalBank } from "../core/banks/bankLoader.service";
import path from "path";

type Locale = "en" | "pt" | "es";

type RoutingRule = {
  when?: {
    any?: Array<{
      type?: string;
      locale?: string;
      patterns?: string[];
    }>;
  };
};

type RoutingBank = {
  config?: {
    enabled?: boolean;
    matching?: {
      caseSensitive?: boolean;
      stripDiacriticsForMatching?: boolean;
      collapseWhitespace?: boolean;
    };
  };
  rules?: RoutingRule[];
};

function normalizeText(
  input: string,
  opts?: { stripDiacritics?: boolean; collapseWhitespace?: boolean },
): string {
  let value = input;
  if (opts?.stripDiacritics) {
    value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (opts?.collapseWhitespace) {
    value = value.replace(/\s+/g, " ");
  }
  return value.trim();
}

export class TurnRoutePolicyService {
  private readonly connectorsRouting: RoutingBank | null;
  private readonly emailRouting: RoutingBank | null;

  constructor() {
    this.connectorsRouting =
      getOptionalBank<RoutingBank>("connectors_routing") ||
      this.loadRoutingBankFallback("routing/connectors_routing.any.json");
    this.emailRouting =
      getOptionalBank<RoutingBank>("email_routing") ||
      this.loadRoutingBankFallback("routing/email_routing.any.json");
  }

  isConnectorTurn(message: string, locale: Locale): boolean {
    if (!message.trim()) return false;

    if (this.matchesBank(message, locale, this.emailRouting)) return true;
    if (this.matchesBank(message, locale, this.connectorsRouting)) return true;
    return false;
  }

  private matchesBank(
    message: string,
    locale: Locale,
    bank: RoutingBank | null,
  ): boolean {
    if (!bank?.config?.enabled) return false;

    const caseSensitive = Boolean(bank.config.matching?.caseSensitive);
    const stripDiacritics = Boolean(
      bank.config.matching?.stripDiacriticsForMatching,
    );
    const collapseWhitespace = Boolean(bank.config.matching?.collapseWhitespace);
    const normalized = normalizeText(message, {
      stripDiacritics,
      collapseWhitespace,
    });

    for (const rule of bank.rules || []) {
      for (const clause of rule.when?.any || []) {
        if (clause.type !== "regex") continue;
        const clauseLocale = String(clause.locale || "any").toLowerCase();
        if (clauseLocale !== "any" && clauseLocale !== locale) continue;

        for (const pattern of clause.patterns || []) {
          try {
            const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
            if (regex.test(normalized)) return true;
          } catch {
            // Ignore invalid bank regex entry and continue.
          }
        }
      }
    }
    return false;
  }

  private loadRoutingBankFallback(relativeBankPath: string): RoutingBank | null {
    const basePaths = [
      path.resolve(process.cwd(), "src/data_banks", relativeBankPath),
      path.resolve(process.cwd(), "backend/src/data_banks", relativeBankPath),
    ];
    for (const candidate of basePaths) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require
        const bank = require(candidate) as RoutingBank;
        if (bank && typeof bank === "object") return bank;
      } catch {
        // Keep trying next path.
      }
    }
    return null;
  }
}
