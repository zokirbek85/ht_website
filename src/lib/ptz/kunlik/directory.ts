// FarmerDirectory — the one piece of Кунлик терим structure that exists in
// no source export: which ҳудуд block each farmer belongs to, the display name
// the report uses (often a Cyrillic personal name, not the basket's legal
// name), and row order. Kept as a human-editable Excel file in the data dir
// (never in git — it holds INNs), seeded once from the hand-made report by
// scripts/ptz-seed-directory.mts and then maintained by the business.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { dataDir } from "../db.ts";
import { loadWorkbook, readTable, type FieldSpec } from "./utils/excel.ts";
import { cleanText } from "./utils/text.ts";
import { parseNumber } from "./utils/numbers.ts";

export type DirectoryEntry = {
  order: number;
  section: string; // e.g. "Хазорасп ҳудуди", "Кластер", "Шартнома килмаганлар"
  hudud: string; // e.g. "Янгибозор ҳудуди"
  displayName: string;
  inn: string | null;
  planT: number | null; // used only for farmers with no basket contract yet
  basketName: string | null;
  matchMethod: string | null;
  confidence: number | null;
};

export const UNASSIGNED_SECTION = "Ҳудуди аниқланмаган";

export function directoryPath(): string {
  return process.env.PTZ_DIRECTORY_PATH ?? path.join(dataDir(), "farmer_directory.xlsx");
}

const COLUMNS: { field: keyof DirectoryEntry; header: string; width: number }[] = [
  { field: "order", header: "№", width: 6 },
  { field: "section", header: "Бўлим", width: 22 },
  { field: "hudud", header: "Ҳудуд", width: 22 },
  { field: "displayName", header: "Фермер (ҳисобот номи)", width: 36 },
  { field: "inn", header: "ИНН", width: 14 },
  { field: "planT", header: "Режа, т", width: 12 },
  { field: "basketName", header: "Basket номи", width: 40 },
  { field: "matchMethod", header: "Боғланиш усули", width: 22 },
  { field: "confidence", header: "Ишонч", width: 9 }
];

const FIELDS: FieldSpec[] = COLUMNS.map((c) => ({
  field: c.field,
  aliases: [c.header],
  required: c.field === "displayName" || c.field === "hudud"
}));

export async function loadDirectory(file = directoryPath()): Promise<DirectoryEntry[]> {
  if (!existsSync(file)) return [];
  const wb = await loadWorkbook(readFileSync(file));
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const table = readTable(ws, FIELDS);
  const out: DirectoryEntry[] = [];
  for (const row of table.rows) {
    const displayName = cleanText(row.get("displayName"));
    if (!displayName) continue;
    out.push({
      order: parseNumber(row.get("order")) ?? out.length + 1,
      section: cleanText(row.get("section")) || cleanText(row.get("hudud")),
      hudud: cleanText(row.get("hudud")),
      displayName,
      inn: cleanText(row.get("inn")).replace(/\s/g, "") || null,
      planT: parseNumber(row.get("planT")),
      basketName: cleanText(row.get("basketName")) || null,
      matchMethod: cleanText(row.get("matchMethod")) || null,
      confidence: parseNumber(row.get("confidence"))
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

export async function saveDirectory(entries: DirectoryEntry[], file = directoryPath()): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Фермерлар", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
  ws.getRow(1).font = { bold: true };
  for (const e of entries) {
    ws.addRow({ ...e, inn: e.inn ?? "", planT: e.planT ?? null, confidence: e.confidence ?? null });
  }
  ws.getColumn("inn").numFmt = "@";
  ws.autoFilter = { from: "A1", to: `I${entries.length + 1}` };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer()));
}
