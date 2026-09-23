// Generic "find the header, read the table" reader for the flat sources
// (выписка, лицевые счета, Shipments). Columns are located by alias lookup
// on normalized header text — never by letter or position — so a reordered
// or extended export keeps working and a missing column produces a precise
// error listing what *was* found.
import ExcelJS from "exceljs";
import type { Cell, Worksheet } from "exceljs";
import { cleanText, normalizeHeader } from "./text.ts";

export type FieldSpec = {
  field: string;
  aliases: string[];
  required?: boolean;
};

export type TableRow = {
  rowNumber: number;
  get(field: string): unknown;
  /** Fields whose cell held an Excel error (#REF!, #VALUE!, #DIV/0!…). */
  errorFields: string[];
};

export type TableReadResult = {
  sheetName: string;
  headerRow: number;
  columns: Map<string, number>;
  foundHeaders: string[];
  duplicateHeaders: string[];
  rows: TableRow[];
};

export class MissingColumnsError extends Error {
  readonly missing: string[];
  readonly foundHeaders: string[];
  constructor(missing: string[], foundHeaders: string[]) {
    super(`Required columns not found: ${missing.join(", ")}`);
    this.name = "MissingColumnsError";
    this.missing = missing;
    this.foundHeaders = foundHeaders;
  }
}

export type CellRead = { value: unknown; isError: boolean };

/** Raw cell value with rich text flattened, formulas resolved to their cached result, and error values flagged. */
export function readCell(cell: Cell): CellRead {
  const v = cell.value as unknown;
  if (v == null) return { value: null, isError: false };
  if (v instanceof Date) return { value: v, isError: false };
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return { value: (o.richText as { text: string }[]).map((r) => r.text).join(""), isError: false };
    if ("error" in o) return { value: null, isError: true };
    if ("formula" in o || "sharedFormula" in o || "result" in o) {
      const result = o.result;
      if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) return { value: null, isError: true };
      return { value: result ?? null, isError: false };
    }
    if (typeof o.text === "string") return { value: o.text, isError: false };
    if (typeof o.hyperlink === "string") return { value: o.hyperlink, isError: false };
  }
  if (typeof v === "string" && /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)$/.test(v.trim())) return { value: null, isError: true };
  return { value: v, isError: false };
}

/** A non-anchor cell of a merged range — ExcelJS echoes the anchor's value there, so scans must skip it. */
function isMergedSlave(cell: Cell): boolean {
  return cell.isMerged && cell.master.address !== cell.address;
}

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

/** Normalized text of the first `maxRows` rows — used for content-based file classification. */
export function sheetPreviewText(ws: Worksheet, maxRows = 12): string[] {
  const out: string[] = [];
  const last = Math.min(ws.rowCount, maxRows);
  for (let r = 1; r <= last; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const t = normalizeHeader(readCell(cell).value);
      if (t) out.push(t);
    });
  }
  return out;
}

function buildAliasIndex(specs: FieldSpec[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const s of specs) for (const a of s.aliases) idx.set(normalizeHeader(a), s.field);
  return idx;
}

/**
 * Picks the header row as the row (within the first `maxHeaderScan`) whose
 * cells match the most field aliases, then reads every following row.
 * Throws MissingColumnsError when a required field is absent.
 */
export function readTable(ws: Worksheet, specs: FieldSpec[], maxHeaderScan = 30): TableReadResult {
  const aliasIndex = buildAliasIndex(specs);
  let best = { row: 0, hits: 0 };
  const lastScan = Math.min(ws.rowCount, maxHeaderScan);
  for (let r = 1; r <= lastScan; r++) {
    const seen = new Set<string>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (isMergedSlave(cell)) return;
      const field = aliasIndex.get(normalizeHeader(readCell(cell).value));
      if (field) seen.add(field);
    });
    if (seen.size > best.hits) best = { row: r, hits: seen.size };
  }

  const foundHeaders: string[] = [];
  const duplicateHeaders: string[] = [];
  const columns = new Map<string, number>();
  if (best.row > 0) {
    ws.getRow(best.row).eachCell({ includeEmpty: false }, (cell, col) => {
      if (isMergedSlave(cell)) return;
      const text = cleanText(readCell(cell).value);
      if (!text) return;
      foundHeaders.push(text);
      const field = aliasIndex.get(normalizeHeader(text));
      if (!field) return;
      if (columns.has(field)) duplicateHeaders.push(text);
      else columns.set(field, col);
    });
  } else {
    // No header row recognized at all — report whatever the top rows contain.
    for (let r = 1; r <= Math.min(ws.rowCount, 3); r++) {
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        const t = cleanText(readCell(cell).value);
        if (t) foundHeaders.push(t);
      });
    }
  }

  const missing = specs.filter((s) => s.required && !columns.has(s.field)).map((s) => s.aliases[0] ?? s.field);
  if (missing.length) throw new MissingColumnsError(missing, foundHeaders);

  const rows: TableRow[] = [];
  for (let r = best.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = new Map<string, unknown>();
    const errorFields: string[] = [];
    let any = false;
    for (const [field, col] of columns) {
      const { value, isError } = readCell(row.getCell(col));
      if (isError) errorFields.push(field);
      if (value != null && cleanText(value instanceof Date ? "d" : value) !== "") any = true;
      values.set(field, value);
    }
    if (!any && errorFields.length === 0) continue; // blank spacer row
    rows.push({ rowNumber: r, get: (f) => values.get(f) ?? null, errorFields });
  }

  return { sheetName: ws.name, headerRow: best.row, columns, foundHeaders, duplicateHeaders, rows };
}

/** Finds the value to the right of a label cell in the top block (e.g. "Клиент ИНН:" → "300074865"). */
export function findLabeledValue(ws: Worksheet, labelRe: RegExp, maxRows = 10): unknown {
  for (let r = 1; r <= Math.min(ws.rowCount, maxRows); r++) {
    let found = false;
    let result: unknown = null;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (result != null) return;
      if (isMergedSlave(cell)) return;
      const { value } = readCell(cell);
      const text = cleanText(value);
      if (!text) return;
      if (found) result = value;
      else if (labelRe.test(text)) found = true;
    });
    if (result != null) return result;
  }
  return null;
}
