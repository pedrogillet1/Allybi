import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import {
  ScopeGateService,
  type ConversationStateLike,
  type DocMeta,
} from "../../services/core/scope/scopeGate.service";
import { writeCertificationGateReport } from "./reporting";

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const BANKS_ROOT = path.join(BACKEND_ROOT, "data_banks");

function walkFiles(root: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, suffix));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

function buildState(overrides?: Partial<ConversationStateLike>): ConversationStateLike {
  return {
    session: { env: "dev", userLanguage: "en" },
    persistent: {
      scope: {
        activeDocId: null,
        hardDocLock: false,
        hardSheetLock: false,
      },
    },
    history: { recentReasonCodes: [] },
    ephemeral: { turn: { turnId: 1 } },
    ...(overrides || {}),
  } as ConversationStateLike;
}

function makeBankLoader() {
  return {
    getBank: (bankId: string): any => {
      if (bankId === "scope_hints") {
        return {
          config: {
            actionsContract: { thresholds: { minHintConfidence: 0.75 } },
          },
        };
      }
      if (bankId === "scope_resolution") {
        return {
          config: {
            enabled: true,
            thresholds: {
              minToEmit: 0.55,
              minToApplySoftConstraint: 0.64,
              minToApplyHardConstraint: 0.74,
              explicitFilenameHardMin: 0.8,
              explicitDocIdHardMin: 0.85,
              activeDocSoftMin: 0.6,
            },
            limits: {
              maxDocAllowlist: 8,
              maxDocDenylist: 24,
              maxTokenExclusions: 30,
            },
            policy: {
              preferExplicitDocRefOverState: true,
            },
          },
          resolution: {
            apply_explicit_doc_refs: { enabled: true },
            apply_user_choice: { enabled: true },
            apply_hard_locked_doc: { enabled: true },
            apply_lock_request: { enabled: true },
            apply_followup_active_doc: { enabled: true },
            apply_entities_and_time: { enabled: true },
            apply_negatives: { enabled: true },
            finalize: { enabled: true },
          },
        };
      }
      if (bankId === "disambiguation_policies") {
        return {
          config: {
            thresholds: {
              autopickTopScore: 0.85,
              autopickGap: 0.25,
              autopickMinScopeCompliance: 0.8,
              disambiguateIfScoreBelow: 0.7,
              disambiguateIfGapBelow: 0.15,
              maxOptions: 4,
              minOptions: 2,
              maxQuestions: 1,
            },
          },
        };
      }
      return {};
    },
  };
}

function makeDocStore(docs: DocMeta[]) {
  return {
    listDocs: async () => docs,
    getDocMeta: async (docId: string) =>
      docs.find((doc) => doc.docId === docId) || null,
  };
}

function makeDocIntelligenceBanks() {
  return {
    getMergedDocAliasesBank: () => ({
      config: { minAliasConfidence: 0.75 },
    }),
    getDocAliasPhrases: () => ["agreement", "msa", "amendment"],
    getDocTaxonomy: () => ({ typeDefinitions: [] }),
  } as any;
}

