/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "fs";
import path from "path";

import { getBankLoaderInstance, getOptionalBank } from "./bankLoader.service";

export interface DocumentIntelligenceIntegrityResult {
  ok: boolean;
  missingMapBank: boolean;
  missingCoreBanks: string[];
  missingRegistryEntries: string[];
  missingBankFiles: string[];
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
    const mapBank = getOptionalBank<any>("document_intelligence_bank_map");

    if (!mapBank || typeof mapBank !== "object") {
      return {
        ok: false,
        missingMapBank: true,
        missingCoreBanks: [],
        missingRegistryEntries: [],
        missingBankFiles: [],
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

    const missingCoreBanks = requiredCoreIds.filter((id: string) => !getOptionalBank(id));

    const loader = getBankLoaderInstance();
    const missingRegistryEntries: string[] = [];
    const missingBankFiles: string[] = [];
    const root = resolveDataBanksRoot();

    for (const id of requiredCoreIds) {
      const entry = loader.getRegistryEntry(id);
      if (!entry) {
        missingRegistryEntries.push(id);
        continue;
      }

      const relPath = String((entry as any)?.path || "").trim();
      if (!relPath) {
        missingBankFiles.push(id);
        continue;
      }

      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) {
        missingBankFiles.push(id);
      }
    }

    return {
      ok:
        missingCoreBanks.length === 0 &&
        missingRegistryEntries.length === 0 &&
        missingBankFiles.length === 0,
      missingMapBank: false,
      missingCoreBanks,
      missingRegistryEntries,
      missingBankFiles,
      mapRequiredCoreCount: requiredCoreIds.length,
      mapOptionalCount: optionalIds.length,
    };
  }
}
