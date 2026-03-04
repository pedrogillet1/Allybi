import fs from "fs";
import path from "path";

import { getBankLoaderInstance, getOptionalBank } from "./bankLoader.service";

export interface DocumentIntelligenceIntegrityResult {
  ok: boolean;
  missingMapBank: boolean;
  missingCoreBanks: string[];
  missingRegistryEntries: string[];
  missingBankFiles: string[];
  missingManifestBanks: string[];
  missingDependencyNodes: string[];
  orphanBankIds: string[];
  domainOntologyMismatches: string[];
  mapRequiredCoreCount: number;
  mapOptionalCount: number;
}

function resolveDataBanksRoot(): string {
  const candidates = [
    path.join(process.cwd(), "backend", "src", "data_banks"),
    path.join(process.cwd(), "src", "data_banks"),
    path.join(__dirname, "..", "..", "..", "data_banks"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export class DocumentIntelligenceIntegrityService {
  validate(): DocumentIntelligenceIntegrityResult {
    const mapBank = getOptionalBank<Record<string, unknown>>("document_intelligence_bank_map");

    if (!mapBank || typeof mapBank !== "object") {
      return {
        ok: false,
        missingMapBank: true,
        missingCoreBanks: [],
        missingRegistryEntries: [],
        missingBankFiles: [],
        missingManifestBanks: [],
        missingDependencyNodes: [],
        orphanBankIds: [],
        domainOntologyMismatches: [],
        mapRequiredCoreCount: 0,
        mapOptionalCount: 0,
      };
    }

    const requiredCoreIds = Array.isArray(mapBank.requiredCoreBankIds)
      ? mapBank.requiredCoreBankIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      : [];

    const optionalIds = Array.isArray(mapBank.optionalBankIds)
      ? mapBank.optionalBankIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      : [];

    const missingCoreBanks = requiredCoreIds.filter(
      (id: string) => !getOptionalBank(id),
    );

    const loader = getBankLoaderInstance();
    const missingRegistryEntries: string[] = [];
    const missingBankFiles: string[] = [];
    const missingDependencyNodes: string[] = [];
    const root = resolveDataBanksRoot();
    const dependencyBank = getOptionalBank<Record<string, unknown>>("bank_dependencies");
    const dependencyNodes = new Set(
      Array.isArray(dependencyBank?.banks)
        ? (dependencyBank.banks as unknown[])
            .map((node: unknown) => String((node as Record<string, unknown>)?.id || "").trim())
            .filter(Boolean)
        : [],
    );

    for (const id of requiredCoreIds) {
      const entry = loader.getRegistryEntry(id);
      if (!entry) {
        missingRegistryEntries.push(id);
        continue;
      }

      const relPath = String(
        (entry as unknown as Record<string, unknown>)?.path || "",
      ).trim();
      if (!relPath) {
        missingBankFiles.push(id);
        continue;
      }

      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) {
        missingBankFiles.push(id);
      }

      if (!dependencyNodes.has(id)) {
        missingDependencyNodes.push(id);
      }
    }

    const requiredManifestIds = [
      "document_intelligence_schema_registry",
      "document_intelligence_dependency_graph",
      "document_intelligence_usage_manifest",
      "document_intelligence_orphan_allowlist",
      "document_intelligence_runtime_wiring_gates",
    ];
    const missingManifestBanks = requiredManifestIds.filter(
      (id) => !getOptionalBank(id),
    );

    const usageManifest = getOptionalBank<Record<string, unknown>>(
      "document_intelligence_usage_manifest",
    );
    const orphanAllowlist = getOptionalBank<Record<string, unknown>>(
      "document_intelligence_orphan_allowlist",
    );
    const consumedIds = new Set(
      Array.isArray(usageManifest?.consumedBankIds)
        ? usageManifest.consumedBankIds
            .map((id: unknown) => String(id || "").trim())
            .filter(Boolean)
        : [],
    );
    const consumedPrefixes: string[] = Array.isArray(
      usageManifest?.consumedIdPrefixes,
    )
      ? usageManifest.consumedIdPrefixes
          .map((prefix: unknown) => String(prefix || "").trim())
          .filter(Boolean)
      : [];
    const consumedPatterns: RegExp[] = Array.isArray(
      usageManifest?.consumedIdPatterns,
    )
      ? usageManifest.consumedIdPatterns
          .map((pattern: unknown) => {
            try {
              return new RegExp(String(pattern || ""));
            } catch {
              return null;
            }
          })
          .filter(
            (pattern: RegExp | null): pattern is RegExp => pattern != null,
          )
      : [];
    const allowlistedIds = new Set(
      Array.isArray(orphanAllowlist?.allowlistedBankIds)
        ? orphanAllowlist.allowlistedBankIds
            .map((id: unknown) => String(id || "").trim())
            .filter(Boolean)
        : [],
    );
    const allowlistedPrefixes: string[] = Array.isArray(
      orphanAllowlist?.allowlistedIdPrefixes,
    )
      ? orphanAllowlist.allowlistedIdPrefixes
          .map((prefix: unknown) => String(prefix || "").trim())
          .filter(Boolean)
      : [];
    const allowlistedPatterns: RegExp[] = Array.isArray(
      orphanAllowlist?.allowlistedIdPatterns,
    )
      ? orphanAllowlist.allowlistedIdPatterns
          .map((pattern: unknown) => {
            try {
              return new RegExp(String(pattern || ""));
            } catch {
              return null;
            }
          })
          .filter(
            (pattern: RegExp | null): pattern is RegExp => pattern != null,
          )
      : [];
    const isConsumed = (id: string): boolean =>
      consumedIds.has(id) ||
      consumedPrefixes.some((prefix) => id.startsWith(prefix)) ||
      consumedPatterns.some((pattern) => pattern.test(id));
    const isAllowlisted = (id: string): boolean =>
      allowlistedIds.has(id) ||
      allowlistedPrefixes.some((prefix) => id.startsWith(prefix)) ||
      allowlistedPatterns.some((pattern) => pattern.test(id));
    const allMapIds = [...requiredCoreIds, ...optionalIds];
    const orphanBankIds = allMapIds.filter(
      (id: string) => !isConsumed(id) && !isAllowlisted(id),
    );

    // Cross-validate DI domain ontology against root domain ontology.
    // Every domain ID declared in the DI enumeration must exist as a
    // parent or subdomain ID in the root taxonomy (SSOT).
    const domainOntologyMismatches: string[] = [];
    const rootOntology = getOptionalBank<Record<string, unknown>>("domain_ontology");
    const diOntology = getOptionalBank<Record<string, unknown>>("di_domain_ontology");

    if (rootOntology && diOntology) {
      // Collect all valid domain IDs from the root taxonomy (parents + subdomains).
      const rootDomainIds = new Set<string>();
      if (Array.isArray(rootOntology.parents)) {
        for (const parent of rootOntology.parents as Record<string, unknown>[]) {
          const parentId = String(parent?.id || "").trim();
          if (parentId) rootDomainIds.add(parentId);
        }
      }
      if (Array.isArray(rootOntology.subdomains)) {
        for (const sub of rootOntology.subdomains as Record<string, unknown>[]) {
          const subId = String(sub?.id || "").trim();
          if (subId) rootDomainIds.add(subId);
        }
      }

      // Extract DI domain IDs from config.canonicalDomainIds and domains[].id.
      const diDomainIds = new Set<string>();
      const diConfig = diOntology.config as Record<string, unknown> | undefined;
      if (diConfig && Array.isArray(diConfig.canonicalDomainIds)) {
        for (const id of diConfig.canonicalDomainIds) {
          const trimmed = String(id || "").trim();
          if (trimmed) diDomainIds.add(trimmed);
        }
      }
      if (Array.isArray(diOntology.domains)) {
        for (const domain of diOntology.domains as Record<string, unknown>[]) {
          const domainId = String(domain?.id || "").trim();
          if (domainId) diDomainIds.add(domainId);
        }
      }

      // Every DI domain ID must exist in the root taxonomy.
      for (const diId of diDomainIds) {
        if (!rootDomainIds.has(diId)) {
          domainOntologyMismatches.push(diId);
        }
      }
    }

    return {
      ok:
        missingCoreBanks.length === 0 &&
        missingRegistryEntries.length === 0 &&
        missingBankFiles.length === 0 &&
        missingManifestBanks.length === 0 &&
        missingDependencyNodes.length === 0 &&
        orphanBankIds.length === 0 &&
        domainOntologyMismatches.length === 0,
      missingMapBank: false,
      missingCoreBanks,
      missingRegistryEntries,
      missingBankFiles,
      missingManifestBanks,
      missingDependencyNodes,
      orphanBankIds,
      domainOntologyMismatches,
      mapRequiredCoreCount: requiredCoreIds.length,
      mapOptionalCount: optionalIds.length,
    };
  }
}
