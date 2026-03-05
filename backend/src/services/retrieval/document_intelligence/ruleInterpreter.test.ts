import { describe, expect, test } from "@jest/globals";

import {
  applyQueryRewrites,
  applyBoostScoring,
  enforceCrossDocPolicy,
  matchBoostRules,
  selectSectionScanPlan,
  type RuleMatchContext,
} from "./ruleInterpreter";

function baseCtx(overrides: Partial<RuleMatchContext> = {}): RuleMatchContext {
  return {
    query: "compare budget vs actual",
    normalizedQuery: "compare budget vs actual",
    intent: "documents",
    operator: "compare",
    domain: "finance",
    docLock: false,
    explicitDocsCount: 2,
    explicitDocIds: ["doc-a", "doc-b"],
    explicitDocTypes: ["budget_report"],
    language: "en",
    ...overrides,
  };
}

describe("ruleInterpreter", () => {
  test("docLock condition prevents boost rule application", () => {
    const ctx = baseCtx({ docLock: true });
    const matched = matchBoostRules(ctx, [
      {
        id: "blocked",
        conditions: { docLock: false },
        boostDocTypes: [{ docType: "budget_report", weight: 3 }],
      },
      {
        id: "allowed",
        conditions: { docLock: true },
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
    ]);

    expect(matched.map((rule) => rule.id)).toEqual(["allowed"]);
  });

  test("weight=3 outranks weight=1 when base scores tie", () => {
    const ctx = baseCtx({ docLock: false, maxMatchedBoostRules: 2 });
    const matched = matchBoostRules(ctx, [
      {
        id: "low_weight",
        priority: 10,
        boostDocTypes: [{ docType: "invoice", weight: 1 }],
      },
      {
        id: "high_weight",
        priority: 10,
        boostDocTypes: [{ docType: "budget_report", weight: 3 }],
      },
    ]);

    const rescored = applyBoostScoring(
      ctx,
      [
        {
          candidateId: "c1",
          docId: "doc-1",
          docType: "invoice",
          location: { sectionKey: "summary" },
          scores: { final: 0.5 },
        },
        {
          candidateId: "c2",
          docId: "doc-2",
          docType: "budget_report",
          location: { sectionKey: "summary" },
          scores: { final: 0.5 },
        },
      ],
      matched,
    );

    expect(rescored[0].docId).toBe("doc-2");
    expect(rescored[0].scores.documentIntelligenceBoost).toBeGreaterThan(
      rescored[1].scores.documentIntelligenceBoost || 0,
    );
  });

  test("section scan plan changes by intent/docType rule selection", () => {
    const rules = [
      {
        id: "default",
        intent: "documents",
        sections: ["overview", "summary"],
        priority: 1,
      },
      {
        id: "finance_compare_budget",
        intent: "documents",
        operator: "compare",
        docTypes: ["budget_report"],
        sections: ["executive_summary", "variance_analysis", "assumptions"],
        priority: 20,
      },
      {
        id: "legal_compare_contract",
        intent: "documents",
        operator: "compare",
        docTypes: ["contract"],
        sections: ["definitions", "termination", "liability"],
        priority: 20,
      },
    ];

    const financePlan = selectSectionScanPlan(
      baseCtx({ explicitDocTypes: ["budget_report"] }),
      rules,
    );
    const legalPlan = selectSectionScanPlan(
      baseCtx({
        domain: "legal",
        explicitDocTypes: ["contract"],
      }),
      rules,
    );

    expect(financePlan.selectedRuleId).toBe("finance_compare_budget");
    expect(financePlan.sections).toEqual([
      "executive_summary",
      "variance_analysis",
      "assumptions",
    ]);
    expect(legalPlan.selectedRuleId).toBe("legal_compare_contract");
    expect(legalPlan.sections).toEqual([
      "definitions",
      "termination",
      "liability",
    ]);
  });

  test("cross-doc compare rejects when fewer than two explicit docs", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        explicitDocsCount: 1,
        explicitDocIds: ["doc-a"],
        candidateDocIds: ["doc-a", "doc-b", "doc-c"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: {
          maxSourceDocuments: 5,
        },
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.askDisambiguation).toBe(true);
    expect(decision.reasonCode).toBe("cross_doc_compare_needs_explicit_docs");
    expect(decision.requiredExplicitDocs).toBe(2);
    expect(decision.actualExplicitDocs).toBe(1);
  });

  test("extract operator with lexical compare cues does not trigger compare gating", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        query: "extract budget versus actual variance by business unit",
        normalizedQuery:
          "extract budget versus actual variance by business unit",
        operator: "extract",
        explicitDocsCount: 1,
        explicitDocIds: ["doc-a"],
        candidateDocIds: ["doc-a", "doc-b"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: {
          maxSourceDocuments: 5,
        },
      },
      {
        config: {
          enabled: true,
          requireExplicitComparisonScope: true,
          minDocsForCompare: 2,
        },
      },
    );

    expect(decision.allow).toBe(true);
    expect(decision.reasonCode).toBeNull();
    expect(decision.askDisambiguation).toBe(false);
  });

  test("single-document compare stays allowed when scope resolves to one doc", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        explicitDocsCount: 1,
        explicitDocIds: ["doc-a"],
        candidateDocIds: ["doc-a"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: {
          maxSourceDocuments: 5,
        },
      },
    );

    expect(decision.allow).toBe(true);
    expect(decision.reasonCode).toBeNull();
    expect(decision.allowedCandidateDocIds).toEqual(["doc-a"]);
  });

  test("alignment policy can require explicit two-doc scope even for intra-doc compare phrasing", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        explicitDocsCount: 1,
        explicitDocIds: ["doc-a"],
        candidateDocIds: ["doc-a"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: {
          maxSourceDocuments: 5,
        },
      },
      {
        config: {
          enabled: true,
          requireExplicitComparisonScope: true,
          minDocsForCompare: 2,
        },
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.reasonCode).toBe("cross_doc_compare_needs_explicit_docs");
    expect(decision.requiredExplicitDocs).toBe(2);
  });

  test("cross-doc precedence uses the stricter explicit-doc minimum across grounding and alignment policies", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        explicitDocsCount: 2,
        explicitDocIds: ["doc-a", "doc-b"],
        candidateDocIds: ["doc-a", "doc-b"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: { maxSourceDocuments: 5 },
        rules: [
          {
            id: "compare_rule",
            intents: ["documents"],
            operators: ["compare"],
            minExplicitResolvedDocs: 2,
          },
        ],
      },
      {
        config: {
          enabled: true,
          requireExplicitComparisonScope: true,
          minDocsForCompare: 3,
        },
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.reasonCode).toBe("cross_doc_compare_needs_explicit_docs");
    expect(decision.requiredExplicitDocs).toBe(3);
  });

  test("alignment policy blocks compare when period normalization is missing", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        explicitDocsCount: 2,
        explicitDocIds: ["doc-a", "doc-b"],
        candidateDocIds: ["doc-a", "doc-b"],
        comparePeriodsNormalized: false,
      }),
      {
        config: { enabled: true },
        retrievalPolicy: { maxSourceDocuments: 5 },
      },
      {
        config: {
          enabled: true,
          requireExplicitComparisonScope: true,
          minDocsForCompare: 2,
        },
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.reasonCode).toBe("cross_doc_period_alignment_required");
  });

  test("alignment policy blocks compare when currency set is mixed", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        explicitDocsCount: 2,
        explicitDocIds: ["doc-a", "doc-b"],
        candidateDocIds: ["doc-a", "doc-b"],
        compareCurrencySetSize: 2,
      }),
      {
        config: { enabled: true },
        retrievalPolicy: { maxSourceDocuments: 5 },
      },
      {
        config: {
          enabled: true,
          requireExplicitComparisonScope: true,
          minDocsForCompare: 2,
        },
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.reasonCode).toBe("cross_doc_currency_alignment_required");
  });

  test("docset lock with multiple explicit docs is not blocked by docLock gate", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        docLock: true,
        explicitDocsCount: 3,
        explicitDocIds: ["doc-a", "doc-b", "doc-c"],
        candidateDocIds: ["doc-a", "doc-b", "doc-c"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: {
          allowWhenDocLock: false,
          maxSourceDocuments: 5,
        },
      },
    );

    expect(decision.allow).toBe(true);
    expect(decision.reasonCode).toBeNull();
    expect(decision.allowedCandidateDocIds).toEqual([
      "doc-a",
      "doc-b",
      "doc-c",
    ]);
  });

  test("\\bap\\b does not rewrite without accounts payable context", () => {
    const rules = [
      {
        id: "finance_ap_guarded",
        priority: 100,
        enabled: true,
        domains: ["finance"],
        patterns: ["\\bap\\b"],
        requireContextAny: ["accounts payable", "ap aging", "vendor invoice"],
        rewrites: [{ value: "accounts payable", weight: 1 }],
      },
    ];

    const withoutContext = applyQueryRewrites(
      baseCtx({
        query: "show ap trend",
        normalizedQuery: "show ap trend",
        explicitDocsCount: 0,
        explicitDocIds: [],
        explicitDocTypes: [],
      }),
      rules,
    );
    const withContext = applyQueryRewrites(
      baseCtx({
        query: "show ap trend from accounts payable aging report",
        normalizedQuery: "show ap trend from accounts payable aging report",
        explicitDocsCount: 0,
        explicitDocIds: [],
        explicitDocTypes: [],
      }),
      rules,
    );

    expect(withoutContext).toHaveLength(0);
    expect(withContext.length).toBeGreaterThan(0);
    expect(withContext[0].sourceRuleId).toBe("finance_ap_guarded");
  });

  test("negativePatterns prevent bad rewrite expansions", () => {
    const variants = applyQueryRewrites(
      baseCtx({
        query: "compare ap score in employee review",
        normalizedQuery: "compare ap score in employee review",
      }),
      [
        {
          id: "finance_ap_with_negative_guard",
          priority: 100,
          enabled: true,
          patterns: ["\\bap\\b"],
          requireContextAny: ["accounts payable", "invoice"],
          negativePatterns: ["\\bemployee review\\b", "\\bperformance\\b"],
          rewrites: [{ value: "accounts payable", weight: 1 }],
        },
      ],
    );

    expect(variants).toHaveLength(0);
  });

  test("rewrite is suppressed on explicit doc ids unless allowWhenExplicitDocIds is true", () => {
    const ctx = baseCtx({
      operator: "extract",
      intent: "documents",
      explicitDocsCount: 1,
      explicitDocIds: ["doc-a"],
      explicitDocTypes: [],
      query: "show ap aging",
      normalizedQuery: "show ap aging",
    });

    const blocked = applyQueryRewrites(ctx, [
      {
        id: "finance_ap_blocked_on_explicit_doc",
        priority: 100,
        enabled: true,
        patterns: ["\\bap\\b"],
        requireContextAny: ["aging"],
        rewrites: [{ value: "accounts payable", weight: 1 }],
        conditions: {
          requireDomainMatch: true,
          domains: ["finance"],
        },
      },
    ]);
    const allowed = applyQueryRewrites(ctx, [
      {
        id: "finance_ap_allowed_on_explicit_doc",
        priority: 100,
        enabled: true,
        patterns: ["\\bap\\b"],
        requireContextAny: ["aging"],
        rewrites: [{ value: "accounts payable", weight: 1 }],
        conditions: {
          requireDomainMatch: true,
          domains: ["finance"],
          allowWhenExplicitDocIds: true,
        },
      },
    ]);

    expect(blocked).toHaveLength(0);
    expect(allowed.length).toBeGreaterThan(0);
  });

  test("non-acronym rewrites are suppressed when explicit doc types already scope request", () => {
    const blocked = applyQueryRewrites(
      baseCtx({
        operator: "summarize",
        query: "show gross margin summary",
        normalizedQuery: "show gross margin summary",
        explicitDocTypes: ["profit_and_loss"],
      }),
      [
        {
          id: "finance_gross_margin_synonym",
          priority: 90,
          enabled: true,
          patterns: ["\\bgross margin\\b"],
          requireContextAny: ["gross margin"],
          rewrites: [{ value: "gross profit margin", weight: 1 }],
          conditions: {
            requireDomainMatch: true,
            domains: ["finance"],
          },
        },
      ],
    );
    const allowedAcronym = applyQueryRewrites(
      baseCtx({
        operator: "extract",
        query: "show ap aging",
        normalizedQuery: "show ap aging",
        explicitDocsCount: 0,
        explicitDocIds: [],
        explicitDocTypes: ["ap_aging_report"],
      }),
      [
        {
          id: "finance_ap_acronym",
          priority: 90,
          enabled: true,
          patterns: ["\\bap\\b"],
          requireContextAny: ["aging"],
          rewrites: [{ value: "accounts payable", weight: 1 }],
          conditions: {
            requireDomainMatch: true,
            domains: ["finance"],
            allowWhenExplicitDocTypes: true,
          },
        },
      ],
    );

    expect(blocked).toHaveLength(0);
    expect(allowedAcronym.length).toBeGreaterThan(0);
  });

  test("unguarded short acronym rewrite is blocked without domain context", () => {
    const rule = {
      id: "medical_mp_unguarded",
      priority: 90,
      enabled: true,
      domains: ["medical"],
      patterns: ["\\bmp\\b"],
      negativePatterns: [],
      requireContextAny: [],
      requireContextAll: [],
      forbidContextAny: [],
      rewrites: [{ value: "metabolic panel", weight: 1 }],
    };

    const withoutContext = applyQueryRewrites(
      baseCtx({
        domain: "medical",
        query: "show mp trend",
        normalizedQuery: "show mp trend",
        explicitDocsCount: 0,
        explicitDocIds: [],
        explicitDocTypes: [],
      }),
      [rule],
    );
    const withContext = applyQueryRewrites(
      baseCtx({
        domain: "medical",
        query: "show mp trend from metabolic panel results",
        normalizedQuery: "show mp trend from metabolic panel results",
        explicitDocsCount: 0,
        explicitDocIds: [],
        explicitDocTypes: [],
      }),
      [rule],
    );

    expect(withoutContext).toHaveLength(0);
    expect(withContext.length).toBeGreaterThan(0);
  });
});

