import type { EditDomain } from "../editing.types";
import { loadAllybiBanks } from "./loadBanks";

function filetypeFromMime(
  mime: string,
): "docx" | "xlsx" | "pptx" | "pdf" | "image" | "unknown" {
  const low = String(mime || "").toLowerCase();
  if (
    low ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (
    low === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return "xlsx";
  if (low.includes("presentationml") || low === "application/vnd.ms-powerpoint")
    return "pptx";
  if (low === "application/pdf") return "pdf";
  if (low.startsWith("image/")) return "image";
  return "unknown";
}

function domainFromFiletype(filetype: string): EditDomain | null {
  if (filetype === "docx") return "docx";
  if (filetype === "xlsx") return "sheets";
  if (filetype === "pptx") return "slides";
  return null;
}

export interface DocumentCapabilities {
  documentId: string;
  filename: string;
  mimeType: string;
  filetype: string;
  saveMode: string;
  supports: {
    docx: boolean;
    sheets: boolean;
    slides: boolean;
    pdfRevisedCopy: boolean;
  };
  operators: {
    canonical: string[];
    runtime: string[];
    unsupported: Array<{ operator: string; reason: string }>;
  };
  alwaysConfirmOperators: string[];
  viewerModeRules: Record<string, unknown>;
  connectorPermissions: {
    enabled: boolean;
    viewerModeBlocksConnectorFallback: boolean;
    requireExplicitSendClick: boolean;
    actions: Record<string, unknown>;
  };
}

export function buildDocumentCapabilities(input: {
  documentId: string;
  filename: string;
  mimeType: string;
}): DocumentCapabilities {
  const banks = loadAllybiBanks();
  const capsBank = banks.capabilities || {};
  const connectorPermissions =
    banks.connectorPermissions && typeof banks.connectorPermissions === "object"
      ? banks.connectorPermissions
      : {};
  const allOps =
    capsBank.operators && typeof capsBank.operators === "object"
      ? capsBank.operators
      : {};

  const filetype = filetypeFromMime(input.mimeType);
  const domain = domainFromFiletype(filetype);

  const supportedCanonical: string[] = [];
  const runtimeOps = new Set<string>();
  const unsupported: Array<{ operator: string; reason: string }> = [];

  for (const [opId, info] of Object.entries<any>(allOps)) {
    if (String(info?.filetype || "") !== filetype) continue;
    const isSupported = Boolean(info?.supported);
    if (isSupported) {
      supportedCanonical.push(opId);
      if (
        typeof info?.runtimeOperator === "string" &&
        info.runtimeOperator.trim()
      ) {
        runtimeOps.add(info.runtimeOperator.trim());
      }
    } else {
      unsupported.push({
        operator: opId,
        reason: String(info?.reason || "unsupported"),
      });
    }
  }

  return {
    documentId: input.documentId,
    filename: input.filename,
    mimeType: input.mimeType,
    filetype,
    saveMode: String(process.env.KODA_EDITING_SAVE_MODE || "overwrite")
      .trim()
      .toLowerCase(),
    supports: {
      docx: domain === "docx",
      sheets: domain === "sheets",
      slides: domain === "slides",
      pdfRevisedCopy: filetype === "pdf",
    },
    operators: {
      canonical: supportedCanonical,
      runtime: Array.from(runtimeOps),
      unsupported,
    },
    alwaysConfirmOperators: Array.isArray(capsBank.alwaysConfirmOperators)
      ? capsBank.alwaysConfirmOperators.map((x: any) => String(x))
      : [],
    viewerModeRules:
      capsBank.viewerModeRules && typeof capsBank.viewerModeRules === "object"
        ? capsBank.viewerModeRules
        : {},
    connectorPermissions: {
      enabled: connectorPermissions?.config?.enabled !== false,
      viewerModeBlocksConnectorFallback:
        connectorPermissions?.config?.viewerModeBlocksConnectorFallback === true,
      requireExplicitSendClick:
        connectorPermissions?.config?.requireExplicitSendClick === true,
      actions:
        connectorPermissions?.actions &&
        typeof connectorPermissions.actions === "object"
          ? connectorPermissions.actions
          : {},
    },
  };
}
