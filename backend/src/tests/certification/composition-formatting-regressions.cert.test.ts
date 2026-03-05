import { afterAll, describe, expect, jest, test } from "@jest/globals";
import { ResponseContractEnforcerService } from "../../services/core/enforcement/responseContractEnforcer.service";
import { writeCertificationGateReport } from "./reporting";

type Lang = "en" | "pt" | "es";

const metricKeys = [
  "openerVariation",
  "noForcedAnalyticalForSimple",
  "citationAlignment",
  "citationMinimality",
  "tableNoDashCorruption",
  "tablePreservation",
  "toneParityEnPt",
  "notFoundPrecision",
  "brevityControl",
  "followupNonLooping",
] as const;

const metrics: Record<(typeof metricKeys)[number], number> = {
  openerVariation: 0,
  noForcedAnalyticalForSimple: 0,
  citationAlignment: 0,
  citationMinimality: 0,
  tableNoDashCorruption: 0,
  tablePreservation: 0,
  toneParityEnPt: 0,
  notFoundPrecision: 0,
  brevityControl: 0,
  followupNonLooping: 0,
};
const qualitySignals: Record<string, number> = {
  openerDistinctCount: 0,
  followupDistinctCount: 0,
  shortToLongRatio: 1,
  claimGuardEvidenceCount: 0,
};
const failures: string[] = [];

function mark(metric: keyof typeof metrics, pass: boolean) {
  metrics[metric] = pass ? 1 : 0;
  if (!pass) failures.push(metric);
}

function bankById(bankId: string): unknown {
  switch (bankId) {
    case "render_policy":
      return {
        config: {
          markdown: { allowCodeBlocks: false, maxConsecutiveNewlines: 2 },
          noJsonOutput: { enabled: true, detectJsonLike: true },
        },
        enforcementRules: {
          rules: [{ id: "RP6_MAX_ONE_QUESTION", then: { maxQuestions: 1 } }],
        },
      };
    case "ui_contracts":
      return { config: { enabled: true } };
    case "banned_phrases":
      return {
        config: { enabled: true, actionOnMatch: "strip_or_replace" },
        categories: {},
        patterns: [],
        sourceLeakage: { patterns: [] },
        robotic: { en: [], pt: [], es: [] },
      };
    case "truncation_and_limits":
      return {
        globalLimits: {
          maxResponseCharsHard: 12000,
          maxResponseTokensHard: 3500,
        },
      };
    case "bullet_rules":
    case "table_rules":
    case "quote_styles":
    case "citation_styles":
    case "list_styles":
    case "table_styles":
      return { config: { enabled: true } };
    case "answer_style_policy":
      return {
        config: {
          enabled: true,
          globalRules: { maxQuestionsPerAnswer: 1 },
        },
        profiles: {},
      };
    case "openers":
      return {
        config: { enabled: true },
        openers: [
          { id: "a", intent: "extract", language: "en", text: "I found relevant evidence." },
          { id: "b", intent: "compare", language: "en", text: "I compared the selected documents." },
          { id: "c", intent: "extract", language: "pt", text: "Encontrei evidencias relevantes." },
        ],
      };
    case "followup_suggestions":
    case "followup_suggestions_v1c6269cc":
      return {
        config: { enabled: true },
        suggestions: [
          { id: "f1", intent: "extract", language: "en", text: "check the adjacent section as a cross-check." },
          { id: "f2", intent: "compare", language: "en", text: "compare this metric with another selected document." },
          { id: "f3", intent: "extract", language: "pt", text: "verifique o mesmo valor em outro periodo." },
        ],
      };
    case "fallback_messages":
      return {
        config: { enabled: true },
        messages: {
          en: {
            missingEvidence: "I cannot answer that from current document evidence.",
            wrongDoc: "I found a related document, but not the one you selected.",
          },
          pt: {
            missingEvidence: "Nao consigo responder com base nas evidencias disponiveis.",
            wrongDoc: "Encontrei um documento relacionado, mas nao o selecionado.",
          },
        },
      };
    default:
      return { config: { enabled: true } };
  }
}

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (bankId: string) => bankById(bankId),
  getOptionalBank: (bankId: string) => bankById(bankId),
}));