describe("Certification: doc-identity harsh quality", () => {
  test("bank quality + version ambiguity behavior satisfy harsh constraints", async () => {
    const failures: string[] = [];

    const archetypeFiles = walkFiles(
      path.join(BANKS_ROOT, "semantics", "taxonomy", "doc_archetypes"),
      ".any.json",
    );
    let supplementIdHits = 0;
    for (const filePath of archetypeFiles) {
      const bank = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        archetypes?: Array<{ id?: string }>;
      };
      for (const archetype of bank.archetypes || []) {
        if (String(archetype?.id || "").includes("_supplement_")) {
          supplementIdHits += 1;
        }
      }
    }
    if (supplementIdHits > 0) failures.push("ARCHETYPE_SYNTHETIC_SUPPLEMENT_IDS");

    const headerFiles = walkFiles(
      path.join(BANKS_ROOT, "semantics", "structure"),
      ".any.json",
    ).filter((filePath) => path.basename(filePath).startsWith("table_header_ontology."));
    let bridgeSynonymHits = 0;
    for (const filePath of headerFiles) {
      const bank = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        headers?: Array<{ synonyms?: string[] }>;
      };
      for (const header of bank.headers || []) {
        for (const synonym of header.synonyms || []) {
          if (String(synonym || "").startsWith("cross_domain_bridge_syn_")) {
            bridgeSynonymHits += 1;
          }
        }
      }
    }
    if (bridgeSynonymHits > 0) failures.push("TABLE_HEADER_SYNTHETIC_BRIDGE_SYNONYMS");

    const entityFiles = walkFiles(
      path.join(BANKS_ROOT, "semantics", "entities"),
      ".any.json",
    );
    let bridgeEntityIds = 0;
    let adversarialCurationReasons = 0;
    let invalidRegexCount = 0;
    for (const filePath of entityFiles) {
      const bank = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        rules?: Array<{ id?: string; pattern?: string; normalizationContract?: { curationReason?: string } }>;
      };
      for (const rule of bank.rules || []) {
        const id = String(rule?.id || "");
        const curationReason = String(
          rule?.normalizationContract?.curationReason || "",
        ).toLowerCase();
        if (id.includes("_bridge_")) bridgeEntityIds += 1;
        if (curationReason.includes("adversarial")) adversarialCurationReasons += 1;
        try {
          new RegExp(String(rule?.pattern || ""), "i");
        } catch {
          invalidRegexCount += 1;
        }
      }
    }
    if (bridgeEntityIds > 0) failures.push("ENTITY_BRIDGE_IDS_PRESENT");
    if (adversarialCurationReasons > 0) {
      failures.push("ENTITY_ADVERSARIAL_CURATION_REASONS_PRESENT");
    }
    if (invalidRegexCount > 0) failures.push("ENTITY_INVALID_REGEX");

    const coreEvalFiles = walkFiles(
      path.join(BANKS_ROOT, "document_intelligence", "eval", "domain_specific"),
      ".qa.jsonl",
    );
    let mojibakeHits = 0;
    for (const filePath of coreEvalFiles) {
      const text = fs.readFileSync(filePath, "utf8");
      const matches = text.match(/se\?\?o|se\?\?es|�/g);
      if (matches) mojibakeHits += matches.length;
    }
    if (mojibakeHits > 0) failures.push("EVAL_MOJIBAKE_PRESENT");

    const versionDocs: DocMeta[] = [
      {
        docId: "msa-v1",
        filename: "MSA_v1_signed.pdf",
        title: "Master Services Agreement v1 signed",
      },
      {
        docId: "msa-v2",
        filename: "MSA_v2_draft.pdf",
        title: "Master Services Agreement v2 draft",
      },
      {
        docId: "msa-am1",
        filename: "MSA_amendment_1.pdf",
        title: "MSA amendment 1",
      },
    ];
    const service = new ScopeGateService(
      makeBankLoader() as any,
      makeDocStore(versionDocs) as any,
      makeDocIntelligenceBanks(),
    );

    const latestDecision = await service.evaluate(buildState(), {
      query: "show me the latest version of the agreement",
      env: "dev",
      signals: {},
    });
    const latestNeedsChoice = latestDecision.reasonCodes.includes("needs_doc_choice");
    const latestMaxOneQuestion = latestDecision.disambiguation?.maxQuestions === 1;
    if (!latestNeedsChoice) failures.push("VERSION_QUERY_NO_DOC_CHOICE");
    if (!latestMaxOneQuestion) failures.push("VERSION_QUERY_MAX_QUESTIONS_NOT_ONE");

    const explicitV2Decision = await service.evaluate(buildState(), {
      query: "open MSA_v2_draft.pdf",
      env: "dev",
      signals: {},
    });
    const explicitV2Resolved = explicitV2Decision.signals.activeDocId === "msa-v2";
    if (!explicitV2Resolved) failures.push("VERSION_QUERY_EXPLICIT_V2_NOT_RESOLVED");

    writeCertificationGateReport("doc-identity-harsh-grade", {
      passed: failures.length === 0,
      metrics: {
        supplementIdHits,
        bridgeSynonymHits,
        bridgeEntityIds,
        adversarialCurationReasons,
        invalidRegexCount,
        mojibakeHits,
        latestNeedsChoice,
        latestMaxOneQuestion,
        explicitV2Resolved,
      },
      thresholds: {
        supplementIdHits: 0,
        bridgeSynonymHits: 0,
        bridgeEntityIds: 0,
        adversarialCurationReasons: 0,
        invalidRegexCount: 0,
        mojibakeHits: 0,
        latestNeedsChoice: true,
        latestMaxOneQuestion: true,
        explicitV2Resolved: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});

