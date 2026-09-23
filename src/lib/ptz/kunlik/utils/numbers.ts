// Numeric parsing and exact money arithmetic.
//
// Money is held as integer tiyin (1 so'm = 100 tiyin) in `bigint` — the
// TypeScript equivalent of Python's Decimal for this domain: sums, the 20%
// share and remainders are exact, with no float drift. Floats appear only at
// the presentation edge (Excel/PDF cells), via tiyinToSum().
//
// Weights stay `number` kg: every source weight is an integer or a 1–3
// decimal value, and totals stay far below 2^53.

import { cleanText } from "./text.ts";

const BLANK_RE = /^(|-|—|–|n\/a|нет|йўқ|null)$/i;

/**
 * Normalizes a human-formatted decimal string to "-1234.56" form, or null.
 * Accepts "1 234,56", "1.234,56", "1,234.56", "1234.56", "32155580.0".
 * A single separator is always the decimal mark (ru/uz convention);
 * when both appear, the last one is the decimal mark.
 */
export function normalizeDecimalString(raw: string): string | null {
  let s = cleanText(raw).replace(/\s/g, "").replace(/[^\d.,\-+]/g, "");
  if (!s || BLANK_RE.test(s)) return null;
  const neg = s.startsWith("-");
  s = s.replace(/^[+-]/, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;

  let intPart: string;
  let fracPart = "";
  if (dots && commas) {
    const decIdx = Math.max(lastDot, lastComma);
    intPart = s.slice(0, decIdx).replace(/[.,]/g, "");
    fracPart = s.slice(decIdx + 1);
  } else if (dots + commas === 1) {
    const decIdx = Math.max(lastDot, lastComma);
    intPart = s.slice(0, decIdx);
    fracPart = s.slice(decIdx + 1);
  } else if (dots + commas > 1) {
    // "1.234.567" / "1,234,567": repeated separator = thousands grouping.
    intPart = s.replace(/[.,]/g, "");
  } else {
    intPart = s;
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || (!intPart && !fracPart)) return null;
  const out = `${intPart || "0"}${fracPart ? `.${fracPart}` : ""}`;
  return neg ? `-${out}` : out;
}

export function parseNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "bigint") return Number(raw);
  const norm = normalizeDecimalString(String(raw));
  if (norm == null) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Exact decimal string → tiyin, rounding half away from zero at the 3rd fractional digit. */
function decimalStringToTiyin(norm: string): bigint {
  const neg = norm.startsWith("-");
  const [intPart = "0", frac = ""] = norm.replace(/^-/, "").split(".");
  const padded = (frac + "000").slice(0, 3);
  let tiyin = BigInt(intPart || "0") * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) tiyin += 1n;
  return neg ? -tiyin : tiyin;
}

/**
 * Money cell → tiyin. Numbers are routed through a 6-decimal string so float
 * noise like 7862.000000000001 (present in the real basket export) rounds
 * to the intended value instead of leaking into totals.
 */
export function parseMoney(raw: unknown): bigint | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "bigint") return raw * 100n;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return decimalStringToTiyin(raw.toFixed(6));
  }
  const norm = normalizeDecimalString(String(raw));
  return norm == null ? null : decimalStringToTiyin(norm);
}

/** tiyin × pct / 100, rounded half away from zero to whole tiyin. */
export function percentOf(tiyin: bigint, pct: bigint): bigint {
  const num = tiyin * pct;
  const q = num / 100n;
  const r = num % 100n;
  const abs = r < 0n ? -r : r;
  if (abs * 2n >= 100n) return num < 0n ? q - 1n : q + 1n;
  return q;
}

export function sumTiyin(values: Iterable<bigint | null | undefined>): bigint {
  let total = 0n;
  for (const v of values) if (v != null) total += v;
  return total;
}

/** Presentation only: tiyin → so'm as a JS number (exact for any realistic amount < 9e13 so'm). */
export function tiyinToSum(tiyin: bigint): number {
  return Number(tiyin) / 100;
}

/** Presentation only: tiyin → thousand so'm ("ming so'm"), the unit the manual Кунлик терим uses. */
export function tiyinToThousand(tiyin: bigint): number {
  return Number(tiyin) / 100_000;
}

export function formatSum(tiyin: bigint): string {
  const neg = tiyin < 0n;
  const abs = neg ? -tiyin : tiyin;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole},${frac}`;
}

export function formatNumber(n: number, decimals = 1): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/ /g, " ");
}

/** Rounds away float accumulation noise in kg totals (e.g. 4109.139999999). */
export function roundKg(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}
