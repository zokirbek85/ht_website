import ExcelJS from "exceljs";
import type { Worksheet, Cell } from "exceljs";
import { classifyHeaderPath, type LeafType, type ZoneMatch } from "./excel-mapping.ts";
import { detectReportDate } from "./dateDetect.ts";
import type { ColumnMapping, ImportWarning, ParsedFarmerRow, ParsedReport, Series, SeriesValues } from "./types.ts";

const IDENTIFIER_ROWNUM_RE = /^(№|n\s*\/\s*p|t\s*\/\s*r|#)$/i;
const IDENTIFIER_FARMER_RE = /(фермер|хужалик|хужалик|хозяйств|farmer)/i;
// Matches a region/grand-total subtotal line by its own label, independent
// of the row-number column (some source files repeat the previous row's
// number here instead of leaving it blank).
const SUBTOTAL_TEXT_RE = /^(ҳудуд\s*жами|туман\s*жами|жами\s*:?|итого\s*:?|всего\s*:?|свод\s*:?|хаммаси\s*:?)$/i;
// The single sheet-wide grand-total line, as opposed to a per-region
// subtotal ("Ҳудуд жами" repeats once per region) — used as an independent
// cross-check against the sum of the parsed farmer rows.
const GRAND_TOTAL_TEXT_RE = /^(хаммаси|умумий\s*жами)\s*:?$/i;

type Merge = { c1: number; r1: number; c2: number; r2: number };

function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n;
}

function parseAddress(addr: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(addr);
  if (!m) throw new Error(`Unparseable cell address: ${addr}`);
  return { col: colLetterToIndex(m[1] ?? ""), row: Number(m[2] ?? "0") };
}

function parseMerges(sheet: Worksheet): Merge[] {
  const raw = (sheet.model.merges ?? []) as string[];
  return raw.map((range) => {
    const [a, b] = range.split(":");
    const start = parseAddress(a ?? range);
    const end = parseAddress(b ?? a ?? range);
    return { c1: start.col, r1: start.row, c2: end.col, r2: end.row };
  });
}

function findMerge(merges: Merge[], row: number, col: number): Merge | null {
  for (const m of merges) {
    if (row >= m.r1 && row <= m.r2 && col >= m.c1 && col <= m.c2) return m;
  }
  return null;
}

function cellText(cell: Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("").trim();
    }
    if ("text" in v && typeof (v as { text: unknown }).text === "string") {
      return (v as { text: string }).text.trim();
    }
  }
  return "";
}

function resolveText(sheet: Worksheet, merges: Merge[], row: number, col: number): string {
  const merge = findMerge(merges, row, col);
  if (merge) return cellText(sheet.getRow(merge.r1).getCell(merge.c1));
  return cellText(sheet.getRow(row).getCell(col));
}

// A real column header rarely merges across more than a handful of columns;
// a report title/subtitle banner (e.g. one full sentence merged A2:Z2 above
// the real header block) merges across nearly the whole sheet. Treating a
// wide merge's text as blank keeps such banners out of the per-column header
// path and out of the farmer/row-number column search, so a coincidental
// keyword match inside a title sentence can't hijack column detection.
const MAX_HEADER_MERGE_WIDTH = 10;

// A stray "report date" banner (e.g. "11.09.2026 й") sometimes sits inside
// the header row range, merged across just 1-2 columns that also belong to
// a real zone (e.g. a "Жами" group) — too narrow for the width guard above
// to catch. A literal date is never a legitimate zone/plan/daily/cumulative
// label, so it's filtered out the same way.
const DATE_LIKE_RE = /\d{1,2}[.,\-]\d{1,2}[.,\-]\d{2,4}/;

function resolveHeaderText(sheet: Worksheet, merges: Merge[], row: number, col: number): string {
  const merge = findMerge(merges, row, col);
  if (merge && merge.c2 - merge.c1 + 1 > MAX_HEADER_MERGE_WIDTH) return "";
  const text = resolveText(sheet, merges, row, col);
  if (DATE_LIKE_RE.test(text)) return "";
  return text;
}

type NumericReadResult = { value: number | null; error?: string };

