// PaymentParser — "Историческая выписка" (RKP bank statement).
//
// Real structure (DATA_PROFILE.md §2): a meta block (client, client INN,
// statement account, period), a header row, one row per transaction leg,
// and an "Итого:" footer. Every payment is two legs — the statement owner's
// own block/unblock leg (counterparty INN = client INN) and the payee's leg —
// so owner legs are flagged `isCompanySide` and excluded from farmer totals
// rather than silently summed twice.
import type { Worksheet } from "exceljs";
import { findLabeledValue, loadWorkbook, MissingColumnsError, readCell, readTable, type FieldSpec } from "../utils/excel.ts";
import { cleanText } from "../utils/text.ts";
import { parseMoney } from "../utils/numbers.ts";
import { parseDateTime } from "../utils/dates.ts";
import { fingerprint } from "../utils/hashing.ts";
import { UserFacingError, type DataIssue, type ParseResult, type PaymentRecord } from "../types.ts";

const FIELDS: FieldSpec[] = [
  { field: "txId", aliases: ["ID транзакции", "ID транзакция", "Transaction ID", "Номер транзакции"] },
  { field: "attributes", aliases: ["Атрибуты", "Attributes"] },
  { field: "opDate", aliases: ["Дата транзакции", "Дата операции", "Дата проводки", "Операция санаси"], required: true },
  { field: "counterpartyName", aliases: ["Наим. контрагента", "Наименование контрагента", "Контрагент"] },
  { field: "counterpartyInn", aliases: ["ИНН контрагента", "СТИР контрагента", "ИНН", "СТИР"] },
  { field: "counterpartyAccount", aliases: ["Л/с контрагента", "Лицевой счет контрагента", "Счет контрагента"] },
  { field: "accountName", aliases: ["Наим.л/с", "Наименование л/с"] },
  { field: "debit", aliases: ["Дебет", "Debit"], required: true },
  { field: "credit", aliases: ["Кредит", "Credit"], required: true },
  { field: "details", aliases: ["Детали", "Назначение платежа", "Назначение", "Тўлов мақсади"] },
  { field: "documentNumber", aliases: ["Номер документа", "№ документа"] }
];

const TOTAL_LABEL_RE = /^(итого|жами|всего)\s*:?$/i;

/** All text above the header row, e.g. "Лиц.счет клиента : 2020…; Дата тран. от : 01.09.2026; …". */
function metaText(ws: Worksheet, headerRow: number): string {
  const parts: string[] = [];
  for (let r = 1; r < headerRow; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const t = cleanText(readCell(cell).value);
      if (t) parts.push(t);
    });
  }
  return parts.join(" | ");
}

function text(v: unknown): string | null {
  const t = cleanText(v);
  return t ? t : null;
}

