// Type normalization helpers for raw Excel cell values. Centralized here so
// the parser never inlines ad-hoc parsing — every "what counts as blank",
// "what date formats are accepted" decision lives in one place.

const BLANK_TEXT_RE = /^(|-|—|–|n\/a|нет|йўқ)$/i;

export function normText(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (BLANK_TEXT_RE.test(s)) return null;
  return s;
}

export function normNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (BLANK_TEXT_RE.test(s)) return null;
    const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function normInt(raw: unknown): number | null {
  const n = normNumber(raw);
  return n == null ? null : Math.round(n);
}

/** "11.09.2026" -> "2026-09-11". Accepts "-" and "/" separators too. */
export function normDate(raw: unknown): string | null {
  const s = normText(raw);
  if (!s) return null;
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/.exec(s);
  if (!m) return null;
  const [, dd, mm, yyRaw] = m;
  const yyyy = (yyRaw?.length ?? 0) <= 2 ? `20${yyRaw}` : yyRaw;
  const day = (dd ?? "").padStart(2, "0");
  const month = (mm ?? "").padStart(2, "0");
  if (!yyyy || !day || !month) return null;
  return `${yyyy}-${month}-${day}`;
}

/** "18:35:47 14.09.2026" -> "2026-09-14T18:35:47" (naive Asia/Tashkent local time, no offset). */
export function normDateTime(raw: unknown): string | null {
  const s = normText(raw);
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/.exec(s);
  if (!m) {
    // Fall back to a bare date, in case the time portion is missing.
    const d = normDate(s);
    return d ? `${d}T00:00:00` : null;
  }
  const [, hh, mi, ss, dd, mm, yyRaw] = m;
  const yyyy = (yyRaw?.length ?? 0) <= 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${(mm ?? "").padStart(2, "0")}-${(dd ?? "").padStart(2, "0")}T${(hh ?? "").padStart(2, "0")}:${mi}:${ss}`;
}

export function normInn(raw: unknown): string | null {
  const s = normText(raw);
  if (!s) return null;
  return s.replace(/\s/g, "");
}