function makeAnalyticalOutput(params: {
  content: string;
  language?: Lang;
  attachments?: unknown[];
  short?: boolean;
}): string {
  const enforcer = new ResponseContractEnforcerService();
  const out = enforcer.enforce(
    {
      content: params.content,
      attachments: (params.attachments as any) || [],
    },
    {
      answerMode: "general_answer",
      language: params.language || "en",
      constraints: params.short ? { userRequestedShort: true } : undefined,
      signals: { queryProfile: "analytical" },
    },
  );
  return String(out.content || "");
}

function sourceButtonsAttachment() {
  return [
    {
      type: "source_buttons",
      buttons: [
        {
          documentId: "doc-1",
          title: "report.pdf",
          location: { type: "page", value: 14, label: "Page 14" },
          locationKey: "d:doc-1|p:14|c:3",
        },
        {
          documentId: "doc-2",
          title: "report-2.pdf",
          location: { type: "page", value: 22, label: "Page 22" },
          locationKey: "d:doc-2|p:22|c:1",
        },
      ],
    },
  ];
}

function sourceButtonsWithSnippets() {
  return [
    {
      type: "source_buttons",
      buttons: [
        {
          documentId: "doc-1",
          title: "report.pdf",
          location: { type: "page", value: 14, label: "Page 14" },
          locationKey: "d:doc-1|p:14|c:3",
          snippet: "Revenue increased in Q1 due to higher subscriptions.",
        },
      ],
    },
  ];
}

function extractFollowupLine(content: string): string {
  const lines = content.split("\n").map((line) => line.trim());
  return (
    lines.find(
      (line) =>
        line.startsWith("If you'd like,") ||
        line.startsWith("Se quiser,") ||
        line.startsWith("Si quieres,"),
    ) || ""
  );
}

