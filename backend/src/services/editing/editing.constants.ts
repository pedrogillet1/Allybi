// backend/src/services/editing/editing.constants.ts
//
// Single source of truth for compute-related constants used across
// the editing pipeline: intent classification, operator planning,
// revision store, and agent services.

/**
 * Base compute kind strings — the 11 core python compute operations.
 */
export const COMPUTE_KINDS = new Set([
  "forecast_series",
  "clean_data",
  "dedupe_by_column",
  "split_names",
  "anomaly_detection",
  "reconcile_sheets",
  "goal_seek",
  "monte_carlo",
  "regression",
  "clustering",
  "generate_chart",
]);

/**
 * Extended compute kinds — base + execute_code for revision store.
 */
export const COMPUTE_KINDS_EXTENDED = new Set([
  ...COMPUTE_KINDS,
  "execute_code",
]);

/**
 * All 27 canonical XLSX compute operator names.
 * Used by intentClassifier and operatorPlanner to route compute ops
 * to the xlsx_compute class instead of falling through to xlsx_value
 * or misrouting to xlsx_formula.
 */
export const XLSX_COMPUTE_OPERATORS = new Set([
  // Original 10
  "XLSX_FORECAST",
  "XLSX_CLEAN_DATA",
  "XLSX_DEDUPE",
  "XLSX_ANOMALY_DETECT",
  "XLSX_RECONCILE",
  "XLSX_REGRESSION",
  "XLSX_MONTE_CARLO",
  "XLSX_GOAL_SEEK",
  "XLSX_CLUSTERING",
  "XLSX_GENERATE_CHART",
  // New 17
  "XLSX_DERIVED_COLUMN",
  "XLSX_NORMALIZE",
  "XLSX_PIVOT",
  "XLSX_ROLLING_WINDOW",
  "XLSX_GROUP_BY",
  "XLSX_COHORT_ANALYSIS",
  "XLSX_HYPOTHESIS_TEST",
  "XLSX_CONFIDENCE_INTERVAL",
  "XLSX_ANOVA",
  "XLSX_CORRELATION_MATRIX",
  "XLSX_SEASONALITY",
  "XLSX_EXPLAIN_FORMULA",
  "XLSX_TRANSLATE_FORMULA",
  "XLSX_SPLIT_COLUMN",
  "XLSX_DASHBOARD",
  "XLSX_KPI_CARD",
  "XLSX_MOVING_AVERAGE",
]);
