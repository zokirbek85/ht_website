// ShipmentParser — exchange "Shipments" export (one row per shipment document of a deal).
//
// Two real-file facts that shape this (DATA_PROFILE.md §4):
// - "Номер контракта" is the buyer's exchange clearing contract (119020 on
//   every row), NOT the farmer contract. The farmer contract key is
//   "Номер сделки" (= basket "Шартнома раками" = statement "D:" attribute).
// - "Стоимость доставки" equals Кол-во отгрузки × price — a shipment value,
//   stored under its source name and never summed as a delivery cost.
import { loadWorkbook, MissingColumnsError, readTable, type FieldSpec } from "../utils/excel.ts";
import { cleanText, normalizeHeader } from "../utils/text.ts";
import { parseMoney, parseNumber } from "../utils/numbers.ts";
import { isUnparseableDate, parseDate } from "../utils/dates.ts";
import { fingerprint } from "../utils/hashing.ts";
import { UserFacingError, type DataIssue, type ParseResult, type ShipmentRecord, type ShipmentStatus } from "../types.ts";

const FIELDS: FieldSpec[] = [
  { field: "dealNumber", aliases: ["Номер сделки", "Сделка №", "Битим рақами"], required: true },
  { field: "dealDate", aliases: ["Дата сделки"] },
  { field: "contractNumber", aliases: ["Номер контракта", "Контракт №"] },
  { field: "sellerName", aliases: ["Имя продавца", "Продавец", "Наименование продавца"] },
  { field: "sellerBroker", aliases: ["Имя брокера продавца", "Брокер продавца"] },
  { field: "sellerInn", aliases: ["ИНН продавца", "СТИР продавца"] },
  { field: "buyerName", aliases: ["Имя покупатель", "Имя покупателя", "Покупатель"] },
  { field: "buyerBroker", aliases: ["Имя брокера покупатель", "Имя брокера покупателя", "Брокер покупателя"] },
  { field: "productName", aliases: ["Наименование товара", "Товар"] },
  { field: "documentNumber", aliases: ["Номер документа", "Документ №"] },
  { field: "documentDate", aliases: ["Дата документа"] },
  { field: "shipmentQty", aliases: ["Кол-во отгрузки", "Количество отгрузки"], required: true },
  { field: "deliveryCost", aliases: ["Стоимость доставки"] },
  { field: "dealQty", aliases: ["Кол-во сделки", "Количество сделки"] },
  { field: "dealAmount", aliases: ["Сумма сделки"] },
  { field: "unit", aliases: ["Ед. изм", "Ед.изм.", "Единица измерения"] },
  { field: "shipmentTimer", aliases: ["Таймер отгрузки"] },
  { field: "status", aliases: ["Статус", "Status", "Ҳолат"] }
];

/** Configurable status mapping; unmapped raw values become UNKNOWN (flagged in Data Quality). */
export const SHIPMENT_STATUS_MAP: Record<string, ShipmentStatus> = {
  approved: "ACTIVE",
  одобрено: "ACTIVE",
  одобрен: "ACTIVE",
  утверждено: "ACTIVE",
  active: "ACTIVE",
  pending: "PENDING",
  "в ожидании": "PENDING",
  "на рассмотрении": "PENDING",
  rejected: "REJECTED",
  отклонено: "REJECTED",
  отклонен: "REJECTED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  отменено: "CANCELLED",
  отменен: "CANCELLED"
};

export function normalizeShipmentStatus(raw: unknown): ShipmentStatus {
  return SHIPMENT_STATUS_MAP[normalizeHeader(raw)] ?? "UNKNOWN";
}

function unitToKgFactor(unit: string | null): number | null {
  const u = normalizeHeader(unit);
  if (!u || /^(кг|килограмм|kg|kilogramm?)$/.test(u)) return 1;
  if (/^(т|тн|тонна|тонн|t|ton|tonna)$/.test(u)) return 1000;
  return null;
}

function text(v: unknown): string | null {
  const t = cleanText(v);
  return t ? t : null;
}

