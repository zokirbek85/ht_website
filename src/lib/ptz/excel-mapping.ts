// Deterministic header -> canonical-field mapping for the cotton acceptance
// ledger ("basket_<buyer>.xlsx" export — one row per weighing operation).
//
// Unlike the old Сводка parser (which had to fuzzy-match an open-ended set of
// contract-type "zones"), this source is a fixed-vocabulary ERP export: the
// header is always the same two rows of Uzbek Cyrillic labels. So mapping is
// exact-text lookup (after normalization) against a known table, not
// keyword/substring guessing — safer for a 47-column sheet where several
// leaf labels ("Саноат нави", "Синфи", "Вилоят"/"Вилояти") legitimately
// repeat under different zones and must not cross-map.
//
// Columns that don't match anything are logged as COLUMN_NOT_MAPPED and
// ignored — never guessed. See docs/ptz-architecture.md for the real-file
// quirks this table was built against (esp. the mislabeled ПК-17 sub-columns).

export type LeafFieldType = "text" | "number" | "int" | "date" | "datetime" | "inn";

export type ColumnDef = {
  field: string;
  type: LeafFieldType;
  zone: string; // normalized zone text (row 5)
  leaf: string | null; // normalized leaf text (row 6), or null for a single-level header
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ёЁ]/g, "е")
    .replace(/[.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Order matches the real file's column order — not required for correctness
// (lookup is by normalized zone+leaf), but keeps this table easy to audit
// against a fresh export side by side.
// Zone/leaf strings below are the exact output of normalize() run against
// the real "basket_HAZORASP-TEXTIL..." export's header rows 5+6 (verified
// programmatically, not hand-transliterated — Uzbek Cyrillic ў/қ/ҳ/ғ are
// easy to mistype and a silent mismatch here means a whole column silently
// falls through to UNMAPPED instead of erroring).
export const COLUMN_DEFS: ColumnDef[] = [
  { field: "farmerName", type: "text", zone: "хўжалик номи", leaf: null },
  { field: "farmerInn", type: "inn", zone: "хўжалик иннси", leaf: null },
  { field: "farmerRegion", type: "text", zone: "вилояти", leaf: null },
  { field: "farmerDistrict", type: "text", zone: "тумани", leaf: null },
  { field: "contractType", type: "text", zone: "шартнома тури", leaf: null },
  { field: "contractNumber", type: "text", zone: "шартнома раками", leaf: null },
  { field: "contractQty", type: "number", zone: "шартнома миқдори", leaf: null },

  { field: "acceptanceDate", type: "date", zone: "кабул қилиш", leaf: "санаси" },
  { field: "acceptanceRecordNo", type: "text", zone: "кабул қилиш", leaf: "кайд раками" },

  { field: "pk17Number", type: "text", zone: "пк-17 раками", leaf: null },
  // The real export's row-6 sub-labels here ("Кластер" / "Фермер") are stale
  // and do not describe the data (both columns hold timestamps) — handled
  // positionally in parser.ts, not via leaf text. Listed here only so this
  // zone is recognized as mapped rather than falling through to UNMAPPED.
  { field: "pk17RegisteredAt", type: "datetime", zone: "пк-17 имзолаш холати", leaf: "__position_1__" },
  { field: "pk17SignedAt", type: "datetime", zone: "пк-17 имзолаш холати", leaf: "__position_2__" },

  { field: "batchNo", type: "text", zone: "партия", leaf: null },
  { field: "plotType", type: "text", zone: "жойлашуви", leaf: "жой тури" },
  { field: "plotNo", type: "text", zone: "жойлашуви", leaf: "жой раками" },

  { field: "varietyDeclared", type: "text", zone: "пахтанинг тури (партия бўйича)", leaf: "селекцион нави" },
  { field: "generationDeclared", type: "text", zone: "пахтанинг тури (партия бўйича)", leaf: "авлоди" },
  { field: "industrialGradeDeclared", type: "int", zone: "пахтанинг тури (партия бўйича)", leaf: "саноат нави" },
  { field: "classDeclared", type: "int", zone: "пахтанинг тури (партия бўйича)", leaf: "синфи" },

  { field: "pickingMethod", type: "text", zone: "терим услуби", leaf: null },

  { field: "lab2hlNumber", type: "text", zone: "лаборатория хулосаси", leaf: "2-хл раками" },
  { field: "industrialGradeLab", type: "int", zone: "лаборатория хулосаси", leaf: "саноат нави" },
  { field: "classLab", type: "int", zone: "лаборатория хулосаси", leaf: "синфи" },

  { field: "grossKg", type: "number", zone: "брутто кг", leaf: null },
  { field: "tareKg", type: "number", zone: "тара кг", leaf: null },
  { field: "physicalKg", type: "number", zone: "физик вазни кг", leaf: null },
  { field: "impurityPct", type: "number", zone: "ифлослиги %", leaf: null },
  { field: "calculatedKg", type: "number", zone: "хисобий вазни кг", leaf: null },
  { field: "moisturePct", type: "number", zone: "намлиги %", leaf: null },
  { field: "conditionedKg", type: "number", zone: "кондицион вазни кг", leaf: null },

  { field: "markup", type: "number", zone: "устама", leaf: null },
  { field: "discount", type: "number", zone: "чегирма", leaf: null },
  { field: "unitPrice", type: "number", zone: "харид баҳоси кг/сўм", leaf: null },
  { field: "amount", type: "number", zone: "суммаси сўм", leaf: null },

  { field: "transportFee", type: "number", zone: "кўшимча тўловлар сўм", leaf: "ташиб келтириш" },
  { field: "seedCottonFee", type: "number", zone: "кўшимча тўловлар сўм", leaf: "уруғлик пахта учун" },
  { field: "otherFeeTotal", type: "number", zone: "кўшимча тўловлар сўм", leaf: "жами қўшимча" },

  { field: "buyerName", type: "text", zone: "сотиб олувчи", leaf: null },
  { field: "buyerInn", type: "inn", zone: "сотиб олувчи инн", leaf: null },

  { field: "preparationPointName", type: "text", zone: "тайерлов маскани номи", leaf: null },
  { field: "preparationDistrict", type: "text", zone: "туман", leaf: null },
  { field: "preparationRegion", type: "text", zone: "вилоят", leaf: null },

  { field: "vehicleType", type: "text", zone: "транспорт", leaf: "тури" },
  { field: "vehiclePlate", type: "text", zone: "транспорт", leaf: "давлат ракам белгиси" },
  { field: "trailerCount", type: "int", zone: "тиркама", leaf: "сони" },
  { field: "trailerPlate", type: "text", zone: "тиркама", leaf: "давлат ракам белгилари" },

  { field: "clusterName", type: "text", zone: "кластер", leaf: null }
];

export type ClassifyResult = { field: string; type: LeafFieldType; confidence: number } | null;

/**
 * Classifies one column's flattened header path. `zoneOccurrenceIndex` is
 * how many prior columns already matched this same zone text (0-based) —
 * used only for the ПК-17 positional special-case above.
 */
export function classifyColumn(segments: string[], zoneOccurrenceIndexByZone: Map<string, number>): ClassifyResult {
  const clean = segments.map((s) => s.trim()).filter(Boolean).map(normalize);
  if (clean.length === 0) return null;

  const zone = clean[0] ?? "";
  const leaf = clean.length > 1 ? clean[clean.length - 1] : null;

  if (zone === "пк-17 имзолаш холати") {
    const idx = zoneOccurrenceIndexByZone.get(zone) ?? 0;
    zoneOccurrenceIndexByZone.set(zone, idx + 1);
    const def = COLUMN_DEFS.find((d) => d.zone === zone && d.leaf === `__position_${idx + 1}__`);
    return def ? { field: def.field, type: def.type, confidence: 0.95 } : null;
  }

  if (leaf === null) {
    const def = COLUMN_DEFS.find((d) => d.zone === zone && d.leaf === null);
    if (def) return { field: def.field, type: def.type, confidence: 1 };
    return null;
  }

  const def = COLUMN_DEFS.find((d) => d.zone === zone && d.leaf === leaf);
  if (def) return { field: def.field, type: def.type, confidence: 1 };
  return null;
}

export const IDENTIFIER_ROWNUM_RE = /^(№|n\s*\/\s*p|t\s*\/\s*r|#)$/i;
export const FARMER_HEADER_RE = /(хужалик номи|хўжалик номи|фермер номи)/i;
export const GRAND_TOTAL_TEXT_RE = /^(жами|итого|всего|хаммаси)\s*:?$/i;

export { normalize as normalizeHeaderText };
