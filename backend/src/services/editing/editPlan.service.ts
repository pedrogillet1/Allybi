import type { LanguageCode } from "../../types/common.types";
import type {
  EditConstraintSet,
  EditOperator,
  EditPlan,
  EditPlanDiagnostics,
  EditPlanRequest,
  EditPlanResult,
} from "./editing.types";

const REQUIRED_ENTITY_BY_OPERATOR: Record<EditOperator, string[]> = {
  EDIT_PARAGRAPH: [],
  EDIT_SPAN: [],
  EDIT_DOCX_BUNDLE: [],
  ADD_PARAGRAPH: [],
  EDIT_CELL: ["cell"],
  EDIT_RANGE: ["range"],
  ADD_SHEET: ["sheet_name"],
  RENAME_SHEET: ["sheet_name"],
  DELETE_SHEET: ["sheet_name"],
  CREATE_CHART: ["range"],
  COMPUTE: [],
  COMPUTE_BUNDLE: [],
  ADD_SLIDE: [],
  REWRITE_SLIDE_TEXT: ["slide"],
  REPLACE_SLIDE_IMAGE: ["slide"],
  PY_COMPUTE: [],
  PY_CHART: [],
  PY_WRITEBACK: [],
};

const DESTRUCTIVE_OR_HINTED_OPS = new Set<EditOperator>([
  "EDIT_RANGE",
  "DELETE_SHEET",
  "REPLACE_SLIDE_IMAGE",
]);

function normalize(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractQuotedTokens(input: string): string[] {
  const out: string[] = [];
  const regex = /"([^"]+)"|'([^']+)'/g;
  let match = regex.exec(input);
  while (match) {
    const token = (match[1] || match[2] || "").trim();
    if (token) out.push(token);
    match = regex.exec(input);
  }
  return out;
}

function uniqueNormalized(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tokens) {
    const n = raw.toLowerCase().trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(raw.trim());
  }
  return out;
}

export class EditPlanService {
  plan(request: EditPlanRequest): EditPlanResult {
    const normalizedInstruction = normalize(request.instruction);
    if (!normalizedInstruction)
      return { ok: false, error: "Instruction is empty." };
    if (!request.documentId?.trim())
      return { ok: false, error: "Document id is required." };

    const constraints = this.extractConstraints(
      normalizedInstruction,
      request.operator,
    );
    const extractedEntities = this.extractEntityHints(normalizedInstruction);
    const missingRequiredEntities = this.findMissingEntities(
      request,
      normalizedInstruction,
      extractedEntities,
    );
    // For selection edits (EDIT_SPAN), quoted text is usually *the thing being changed*
    // (e.g. replace "X" with "Y"), so treating quotes as "must preserve" causes false blocks.
    const autoQuotedPreserve =
      request.operator === "EDIT_SPAN" ||
      request.operator === "EDIT_DOCX_BUNDLE" ||
      request.operator === "COMPUTE_BUNDLE"
        ? []
        : extractQuotedTokens(normalizedInstruction);
    const preserveTokens = uniqueNormalized([
      ...(request.preserveTokens || []),
      ...autoQuotedPreserve,
    ]);

    const diagnostics: EditPlanDiagnostics = {
      extractedEntities,
      extractedHints: this.extractHints(normalizedInstruction),
      checks: [
        { id: "instruction_non_empty", pass: true },
        { id: "document_id_present", pass: true },
        {
          id: "required_entities_satisfied",
          pass: missingRequiredEntities.length === 0,
          detail: missingRequiredEntities.length
            ? `Missing: ${missingRequiredEntities.join(", ")}`
            : undefined,
        },
        {
          id: "operator_requires_caution",
          pass: !DESTRUCTIVE_OR_HINTED_OPS.has(request.operator),
          detail: DESTRUCTIVE_OR_HINTED_OPS.has(request.operator)
            ? "Operator requires stronger confirmation gating."
            : undefined,
        },
      ],
    };

    const plan: EditPlan = {
      operator: request.operator,
      canonicalOperator: request.canonicalOperator,
      intentSource: request.intentSource,
      domain: request.domain,
      documentId: request.documentId,
      targetHint: request.targetHint,
      normalizedInstruction,
      constraints,
      missingRequiredEntities,
      preserveTokens,
      diagnostics,
    };

    return {
      ok: true,
      plan,
      missingRequiredEntities,
    };
  }

  private extractConstraints(
    instruction: string,
    operator: EditOperator,
  ): EditConstraintSet {
    const low = instruction.toLowerCase();
    const preserveNumbers =
      /preserve (all )?numbers|keep (all )?numbers|manter (os )?n[úu]meros/.test(
        low,
      );
    const preserveEntities =
      /preserve entities|keep names|manter entidades|manter nomes/.test(low);
    const strictNoNewFacts =
      /no new facts|do not add facts|sem fatos novos|n[ãa]o invente/.test(low);

    return {
      preserveNumbers,
      preserveEntities,
      strictNoNewFacts,
      tone: this.detectTone(low),
      outputLanguage: this.detectLanguage(low),
      maxExpansionRatio: operator === "EDIT_CELL" ? 1.5 : 2.2,
    };
  }

  private detectTone(low: string): EditConstraintSet["tone"] {
    if (/formal|professional|profissional|executive|executivo/.test(low))
      return "formal";
    if (/casual|friendly|informal|leve|amig[aá]vel/.test(low)) return "casual";
    return "neutral";
  }

  private detectLanguage(low: string): LanguageCode {
    if (/\bpt\b|pt-br|portugu[êe]s| em portugu[êe]s/.test(low)) return "pt";
    if (/\bes\b|espa[ñn]ol| en espa[ñn]ol/.test(low)) return "es";
    return "en";
  }

  private extractEntityHints(instruction: string): string[] {
    const low = instruction.toLowerCase();
    const entities: string[] = [];
    if (/\bcell\b|\bc[ée]lula\b/.test(low)) entities.push("cell");
    if (/\brange\b|\bintervalo\b/.test(low)) entities.push("range");
    if (/\bsheet\b|\baba\b|\bplanilha\b/.test(low)) entities.push("sheet_name");
    if (/\bslide\b/.test(low)) entities.push("slide");
    return uniqueNormalized(entities);
  }

  private extractHints(instruction: string): string[] {
    const hints: string[] = [];
    const low = instruction.toLowerCase();
    if (/rewrite|rephrase|reescreva|reformule/.test(low)) hints.push("rewrite");
    if (/keep|preserve|manter/.test(low)) hints.push("preserve");
    if (/short|concise|curto|resumido/.test(low)) hints.push("shorten");
    if (/expand|detailed|detalhado/.test(low)) hints.push("expand");
    return uniqueNormalized(hints);
  }

  private findMissingEntities(
    request: EditPlanRequest,
    normalizedInstruction: string,
    extractedEntities: string[],
  ): string[] {
    const required = [
      ...(REQUIRED_ENTITY_BY_OPERATOR[request.operator] || []),
      ...(request.requiredEntities || []),
    ];
    const searchable = `${normalizedInstruction.toLowerCase()} ${extractedEntities.join(" ")}`;
    const missing: string[] = [];
    for (const token of required) {
      const tokenNorm = token.toLowerCase().replace(/_/g, " ");
      if (!searchable.includes(tokenNorm) && !missing.includes(token)) {
        missing.push(token);
      }
    }
    return missing;
  }
}