export async function parseShipments(buffer: Buffer): Promise<ParseResult<ShipmentRecord>> {
  let wb;
  try {
    wb = await loadWorkbook(buffer);
  } catch (err) {
    throw new UserFacingError("Shipments файлини ўқиб бўлмади — файл шикастланган ёки .xlsx эмас.", [String((err as Error).message ?? err)]);
  }
  const ws = wb.worksheets.find((w) => normalizeHeader(w.name) === "shipments") ?? wb.worksheets[0];
  if (!ws) throw new UserFacingError("Shipments файлида варақ йўқ.");

  let table;
  try {
    table = readTable(ws, FIELDS);
  } catch (err) {
    if (err instanceof MissingColumnsError) {
      throw new UserFacingError(`Shipments файлида керакли ${err.missing.map((m) => `"${m}"`).join(", ")} устуни топилмади.`, err.foundHeaders);
    }
    throw err;
  }

  const issues: DataIssue[] = [];
  const records: ShipmentRecord[] = [];
  for (const row of table.rows) {
    const dealNumber = text(row.get("dealNumber"));
    if (!dealNumber) continue;
    const unit = text(row.get("unit"));
    const factor = unitToKgFactor(unit);
    if (factor == null) {
      issues.push({ severity: "WARNING", code: "UNKNOWN_UNIT", source: "SHIPMENTS", row: row.rowNumber, ref: dealNumber, message: `Номаълум ўлчов бирлиги "${unit}" — миқдор кг деб олинди.` });
    }
    const k = factor ?? 1;
    const shipQty = parseNumber(row.get("shipmentQty"));
    const dealQty = parseNumber(row.get("dealQty"));
    const documentNumber = text(row.get("documentNumber"));
    const documentDateRaw = row.get("documentDate");
    const documentDate = parseDate(documentDateRaw);
    const statusRaw = text(row.get("status"));
    const status = normalizeShipmentStatus(statusRaw);

    if (isUnparseableDate(documentDateRaw)) {
      issues.push({ severity: "CRITICAL", code: "INVALID_DATE", source: "SHIPMENTS", row: row.rowNumber, ref: dealNumber, message: `Ҳужжат санаси нотўғри: "${cleanText(documentDateRaw)}".` });
    }
    if (shipQty == null || shipQty < 0 || row.errorFields.includes("shipmentQty")) {
      issues.push({ severity: "CRITICAL", code: shipQty != null && shipQty < 0 ? "NEGATIVE_WEIGHT" : "INVALID_WEIGHT", source: "SHIPMENTS", row: row.rowNumber, ref: dealNumber, message: "Кол-во отгрузки йўқ, манфий ёки Excel хатоси." });
    }
    if (status === "UNKNOWN") {
      issues.push({ severity: "WARNING", code: "UNKNOWN_STATUS", source: "SHIPMENTS", row: row.rowNumber, ref: dealNumber, message: `Номаълум статус "${statusRaw ?? ""}" — жамига қўшилмади.` });
    }

    const shipmentQtyKg = shipQty == null ? null : shipQty * k;
    const fp = fingerprint([dealNumber, text(row.get("contractNumber")), documentNumber, documentDate, shipmentQtyKg, statusRaw]);
    records.push({
      naturalKey: `shp:${dealNumber}:${documentNumber ?? ""}:${documentDate ?? ""}`,
      fingerprint: fp,
      sourceRow: row.rowNumber,
      dealNumber,
      dealDate: parseDate(row.get("dealDate")),
      contractNumber: text(row.get("contractNumber")),
      sellerName: text(row.get("sellerName")),
      sellerBroker: text(row.get("sellerBroker")),
      sellerInn: text(row.get("sellerInn"))?.replace(/\s/g, "") ?? null,
      buyerName: text(row.get("buyerName")),
      buyerBroker: text(row.get("buyerBroker")),
      productName: text(row.get("productName")),
      documentNumber,
      documentDate,
      shipmentQtyKg,
      deliveryCost: parseMoney(row.get("deliveryCost")),
      dealQtyKg: dealQty == null ? null : dealQty * k,
      dealAmount: parseMoney(row.get("dealAmount")),
      unit,
      shipmentTimer: text(row.get("shipmentTimer")),
      status,
      statusRaw
    });
  }

  if (records.length === 0) {
    throw new UserFacingError("Shipments файлида битта ҳам отгрузка топилмади (файл бўш).", table.foundHeaders);
  }
  return { records, issues, rowCount: records.length, meta: { sheetName: table.sheetName, duplicateHeaders: table.duplicateHeaders } };
}
