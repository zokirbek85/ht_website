// Text normalization shared by every parser and the matching engine.
// Header text and farmer names arrive in Uzbek Cyrillic, Uzbek Latin and
// Russian, with BOMs, NBSPs, zero-width characters and five different
// apostrophe glyphs (the basket export even writes o' as "O_"), so all
// comparisons go through these functions — never raw string equality.

const INVISIBLE_RE = /[﻿​-‍⁠­]/g;
const SPACE_LIKE_RE = /[  -   　\t\r\n]+/g;
const APOSTROPHES_RE = /[`'‘’ʻʼ´ʹ′]/g;

export function cleanText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(INVISIBLE_RE, "").replace(SPACE_LIKE_RE, " ").replace(/ {2,}/g, " ").trim();
}

/** Lowercased, ё→е, apostrophes unified, punctuation → space. For header alias lookup. */
export function normalizeHeader(raw: unknown): string {
  return cleanText(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(APOSTROPHES_RE, "'")
    .replace(/[.,:;()"«»№#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Uzbek + Russian Cyrillic → Uzbek Latin (official 1995 alphabet, simplified:
// o'/g' keep their apostrophe here; name normalization strips it after).
const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o'", қ: "q", ғ: "g'", ҳ: "h"
};

export function transliterateToLatin(raw: string): string {
  let out = "";
  for (const ch of raw.toLowerCase()) out += CYR_TO_LAT[ch] ?? ch;
  return out;
}

// Legal-form tokens that differ between sources for the same farm
// ("… FX" in the basket, "FX …" or quoted in the bank statement, "МЧЖ"/"MCHJ").
const LEGAL_FORM_TOKENS = new Set([
  "fx", "fh", "fxk", "mchj", "mchzh", "mas'uliyati", "masuliyati", "cheklangan", "jamiyat", "jamiyati",
  "xk", "qk", "tx", "dx", "ooo", "llc", "ok", "f/x"
]);

/**
 * Canonical farmer-name key: Latin, uppercase-insensitive, no apostrophes,
 * quotes, punctuation or legal-form suffixes. "\"POLVON QO_SHAR\" FX",
 * "POLVON QO'SHAR FX" and "Полвон қўшар" all normalize to "polvon qoshar".
 */
export function normalizeFarmerName(raw: unknown): string {
  const latin = transliterateToLatin(cleanText(raw)).replace(/ё/g, "yo");
  const tokens = latin
    .replace(/_/g, "'")
    .replace(APOSTROPHES_RE, "'")
    .replace(/[-–—/\\.,;:()"«»№]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !LEGAL_FORM_TOKENS.has(t) && !LEGAL_FORM_TOKENS.has(t.replace(/'/g, "")));
  return tokens.join(" ").replace(/'/g, "").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((cur[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** 0..1 similarity of two already-normalized names, word-order insensitive. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const sa = a.split(" ").sort().join(" ");
  const sb = b.split(" ").sort().join(" ");
  const dist = levenshtein(sa, sb);
  return 1 - dist / Math.max(sa.length, sb.length);
}

export type HarvestMethod = "HAND" | "MACHINE" | "UNKNOWN";

/** "1-Qo`l terimi", "Қўл терими", "Кул терим", "Qo'l" → HAND; "Mashina terimi", "Машина терими" → MACHINE. */
export function normalizeHarvestMethod(raw: unknown): HarvestMethod {
  const s = transliterateToLatin(cleanText(raw)).replace(APOSTROPHES_RE, "").replace(/_/g, "");
  if (!s) return "UNKNOWN";
  // Matched after transliteration, so Russian "ручной"/"машинный" arrive as "ruchn…"/"mashin…".
  if (/\b\d*-?\s*(qol|kul|qul)\b|qol\s*terim|ruchn|\bhand\b/.test(s)) return "HAND";
  if (/mashin|machine|kombayn/.test(s)) return "MACHINE";
  return "UNKNOWN";
}
