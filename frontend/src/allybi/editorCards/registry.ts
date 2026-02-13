import DocxDiffCard from "./DocxDiffCard";
import XlsxDiffCard from "./XlsxDiffCard";
import ChartDiffCard from "./ChartDiffCard";

export const allybiCardRegistry: Record<string, any> = {
  docx_text_diff: DocxDiffCard,
  docx_inline_format_diff: DocxDiffCard,
  docx_format_diff: DocxDiffCard,
  docx_structural_diff: DocxDiffCard,
  xlsx_cell_diff: XlsxDiffCard,
  xlsx_range_diff: XlsxDiffCard,
  xlsx_formula_diff: XlsxDiffCard,
  xlsx_format_diff: XlsxDiffCard,
  xlsx_structural_diff: XlsxDiffCard,
  xlsx_chart_diff: ChartDiffCard,
  target_resolution: DocxDiffCard,
};

export function resolveAllybiCard(renderType: string) {
  return allybiCardRegistry[String(renderType || "").trim()] || null;
}
