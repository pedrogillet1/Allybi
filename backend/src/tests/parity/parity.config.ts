/**
 * Parity Test Configuration
 *
 * Shared configuration for all parity test suites.
 * Uses stable fake doc inventory for deterministic routing + scope tests.
 */

export const PARITY_CONFIG = {
  userId: 'parity_user',
  conversationId: 'parity_convo',
  hasDocuments: true,

  // Stable fake doc inventory for deterministic tests
  availableDocs: [
    {
      id: 'doc_budget_2024',
      filename: 'budget_2024.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    {
      id: 'doc_budget_2025',
      filename: 'budget_2025.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    {
      id: 'doc_project_plan',
      filename: 'project_plan.pdf',
      mimeType: 'application/pdf',
    },
    {
      id: 'doc_fin_report',
      filename: 'financial_report.pdf',
      mimeType: 'application/pdf',
    },
    {
      id: 'doc_contract',
      filename: 'contract_2024.pdf',
      mimeType: 'application/pdf',
    },
  ],

  // Target accuracy thresholds
  thresholds: {
    routing: 0.95,
    completeness: 0.95,
    formatting: 0.99,
    grounding: 0.98,
    followup: 0.95,
  },
};
