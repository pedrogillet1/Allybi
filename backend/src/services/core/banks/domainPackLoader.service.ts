import { ensureBanksLoaded } from "./bankLoader.service";
import {
  normalizeDocumentIntelligenceDomain,
  type DocumentIntelligenceDomain,
} from "./documentIntelligenceBanks.service";
import { getBankLoadPlannerInstance } from "./bankLoadPlanner.service";

export interface EnsureDomainPackInput {
  domainId?: string | null;
  rootBankIds: string[];
  selectedBankVersionMap?: Record<string, string> | null;
  locale?: string | null;
  traceId?: string | null;
}

export interface EnsureDomainPackResult {
  enabled: boolean;
  domainId: DocumentIntelligenceDomain | null;
  selectedBankIds: string[];
  dependencyExpandedBankIds: string[];
  loadedBankIds: string[];
  missingBankIds: string[];
  loadDurationMs: number;
}

type BankLocale = "en" | "pt" | "es";

function normalizeLocale(value: string | null | undefined): BankLocale {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "pt") return "pt";
  if (normalized === "es") return "es";
  return "en";
}

function hasLocaleSuffix(bankId: string): boolean {
  const normalized = String(bankId || "").trim().toLowerCase();
  return /(^|_)(en|pt|es)(?=_|$)/.test(normalized);
}

function buildBankCandidates(input: {
  bankId: string;
  locale: BankLocale;
  version: string | null;
}): string[] {
  const out = new Set<string>();
  const bankId = String(input.bankId || "").trim();
  if (!bankId) return [];
  const version = String(input.version || "").trim();
  const locale = input.locale;
  const hasLocale = hasLocaleSuffix(bankId);

  if (!hasLocale) {
    if (version) out.add(`${bankId}_${locale}_${version}`);
    out.add(`${bankId}_${locale}`);
  }

  if (version) {
    out.add(`${bankId}_${version}`);
  }
  out.add(bankId);

  return Array.from(out.values());
}

export class DomainPackLoaderService {
  async ensureLoaded(input: EnsureDomainPackInput): Promise<EnsureDomainPackResult> {
    const startedAt = Date.now();
    const enabled = process.env.BANK_DOMAIN_PACKS_ENABLED !== "false";
    const domainId = normalizeDocumentIntelligenceDomain(input.domainId);
    const locale = normalizeLocale(input.locale);

    const loadPlan = getBankLoadPlannerInstance().plan({
      rootBankIds: input.rootBankIds,
    });
    const selectedBankIds =
      loadPlan.orderedBankIds.length > 0
        ? loadPlan.orderedBankIds
        : input.rootBankIds;
    const versionedCandidates: string[] = [];
    for (const bankId of selectedBankIds) {
      const version = String(input.selectedBankVersionMap?.[bankId] || "").trim();
      versionedCandidates.push(
        ...buildBankCandidates({
          bankId,
          locale,
          version: version || null,
        }),
      );
    }

    if (!enabled) {
      return {
        enabled: false,
        domainId,
        selectedBankIds,
        dependencyExpandedBankIds: loadPlan.expandedBankIds,
        loadedBankIds: [],
        missingBankIds: loadPlan.missingBankIds,
        loadDurationMs: Date.now() - startedAt,
      };
    }

    const dedupedCandidates = Array.from(new Set(versionedCandidates));
    const loadResult = await ensureBanksLoaded(dedupedCandidates);
    const missing = new Set<string>([
      ...loadPlan.missingBankIds,
      ...loadResult.missingBankIds,
    ]);

    return {
      enabled: true,
      domainId,
      selectedBankIds,
      dependencyExpandedBankIds: loadPlan.expandedBankIds,
      loadedBankIds: loadResult.loadedBankIds,
      missingBankIds: Array.from(missing).sort((a, b) => a.localeCompare(b)),
      loadDurationMs: Date.now() - startedAt,
    };
  }
}

let singleton: DomainPackLoaderService | null = null;

export function getDomainPackLoaderInstance(): DomainPackLoaderService {
  if (!singleton) {
    singleton = new DomainPackLoaderService();
  }
  return singleton;
}
