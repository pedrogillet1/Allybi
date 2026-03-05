import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

const FIRST_CLASS_FAMILIES = [
  "documents",
  "editing",
  "calc",
  "navigation",
  "integrations",
] as const;

type FamilyMechanism = {
  mode: "bank" | "hybrid" | "heuristic";
  requiredBanks: string[];
  routerMarkers: string[];
  documentedException?: {
    reason: string;
  };
};

const FAMILY_MECHANISM_CONTRACT: Record<(typeof FIRST_CLASS_FAMILIES)[number], FamilyMechanism> =
  {
    documents: {
      mode: "hybrid",
      requiredBanks: ["intent_patterns"],
      routerMarkers: ["detectIntentPatternCandidates(", "isDiscoveryQuery("],
      documentedException: {
        reason: "Documents family also depends on document-context and discovery heuristics.",
      },
    },
    editing: {
      mode: "heuristic",
      requiredBanks: [],
      routerMarkers: ["isEditingQuery("],
      documentedException: {
        reason: "TurnRouter editing family currently routes from deterministic lexical heuristics.",
      },
    },
    calc: {
      mode: "hybrid",
      requiredBanks: ["calc_intent_patterns_en", "calc_intent_patterns_pt"],
      routerMarkers: ["isCalcQuery("],
      documentedException: {
        reason: "TurnRouter calc family currently mixes lexical heuristic with agent-level calc banks.",
      },
    },
    navigation: {
      mode: "bank",
      requiredBanks: ["nav_intents_en", "nav_intents_pt", "nav_intents_es"],
      routerMarkers: ["detectNavIntentFromBank(", "getNavIntentsBank(locale)"],
    },
    integrations: {
      mode: "bank",
      requiredBanks: [
        "connect_intents_en",
        "connect_intents_pt",
        "search_intents_en",
        "search_intents_pt",
        "send_intents_en",
        "send_intents_pt",
        "sync_intents_en",
        "sync_intents_pt",
      ],
      routerMarkers: ["detectIntegrationIntentFromBanks("],
    },
  };

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

describe("Certification: routing-family-mechanism-contract", () => {
  const intentConfig = readJson("routing/intent_config.any.json");
  const registry = readJson("manifest/bank_registry.any.json");
  const configuredFamilies = new Set(
    (Array.isArray(intentConfig?.intentFamilies) ? intentConfig.intentFamilies : [])
      .map((entry: any) => String(entry?.id || "").trim())
      .filter(Boolean),
  );
  const registryIds = new Set(
    (Array.isArray(registry?.banks) ? registry.banks : [])
      .map((entry: any) => String(entry?.id || "").trim())
      .filter(Boolean),
  );
  const turnRouterSource = fs.readFileSync(
    path.resolve(__dirname, "../../services/chat/turnRouter.service.ts"),
    "utf8",
  );
  const runtimeWiringSource = fs.readFileSync(
    path.resolve(__dirname, "../../services/core/banks/runtimeWiringIntegrity.service.ts"),
    "utf8",
  );

  test("contract covers every first-class family declared in intent_config", () => {
    for (const familyId of FIRST_CLASS_FAMILIES) {
      expect(configuredFamilies.has(familyId)).toBe(true);
      expect(Boolean(FAMILY_MECHANISM_CONTRACT[familyId])).toBe(true);
    }
  });

  test("contract required banks exist in bank registry", () => {
    for (const familyId of FIRST_CLASS_FAMILIES) {
      const contract = FAMILY_MECHANISM_CONTRACT[familyId];
      for (const bankId of contract.requiredBanks) {
        expect(registryIds.has(bankId)).toBe(true);
      }
    }
  });

  test("contract router markers are wired in TurnRouterService", () => {
    for (const familyId of FIRST_CLASS_FAMILIES) {
      const contract = FAMILY_MECHANISM_CONTRACT[familyId];
      for (const marker of contract.routerMarkers) {
        expect(turnRouterSource.includes(marker)).toBe(true);
      }
    }
  });

  test("bank-mode families are wired in runtime routing-bank contract", () => {
    for (const familyId of FIRST_CLASS_FAMILIES) {
      const contract = FAMILY_MECHANISM_CONTRACT[familyId];
      if (contract.mode !== "bank") continue;
      for (const bankId of contract.requiredBanks) {
        expect(runtimeWiringSource.includes(bankId)).toBe(true);
      }
    }
  });

  test("non-bank families declare explicit exception rationale", () => {
    for (const familyId of FIRST_CLASS_FAMILIES) {
      const contract = FAMILY_MECHANISM_CONTRACT[familyId];
      if (contract.mode === "bank") continue;
      expect(String(contract.documentedException?.reason || "").trim().length).toBeGreaterThan(0);
    }
  });

  test("write certification gate report", () => {
    const failures: string[] = [];

    for (const familyId of FIRST_CLASS_FAMILIES) {
      if (!configuredFamilies.has(familyId)) {
        failures.push(`MISSING_INTENT_CONFIG_FAMILY_${familyId}`);
      }

      const contract = FAMILY_MECHANISM_CONTRACT[familyId];
      if (!contract) {
        failures.push(`MISSING_CONTRACT_ENTRY_${familyId}`);
        continue;
      }

      for (const bankId of contract.requiredBanks) {
        if (!registryIds.has(bankId)) {
          failures.push(`MISSING_REGISTRY_BANK_${familyId}_${bankId}`);
        }
      }

      for (const marker of contract.routerMarkers) {
        if (!turnRouterSource.includes(marker)) {
          failures.push(`MISSING_ROUTER_MARKER_${familyId}_${marker}`);
        }
      }

      if (contract.mode === "bank") {
        for (const bankId of contract.requiredBanks) {
          if (!runtimeWiringSource.includes(bankId)) {
            failures.push(`MISSING_RUNTIME_ROUTING_CONTRACT_${familyId}_${bankId}`);
          }
        }
      } else {
        if (!String(contract.documentedException?.reason || "").trim()) {
          failures.push(`MISSING_EXCEPTION_REASON_${familyId}`);
        }
      }
    }

    writeCertificationGateReport("routing-family-mechanism-contract", {
      passed: failures.length === 0,
      metrics: {
        firstClassFamilies: FIRST_CLASS_FAMILIES.length,
        contractFamilies: Object.keys(FAMILY_MECHANISM_CONTRACT).length,
        bankModeFamilies: FIRST_CLASS_FAMILIES.filter(
          (familyId) => FAMILY_MECHANISM_CONTRACT[familyId].mode === "bank",
        ).length,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
