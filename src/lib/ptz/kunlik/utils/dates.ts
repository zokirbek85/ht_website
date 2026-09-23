// Date parsing for the four sources. All business dates are calendar dates
// in Asia/Tashkent. ExcelJS hands back real date cells as JS Dates whose UTC
// fields hold the naive wall-clock value (Excel dates carry no zone), so UTC
// getters are the correct way to read them — converting through a timezone
// here would shift 23:30 operations into the next day.
import { REPORT_TIMEZONE } from "../config.ts";
import { cleanText } from "./text.ts";

export type IsoDate = string; // YYYY-MM-DD
export type IsoDateTime = string; // YYYY-MM-DDTHH:MM:SS (naive, Asia/Tashkent)

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

function fromParts(y: number, m: number, d: number, hh = 0, mi = 0, ss = 0): IsoDateTime | null {
  if (!validYmd(y, m, d) || hh > 23 || mi > 59 || ss > 59) return null;
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}`;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Any date-ish cell → naive ISO datetime, or null if it isn't a real date.
 * Accepts Date objects, Excel serial numbers, "dd.mm.yyyy[ hh:mm[:ss]]",
 * "hh:mm:ss dd.mm.yyyy" (basket ПК-17 format), "yyyy-mm-dd[Thh:mm:ss]".
 */
export function parseDateTime(raw: unknown): IsoDateTime | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return fromParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate(), raw.getUTCHours(), raw.getUTCMinutes(), raw.getUTCSeconds());
  }
  if (typeof raw === "number") {
    if (raw < 20000 || raw > 80000) return null; // outside 1954..2118 — not a date serial
    return parseDateTime(new Date(EXCEL_EPOCH_MS + Math.round(raw * 86400) * 1000));
  }
  const s = cleanText(raw);
  let m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const y = Number(m[3]!.length <= 2 ? `20${m[3]}` : m[3]);
    return fromParts(y, Number(m[2]), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/.exec(s);
  if (m) {
    const y = Number(m[6]!.length <= 2 ? `20${m[6]}` : m[6]);
    return fromParts(y, Number(m[5]), Number(m[4]), Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  return null;
}

export function parseDate(raw: unknown): IsoDate | null {
  return parseDateTime(raw)?.slice(0, 10) ?? null;
}

/** True when the cell has content but it could not be read as a date — an INVALID_DATE, not a missing one. */
export function isUnparseableDate(raw: unknown): boolean {
  return cleanText(raw instanceof Date ? "x" : raw) !== "" && parseDateTime(raw) == null;
}

/** Current wall-clock time in Asia/Tashkent. */
export function nowInTashkent(now: Date = new Date()): { date: IsoDate; time: string; iso: IsoDateTime } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: REPORT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date, time, iso: `${date}T${time}:${parts.second}` };
}

/** "2026-09-23" → "23.09.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-09-23T14:30:00" → "23.09.2026 14:30" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatDate(iso)} ${iso.slice(11, 16)}`;
}
