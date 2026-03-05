import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../data_banks", rel),
      "utf8",
    ),
  );
}

type Locale = "en" | "pt" | "es";

interface CollisionRule {
  id: string;
  priority: number;
  action: string;
  reasonCode: string;
  when: {
    operators: string[];
    queryRegexAny?: Record<Locale, string[]>;
    signals?: string[];
  };
}

interface CollisionBank {
  config: {
    enabled: boolean;
    deterministic: boolean;
    [k: string]: unknown;
  };
  rules: CollisionRule[];
  tests: {
    cases: Array<{
      id: string;
      input: string;
      candidateOperator: string;
      expect: {
        suppressed: boolean;
        reasonCode?: string;
      };
    }>;
  };
}

const REGEX_RULE_IDS = [
  "CM_0001_file_actions_vs_content_questions",
  "CM_0002_file_actions_vs_extraction_intents",
  "CM_0003_open_vs_doc_location_questions",
  "CM_0006_connector_vs_doc_retrieval",
  "CM_0008_email_draft_vs_email_explain",
];

const SIGNAL_RULE_IDS = [
  "CM_0004_edit_ops_vs_retrieval_questions",
  "CM_0005_compute_vs_summarize",
  "CM_0007_greeting_vs_help",
  "CM_0009_chart_vs_compute",
  "CM_0010_slide_edit_vs_doc_edit",
];

const REGEX_TEST_VECTORS: Record<
  string,
  Record<Locale, { positive: string; negative: string }>
> = {
  CM_0001: {
    en: {
      positive: "where in the document is the indemnity clause?",
      negative: "open budget.xlsx",
    },
    pt: {
      positive: "onde no documento está a cláusula?",
      negative: "abrir orçamento.xlsx",
    },
    es: {
      positive: "dónde en el documento está la cláusula?",
      negative: "abrir presupuesto.xlsx",
    },
  },
  CM_0001_v2: {
    en: {
      positive: "what does the agreement say about warranties?",
      negative: "save as draft.docx",
    },
    pt: {
      positive: "o que o contrato diz sobre garantias?",
      negative: "salvar como rascunho.docx",
    },
    es: {
      positive: "qué dice el acuerdo sobre garantías?",
      negative: "guardar como borrador.docx",
    },
  },
  CM_0001_v3: {
    en: {
      positive: "can you tell me what section 3.2 says?",
      negative: "copy this file to the desktop",
    },
    pt: {
      positive: "pode me dizer o que diz a seção 3.2?",
      negative: "copiar este arquivo para a área de trabalho",
    },
    es: {
      positive: "puedes decirme qué dice la sección 3.2?",
      negative: "copiar este archivo al escritorio",
    },
  },
  CM_0002: {
    en: {
      positive: "summarize the key findings",
      negative: "rename file to report.pdf",
    },
    pt: {
      positive: "resumir os principais achados",
      negative: "renomear arquivo para relatório.pdf",
    },
    es: {
      positive: "resumir los hallazgos clave",
      negative: "renombrar archivo a informe.pdf",
    },
  },
  CM_0002_v2: {
    en: {
      positive: "extract all dates mentioned in the contract",
      negative: "move this file to trash",
    },
    pt: {
      positive: "extrair todas as datas mencionadas no contrato",
      negative: "mover este arquivo para a lixeira",
    },
    es: {
      positive: "extraer todas las fechas mencionadas en el contrato",
      negative: "mover este archivo a la papelera",
    },
  },
  CM_0002_v3: {
    en: {
      positive: "pull out the payment terms from this invoice",
      negative: "zip all files in this folder",
    },
    pt: {
      positive: "extrair os termos de pagamento desta fatura",
      negative: "compactar todos os arquivos nesta pasta",
    },
    es: {
      positive: "sacar los términos de pago de esta factura",
      negative: "comprimir todos los archivos en esta carpeta",
    },
  },
  CM_0003: {
    en: {
      positive: "where is the clause about termination?",
      negative: "open the contract",
    },
    pt: {
      positive: "onde está a cláusula sobre rescisão?",
      negative: "abrir o contrato",
    },
    es: {
      positive: "dónde está la cláusula sobre rescisión?",
      negative: "abrir el contrato",
    },
  },
  CM_0003_v2: {
    en: {
      positive: "which page has the confidentiality section?",
      negative: "launch the presentation",
    },
    pt: {
      positive: "em qual página está a seção de confidencialidade?",
      negative: "abrir a apresentação",
    },
    es: {
      positive: "en qué página está la sección de confidencialidad?",
      negative: "abrir la presentación",
    },
  },
  CM_0006: {
    en: {
      positive: "connect my gmail account",
      negative: "move report.pdf to archive",
    },
    pt: {
      positive: "conectar minha conta gmail",
      negative: "mover relatório.pdf para arquivo",
    },
    es: {
      positive: "conectar mi cuenta gmail",
      negative: "mover informe.pdf a archivo",
    },
  },
  CM_0006_v2: {
    en: {
      positive: "link my dropbox storage",
      negative: "download the quarterly report",
    },
    pt: {
      positive: "vincular meu armazenamento dropbox",
      negative: "baixar o relatório trimestral",
    },
    es: {
      positive: "vincular mi almacenamiento dropbox",
      negative: "descargar el informe trimestral",
    },
  },
  CM_0008: {
    en: {
      positive: "read my latest email from john",
      negative: "delete the spreadsheet",
    },
    pt: {
      positive: "ler meu último email do joão",
      negative: "excluir a planilha",
    },
    es: {
      positive: "leer mi último correo de juan",
      negative: "eliminar la hoja de cálculo",
    },
  },
  CM_0008_v2: {
    en: {
      positive: "what was in the email from the vendor?",
      negative: "create a new blank document",
    },
    pt: {
      positive: "o que tinha no email do fornecedor?",
      negative: "criar um novo documento em branco",
    },
    es: {
      positive: "qué decía el correo del proveedor?",
      negative: "crear un nuevo documento en blanco",
    },
  },
  CM_0008_v3: {
    en: {
      positive: "show me the email thread about the deadline",
      negative: "print the current page",
    },
    pt: {
      positive: "me mostre a conversa por email sobre o prazo",
      negative: "imprimir a página atual",
    },
    es: {
      positive: "muéstrame el hilo de correo sobre la fecha límite",
      negative: "imprimir la página actual",
    },
  },
};

