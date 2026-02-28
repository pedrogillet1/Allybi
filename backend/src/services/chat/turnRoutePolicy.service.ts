import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../core/banks/documentIntelligenceBanks.service";

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

function isStrictEnv(): boolean {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "production" || env === "staging";
}

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
  private readonly strict: boolean;
  private readonly banks: Pick<
    DocumentIntelligenceBanksService,
    "getRoutingBank"
  >;

  constructor(opts?: {
    strict?: boolean;
    banks?: Pick<DocumentIntelligenceBanksService, "getRoutingBank">;
  }) {
    this.strict = opts?.strict ?? isStrictEnv();
    this.banks = opts?.banks ?? getDocumentIntelligenceBanksInstance();
    this.connectorsRouting = this.banks.getRoutingBank("connectors_routing");
    this.emailRouting = this.banks.getRoutingBank("email_routing");

    const missingBanks: string[] = [];
    if (!this.connectorsRouting) missingBanks.push("connectors_routing");
    if (!this.emailRouting) missingBanks.push("email_routing");
    if (this.strict && missingBanks.length > 0) {
      throw new Error(
        `[TurnRoutePolicy] Missing required routing banks in strict mode: ${missingBanks.join(", ")}`,
      );
    }

    this.validateRegexPatterns("connectors_routing", this.connectorsRouting);
    this.validateRegexPatterns("email_routing", this.emailRouting);
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
    const collapseWhitespace = Boolean(
      bank.config.matching?.collapseWhitespace,
    );
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

  private validateRegexPatterns(
    bankId: string,
    bank: RoutingBank | null,
  ): void {
    if (!bank) return;
    const caseSensitive = Boolean(bank.config?.matching?.caseSensitive);
    for (const rule of bank.rules || []) {
      for (const clause of rule.when?.any || []) {
        if (clause.type !== "regex") continue;
        for (const pattern of clause.patterns || []) {
          try {
            void new RegExp(pattern, caseSensitive ? "g" : "gi");
          } catch {
            if (this.strict) {
              throw new Error(
                `[TurnRoutePolicy] Invalid regex in ${bankId}: ${pattern}`,
              );
            }
          }
        }
      }
    }
  }
}
