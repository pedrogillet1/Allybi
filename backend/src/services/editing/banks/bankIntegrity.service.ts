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
      "intent_patterns_excel_en",
      "intent_patterns_excel_pt",
      "intent_patterns_docx_en",
      "intent_patterns_docx_pt",
      "allybi_capabilities",
      "editing_microcopy",
      "edit_error_catalog",
    ];

    const missingBanks = requiredBanks.filter((id) => !safeEditingBank(id));
    const operatorCatalog = safeEditingBank<{
      operators?: Record<string, unknown>;
    }>("operator_catalog");
    const operators =
      operatorCatalog?.operators &&
      typeof operatorCatalog.operators === "object"
        ? Object.keys(operatorCatalog.operators)
        : [];
    const opSet = new Set(
      operators
        .map((op) =>
          String(op || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    );

    const patternBanks = [
      safeEditingBank<{
        patterns?: Array<{
          operator?: string;
          planTemplate?: Array<{ op?: string }>;
        }>;
      }>("intent_patterns_excel_en"),
      safeEditingBank<{
        patterns?: Array<{
          operator?: string;
          planTemplate?: Array<{ op?: string }>;
        }>;
      }>("intent_patterns_excel_pt"),
      safeEditingBank<{
        patterns?: Array<{
          operator?: string;
          planTemplate?: Array<{ op?: string }>;
        }>;
      }>("intent_patterns_docx_en"),
      safeEditingBank<{
        patterns?: Array<{
          operator?: string;
          planTemplate?: Array<{ op?: string }>;
        }>;
      }>("intent_patterns_docx_pt"),
    ];

    const missingOperators: string[] = [];
    for (const bank of patternBanks) {
      const patterns = Array.isArray(bank?.patterns) ? bank!.patterns : [];
      for (const p of patterns) {
        const opsFromTemplate = Array.isArray((p as any)?.planTemplate)
          ? (p as any).planTemplate
              .map((step: any) =>
                String(step?.op || "")
                  .trim()
                  .toUpperCase(),
              )
              .filter(Boolean)
          : [];
        const ops = [
          ...opsFromTemplate,
          String((p as any)?.operator || "")
            .trim()
            .toUpperCase(),
        ].filter(Boolean);
        for (const op of ops) {
          if (!opSet.has(op) && !missingOperators.includes(op))
            missingOperators.push(op);
        }
      }
    }

    return {
      ok: missingBanks.length === 0 && missingOperators.length === 0,
      missingBanks,
      missingOperators,
    };
  }
}