function readNumeric(sheet: Worksheet, merges: Merge[], row: number, col: number): NumericReadResult {
  const merge = findMerge(merges, row, col);
  const cell = merge ? sheet.getRow(merge.r1).getCell(merge.c1) : sheet.getRow(row).getCell(col);
  const v = cell.value;
  if (v == null || v === "") return { value: null };
  if (typeof v === "number") return { value: v };

  if (typeof v === "object") {
    if ("error" in v && typeof (v as { error: string }).error === "string") {
      return { value: null, error: (v as { error: string }).error };
    }
    if ("result" in v) {
      const result = (v as { result: unknown }).result;
      if (typeof result === "number") return { value: result };
      if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
        return { value: null, error: String((result as { error: unknown }).error) };
      }
      if (typeof result === "string") {
        const n = parseFloat(result.replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) ? { value: n } : { value: null };
      }
      return { value: null };
    }
  }

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return { value: null };
    const n = parseFloat(trimmed.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? { value: n } : { value: null, error: "UNPARSEABLE" };
  }

  return { value: null };
}

type ColumnRole =
  | { kind: "ROW_NUM" }
  | { kind: "FARMER_NAME" }
  | { kind: "METRIC"; series: Series; leaf: NonNullable<LeafType> }
  | { kind: "UNMAPPED" };

function pickSheet(workbook: ExcelJS.Workbook): Worksheet {
  const byName = workbook.worksheets.find((ws) => /факт|fact/i.test(ws.name));
  const sheet = byName ?? workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook contains no worksheets.");
  return sheet;
}

function findIdentifierColumns(
  sheet: Worksheet,
  merges: Merge[],
  scanRows: number
): { farmerCol: number | null; farmerHeaderBottomRow: number | null; rowNumCol: number | null } {
  let farmerCol: number | null = null;
  let farmerHeaderBottomRow: number | null = null;
  let rowNumCol: number | null = null;

  const colCount = sheet.columnCount || 30;
  for (let r = 1; r <= Math.min(scanRows, sheet.rowCount); r++) {
    for (let c = 1; c <= colCount; c++) {
      const text = resolveHeaderText(sheet, merges, r, c);
      if (!text) continue;
      if (farmerCol === null && IDENTIFIER_FARMER_RE.test(text)) {
        farmerCol = c;
        const merge = findMerge(merges, r, c);
        farmerHeaderBottomRow = merge ? merge.r2 : r;
      }
      if (rowNumCol === null && IDENTIFIER_ROWNUM_RE.test(text)) {
        rowNumCol = c;
      }
    }
  }
  return { farmerCol, farmerHeaderBottomRow, rowNumCol };
}

