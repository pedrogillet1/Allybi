import { safeEditingBank } from "./bankService";

export interface BankIntegrityResult {
  ok: boolean;
  missingBanks: string[];
  missingOperators: string[];
}

/**
 * Lightweight integrity checks for editing bank wiring.
 * Intended for startup health warnings and test-time assertions.
 */
export class BankIntegrityService {
  validateEditingBanks(): BankIntegrityResult {
    const requiredBanks = [
      "operator_catalog",
      "allybi_intents",
      "allybi_docx_operators",
      "allybi_xlsx_operators",
      "intent_patterns_excel_en",
      "intent_patterns_excel_pt",
      "intent_patterns_docx_en",
      "intent_patterns_docx_pt",
    ];

    const missingBanks = requiredBanks.filter((id) => !safeEditingBank(id));
    const operatorCatalog = safeEditingBank<{ operators?: Record<string, unknown> }>("operator_catalog");
    const operators = operatorCatalog?.operators && typeof operatorCatalog.operators === "object"
      ? Object.keys(operatorCatalog.operators)
      : [];
    const opSet = new Set(operators.map((op) => String(op || "").trim().toUpperCase()).filter(Boolean));

    const patternBanks = [
      safeEditingBank<{ patterns?: Array<{ operator?: string }> }>("intent_patterns_excel_en"),
      safeEditingBank<{ patterns?: Array<{ operator?: string }> }>("intent_patterns_excel_pt"),
      safeEditingBank<{ patterns?: Array<{ operator?: string }> }>("intent_patterns_docx_en"),
      safeEditingBank<{ patterns?: Array<{ operator?: string }> }>("intent_patterns_docx_pt"),
    ];

    const missingOperators: string[] = [];
    for (const bank of patternBanks) {
      const patterns = Array.isArray(bank?.patterns) ? bank!.patterns : [];
      for (const p of patterns) {
        const op = String(p?.operator || "").trim().toUpperCase();
        if (!op) continue;
        if (!opSet.has(op) && !missingOperators.includes(op)) missingOperators.push(op);
      }
    }

    return {
      ok: missingBanks.length === 0 && missingOperators.length === 0,
      missingBanks,
      missingOperators,
    };
  }
}

