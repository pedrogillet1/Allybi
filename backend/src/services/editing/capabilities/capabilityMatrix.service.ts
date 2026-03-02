import crypto from "crypto";
import { safeEditingBank } from "../banks/bankService";
import { getRuntimeOperatorContract } from "../contracts";

type EditingDomainMatrix = "docx" | "sheets" | "python";

export interface EditingCapabilityRow {
  domain: EditingDomainMatrix;
  canonicalOperator: string;
  runtimeOperator: string | null;
  supportedInPlanner: boolean;
  supportedInExecutor: boolean;
  supported: boolean;
  confirmationRequired: boolean;
  destructive: boolean;
  engine: string;
  undoSupported: boolean;
  proofRequired: boolean;
  unsupportedReason: string | null;
}

export interface EditingCapabilityMatrixSnapshot {
  generatedAt: string;
  versionHash: string;
  rows: EditingCapabilityRow[];
  summary: {
    total: number;
    supported: number;
    unsupported: number;
  };
}

function normalizeDomain(raw: unknown): EditingDomainMatrix | null {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "docx") return "docx";
  if (value === "excel" || value === "xlsx" || value === "sheets")
    return "sheets";
  if (value === "python") return "python";
  return null;
}

function normalizeOperator(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isDestructiveOperator(
  canonical: string,
  runtime: string | null,
): boolean {
  const token = canonical.toUpperCase();
  if (runtime === "DELETE_SHEET") return true;
  if (runtime === "EDIT_RANGE" && token.includes("SET_RANGE")) return true;
  return (
    token.includes("DELETE") ||
    token.includes("REMOVE") ||
    token.includes("FIND_REPLACE") ||
    token.includes("REWRITE_SECTION") ||
    token.includes("MERGE") ||
    token.includes("SPLIT")
  );
}

function shouldConfirm(
  canonicalOperator: string,
  entry: any,
  alwaysConfirmOperators: Set<string>,
): boolean {
  if (alwaysConfirmOperators.has(canonicalOperator)) return true;
  return Boolean(entry?.requires_confirmation);
}

export class EditingCapabilityMatrixService {
  build(domain?: EditingDomainMatrix): EditingCapabilityMatrixSnapshot {
    const operatorCatalog = safeEditingBank<any>("operator_catalog");
    const capabilities = safeEditingBank<any>("allybi_capabilities");
    const docxOperators = safeEditingBank<any>("allybi_docx_operators");
    const xlsxOperators = safeEditingBank<any>("allybi_xlsx_operators");

    const catalogEntries = Object.entries(operatorCatalog?.operators || {});
    const alwaysConfirmOperators = new Set<string>(
      Array.isArray(capabilities?.alwaysConfirmOperators)
        ? capabilities.alwaysConfirmOperators
            .map((value: unknown) => normalizeOperator(value))
            .filter(Boolean)
        : [],
    );
    const capabilityEntries = capabilities?.operators || {};

    const rows: EditingCapabilityRow[] = [];

    for (const [canonicalOperatorRaw, entry] of catalogEntries) {
      const canonicalOperator = normalizeOperator(canonicalOperatorRaw);
      const rowDomain = normalizeDomain((entry as any)?.domain);
      if (!rowDomain) continue;
      if (domain && rowDomain !== domain) continue;

      const runtimeOperator =
        normalizeOperator((entry as any)?.runtimeOperator) || null;
      const expectedRuntimeDomain =
        rowDomain === "python" ? "sheets" : rowDomain;
      const contract = runtimeOperator
        ? getRuntimeOperatorContract(runtimeOperator as any)
        : null;
      const bankOps =
        rowDomain === "docx"
          ? docxOperators?.operators || {}
          : rowDomain === "sheets"
            ? xlsxOperators?.operators || {}
            : {};
      const operatorBankEntry = bankOps?.[canonicalOperator] || {};
      const capabilityEntry = capabilityEntries?.[canonicalOperator] || {};
      const declaredSupported = capabilityEntry?.supported !== false;
      const supportedInExecutor = Boolean(
        contract && contract.domain === expectedRuntimeDomain,
      );
      const supported = declaredSupported && supportedInExecutor;
      const unsupportedReason = supported
        ? null
        : String(
            capabilityEntry?.reason ||
              (!supportedInExecutor
                ? "runtime_contract_missing_or_mismatch"
                : "marked_unsupported"),
          );

      rows.push({
        domain: rowDomain,
        canonicalOperator,
        runtimeOperator,
        supportedInPlanner: true,
        supportedInExecutor,
        supported,
        confirmationRequired: shouldConfirm(
          canonicalOperator,
          operatorBankEntry,
          alwaysConfirmOperators,
        ),
        destructive: isDestructiveOperator(canonicalOperator, runtimeOperator),
        engine: String(
          capabilityEntry?.engine || operatorBankEntry?.engine || "local",
        ),
        undoSupported: Boolean(contract?.supportsUndo),
        proofRequired: Boolean(contract?.proofRequired),
        unsupportedReason,
      });
    }

    // Include capability-only unsupported operators that are not in catalog.
    for (const [canonicalOperatorRaw, capabilityEntry] of Object.entries<any>(
      capabilityEntries,
    )) {
      const canonicalOperator = normalizeOperator(canonicalOperatorRaw);
      if (!canonicalOperator) continue;
      const exists = rows.some(
        (row) => row.canonicalOperator === canonicalOperator,
      );
      if (exists) continue;
      const rowDomain = normalizeDomain(capabilityEntry?.filetype);
      if (!rowDomain) continue;
      if (domain && rowDomain !== domain) continue;
      rows.push({
        domain: rowDomain,
        canonicalOperator,
        runtimeOperator:
          normalizeOperator(capabilityEntry?.runtimeOperator) || null,
        supportedInPlanner: false,
        supportedInExecutor: false,
        supported: false,
        confirmationRequired: shouldConfirm(
          canonicalOperator,
          capabilityEntry,
          alwaysConfirmOperators,
        ),
        destructive: isDestructiveOperator(
          canonicalOperator,
          normalizeOperator(capabilityEntry?.runtimeOperator) || null,
        ),
        engine: String(capabilityEntry?.engine || "local"),
        undoSupported: false,
        proofRequired: false,
        unsupportedReason: String(
          capabilityEntry?.reason || "missing_from_operator_catalog",
        ),
      });
    }

    rows.sort((a, b) =>
      `${a.domain}:${a.canonicalOperator}`.localeCompare(
        `${b.domain}:${b.canonicalOperator}`,
      ),
    );
    const versionHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex");
    const supportedCount = rows.filter((row) => row.supported).length;
    return {
      generatedAt: new Date().toISOString(),
      versionHash,
      rows,
      summary: {
        total: rows.length,
        supported: supportedCount,
        unsupported: rows.length - supportedCount,
      },
    };
  }
}

export default EditingCapabilityMatrixService;
