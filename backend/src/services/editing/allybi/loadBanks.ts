import { safeEditingBank } from "../banks/bankService";

export interface AllybiBanks {
  capabilities: any;
  intents: any;
  docxOperators: any;
  xlsxOperators: any;
  languageTriggers: any;
  docxResolvers: any;
  xlsxResolvers: any;
  formulaBank: any;
  chartSpecBank: any;
  crossDocGrounding: any;
  responseStyle: any;
  renderCards: any;
  connectorPermissions: any;
  fontAliases: any;
  excelFormulaCatalog: any;
  excelShortcuts: any;
  excelEditRegression: any;
  // Intent runtime banks
  operatorCatalog: any;
  intentPatternsExcelEn: any;
  intentPatternsExcelPt: any;
  intentPatternsDocxEn: any;
  intentPatternsDocxPt: any;
  lexiconCommonEn: any;
  lexiconCommonPt: any;
  lexiconExcelEn: any;
  lexiconExcelPt: any;
  lexiconDocxEn: any;
  lexiconDocxPt: any;
  colorsEn: any;
  colorsPt: any;
  fonts: any;
  excelNumberFormats: any;
  excelChartTypesEn: any;
  excelChartTypesPt: any;
  excelFunctionsPtToEn: any;
  docxHeadingLevelsEn: any;
  docxHeadingLevelsPt: any;
}

function safeBank<T = any>(id: string): T | null {
  return safeEditingBank<T>(id);
}

export function loadAllybiBanks(): AllybiBanks {
  return {
    capabilities: safeBank("allybi_capabilities"),
    intents: safeBank("allybi_intents"),
    docxOperators: safeBank("allybi_docx_operators"),
    xlsxOperators: safeBank("allybi_xlsx_operators"),
    languageTriggers: safeBank("allybi_language_triggers"),
    docxResolvers: safeBank("allybi_docx_resolvers"),
    xlsxResolvers: safeBank("allybi_xlsx_resolvers"),
    formulaBank: safeBank("allybi_formula_bank"),
    chartSpecBank: safeBank("allybi_chart_spec_bank"),
    crossDocGrounding: safeBank("allybi_crossdoc_grounding"),
    responseStyle: safeBank("allybi_response_style"),
    renderCards: safeBank("allybi_render_cards"),
    connectorPermissions: safeBank("allybi_connector_permissions"),
    fontAliases: safeBank("allybi_font_aliases"),
    excelFormulaCatalog: safeBank("excel_formula_catalog"),
    excelShortcuts: safeBank("excel_shortcuts"),
    excelEditRegression: safeBank("excel_edit_regression"),
    // Intent runtime banks
    operatorCatalog: safeBank("operator_catalog"),
    intentPatternsExcelEn: safeBank("intent_patterns_excel_en"),
    intentPatternsExcelPt: safeBank("intent_patterns_excel_pt"),
    intentPatternsDocxEn: safeBank("intent_patterns_docx_en"),
    intentPatternsDocxPt: safeBank("intent_patterns_docx_pt"),
    lexiconCommonEn: safeBank("common_en"),
    lexiconCommonPt: safeBank("common_pt"),
    lexiconExcelEn: safeBank("excel_en"),
    lexiconExcelPt: safeBank("excel_pt"),
    lexiconDocxEn: safeBank("docx_en"),
    lexiconDocxPt: safeBank("docx_pt"),
    colorsEn: safeBank("colors_en"),
    colorsPt: safeBank("colors_pt"),
    fonts: safeBank("fonts"),
    excelNumberFormats: safeBank("excel_number_formats"),
    excelChartTypesEn: safeBank("excel_chart_types_en"),
    excelChartTypesPt: safeBank("excel_chart_types_pt"),
    excelFunctionsPtToEn: safeBank("excel_functions_pt_to_en"),
    docxHeadingLevelsEn: safeBank("docx_heading_levels_en"),
    docxHeadingLevelsPt: safeBank("docx_heading_levels_pt"),
  };
}