describe("applyBoostScoring multipliers and caps", () => {
  test("standard mode uses 0.03 docType and 0.025 section multipliers", () => {
    const ctx = baseCtx({ maxMatchedBoostRules: 1 });
    const rules = matchBoostRules(ctx, [
      {
        id: "r1",
        priority: 1,
        weight: 1,
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
        boostSections: [{ section: "summary", weight: 1 }],
      },
    ]);

    const candidates = [
      {
        candidateId: "c1",
        docId: "doc-1",
        docType: "budget_report",
        location: { sectionKey: "summary" },
        scores: { final: 0.5 },
      },
    ];

    const rescored = applyBoostScoring(ctx, candidates, rules);
    // First rule (i=0), diminishing = 1/1 = 1
    // boost = (1 * 0.03 + 1 * 0.025) * 1 = 0.055
    const boost = rescored[0].scores.documentIntelligenceBoost!;
    expect(boost).toBeCloseTo(0.055, 5);
    expect(rescored[0].scores.final).toBeCloseTo(0.555, 5);
  });

  test("maxDocumentIntelligenceBoost caps total boost (default 0.45)", () => {
    const ctx = baseCtx({
      maxMatchedBoostRules: 1,
      maxDocumentIntelligenceBoost: 0.45,
    });
    const rules = matchBoostRules(ctx, [
      {
        id: "r1",
        priority: 1,
        weight: 20,
        boostDocTypes: [{ docType: "budget_report", weight: 20 }],
        boostSections: [{ section: "summary", weight: 20 }],
      },
    ]);

    const candidates = [
      {
        candidateId: "c1",
        docId: "doc-1",
        docType: "budget_report",
        location: { sectionKey: "summary" },
        scores: { final: 0.3 },
      },
    ];

    const rescored = applyBoostScoring(ctx, candidates, rules);
    // Raw boost would be huge, but capped at 0.45
    expect(rescored[0].scores.documentIntelligenceBoost).toBeLessThanOrEqual(
      0.45,
    );
    expect(rescored[0].scores.documentIntelligenceBoost).toBeCloseTo(0.45, 5);
  });

  test("maxDocumentIntelligenceBoost=0.60 caps at 0.60", () => {
    const ctx = baseCtx({
      maxMatchedBoostRules: 1,
      maxDocumentIntelligenceBoost: 0.60,
    });
    const rules = matchBoostRules(ctx, [
      {
        id: "r1",
        priority: 1,
        weight: 20,
        boostDocTypes: [{ docType: "budget_report", weight: 20 }],
        boostSections: [{ section: "summary", weight: 20 }],
      },
    ]);

    const candidates = [
      {
        candidateId: "c1",
        docId: "doc-1",
        docType: "budget_report",
        location: { sectionKey: "summary" },
        scores: { final: 0.2 },
      },
    ];

    const rescored = applyBoostScoring(ctx, candidates, rules);
    expect(rescored[0].scores.documentIntelligenceBoost).toBeLessThanOrEqual(
      0.60,
    );
    expect(rescored[0].scores.documentIntelligenceBoost).toBeCloseTo(0.60, 5);
  });

  test("diminishing returns on successive boost rules", () => {
    const ctx = baseCtx({ maxMatchedBoostRules: 3 });
    const rules = matchBoostRules(ctx, [
      {
        id: "r1",
        priority: 3,
        weight: 1,
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
      {
        id: "r2",
        priority: 2,
        weight: 1,
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
      {
        id: "r3",
        priority: 1,
        weight: 1,
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
    ]);

    const candidates = [
      {
        candidateId: "c1",
        docId: "doc-1",
        docType: "budget_report",
        location: {},
        scores: { final: 0.5 },
      },
    ];

    const rescored = applyBoostScoring(ctx, candidates, rules);
    // Rule 1 (i=0): 1*0.03 * 1/1 = 0.03
    // Rule 2 (i=1): 1*0.03 * 1/2 = 0.015
    // Rule 3 (i=2): 1*0.03 * 1/3 = 0.01
    // Total: ~0.055
    const boost = rescored[0].scores.documentIntelligenceBoost!;
    expect(boost).toBeCloseTo(0.03 + 0.015 + 0.01, 5);
  });

  test("disabled rules are skipped by matchBoostRules", () => {
    const ctx = baseCtx();
    const matched = matchBoostRules(ctx, [
      {
        id: "active",
        enabled: true,
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
      {
        id: "disabled",
        enabled: false,
        boostDocTypes: [{ docType: "budget_report", weight: 5 }],
      },
    ]);

    expect(matched.map((r) => r.id)).toEqual(["active"]);
  });

  test("requireDomainMatch filters rules when domain does not match", () => {
    const ctx = baseCtx({ domain: "finance" });
    const matched = matchBoostRules(ctx, [
      {
        id: "legal_only",
        requireDomainMatch: true,
        conditions: { domains: ["legal"] },
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
      {
        id: "finance_rule",
        requireDomainMatch: true,
        conditions: { domains: ["finance"] },
        boostDocTypes: [{ docType: "budget_report", weight: 1 }],
      },
    ]);

    expect(matched.map((r) => r.id)).toEqual(["finance_rule"]);
  });

  test("cross-doc policy blocks when single docLock and multiple candidates", () => {
    const decision = enforceCrossDocPolicy(
      baseCtx({
        docLock: true,
        explicitDocsCount: 1,
        explicitDocIds: ["doc-a"],
        candidateDocIds: ["doc-a", "doc-b", "doc-c"],
      }),
      {
        config: { enabled: true },
        retrievalPolicy: {
          allowWhenDocLock: false,
          maxSourceDocuments: 5,
        },
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.reasonCode).toBe("cross_doc_blocked_doc_lock");
    expect(decision.askDisambiguation).toBe(true);
    expect(decision.allowedCandidateDocIds).toEqual(["doc-a"]);
  });
});

describe("summarizeBoostRuleApplications", () => {
  test("summary reflects per-rule delta contributions", () => {
    const ctx = baseCtx({ maxMatchedBoostRules: 2 });
    const rules = matchBoostRules(ctx, [
      {
        id: "r1",
        priority: 2,
        weight: 1,
        boostDocTypes: [{ docType: "budget_report", weight: 2 }],
      },
      {
        id: "r2",
        priority: 1,
        weight: 1,
        boostSections: [{ section: "summary", weight: 3 }],
      },
    ]);

    const candidates = [
      {
        candidateId: "c1",
        docId: "doc-1",
        docType: "budget_report",
        location: { sectionKey: "summary" },
        scores: { final: 0.5 },
      },
    ];

    const { summarizeBoostRuleApplications } = require("./ruleInterpreter");
    const summaries = summarizeBoostRuleApplications(ctx, candidates, rules);

    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s.candidateHits).toBeGreaterThanOrEqual(1);
      expect(s.totalDelta).toBeGreaterThan(0);
      expect(s.averageDelta).toBeGreaterThan(0);
      expect(s.maxDelta).toBeGreaterThanOrEqual(s.averageDelta);
    }
  });
});
