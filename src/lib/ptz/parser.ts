import ExcelJS from "exceljs";
import type { Worksheet, Cell } from "exceljs";
import { classifyColumn, FARMER_HEADER_RE, GRAND_TOTAL_TEXT_RE, IDENTIFIER_ROWNUM_RE } from "./excel-mapping.ts";
import { normDate, normDateTime, normInn, normInt, normNumber, normText } from "./normalize.ts";
import { getOperationIdentityKey } from "./identity.ts";
import type { ColumnMapping, GrandTotalCheck, ImportWarning, ParsedOperationRow, ParsedReport } from "./types.ts";

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

function cellRaw(cell: Cell): unknown {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
    if ("result" in v) {
      const result = (v as { result: unknown }).result;
      if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) return null;
      return result;
    }
    if ("error" in v) return null;
    if (v instanceof Date) return v;
    if ("text" in v && typeof (v as { text: unknown }).text === "string") return (v as { text: string }).text;
  }
  return v;
}

function cellText(cell: Cell): string {
  const v = cellRaw(cell);
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function resolveText(sheet: Worksheet, merges: Merge[], row: number, col: number): string {
  const merge = findMerge(merges, row, col);
  if (merge) return cellText(sheet.getRow(merge.r1).getCell(merge.c1));
  return cellText(sheet.getRow(row).getCell(col));
}

function resolveRaw(sheet: Worksheet, merges: Merge[], row: number, col: number): unknown {
  const merge = findMerge(merges, row, col);
  if (merge) return cellRaw(sheet.getRow(merge.r1).getCell(merge.c1));
  return cellRaw(sheet.getRow(row).getCell(col));
}

// A real column header rarely merges across more than a handful of columns;
// the report title/"МАЪЛУМОТ" banners merge across the whole sheet width.
// Treating such a wide merge's text as blank keeps it out of both the
// identifier-column search and the per-column header path.
const MAX_HEADER_MERGE_WIDTH = 10;

function resolveHeaderText(sheet: Worksheet, merges: Merge[], row: number, col: number): string {
  const merge = findMerge(merges, row, col);
  if (merge && merge.c2 - merge.c1 + 1 > MAX_HEADER_MERGE_WIDTH) return "";
  return resolveText(sheet, merges, row, col);
}

function pickSheet(workbook: ExcelJS.Workbook): Worksheet {
  const sheet = workbook.worksheets[0];
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

  const colCount = sheet.columnCount || 50;
  for (let r = 1; r <= Math.min(scanRows, sheet.rowCount); r++) {
    for (let c = 1; c <= colCount; c++) {
      const text = resolveHeaderText(sheet, merges, r, c);
      if (!text) continue;
      if (farmerCol === null && FARMER_HEADER_RE.test(text)) {
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

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

/**
 * The report title banner (e.g. "... бўйича 15 September 08:45 кунига
 * саватда ...") carries a generation timestamp but no year. The acceptance
 * dates in the data rows always carry a full year, so that's used to
 * disambiguate — see docs/ptz-architecture.md.
 */
function detectReportGeneratedAt(
  bannerText: string,
  fallbackYear: number
): { iso: string | null; method: "title_banner" } {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{1,2}):(\d{2})/.exec(bannerText);
  if (!m) return { iso: null, method: "title_banner" };
  const [, dayStr, monthName, hh, mm] = m;
  const month = ENGLISH_MONTHS[(monthName ?? "").toLowerCase()];
  if (!month || !dayStr) return { iso: null, method: "title_banner" };
  const day = dayStr.padStart(2, "0");
  const monthStr = String(month).padStart(2, "0");
  return { iso: `${fallbackYear}-${monthStr}-${day}T${hh}:${mm}:00`, method: "title_banner" };
}

export async function parseWorkbook(buffer: Buffer, _filename: string, uploadTimestamp: Date): Promise<ParsedReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = pickSheet(workbook);
  const merges = parseMerges(sheet);
  const warnings: ImportWarning[] = [];

  const HEADER_SCAN_ROWS = 15;
  const { farmerCol, farmerHeaderBottomRow, rowNumCol } = findIdentifierColumns(sheet, merges, HEADER_SCAN_ROWS);

  const emptyResult = (): ParsedReport => ({
    reportGeneratedAt: null,
    dateDetectionMethod: "upload_time",
    dataPeriodStart: null,
    dataPeriodEnd: null,
    sheetName: sheet.name,
    rows: [],
    warnings,
    columnMap: [],
    grandTotalFromSheet: null
  });

  if (farmerCol === null) {
    warnings.push({
      severity: "ERROR",
      code: "FARMER_COLUMN_NOT_FOUND",
      message: "Could not locate the farmer name column (Хўжалик номи) in the header. Parsing aborted."
    });
    return emptyResult();
  }

  let dataStartRow = farmerHeaderBottomRow ? farmerHeaderBottomRow + 1 : null;
  if (!dataStartRow && rowNumCol !== null) {
    for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, sheet.rowCount); r++) {
      const raw = resolveRaw(sheet, merges, r, rowNumCol);
      if (normInt(raw) === 1) {
        dataStartRow = r;
        break;
      }
    }
  }
  if (!dataStartRow) {
    dataStartRow = 7; // last-resort guess matching the known real-file layout (2-row header)
    warnings.push({
      severity: "WARNING",
      code: "HEADER_BOUNDARY_GUESSED",
      message: `Could not confidently detect where the header ends; assumed data starts at row ${dataStartRow}.`
    });
  }

  const headerRows = Array.from({ length: dataStartRow - 1 }, (_, i) => i + 1);
  const colCount = sheet.columnCount || 50;

  const columnMap: ColumnMapping[] = [];
  const fieldByColumn = new Map<number, { field: string; type: string }>();
  const zoneOccurrenceIndex = new Map<string, number>();

  for (let c = 1; c <= colCount; c++) {
    if (c === farmerCol) {
      fieldByColumn.set(c, { field: "farmerName", type: "text" });
      continue;
    }
    if (rowNumCol !== null && c === rowNumCol) continue; // row number itself isn't a business field

    const segments: string[] = [];
    let last = "";
    for (const r of headerRows) {
      const text = resolveHeaderText(sheet, merges, r, c);
      if (text && text !== last) {
        segments.push(text);
        last = text;
      }
    }
    if (segments.length === 0) continue;

    const result = classifyColumn(segments, zoneOccurrenceIndex);
    columnMap.push({
      columnIndex: c,
      headerPath: segments.join(" > "),
      canonicalField: result?.field ?? null,
      confidence: result?.confidence ?? 0
    });

    if (result) {
      fieldByColumn.set(c, result);
    } else {
      warnings.push({
        severity: "INFO",
        code: "COLUMN_NOT_MAPPED",
        message: `Column ${c} ("${segments.join(" > ")}") could not be mapped to a known business field and was ignored.`,
        context: { columnIndex: c, headerPath: segments.join(" > ") }
      });
    }
  }

  const fieldColumn = new Map<string, number>();
  for (const [col, { field }] of fieldByColumn.entries()) fieldColumn.set(field, col);

  function raw(field: string, r: number): unknown {
    const col = fieldColumn.get(field);
    if (col == null) return null;
    return resolveRaw(sheet, merges, r, col);
  }

  const rows: ParsedOperationRow[] = [];
  let grandTotalFromSheet: GrandTotalCheck | null = null;
  const seenIdentityKeys = new Map<string, number>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let r = dataStartRow; r <= sheet.rowCount; r++) {
    const farmerText = normText(raw("farmerName", r));
    const rowNumRaw = rowNumCol !== null ? resolveRaw(sheet, merges, r, rowNumCol) : null;
    const rowNumValue = normInt(rowNumRaw);
    // The sheet's own grand-total row puts its "ЖАМИ:" label in the row-number
    // column (verified against the real export), not the farmer-name column —
    // farmerText is null on that row, so both are checked as possible labels.
    const rowLabelText = normText(rowNumRaw);

    const physicalKg = normNumber(raw("physicalKg", r));
    const conditionedKg = normNumber(raw("conditionedKg", r));
    const hasAnyMetric = physicalKg != null || conditionedKg != null;

    if (!farmerText && !hasAnyMetric) continue; // blank spacer row

    const grandTotalLabel = [farmerText, rowLabelText].find((t) => t && GRAND_TOTAL_TEXT_RE.test(t));
    if (grandTotalLabel && rowNumValue == null) {
      if (hasAnyMetric) {
        grandTotalFromSheet = {
          ...(physicalKg != null ? { physicalKg } : {}),
          ...(conditionedKg != null ? { conditionedKg } : {}),
          ...(normNumber(raw("amount", r)) != null ? { amount: normNumber(raw("amount", r))! } : {})
        };
      }
      warnings.push({
        severity: "INFO",
        code: "GRAND_TOTAL_ROW_SKIPPED",
        message: `Row ${r} ("${grandTotalLabel}") is the sheet's own grand-total line and was not counted as an operation.`,
        context: { row: r }
      });
      continue;
    }

    if (!farmerText) {
      warnings.push({
        severity: "WARNING",
        code: "MISSING_FARMER_NAME",
        message: `Row ${r} has data but no farmer name and was skipped.`,
        context: { row: r }
      });
      continue;
    }

    const acceptanceDate = normDate(raw("acceptanceDate", r));
    if (acceptanceDate) {
      if (!minDate || acceptanceDate < minDate) minDate = acceptanceDate;
      if (!maxDate || acceptanceDate > maxDate) maxDate = acceptanceDate;
    }

    const partial: Omit<ParsedOperationRow, "identityKey"> = {
      rowNumber: r,
      farmerName: farmerText,
      farmerInn: normInn(raw("farmerInn", r)),
      farmerRegion: normText(raw("farmerRegion", r)),
      farmerDistrict: normText(raw("farmerDistrict", r)),

      contractType: normText(raw("contractType", r)),
      contractNumber: normText(raw("contractNumber", r)),
      contractQty: normNumber(raw("contractQty", r)),

      acceptanceDate,
      acceptanceRecordNo: normText(raw("acceptanceRecordNo", r)),

      pk17Number: normText(raw("pk17Number", r)),
      pk17RegisteredAt: normDateTime(raw("pk17RegisteredAt", r)),
      pk17SignedAt: normDateTime(raw("pk17SignedAt", r)),

      batchNo: normText(raw("batchNo", r)),
      plotType: normText(raw("plotType", r)),
      plotNo: normText(raw("plotNo", r)),

      varietyDeclared: normText(raw("varietyDeclared", r)),
      generationDeclared: normText(raw("generationDeclared", r)),
      industrialGradeDeclared: normText(raw("industrialGradeDeclared", r)),
      classDeclared: normText(raw("classDeclared", r)),

      pickingMethod: normText(raw("pickingMethod", r)),

      lab2hlNumber: normText(raw("lab2hlNumber", r)),
      industrialGradeLab: normText(raw("industrialGradeLab", r)),
      classLab: normText(raw("classLab", r)),

      grossKg: normNumber(raw("grossKg", r)),
      tareKg: normNumber(raw("tareKg", r)),
      physicalKg,
      impurityPct: normNumber(raw("impurityPct", r)),
      calculatedKg: normNumber(raw("calculatedKg", r)),
      moisturePct: normNumber(raw("moisturePct", r)),
      conditionedKg,

      markup: normNumber(raw("markup", r)),
      discount: normNumber(raw("discount", r)),
      unitPrice: normNumber(raw("unitPrice", r)),
      amount: normNumber(raw("amount", r)),
      transportFee: normNumber(raw("transportFee", r)),
      seedCottonFee: normNumber(raw("seedCottonFee", r)),
      otherFeeTotal: normNumber(raw("otherFeeTotal", r)),

      buyerName: normText(raw("buyerName", r)),
      buyerInn: normInn(raw("buyerInn", r)),

      preparationPointName: normText(raw("preparationPointName", r)),
      preparationDistrict: normText(raw("preparationDistrict", r)),
      preparationRegion: normText(raw("preparationRegion", r)),

      vehicleType: normText(raw("vehicleType", r)),
      vehiclePlate: normText(raw("vehiclePlate", r)),
      trailerCount: normInt(raw("trailerCount", r)),
      trailerPlate: normText(raw("trailerPlate", r)),

      clusterName: normText(raw("clusterName", r))
    };

    const identityKey = getOperationIdentityKey(partial);
    const priorRow = seenIdentityKeys.get(identityKey);
    if (priorRow != null) {
      warnings.push({
        severity: "WARNING",
        code: "DUPLICATE_OPERATION",
        message: `Row ${r} looks like a duplicate of row ${priorRow} (same identity key: ${identityKey}).`,
        context: { row: r, duplicateOfRow: priorRow, identityKey }
      });
    } else {
      seenIdentityKeys.set(identityKey, r);
    }

    rows.push({ ...partial, identityKey });
  }

  const bannerText = resolveText(sheet, merges, 1, 1) || resolveText(sheet, merges, 1, 2);
  const fallbackYear = maxDate ? Number(maxDate.slice(0, 4)) : uploadTimestamp.getUTCFullYear();
  const bannerResult = detectReportGeneratedAt(bannerText, fallbackYear);

  let reportGeneratedAt = bannerResult.iso;
  let dateDetectionMethod: ParsedReport["dateDetectionMethod"] = "title_banner";
  if (!reportGeneratedAt) {
    if (maxDate) {
      reportGeneratedAt = `${maxDate}T00:00:00`;
      dateDetectionMethod = "max_acceptance_date";
    } else {
      reportGeneratedAt = uploadTimestamp.toISOString();
      dateDetectionMethod = "upload_time";
    }
  }

  if (rows.length === 0) {
    warnings.push({
      severity: "ERROR",
      code: "NO_ROWS_PARSED",
      message: "No acceptance operation rows could be parsed from this file."
    });
  }

  return {
    reportGeneratedAt,
    dateDetectionMethod,
    dataPeriodStart: minDate,
    dataPeriodEnd: maxDate,
    sheetName: sheet.name,
    rows,
    warnings,
    columnMap,
    grandTotalFromSheet
  };
}
