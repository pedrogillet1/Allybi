import ExcelJS from "exceljs";

export type XlsxCellValue = string | number | boolean | Date | null;

function normalizeSheetName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("sheet name is required");
  // Excel constraints: no : \ / ? * [ ]
  const cleaned = trimmed.replace(/[:\\/?*[\]]/g, "-").slice(0, 100).trim();
  if (!cleaned) throw new Error("sheet name is invalid");
  return cleaned;
}

function parseTargetId(targetId: string): { sheetName: string; a1: string } {
  const raw = String(targetId || "").trim();
  // Accept:
  // - "xlsx:Sheet1!B12"
  // - "Sheet1!B12"
  // - "'My Sheet'!B12"
  const withoutPrefix = raw.startsWith("xlsx:") ? raw.slice("xlsx:".length) : raw;
  const bang = withoutPrefix.indexOf("!");
  if (bang <= 0) throw new Error(`Invalid XLSX target: ${targetId}`);
  const sheetPart = withoutPrefix.slice(0, bang).replace(/^'/, "").replace(/'$/, "").trim();
  const a1 = withoutPrefix.slice(bang + 1).trim();
  if (!sheetPart || !a1) throw new Error(`Invalid XLSX target: ${targetId}`);
  return { sheetName: sheetPart, a1 };
}

function parseSimpleValue(text: string): XlsxCellValue {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (/^(null|empty)$/i.test(t)) return null;
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  // Number (allow commas)
  const num = Number(t.replace(/,/g, ""));
  if (Number.isFinite(num) && /^-?[\d,]+(\.\d+)?$/.test(t)) return num;
  // ISO date
  const d = new Date(t);
  if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(t)) return d;
  return t;
}

function parseTsvOrCsvGrid(text: string): string[][] {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("range values are empty");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
}

export class XlsxFileEditorService {
  async editCell(buffer: Buffer, targetId: string, proposedText: string): Promise<Buffer> {
    const { sheetName, a1 } = parseTargetId(targetId);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

    const cell = ws.getCell(a1);
    cell.value = parseSimpleValue(proposedText) as any;

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async editRange(buffer: Buffer, targetId: string, proposedText: string): Promise<Buffer> {
    const { sheetName, a1 } = parseTargetId(targetId);
    if (!a1.includes(":")) throw new Error("EDIT_RANGE target must be an A1 range like Sheet1!A1:B2");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

    const grid = parseTsvOrCsvGrid(proposedText);
    const [startCell] = a1.split(":");
    const start = ws.getCell(startCell);
    const startRow = start.row;
    const startCol = start.col;

    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const v = grid[r][c];
        ws.getCell(startRow + r, startCol + c).value = parseSimpleValue(v) as any;
      }
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async addSheet(buffer: Buffer, proposedSheetName: string): Promise<Buffer> {
    const name = normalizeSheetName(proposedSheetName);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    if (wb.getWorksheet(name)) throw new Error(`Sheet already exists: ${name}`);
    wb.addWorksheet(name);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async renameSheet(buffer: Buffer, fromName: string, toName: string): Promise<Buffer> {
    const from = normalizeSheetName(fromName);
    const to = normalizeSheetName(toName);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet(from);
    if (!ws) throw new Error(`Sheet not found: ${from}`);
    if (wb.getWorksheet(to)) throw new Error(`Sheet already exists: ${to}`);

    ws.name = to;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

export default XlsxFileEditorService;