export async function parseWorkbook(
  buffer: Buffer,
  filename: string,
  uploadTimestamp: Date
): Promise<ParsedReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = pickSheet(workbook);
  const merges = parseMerges(sheet);
  const warnings: ImportWarning[] = [];

  const HEADER_SCAN_ROWS = 15;
  const { farmerCol, farmerHeaderBottomRow, rowNumCol } = findIdentifierColumns(sheet, merges, HEADER_SCAN_ROWS);

  if (farmerCol === null) {
    warnings.push({
      severity: "ERROR",
      code: "FARMER_COLUMN_NOT_FOUND",
      message: "Could not locate the farmer name column in the header. Parsing aborted."
    });
    return {
      reportDate: detectReportDate(filename, sheet, uploadTimestamp).reportDate,
      dateDetectionMethod: detectReportDate(filename, sheet, uploadTimestamp).method,
      sheetName: sheet.name,
      rows: [],
      warnings,
      columnMap: [],
      grandTotalFromSheet: null
    };
  }

  // Fallback for the header/data boundary when the farmer-name header isn't
  // vertically merged across the whole header block: first row where the
  // row-number column holds the value 1.
  let dataStartRow = farmerHeaderBottomRow ? farmerHeaderBottomRow + 1 : null;
  if (!dataStartRow && rowNumCol !== null) {
    for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, sheet.rowCount); r++) {
      const { value } = readNumeric(sheet, merges, r, rowNumCol);
      if (value === 1) {
        dataStartRow = r;
        break;
      }
    }
  }
  if (!dataStartRow) {
    dataStartRow = 6; // last-resort guess; the sample structure has ~4-5 header rows
    warnings.push({
      severity: "WARNING",
      code: "HEADER_BOUNDARY_GUESSED",
      message: `Could not confidently detect where the header ends; assumed data starts at row ${dataStartRow}.`
    });
  }

  const headerRows = Array.from({ length: dataStartRow - 1 }, (_, i) => i + 1);
  const colCount = sheet.columnCount || 30;

  const columnMap: ColumnMapping[] = [];
  const roles = new Map<number, ColumnRole>();
  const seriesFieldMap = new Map<Series, Partial<Record<NonNullable<LeafType>, number>>>();

  for (let c = 1; c <= colCount; c++) {
    if (c === farmerCol) {
      roles.set(c, { kind: "FARMER_NAME" });
      continue;
    }
    if (rowNumCol !== null && c === rowNumCol) {
      roles.set(c, { kind: "ROW_NUM" });
      continue;
    }

    const segments: string[] = [];
    let last = "";
    for (const r of headerRows) {
      const text = resolveHeaderText(sheet, merges, r, c);
      if (text && text !== last) {
        segments.push(text);
        last = text;
      }
    }
    if (segments.length === 0) {
      roles.set(c, { kind: "UNMAPPED" });
      continue;
    }

    const { zone, leaf, confidence } = classifyHeaderPath(segments);
    columnMap.push({ columnIndex: c, headerPath: segments.join(" > "), canonicalField: zone && leaf ? `${zone}.${leaf}` : null, confidence });

    if (zone && zone !== "IDENTIFIER" && leaf) {
      roles.set(c, { kind: "METRIC", series: zone, leaf });
      const existing = seriesFieldMap.get(zone) ?? {};
      existing[leaf] = c;
      seriesFieldMap.set(zone, existing);
    } else {
      roles.set(c, { kind: "UNMAPPED" });
      if (confidence < 0.5) {
        warnings.push({
          severity: "INFO",
          code: "COLUMN_NOT_MAPPED",
          message: `Column ${c} ("${segments.join(" > ")}") could not be mapped to a known business field and was ignored.`,
          context: { columnIndex: c, headerPath: segments.join(" > "), confidence }
        });
      }
    }
  }

  if (seriesFieldMap.size === 0) {
    warnings.push({
      severity: "ERROR",
      code: "NO_METRIC_COLUMNS_MAPPED",
      message: "No Futures/Forward/Temporary-Storage/Total metric columns could be mapped."
    });
  }

  function extractRowMetrics(r: number, label: string): Partial<Record<Series, SeriesValues>> {
    const metrics: Partial<Record<Series, SeriesValues>> = {};
    for (const [series, fields] of seriesFieldMap.entries()) {
      const values: SeriesValues = {};
      if (fields.PLAN != null) {
        const res = readNumeric(sheet, merges, r, fields.PLAN);
        values.planQty = res.value;
        if (res.error) warnings.push(formulaErrorWarning(r, fields.PLAN, res.error, label, series, "PLAN"));
      }
      if (fields.DAILY != null) {
        const res = readNumeric(sheet, merges, r, fields.DAILY);
        values.sourceDailyQty = res.value;
        if (res.error) warnings.push(formulaErrorWarning(r, fields.DAILY, res.error, label, series, "DAILY"));
      }
      if (fields.CUMULATIVE != null) {
        const res = readNumeric(sheet, merges, r, fields.CUMULATIVE);
        values.sourceCumulativeQty = res.value;
        if (res.error) warnings.push(formulaErrorWarning(r, fields.CUMULATIVE, res.error, label, series, "CUMULATIVE"));
      }
      if (fields.PCT != null) {
        const res = readNumeric(sheet, merges, r, fields.PCT);
        values.completionPct = res.value;
        if (res.error) warnings.push(formulaErrorWarning(r, fields.PCT, res.error, label, series, "PCT"));
      }
      metrics[series] = values;
    }
    return metrics;
  }

  const rows: ParsedFarmerRow[] = [];
  let grandTotalFromSheet: Partial<Record<Series, SeriesValues>> | null = null;
  let currentRegion: string | null = null;
  const seenFarmerKeys = new Set<string>();

  for (let r = dataStartRow; r <= sheet.rowCount; r++) {
    const farmerText = resolveText(sheet, merges, r, farmerCol);
    const rowNumValue = rowNumCol !== null ? readNumeric(sheet, merges, r, rowNumCol).value : null;

    // Check whether any mapped metric column has a non-empty value on this row.
    let hasAnyMetric = false;
    for (const fields of seriesFieldMap.values()) {
      for (const col of Object.values(fields)) {
        if (col == null) continue;
        const { value } = readNumeric(sheet, merges, r, col);
        if (value != null && value !== 0) hasAnyMetric = true;
      }
    }

    if (!farmerText && !hasAnyMetric) continue; // blank row

    if (farmerText && SUBTOTAL_TEXT_RE.test(farmerText.trim())) {
      // Subtotal/grand-total line identified by its own label (e.g. "Ҳудуд
      // жами", "Жами:"). Checked before the row-number heuristic below
      // because some source files repeat the previous farmer's row number
      // on this line instead of leaving it blank.
      if (GRAND_TOTAL_TEXT_RE.test(farmerText.trim()) && hasAnyMetric) {
        // The sheet-wide grand total ("Хаммаси") — capture it (without the
        // formula-error warnings a broken cell there would otherwise add;
        // this is a cross-check value, not farmer data) so the importer can
        // compare it against the actual sum of parsed farmers and flag it
        // if the sheet's own total is stale.
        const before = warnings.length;
        grandTotalFromSheet = extractRowMetrics(r, farmerText);
        warnings.length = before;
      }
      warnings.push({
        severity: "INFO",
        code: "SUBTOTAL_ROW_SKIPPED",
        message: `Row ${r} ("${farmerText}") looks like a subtotal and was not counted as a farmer.`,
        context: { row: r }
      });
      continue;
    }

    if (farmerText && rowNumValue == null && !hasAnyMetric) {
      // Region separator row: a label with no row number and no figures.
      currentRegion = farmerText.replace(/[":]+$/g, "").trim();
      continue;
    }

    if (farmerText && rowNumValue == null && hasAnyMetric) {
      // Subtotal/grand-total line (e.g. "Жами:" with aggregate figures).
      warnings.push({
        severity: "INFO",
        code: "SUBTOTAL_ROW_SKIPPED",
        message: `Row ${r} ("${farmerText}") looks like a subtotal and was not counted as a farmer.`,
        context: { row: r }
      });
      continue;
    }

    if (!farmerText) continue;

    const key = `${currentRegion ?? ""}::${farmerText}`;
    if (seenFarmerKeys.has(key)) {
      warnings.push({
        severity: "WARNING",
        code: "DUPLICATE_FARMER_ROW",
        message: `Farmer "${farmerText}" appears more than once under the same region (row ${r}).`,
        context: { row: r, farmer: farmerText, region: currentRegion }
      });
    }
    seenFarmerKeys.add(key);

    const metrics = extractRowMetrics(r, farmerText);
    rows.push({ region: currentRegion, farmer: farmerText, metrics });
  }

  const { reportDate, method } = detectReportDate(filename, sheet, uploadTimestamp);

  return {
    reportDate,
    dateDetectionMethod: method,
    sheetName: sheet.name,
    rows,
    warnings,
    columnMap,
    grandTotalFromSheet
  };
}

function formulaErrorWarning(
  row: number,
  col: number,
  error: string,
  farmer: string,
  series: Series,
  leaf: string
): ImportWarning {
  return {
    severity: error === "UNPARSEABLE" ? "WARNING" : "ERROR",
    code: error === "UNPARSEABLE" ? "UNPARSEABLE_NUMBER" : "FORMULA_ERROR",
    message: `${error === "UNPARSEABLE" ? "Non-numeric value" : `Formula error (${error})`} at row ${row}, col ${col} for "${farmer}" (${series}.${leaf}). Treated as missing, not zero.`,
    context: { row, col, farmer, series, leaf, error }
  };
}

export type { ZoneMatch };
