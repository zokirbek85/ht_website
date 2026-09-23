// FileClassifier — decides which of the four sources an uploaded workbook is.
// Filename first (cheap, and how users actually name these exports), then the
// workbook's sheet names and top rows. Returns null when neither is conclusive,
// so the bot can ask the user instead of guessing.
import { loadWorkbook, sheetPreviewText } from "./utils/excel.ts";
import { cleanText, normalizeHeader } from "./utils/text.ts";
import type { SourceType } from "./types.ts";

export type Classification = { type: SourceType; by: "filename" | "content" } | null;

const FILENAME_RULES: { type: SourceType; re: RegExp }[] = [
  { type: "BASKET", re: /basket|саватда/ },
  { type: "PAYMENTS", re: /историческ\w*[\s_]*выписк|выписк|vypisk|statement/ },
  { type: "ACCOUNTS", re: /лицевые[\s_]*сч[её]т|лицев\w*[\s_]*сч|ркп[\s_]*сч|accounts?/ },
  { type: "SHIPMENTS", re: /shipments?|отгрузк/ }
];

export function classifyByFilename(filename: string): SourceType | null {
  const name = cleanText(filename).toLowerCase().replace(/ё/g, "е");
  const hits = FILENAME_RULES.filter((r) => r.re.test(name)).map((r) => r.type);
  return hits.length === 1 ? hits[0]! : null;
}

/** Signals from DATA_PROFILE.md §7 — each type needs all of its markers present. */
const CONTENT_RULES: { type: SourceType; all: string[] }[] = [
  { type: "BASKET", all: ["хўжалик иннси", "терим услуби"] },
  { type: "PAYMENTS", all: ["id транзакции", "дебет", "кредит"] },
  { type: "ACCOUNTS", all: ["счет ркп", "баланс"] },
  { type: "SHIPMENTS", all: ["номер сделки", "кол-во отгрузки"] }
];

export async function classifyByContent(buffer: Buffer): Promise<SourceType | null> {
  let wb;
  try {
    wb = await loadWorkbook(buffer);
  } catch {
    return null;
  }
  if (wb.worksheets.some((w) => normalizeHeader(w.name) === "shipments")) return "SHIPMENTS";
  const texts = new Set(wb.worksheets.slice(0, 3).flatMap((w) => sheetPreviewText(w, 12)));
  const joined = [...texts].join(" | ");
  const hits = CONTENT_RULES.filter((r) => r.all.every((m) => texts.has(m) || joined.includes(m))).map((r) => r.type);
  return hits.length === 1 ? hits[0]! : null;
}

export async function classifyFile(filename: string, buffer: Buffer): Promise<Classification> {
  const byName = classifyByFilename(filename);
  if (byName) return { type: byName, by: "filename" };
  const byContent = await classifyByContent(buffer);
  return byContent ? { type: byContent, by: "content" } : null;
}

export const SOURCE_LABELS: Record<SourceType, string> = {
  BASKET: "Basket",
  PAYMENTS: "Историческая выписка",
  ACCOUNTS: "Мои лицевые счета в РКП",
  SHIPMENTS: "Shipments"
};