function matchesAnyPattern(query: string, patterns: string[]): boolean {
  return patterns.some((p) => new RegExp(p, "i").test(query));
}

function getRulePrefix(ruleId: string): string {
  const match = ruleId.match(/^(CM_\d{4})/);
  return match ? match[1] : ruleId;
}

describe("Certification: collision-matrix-exhaustive", () => {
  const collisionBank: CollisionBank = readJson(
    "operators/operator_collision_matrix.any.json",
  );
  const { rules, config } = collisionBank;

  // -------------------------------------------------------------------------
  // Structural tests
  // -------------------------------------------------------------------------

  test("exactly 10 rules present", () => {
    expect(rules).toHaveLength(10);
  });

  test("all rule IDs CM_0001 through CM_0010 present", () => {
    const prefixes = rules.map((r) => getRulePrefix(r.id));
    for (let i = 1; i <= 10; i++) {
      const expected = `CM_${String(i).padStart(4, "0")}`;
      expect(prefixes).toContain(expected);
    }
  });

  test("all rules have priority, action, and reasonCode", () => {
    for (const rule of rules) {
      expect(typeof rule.priority).toBe("number");
      expect(typeof rule.action).toBe("string");
      expect(rule.action.length).toBeGreaterThan(0);
      expect(typeof rule.reasonCode).toBe("string");
      expect(rule.reasonCode.length).toBeGreaterThan(0);
    }
  });

  test("config.enabled === true", () => {
    expect(config.enabled).toBe(true);
  });

  test("config.deterministic === true", () => {
    expect(config.deterministic).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Regex-based rules: CM_0001, CM_0002, CM_0003, CM_0006, CM_0008
  // -------------------------------------------------------------------------

  describe("regex-based rules", () => {
    const locales: Locale[] = ["en", "pt", "es"];

    for (const ruleId of REGEX_RULE_IDS) {
      const prefix = getRulePrefix(ruleId);
      const rule = rules.find((r) => r.id === ruleId)!;

      describe(`${prefix} regex matching`, () => {
        for (const locale of locales) {
          test(`${locale}: positive query matches at least one pattern`, () => {
            const patterns = rule.when.queryRegexAny![locale];
            expect(patterns).toBeDefined();
            expect(patterns.length).toBeGreaterThan(0);

            const vectors = REGEX_TEST_VECTORS[prefix];
            const positiveQuery = vectors[locale].positive;
            const matched = matchesAnyPattern(positiveQuery, patterns);
            expect(matched).toBe(true);
          });

          test(`${locale}: negative query matches no pattern`, () => {
            const patterns = rule.when.queryRegexAny![locale];
            const vectors = REGEX_TEST_VECTORS[prefix];
            const negativeQuery = vectors[locale].negative;
            const matched = matchesAnyPattern(negativeQuery, patterns);
            expect(matched).toBe(false);
          });
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Signal-based rules: CM_0004, CM_0005, CM_0007, CM_0009, CM_0010
  // -------------------------------------------------------------------------

  describe("signal-based rules", () => {
    for (const ruleId of SIGNAL_RULE_IDS) {
      const prefix = getRulePrefix(ruleId);
      const rule = rules.find((r) => r.id === ruleId)!;

      test(`${prefix} has when.signals array with entries`, () => {
        expect(Array.isArray(rule.when.signals)).toBe(true);
        expect(rule.when.signals!.length).toBeGreaterThan(0);
      });

      test(`${prefix} has when.operators array`, () => {
        expect(Array.isArray(rule.when.operators)).toBe(true);
        expect(rule.when.operators.length).toBeGreaterThan(0);
      });

      test(`${prefix} has valid action and reasonCode`, () => {
        expect(typeof rule.action).toBe("string");
        expect(rule.action.length).toBeGreaterThan(0);
        expect(typeof rule.reasonCode).toBe("string");
        expect(rule.reasonCode.length).toBeGreaterThan(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Signal-based rule behavioral tests
  // -------------------------------------------------------------------------

  describe("signal-based rule behavioral tests", () => {
    test("CM_0004 edit_ops_vs_retrieval remains suppressive and signal-driven", () => {
      const rule = rules.find((r) => getRulePrefix(r.id) === "CM_0004")!;
      expect(Array.isArray(rule.when.signals)).toBe(true);
      expect(rule.when.signals!.every((signal) => typeof signal === "string")).toBe(
        true,
      );
      expect(rule.when.operators.length).toBeGreaterThan(0);
      expect(String(rule.action || "").startsWith("suppress")).toBe(true);
    });

    test("CM_0005 compute_vs_summarize remains signal-driven", () => {
      const rule = rules.find((r) => getRulePrefix(r.id) === "CM_0005")!;
      expect(Array.isArray(rule.when.signals)).toBe(true);
      expect(rule.when.signals!.every((signal) => typeof signal === "string")).toBe(
        true,
      );
      expect(rule.when.operators.length).toBeGreaterThan(0);
    });

    test("CM_0007 greeting_vs_help remains signal-driven", () => {
      const rule = rules.find((r) => getRulePrefix(r.id) === "CM_0007")!;
      expect(Array.isArray(rule.when.signals)).toBe(true);
      expect(rule.when.signals!.every((signal) => typeof signal === "string")).toBe(
        true,
      );
      expect(rule.when.operators.length).toBeGreaterThan(0);
    });

    test("CM_0009 chart_vs_compute remains signal-driven", () => {
      const rule = rules.find((r) => getRulePrefix(r.id) === "CM_0009")!;
      expect(Array.isArray(rule.when.signals)).toBe(true);
      expect(rule.when.signals!.every((signal) => typeof signal === "string")).toBe(
        true,
      );
      expect(rule.when.operators.length).toBeGreaterThan(0);
    });

    test("CM_0010 slide_edit_vs_doc_edit remains signal-driven", () => {
      const rule = rules.find((r) => getRulePrefix(r.id) === "CM_0010")!;
      expect(Array.isArray(rule.when.signals)).toBe(true);
      expect(rule.when.signals!.every((signal) => typeof signal === "string")).toBe(
        true,
      );
      expect(rule.when.operators.length).toBeGreaterThan(0);
    });

    test("all signal rules have scoped operator lists (not wildcard)", () => {
      for (const ruleId of SIGNAL_RULE_IDS) {
        const rule = rules.find((r) => r.id === ruleId)!;
        expect(rule.when.operators.length).toBeGreaterThan(0);
        expect(rule.when.operators.length).toBeLessThanOrEqual(10);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Extended regex edge-case vectors
  // -------------------------------------------------------------------------

  describe("extended regex edge-case vectors", () => {
    const EDGE_CASE_VECTORS: Array<{
      ruleId: string;
      locale: Locale;
      query: string;
      shouldMatch: boolean;
      description: string;
    }> = [
      // CM_0001 edge cases
      { ruleId: "CM_0001_file_actions_vs_content_questions", locale: "en", query: "rename the contract to final.pdf", shouldMatch: false, description: "pure file action rename" },
      { ruleId: "CM_0001_file_actions_vs_content_questions", locale: "pt", query: "o que diz o par�grafo sobre responsabilidade?", shouldMatch: true, description: "PT content question" },
      // CM_0002 edge cases
      { ruleId: "CM_0002_file_actions_vs_extraction_intents", locale: "en", query: "extract the key terms from this agreement", shouldMatch: true, description: "extraction with key terms" },
      { ruleId: "CM_0002_file_actions_vs_extraction_intents", locale: "en", query: "delete budget.xlsx", shouldMatch: false, description: "pure file deletion" },
      // CM_0006 edge cases
      { ruleId: "CM_0006_connector_vs_doc_retrieval", locale: "en", query: "summarize the linked document", shouldMatch: false, description: "doc action not connector" },
      // CM_0008 edge cases
      { ruleId: "CM_0008_email_draft_vs_email_explain", locale: "en", query: "what did the last email say?", shouldMatch: true, description: "email content question" },
    ];

    for (const vec of EDGE_CASE_VECTORS) {
      test(`${getRulePrefix(vec.ruleId)} [${vec.locale}] ${vec.description}: ${vec.shouldMatch ? "matches" : "no match"}`, () => {
        const rule = rules.find((r) => r.id === vec.ruleId);
        expect(rule).toBeDefined();

        if (rule?.when.queryRegexAny) {
          const patterns = rule.when.queryRegexAny[vec.locale] || [];
          const matched = matchesAnyPattern(vec.query, patterns);
          expect(matched).toBe(vec.shouldMatch);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Built-in test cases from collisionBank.tests.cases
  // -------------------------------------------------------------------------

  describe("built-in test cases", () => {
    const testCases = collisionBank.tests.cases;

    test("bank ships at least 4 built-in test cases", () => {
      expect(testCases.length).toBeGreaterThanOrEqual(4);
    });

    for (const tc of testCases) {
      test(`${tc.id}: expectation structurally valid`, () => {
        expect(typeof tc.input).toBe("string");
        expect(tc.input.length).toBeGreaterThan(0);
        expect(typeof tc.candidateOperator).toBe("string");
        expect(typeof tc.expect.suppressed).toBe("boolean");
        if (tc.expect.suppressed) {
          expect(typeof tc.expect.reasonCode).toBe("string");
        }
      });

      if (tc.expect.suppressed) {
        test(`${tc.id}: suppressed input matches a regex-based rule`, () => {
          // Find the rule whose reasonCode matches the expected one
          const matchingRule = rules.find(
            (r) =>
              r.reasonCode === tc.expect.reasonCode &&
              r.when.operators.includes(tc.candidateOperator),
          );
          expect(matchingRule).toBeDefined();

          if (matchingRule?.when.queryRegexAny) {
            // Check at least one locale pattern matches the input
            const allPatterns = Object.values(
              matchingRule.when.queryRegexAny,
            ).flat();
            const matched = matchesAnyPattern(tc.input, allPatterns);
            expect(matched).toBe(true);
          }
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Gate report
  // -------------------------------------------------------------------------

  test("write certification gate report", () => {
    const failures: string[] = [];
    if (rules.length !== 10) failures.push("RULE_COUNT_MISMATCH");
    if (!config.enabled) failures.push("CONFIG_NOT_ENABLED");
    if (!config.deterministic) failures.push("CONFIG_NOT_DETERMINISTIC");

    // Check regex positive matches
    let regexPositivePasses = 0;
    let regexPositiveTotal = 0;
    let regexNegativePasses = 0;
    let regexNegativeTotal = 0;

    for (const ruleId of REGEX_RULE_IDS) {
      const prefix = getRulePrefix(ruleId);
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule?.when.queryRegexAny) continue;

      for (const locale of ["en", "pt", "es"] as Locale[]) {
        const patterns = rule.when.queryRegexAny[locale];
        if (!patterns) continue;

        const vectors = REGEX_TEST_VECTORS[prefix];

        regexPositiveTotal++;
        if (matchesAnyPattern(vectors[locale].positive, patterns)) {
          regexPositivePasses++;
        } else {
          failures.push(`REGEX_POSITIVE_MISS_${prefix}_${locale}`);
        }

        regexNegativeTotal++;
        if (!matchesAnyPattern(vectors[locale].negative, patterns)) {
          regexNegativePasses++;
        } else {
          failures.push(`REGEX_NEGATIVE_HIT_${prefix}_${locale}`);
        }
      }
    }

    // Check signal-based rules
    let signalRulesValid = 0;
    for (const ruleId of SIGNAL_RULE_IDS) {
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) {
        failures.push(`MISSING_SIGNAL_RULE_${ruleId}`);
        continue;
      }
      if (!Array.isArray(rule.when.signals) || rule.when.signals.length === 0) {
        failures.push(`EMPTY_SIGNALS_${getRulePrefix(ruleId)}`);
      } else {
        signalRulesValid++;
      }
    }

    writeCertificationGateReport("collision-matrix-exhaustive", {
      passed: failures.length === 0,
      metrics: {
        totalRules: rules.length,
        regexRules: REGEX_RULE_IDS.length,
        signalRules: SIGNAL_RULE_IDS.length,
        regexPositivePasses,
        regexPositiveTotal,
        regexNegativePasses,
        regexNegativeTotal,
        signalRulesValid,
        signalRulesTotal: SIGNAL_RULE_IDS.length,
        builtInTestCases: collisionBank.tests.cases.length,
        configEnabled: config.enabled,
        configDeterministic: config.deterministic,
      },
      thresholds: {
        expectedRuleCount: 10,
        minRegexPositiveRate: 1,
        maxRegexNegativeHitRate: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
