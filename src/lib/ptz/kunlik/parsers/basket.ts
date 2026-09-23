// BasketParser — wraps the existing, real-file-validated ledger parser
// (src/lib/ptz/parser.ts: two-row merged header, stale ПК-17 labels, ЖАМИ
// row in the №-column) instead of re-implementing it, and maps its rows onto
// HarvestRecord with harvest-method normalization and exact money.
import { parseWorkbook } from "../../parser.ts";
import { normalizeHarvestMethod } from "../utils/text.ts";
import { parseMoney } from "../utils/numbers.ts";
import { fingerprint } from "../utils/hashing.ts";
import { parseDate } from "../utils/dates.ts";
import { UserFacingError, type DataIssue, type HarvestRecord, type ParseResult } from "../types.ts";

const REQUIRED_FIELDS: { field: string; label: string }[] = [
  { field: "farmerInn", label: "Хўжалик ИННси" },
  { field: "contractNumber", label: "Шартнома раками" },
  { field: "acceptanceDate", label: "Кабул қилиш › Санаси" },
  { field: "pickingMethod", label: "Терим услуби" },
  { field: "conditionedKg", label: "Кондицион вазни, кг" }
];

export async function parseBasket(buffer: Buffer, filename: string, uploadedAt: Date): Promise<ParseResult<HarvestRecord>> {
  let parsed;
  try {
    parsed = await parseWorkbook(buffer, filename, uploadedAt);
  } catch (err) {
    throw new UserFacingError("Basket файлини ўқиб бўлмади — файл шикастланган ёки .xlsx эмас.", [String((err as Error).message ?? err)]);
  }

  const found = parsed.columnMap.map((c) => c.headerPath);
  const fatal = parsed.warnings.find((w) => w.code === "FARMER_COLUMN_NOT_FOUND");
  if (fatal) {
    throw new UserFacingError('Basket файлида "Хўжалик номи" устуни топилмади.', found);
  }
  const mapped = new Set(parsed.columnMap.map((c) => c.canonicalField).filter(Boolean));
  const missing = REQUIRED_FIELDS.filter((f) => !mapped.has(f.field)).map((f) => `"${f.label}"`);
  if (missing.length) {
    throw new UserFacingError(`Basket файлида керакли ${missing.join(", ")} устуни топилмади.`, found);
  }
  if (parsed.rows.length === 0) {
    throw new UserFacingError("Basket файлида битта ҳам қабул қатори топилмади (файл бўш).", found);
  }

  const issues: DataIssue[] = [];
  const records: HarvestRecord[] = [];

  for (const w of parsed.warnings) {
    if (w.code === "GRAND_TOTAL_MISMATCH") issues.push({ severity: "WARNING", code: w.code, source: "BASKET", message: w.message });
  }

  for (const row of parsed.rows) {
    const amount = parseMoney(row.amount);
    const acceptanceDate = parseDate(row.acceptanceDate);
    const fp = fingerprint([row.farmerInn, row.contractNumber, acceptanceDate, row.conditionedKg, row.physicalKg, row.pickingMethod, amount, row.pk17Number ?? row.acceptanceRecordNo]);
    // Natural key: the weighbridge record number is unique per weighing (0 repeats
    // in 1 204 real rows) and survives re-exports; ПК-17 is assigned later and may
    // appear between exports, so it can't be the key.
    const naturalKey = row.acceptanceRecordNo
      ? `rec:${row.contractNumber ?? ""}:${row.acceptanceRecordNo}`
      : row.pk17Number
        ? `pk17:${row.pk17Number}`
        : `fp:${fp}`;

    records.push({
      naturalKey,
      fingerprint: fp,
      sourceRow: row.rowNumber,
      inn: row.farmerInn,
      farmerName: row.farmerName,
      region: row.farmerRegion,
      district: row.farmerDistrict,
      contractType: row.contractType,
      contractNumber: row.contractNumber,
      contractQtyT: row.contractQty,
      acceptanceDate,
      acceptanceDateInvalid: row.acceptanceDate != null && acceptanceDate == null,
      recordNo: row.acceptanceRecordNo,
      pk17: row.pk17Number,
      method: normalizeHarvestMethod(row.pickingMethod),
      methodRaw: row.pickingMethod,
      physicalKg: row.physicalKg,
      conditionedKg: row.conditionedKg,
      amount,
      unitPrice: row.unitPrice
    });
  }

  return {
    records,
    issues,
    rowCount: parsed.rows.length,
    meta: {
      sheetName: parsed.sheetName,
      reportGeneratedAt: parsed.reportGeneratedAt,
      dateDetectionMethod: parsed.dateDetectionMethod,
      dataPeriodStart: parsed.dataPeriodStart,
      dataPeriodEnd: parsed.dataPeriodEnd,
      grandTotal: parsed.grandTotalFromSheet,
      unmappedColumns: parsed.columnMap.filter((c) => !c.canonicalField).map((c) => c.headerPath)
    }
  };
}
