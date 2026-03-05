import fs from "node:fs";
import path from "node:path";
import glob from "glob";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

const ACCENT_RULES: Array<[RegExp, string]> = [
  [/\bCabecalho\b/g, "Cabeçalho"],
  [/\bAprovacao\b/g, "Aprovação"],
  [/\bPeriodo\b/g, "Período"],
  [/\bRescisao\b/g, "Rescisão"],
  [/\bTransacao\b/g, "Transação"],
  [/\bTransacoes\b/g, "Transações"],
  [/\bInformacao\b/g, "Informação"],
  [/\bInformacoes\b/g, "Informações"],
  [/\bDescricao\b/g, "Descrição"],
  [/\bOperacao\b/g, "Operação"],
  [/\bOperacoes\b/g, "Operações"],
  [/\bCondicao\b/g, "Condição"],
  [/\bCondicoes\b/g, "Condições"],
  [/\bRodape\b/g, "Rodapé"],
  [/\bIndice\b/g, "Índice"],
  [/\bAnalise\b/g, "Análise"],
];

describe("Portuguese accent correctness in section files", () => {
  it("no unaccented Portuguese words in heading anchors", () => {
    const files = glob.sync(
      "**/doc_types/sections/*.sections.any.json",
      { cwd: BANKS_ROOT, absolute: true },
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const [pattern, correct] of ACCENT_RULES) {
        if (pattern.test(content)) {
          const rel = path.relative(BANKS_ROOT, file);
          violations.push(`${rel}: found unaccented "${pattern.source}", should be "${correct}"`);
        }
        pattern.lastIndex = 0;
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("10-K section heading grounding", () => {
  it("fin_10k sections include real SEC Item headings", () => {
    const filePath = path.join(
      BANKS_ROOT,
      "document_intelligence/domains/finance/doc_types/sections/fin_10k.sections.any.json",
    );
    if (!fs.existsSync(filePath)) return; // skip if file doesn't exist
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const sections = raw.sections || [];
    const allAnchors = sections.flatMap(
      (s: Record<string, unknown>) => {
        const anchors = s.headingAnchors || s.headerVariants;
        const names = [];
        if (s.name && typeof s.name === "object") {
          names.push(...Object.values(s.name as Record<string, string>));
        }
        if (Array.isArray(anchors)) return [...anchors, ...names];
        if (anchors && typeof anchors === "object") {
          return [
            ...Object.values(anchors as Record<string, string[]>).flat(),
            ...names,
          ];
        }
        return names;
      },
    );
    const joined = allAnchors.join(" ").toLowerCase();

    expect(joined).toContain("item 1");
    expect(joined).toContain("item 1a");
    expect(joined).toContain("item 7");
    expect(joined).toContain("management's discussion");
    expect(joined).toContain("risk factors");
  });
});

describe("Trial balance section heading grounding", () => {
  it("acct_trial_balance sections include relevant accounting anchors", () => {
    const filePath = path.join(
      BANKS_ROOT,
      "document_intelligence/domains/accounting/doc_types/sections/acct_trial_balance.sections.any.json",
    );
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const sections = raw.sections || [];
    const allAnchors = sections.flatMap(
      (s: Record<string, unknown>) => {
        const anchors = s.headingAnchors || s.headerVariants;
        const names = [];
        if (s.name && typeof s.name === "object") {
          names.push(...Object.values(s.name as Record<string, string>));
        }
        if (Array.isArray(anchors)) return [...anchors, ...names];
        if (anchors && typeof anchors === "object") {
          return [
            ...Object.values(anchors as Record<string, string[]>).flat(),
            ...names,
          ];
        }
        return names;
      },
    );
    const joined = allAnchors.join(" ").toLowerCase();
    expect(joined).toContain("trial balance");
  });
});

describe("Insurance policy heading grounding", () => {
  it("ins_policy_document sections include insurance-specific anchors", () => {
    const filePath = path.join(
      BANKS_ROOT,
      "document_intelligence/domains/insurance/doc_types/sections/ins_policy_document.sections.any.json",
    );
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const sections = raw.sections || [];
    const allAnchors = sections.flatMap(
      (s: Record<string, unknown>) => {
        const anchors = s.headingAnchors || s.headerVariants;
        const names = [];
        if (s.name && typeof s.name === "object") {
          names.push(...Object.values(s.name as Record<string, string>));
        }
        if (Array.isArray(anchors)) return [...anchors, ...names];
        if (anchors && typeof anchors === "object") {
          return [
            ...Object.values(anchors as Record<string, string[]>).flat(),
            ...names,
          ];
        }
        return names;
      },
    );
    const joined = allAnchors.join(" ").toLowerCase();
    // At least one of these should be present
    const hasRelevant =
      joined.includes("coverage") ||
      joined.includes("premium") ||
      joined.includes("policy") ||
      joined.includes("cobertura") ||
      joined.includes("premio") ||
      joined.includes("apolice");
    expect(hasRelevant).toBe(true);
  });
});

describe("Banking statement heading grounding", () => {
  it("banking_bank_statement sections include banking-specific anchors", () => {
    const filePath = path.join(
      BANKS_ROOT,
      "document_intelligence/domains/banking/doc_types/sections/banking_bank_statement.sections.any.json",
    );
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const sections = raw.sections || [];
    const allAnchors = sections.flatMap(
      (s: Record<string, unknown>) => {
        const anchors = s.headingAnchors || s.headerVariants;
        if (Array.isArray(anchors)) return anchors;
        if (anchors && typeof anchors === "object") {
          return Object.values(anchors as Record<string, string[]>).flat();
        }
        return [];
      },
    );
    const joined = allAnchors.join(" ").toLowerCase();
    const hasRelevant = joined.includes("transaction") || joined.includes("balance") || joined.includes("statement");
    expect(hasRelevant).toBe(true);
  });
});

describe("Passport heading grounding", () => {
  it("id_passport sections include identity-specific anchors", () => {
    const filePath = path.join(
      BANKS_ROOT,
      "document_intelligence/domains/identity/doc_types/sections/id_passport.sections.any.json",
    );
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const sections = raw.sections || [];
    const allAnchors = sections.flatMap(
      (s: Record<string, unknown>) => {
        const anchors = s.headingAnchors || s.headerVariants;
        if (Array.isArray(anchors)) return anchors;
        if (anchors && typeof anchors === "object") {
          return Object.values(anchors as Record<string, string[]>).flat();
        }
        return [];
      },
    );
    const joined = allAnchors.join(" ").toLowerCase();
    expect(joined).toContain("passport");
    expect(joined).toContain("personal data");
  });
});

describe("Invoice heading grounding", () => {
  it("every_invoice sections include invoice-specific anchors", () => {
    const filePath = path.join(
      BANKS_ROOT,
      "document_intelligence/domains/everyday/doc_types/sections/every_invoice.sections.any.json",
    );
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const sections = raw.sections || [];
    const allAnchors = sections.flatMap(
      (s: Record<string, unknown>) => {
        const anchors = s.headingAnchors || s.headerVariants;
        if (Array.isArray(anchors)) return anchors;
        if (anchors && typeof anchors === "object") {
          return Object.values(anchors as Record<string, string[]>).flat();
        }
        return [];
      },
    );
    const joined = allAnchors.join(" ").toLowerCase();
    expect(joined).toContain("invoice");
    const hasLineItems = joined.includes("item") || joined.includes("line");
    expect(hasLineItems).toBe(true);
    const hasTotal = joined.includes("total");
    expect(hasTotal).toBe(true);
  });
});


