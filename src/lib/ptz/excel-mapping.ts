// Deterministic + fuzzy semantic mapping from Excel header text to canonical
// business fields. No external AI calls — see docs/ptz-architecture.md for
// why (cost/latency/offline-reliability), and how to add an LLM fallback
// later for headers this cannot classify.

import type { ContractType, Series } from "./types.ts";

export type LeafType = "PLAN" | "DAILY" | "CUMULATIVE" | "PCT" | null;

export type ZoneMatch = Series | "IDENTIFIER" | null;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ёЁ]/g, "е")
    .replace(/[.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ZONE_KEYWORDS: Array<{ series: ZoneMatch; patterns: string[] }> = [
  { series: "FUTURES", patterns: ["фьючерс", "future"] },
  { series: "FORWARD", patterns: ["форвард", "forward"] },
  { series: "TEMPORARY_STORAGE", patterns: ["вактинча сакла", "временн", "врем сохран", "temporary storage"] },
  { series: "DELIVERED", patterns: ["топшир", "сдано", "delivered"] },
  { series: "IDENTIFIER", patterns: ["№", "n/p", "т/р", "фермер", "хужалик", "хозяйств", "farmer", "ферма номи"] }
];

// "Жами"/"Итого" at the top of a header path means the grand-total zone,
// but the same word also means "cumulative" deeper in a Futures/Forward/etc
// path — callers only classify segment[0] as a zone.
const TOTAL_ZONE_PATTERNS = ["жами", "итого", "всего", "total"];
const PCT_ZONE_PATTERNS = ["бажарил", "выполнен", "completion", "%"];

export function classifyZone(topSegment: string): ZoneMatch {
  const n = normalize(topSegment);
  if (!n) return null;
  for (const { series, patterns } of ZONE_KEYWORDS) {
    if (patterns.some((p) => n.includes(p))) return series;
  }
  if (PCT_ZONE_PATTERNS.some((p) => n.includes(p))) return "DELIVERED"; // "Бажарилиши %" zone
  if (TOTAL_ZONE_PATTERNS.some((p) => n.includes(p))) return "TOTAL";
  return null;
}

const PLAN_PATTERNS = ["режа", "план"];
const DAILY_PATTERNS = ["бир кунда", "за день", "дневн", "суточ"];
const CUMULATIVE_PATTERNS = ["жами", "итого", "всего", "накоплен", "cumulative"];
const PCT_PATTERNS = ["%", "бажарил", "выполнен", "процент"];

export function classifyLeaf(segments: string[], zone: ZoneMatch): LeafType {
  const joined = normalize(segments.join(" "));
  if (!joined) return null;

  // The whole "Бажарилиши %" / "Топширди" zone is percent-flavored by
  // definition; still distinguish daily vs cumulative sub-columns.
  if (zone === "DELIVERED" && PCT_ZONE_PATTERNS.some((p) => normalize(segments[0] ?? "").includes(p))) {
    if (DAILY_PATTERNS.some((p) => joined.includes(p))) return "PCT"; // daily completion % — stored as PCT too (MVP: cumulative wins if both present)
    return "PCT";
  }

  if (PCT_PATTERNS.some((p) => joined.includes(p))) return "PCT";
  if (PLAN_PATTERNS.some((p) => joined.includes(p))) return "PLAN";
  if (DAILY_PATTERNS.some((p) => joined.includes(p))) return "DAILY";
  if (CUMULATIVE_PATTERNS.some((p) => joined.includes(p))) return "CUMULATIVE";
  return null;
}

export type FieldClassification = {
  zone: ZoneMatch;
  leaf: LeafType;
  confidence: number;
};

/**
 * Classify a flattened header path (top row first) for one Excel column.
 * segments[0] decides the zone; the rest (or the whole path, for
 * single-level headers) decide plan/daily/cumulative/pct.
 */
export function classifyHeaderPath(segments: string[]): FieldClassification {
  const clean = segments.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return { zone: null, leaf: null, confidence: 0 };

  const zone = classifyZone(clean[0] ?? "");
  if (zone === "IDENTIFIER") return { zone, leaf: null, confidence: 0.9 };

  const leafSegments = clean.length > 1 ? clean.slice(1) : clean;
  const leaf = classifyLeaf(leafSegments, zone);

  let confidence = 0;
  if (zone) confidence += 0.5;
  if (leaf) confidence += 0.5;

  return { zone, leaf, confidence };
}

export const CONTRACT_TYPE_LABELS_UZ: Record<ContractType, string> = {
  FUTURES: "Фьючерс",
  FORWARD: "Форвард",
  TEMPORARY_STORAGE: "Вақтинча сақлаш"
};
