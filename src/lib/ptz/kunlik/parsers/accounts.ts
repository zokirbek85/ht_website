// AccountParser — "Мои лицевые счета в РКП": balances per RKP personal account.
// The real export carries no INN or holder column (all rows are the
// uploader's own accounts), so owner linkage happens in matching.ts via the
// account's client code; INN/holder columns are read when a future export has them.
import { loadWorkbook, MissingColumnsError, readTable, type FieldSpec } from "../utils/excel.ts";
import { cleanText, normalizeHeader } from "../utils/text.ts";
import { parseMoney } from "../utils/numbers.ts";
import { UserFacingError, type DataIssue, type ParseResult, type RkpAccountCategory, type RkpAccountRecord } from "../types.ts";

const FIELDS: FieldSpec[] = [
  { field: "bankAccount", aliases: ["Счет РКП", "Банковский счет РКП", "Банк. счет РКП"] },
  { field: "accountName", aliases: ["Наим. л/с", "Наименование л/с", "Наим.л/с"] },
  { field: "account", aliases: ["Л/с", "Лицевой счет", "Шахсий ҳисоб рақами"], required: true },
  { field: "balance", aliases: ["Баланс", "Остаток", "Қолдиқ", "Доступный остаток"], required: true },
  { field: "isDefault", aliases: ["По умолчанию счет", "По умолчанию"] },
  { field: "holderInn", aliases: ["ИНН", "СТИР", "ИНН клиента"] },
  { field: "holderName", aliases: ["Клиент", "Наименование клиента", "Владелец"] }
];

export function categorizeAccount(name: string | null): RkpAccountCategory {
  const n = normalizeHeader(name);
  if (n.includes("свободн")) return "FREE";
  if (n.includes("блокир")) return "BLOCKED";
  if (n.includes("в пути")) return "IN_TRANSIT";
  return "OTHER";
}

export async function parseAccounts(buffer: Buffer): Promise<ParseResult<RkpAccountRecord>> {
  let wb;
  try {
    wb = await loadWorkbook(buffer);
  } catch (err) {
    throw new UserFacingError("Мои лицевые счета файлини ўқиб бўлмади — файл шикастланган ёки .xlsx эмас.", [String((err as Error).message ?? err)]);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new UserFacingError("Мои лицевые счета файлида варақ йўқ.");

  let table;
  try {
    table = readTable(ws, FIELDS);
  } catch (err) {
    if (err instanceof MissingColumnsError) {
      throw new UserFacingError(`Мои лицевые счета файлида керакли ${err.missing.map((m) => `"${m}"`).join(", ")} устуни топилмади.`, err.foundHeaders);
    }
    throw err;
  }

  const issues: DataIssue[] = [];
  const records: RkpAccountRecord[] = [];
  for (const row of table.rows) {
    const account = cleanText(row.get("account")).replace(/\s/g, "") || null;
    if (!account) continue;
    const bankRaw = cleanText(row.get("bankAccount"));
    const bankMatch = /^(\d+)\s*(?:\(([A-Z]{3})\))?/.exec(bankRaw);
    const balance = parseMoney(row.get("balance"));
    if (balance == null || row.errorFields.includes("balance")) {
      issues.push({ severity: "CRITICAL", code: "INVALID_AMOUNT", source: "ACCOUNTS", row: row.rowNumber, ref: account, message: "Баланс қиймати йўқ ёки нотўғри." });
    }
    const accountName = cleanText(row.get("accountName")) || null;
    const isDefaultRaw = normalizeHeader(row.get("isDefault"));
    records.push({
      sourceRow: row.rowNumber,
      bankAccount: bankMatch?.[1] ?? (bankRaw || null),
      currency: bankMatch?.[2] ?? null,
      accountName,
      category: categorizeAccount(accountName),
      account,
      balance: balance ?? 0n,
      isDefault: isDefaultRaw ? ["да", "ha", "yes", "true", "1"].includes(isDefaultRaw) : null,
      holderInn: cleanText(row.get("holderInn")).replace(/\s/g, "") || null,
      holderName: cleanText(row.get("holderName")) || null
    });
  }

  if (records.length === 0) {
    throw new UserFacingError("Мои лицевые счета файлида битта ҳам ҳисоб топилмади (файл бўш).", table.foundHeaders);
  }
  return { records, issues, rowCount: records.length, meta: { sheetName: table.sheetName } };
}