describe("Certification: composition formatting regressions", () => {
  test("1) opener variation is non-robotic across seeds", () => {
    const outputs = [
      makeAnalyticalOutput({ content: "Revenue increased in Q1.", attachments: sourceButtonsAttachment() }),
      makeAnalyticalOutput({ content: "Revenue decreased in Q2.", attachments: sourceButtonsAttachment() }),
      makeAnalyticalOutput({ content: "Revenue stabilized in Q3.", attachments: sourceButtonsAttachment() }),
    ];
    const openers = outputs
      .map((value) => value.split("\n").find((line) => !line.startsWith("Direct answer:")) || "")
      .filter((line) => line.length > 0);
    qualitySignals.openerDistinctCount = new Set(openers).size;
    const pass = new Set(openers).size >= 2;
    mark("openerVariation", pass);
    expect(pass).toBe(true);
  });

  test("2) analytical template is not forced for simple non-analytical queries", () => {
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "Revenue increased in Q1.", attachments: sourceButtonsAttachment() as any },
      { answerMode: "general_answer", language: "en", signals: {} },
    );
    const content = String(out.content || "");
    const pass = !content.includes("Direct answer:") && !content.includes("Key evidence:");
    mark("noForcedAnalyticalForSimple", pass);
    expect(pass).toBe(true);
  });

  test("3) citation alignment keeps sources section scoped and removes unsupported claims", () => {
    const content = makeAnalyticalOutput({
      content: "Revenue increased in Q1. EBITDA margin reached 80%.",
      attachments: sourceButtonsWithSnippets(),
    });
    const pass =
      content.includes("Sources used:") &&
      content.includes("Page 14") &&
      content.includes("Revenue increased in Q1.") &&
      !content.includes("EBITDA margin reached 80%.") &&
      content.includes("Removed 1 claim(s) without direct citation support.");
    qualitySignals.claimGuardEvidenceCount = content.includes(
      "Removed 1 claim(s) without direct citation support.",
    )
      ? 1
      : 0;
    mark("citationAlignment", pass);
    expect(pass).toBe(true);
  });

  test("4) citation minimality limits source bullets", () => {
    const content = makeAnalyticalOutput({
      content: "Revenue increased in Q1.",
      attachments: sourceButtonsAttachment(),
    });
    const lines = content.split("\n");
    const sourceStart = lines.findIndex((line) => line.trim() === "Sources used:");
    const sourceBullets = sourceStart >= 0
      ? lines.slice(sourceStart + 1).filter((line) => line.trim().startsWith("- "))
      : [];
    const pass = sourceBullets.length <= 2 && sourceBullets.length >= 1;
    mark("citationMinimality", pass);
    expect(pass).toBe(true);
  });

  test("5) table rendering removes giant dash separators", () => {
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      {
        content: "| A | B |\n| --------------------------------------------------------------------------- | --- |\n| 1 | 2 |",
        attachments: [],
      },
      { answerMode: "general_answer", language: "en" },
    );
    const content = String(out.content || "");
    const pass = !/-{50,}/.test(content);
    mark("tableNoDashCorruption", pass);
    expect(pass).toBe(true);
  });

  test("6) table rendering preserves header and content rows", () => {
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      {
        content: "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |",
        attachments: [],
      },
      { answerMode: "general_answer", language: "en" },
    );
    const pipeLines = String(out.content || "")
      .split("\n")
      .filter((line) => line.includes("|"));
    const pass = pipeLines.length >= 3;
    mark("tablePreservation", pass);
    expect(pass).toBe(true);
  });

  test("7) EN/PT tone parity keeps summary+followup semantics", () => {
    const en = makeAnalyticalOutput({
      content: "Revenue increased in Q1.",
      language: "en",
      attachments: sourceButtonsAttachment(),
    });
    const pt = makeAnalyticalOutput({
      content: "Receita aumentou no primeiro trimestre.",
      language: "pt",
      attachments: sourceButtonsAttachment(),
    });
    const pass =
      en.includes("In summary,") &&
      en.includes("If you'd like,") &&
      en.includes("Direct answer:") &&
      en.includes("Key evidence:") &&
      en.includes("Sources used:") &&
      pt.includes("Em resumo,") &&
      pt.includes("Se quiser,") &&
      pt.includes("Resposta direta:") &&
      pt.includes("Evidencia principal:") &&
      pt.includes("Fontes utilizadas:") &&
      !pt.includes("Direct answer:") &&
      !pt.includes("Sources used:");
    mark("toneParityEnPt", pass);
    expect(pass).toBe(true);
  });

  test("8) not-found behavior is precise and bank-driven", () => {
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "", attachments: [] },
      { answerMode: "nav_pills", language: "en" },
    );
    const pass =
      out.enforcement.blocked === true &&
      String(out.content || "").includes(
        "I cannot answer that from current document evidence.",
      );
    mark("notFoundPrecision", pass);
    expect(pass).toBe(true);
  });

  test("9) brevity control enforces shorter output under short constraint", () => {
    const long = makeAnalyticalOutput({
      content:
        "Revenue increased in Q1 by 12% after pricing changes. Operating margin improved as support costs fell. Cash conversion improved after collections normalized. Working capital tightened due to lower inventory days. Subscription churn declined while expansion revenue increased. Net retention remained above prior guidance levels.",
      attachments: sourceButtonsAttachment(),
    });
    const short = makeAnalyticalOutput({
      content:
        "Revenue increased in Q1 by 12% after pricing changes. Operating margin improved as support costs fell. Cash conversion improved after collections normalized. Working capital tightened due to lower inventory days. Subscription churn declined while expansion revenue increased. Net retention remained above prior guidance levels.",
      attachments: sourceButtonsAttachment(),
      short: true,
    });
    qualitySignals.shortToLongRatio =
      long.length > 0 ? short.length / long.length : 1;
    const pass = short.length < long.length;
    mark("brevityControl", pass);
    expect(pass).toBe(true);
  });

  test("10) follow-up lines are non-looping across seeds", () => {
    const outputs = [
      makeAnalyticalOutput({ content: "Revenue increased in Q1.", attachments: sourceButtonsAttachment() }),
      makeAnalyticalOutput({ content: "Revenue decreased in Q2.", attachments: sourceButtonsAttachment() }),
      makeAnalyticalOutput({ content: "Revenue stabilized in Q3.", attachments: sourceButtonsAttachment() }),
    ];
    const followups = outputs.map(extractFollowupLine).filter(Boolean);
    qualitySignals.followupDistinctCount = new Set(followups).size;
    const pass = followups.length >= 2 && new Set(followups).size >= 2;
    mark("followupNonLooping", pass);
    expect(pass).toBe(true);
  });
});

afterAll(() => {
  writeCertificationGateReport("composition-formatting-regressions", {
    passed: failures.length === 0,
    metrics: {
      ...metrics,
      ...qualitySignals,
    },
    thresholds: {
      openerVariation: 1,
      noForcedAnalyticalForSimple: 1,
      citationAlignment: 1,
      citationMinimality: 1,
      tableNoDashCorruption: 1,
      tablePreservation: 1,
      toneParityEnPt: 1,
      notFoundPrecision: 1,
      brevityControl: 1,
      followupNonLooping: 1,
    },
    failures,
  });
});
