import type { EditDomain, EditOperator } from "../editing.types";

export interface RuntimeOperatorContract {
  operator: EditOperator;
  domain: EditDomain;
  supportsUndo: boolean;
  requiresTarget: boolean;
  certified: boolean;
  proofRequired: boolean;
}

const CONTRACTS: RuntimeOperatorContract[] = [
  {
    operator: "EDIT_PARAGRAPH",
    domain: "docx",
    supportsUndo: true,
    requiresTarget: true,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "EDIT_SPAN",
    domain: "docx",
    supportsUndo: true,
    requiresTarget: true,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "EDIT_DOCX_BUNDLE",
    domain: "docx",
    supportsUndo: true,
    requiresTarget: false,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "ADD_PARAGRAPH",
    domain: "docx",
    supportsUndo: true,
    requiresTarget: true,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "EDIT_CELL",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: true,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "EDIT_RANGE",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: true,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "ADD_SHEET",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: false,
    proofRequired: true,
  },
  {
    operator: "RENAME_SHEET",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: true,
    certified: false,
    proofRequired: true,
  },
  {
    operator: "DELETE_SHEET",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: true,
    certified: false,
    proofRequired: true,
  },
  {
    operator: "CREATE_CHART",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: false,
    proofRequired: true,
  },
  {
    operator: "COMPUTE",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "COMPUTE_BUNDLE",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "PY_COMPUTE",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "PY_CHART",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "PY_WRITEBACK",
    domain: "sheets",
    supportsUndo: true,
    requiresTarget: false,
    certified: true,
    proofRequired: true,
  },
  {
    operator: "ADD_SLIDE",
    domain: "slides",
    supportsUndo: true,
    requiresTarget: false,
    certified: false,
    proofRequired: true,
  },
  {
    operator: "REWRITE_SLIDE_TEXT",
    domain: "slides",
    supportsUndo: true,
    requiresTarget: true,
    certified: false,
    proofRequired: true,
  },
  {
    operator: "REPLACE_SLIDE_IMAGE",
    domain: "slides",
    supportsUndo: true,
    requiresTarget: true,
    certified: false,
    proofRequired: true,
  },
];

const CONTRACT_BY_OPERATOR = new Map<EditOperator, RuntimeOperatorContract>(
  CONTRACTS.map((contract) => [contract.operator, contract]),
);

export function listRuntimeOperatorContracts(): RuntimeOperatorContract[] {
  return [...CONTRACTS];
}

export function getRuntimeOperatorContract(
  operator: EditOperator,
): RuntimeOperatorContract | null {
  return CONTRACT_BY_OPERATOR.get(operator) || null;
}

export function isCertifiedEditingOperator(operator: EditOperator): boolean {
  return Boolean(CONTRACT_BY_OPERATOR.get(operator)?.certified);
}
