import { getOptionalBank } from "../../core/banks/bankLoader.service";
import * as fs from "fs";
import * as path from "path";
import { resolveDataDir } from "../../../utils/resolveDataDir";

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
}

function safeBank<T = any>(id: string): T | null {
  try {
    const loaded = getOptionalBank<T>(id);
    if (loaded) return loaded;
  } catch {
    // Ignore and attempt file fallback below.
  }

  // Fallback for test environments where bank loader is not initialized.
  try {
    const dataDir = resolveDataDir();
    const categories = [
      "semantics",
      "routing",
      "operators",
      "triggers",
      "scope",
      "microcopy",
      "overlays",
      "policies",
      "quality",
      "dictionaries",
      "templates",
      "probes",
    ];
    for (const category of categories) {
      const p = path.join(dataDir, category, `${id}.any.json`);
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as T;
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
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
  };
}