export async function parsePayments(buffer: Buffer): Promise<ParseResult<PaymentRecord>> {
  let wb;
  try {
    wb = await loadWorkbook(buffer);
  } catch (err) {
    throw new UserFacingError("Историческая выписка файлини ўқиб бўлмади — файл шикастланган ёки .xlsx эмас.", [String((err as Error).message ?? err)]);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new UserFacingError("Историческая выписка файлида варақ йўқ.");

  let table;
  try {
    table = readTable(ws, FIELDS);
  } catch (err) {
    if (err instanceof MissingColumnsError) {
      throw new UserFacingError(`Историческая выписка файлида керакли ${err.missing.map((m) => `"${m}"`).join(", ")} устуни топилмади.`, err.foundHeaders);
    }
    throw err;
  }

  const clientInn = text(findLabeledValue(ws, /^клиент\s+инн/i))?.replace(/\s/g, "") ?? null;
  const headerLine = metaText(ws, table.headerRow);
  const statementAccount = /Лиц\.?\s*сч[её]т\s+клиента\s*:\s*(\d+)/i.exec(headerLine)?.[1] ?? null;
  const periodFrom = /от\s*:\s*([\d.]+)/i.exec(headerLine)?.[1] ?? null;
  const periodTo = /до\s*:\s*([\d.]+)/i.exec(headerLine)?.[1] ?? null;

  const issues: DataIssue[] = [];
  const records: PaymentRecord[] = [];
  let footer: { debit: bigint | null; credit: bigint | null } | null = null;

  for (const row of table.rows) {
    const labelCells = [row.get("accountName"), row.get("counterpartyAccount"), row.get("txId")].map(cleanText);
    const opDateRaw = row.get("opDate");
    if (!opDateRaw && labelCells.some((t) => TOTAL_LABEL_RE.test(t))) {
      footer = { debit: parseMoney(row.get("debit")), credit: parseMoney(row.get("credit")) };
      continue;
    }

    const opDateTime = parseDateTime(opDateRaw);
    const debit = parseMoney(row.get("debit"));
    const credit = parseMoney(row.get("credit"));
    const txId = text(row.get("txId"));
    const counterpartyInn = text(row.get("counterpartyInn"))?.replace(/\s/g, "") ?? null;
    const counterpartyAccount = text(row.get("counterpartyAccount"))?.replace(/\s/g, "") ?? null;
    const attrs = cleanText(row.get("attributes"));
    const details = text(row.get("details"));

    if (!opDateTime) {
      issues.push({
        severity: "CRITICAL",
        code: opDateRaw ? "INVALID_DATE" : "MISSING_DATE",
        source: "PAYMENTS",
        row: row.rowNumber,
        ref: txId ?? undefined,
        message: opDateRaw ? `Тўлов санаси нотўғри: "${cleanText(opDateRaw)}".` : "Тўлов санаси йўқ."
      });
    }
    if (row.errorFields.length || (debit == null && credit == null) || (debit ?? 0n) < 0n || (credit ?? 0n) < 0n) {
      issues.push({
        severity: "CRITICAL",
        code: "INVALID_AMOUNT",
        source: "PAYMENTS",
        row: row.rowNumber,
        ref: txId ?? undefined,
        message: "Дебет/Кредит суммаси йўқ, манфий ёки Excel хатоси (#REF!/#VALUE!)."
      });
    }

    const dealNumber = /D:\s*(\d+)/.exec(attrs)?.[1] ?? /сд\.?\s*№\s*(\d+)/i.exec(details ?? "")?.[1] ?? null;
    const clearingContract = /C:\s*(\d+)/.exec(attrs)?.[1] ?? null;
    const invoiceNo = text(row.get("documentNumber")) ?? /с\/ф\.?\s*№\s*([^\s,]+)/i.exec(details ?? "")?.[1] ?? null;
    const opDate = opDateTime?.slice(0, 10) ?? null;
    const net = (debit ?? 0n) - (credit ?? 0n);

    const fp = fingerprint([opDateTime, counterpartyAccount, net, invoiceNo, txId]);
    records.push({
      naturalKey: txId ? `tx:${txId}` : `fp:${fp}`,
      fingerprint: fp,
      sourceRow: row.rowNumber,
      txId,
      opDateTime,
      opDate,
      counterpartyName: text(row.get("counterpartyName")),
      counterpartyInn,
      counterpartyAccount,
      accountName: text(row.get("accountName")),
      debit: debit ?? 0n,
      credit: credit ?? 0n,
      details,
      dealNumber,
      clearingContract,
      invoiceNo,
      isReversal: /возврат|qaytar|қайтар/i.test(details ?? ""),
      isCompanySide: clientInn != null && counterpartyInn === clientInn,
      statementAccount,
      clientInn
    });
  }

  if (footer && footer.debit != null) {
    const sum = records.reduce((a, r) => a + r.debit, 0n);
    if (sum !== footer.debit) {
      issues.push({
        severity: "WARNING",
        code: "STATEMENT_TOTAL_MISMATCH",
        source: "PAYMENTS",
        message: `Выпискадаги "Итого" дебет (${footer.debit}) қаторлар йиғиндисидан (${sum}) фарқ қилади (тийин).`
      });
    }
  }
  if (records.length === 0) {
    throw new UserFacingError("Историческая выписка файлида битта ҳам транзакция топилмади (файл бўш).", table.foundHeaders);
  }

  return {
    records,
    issues,
    rowCount: records.length,
    meta: { sheetName: table.sheetName, clientInn, statementAccount, periodFrom, periodTo, headerRow: table.headerRow }
  };
}
