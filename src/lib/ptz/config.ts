// Central configuration for business rules that must NOT be silently assumed
// in code — each constant here is a decision that was either confirmed with
// the client or is an explicit, documented placeholder pending confirmation.
// See docs/ptz-architecture.md §"Reporting weight & other assumptions" for
// the reasoning behind each default.

/**
 * Which weight field on an acceptance operation counts as the "actual"
 * quantity toward contract fulfillment (Шартнома бажарилиши).
 *
 * CONFIRMED with the client (2026-09-15): Кондицион вазн — the file's own
 * Суммаси (amount) column is computed as conditionedKg * unitPrice
 * (verified against the real sample file: 4090 * 7862 = 32,155,580, exactly
 * matching the "Суммаси, сўм" cell), so conditioned weight is the field the
 * business already settles contracts on.
 */
export const REPORTING_WEIGHT_FIELD: "conditionedKg" | "calculatedKg" | "physicalKg" = "conditionedKg";

/**
 * "Шартнома миқдори" (contract quantity) has no unit suffix in the source
 * header, unlike every weight column below it ("Брутто, кг" etc). Its value
 * magnitude (e.g. 223.989, 306.313) is consistent with TONS for a
 * season-long farmer contract, not kilograms — a single truckload is
 * typically 3-6 tons, and real contract totals in the sample file run into
 * the hundreds of tons. This is an inferred-but-unconfirmed assumption;
 * flagged in generated reports' methodology section. Change here if wrong.
 */
export const CONTRACT_QTY_UNIT: "tons" | "kg" = "tons";
export const CONTRACT_QTY_TO_KG = CONTRACT_QTY_UNIT === "tons" ? 1000 : 1;

/** Weight basis for the weighted-average purchase price (Sum(amount) / Sum(basis)). */
export const PRICE_WEIGHT_BASIS: "conditionedKg" | "physicalKg" = "conditionedKg";

/**
 * Default buyer filter. The source export is already scoped to one buyer,
 * but the parser doesn't hardcode this — it reads "Сотиб олувчи" per row so
 * a future multi-buyer export still works, with this as the default filter.
 */
export const DEFAULT_BUYER_NAME = "HAZORASP-TEXTIL MCHJ";

/** Contract-status thresholds (§10) — configurable, not hardcoded in analytics.ts. */
export const CONTRACT_STATUS_THRESHOLDS = {
  nearCompletionPct: 90, // >= this % and < 100% => NEAR_COMPLETION
  notStartedMaxPct: 0 // <= this % (i.e. 0) with no operations => NOT_STARTED
};

/**
 * Quality thresholds (§13). NOT confirmed by the client or present in the
 * source data — no normative moisture/impurity limits exist anywhere in the
 * sample file or prior codebase. Traffic-light quality visualizations use
 * these as a placeholder; treat every quality "status" in reports as
 * provisional until a real agronomy threshold is supplied, and the PDF/XLSX
 * methodology sections say so explicitly.
 */
export const QUALITY_THRESHOLDS_CONFIGURED = false;
export const QUALITY_THRESHOLDS = {
  moisturePctWarn: 12,
  moisturePctCritical: 15,
  impurityPctWarn: 6,
  impurityPctCritical: 9
};

/** Data-quality control thresholds (§16). */
export const CONTROL_THRESHOLDS = {
  lowAchievementPct: 20, // "unusually low achievement" — contract active > N days with < this %
  highMoisturePct: QUALITY_THRESHOLDS.moisturePctCritical,
  highImpurityPct: QUALITY_THRESHOLDS.impurityPctCritical,
  abnormalConversionMinRatio: 0.75, // conditionedKg / physicalKg below this => abnormal
  abnormalConversionMaxRatio: 1.02,
  contractNearCompletionPct: CONTRACT_STATUS_THRESHOLDS.nearCompletionPct
};

/**
 * Duplicate-operation identity. PK-17 number is unique per weighing when
 * present; a small fraction of rows have no PK-17 yet (not signed — see the
 * real sample's last row), so a composite fallback key is used for those.
 * Both are configurable here rather than hardcoded in the importer.
 */
export type DuplicateKeyStrategy = "pk17_or_composite";
export const DUPLICATE_KEY_STRATEGY: DuplicateKeyStrategy = "pk17_or_composite";

/** IANA timezone for all "today" / date-bucketing logic (§27). */
export const REPORT_TIMEZONE = "Asia/Tashkent";

/** Season deadline fallback when not set in the settings table (per year). */
export function defaultSeasonDeadline(year: number): string {
  return `${year}-12-31`;
}

/** List of assumptions surfaced verbatim in report methodology sections. */
export const DOCUMENTED_ASSUMPTIONS: string[] = [
  `Ҳисобот учун асосий вазн: КОНДИЦИОН ВАЗН (мижоз томонидан тасдиқланган, ${new Date().getFullYear()}).`,
  `Шартнома миқдори ўлчов бирлиги: ТОННА (манба файлида бирлик кўрсатилмаган — қиймат кўламидан хулоса қилинган, тасдиқланмаган тахмин).`,
  "Сифат кўрсаткичлари (намлик/ифлослик) учун норматив чегаралар мижоздан ёки манба файлидан олинмаган — қуйидаги чегаралар вақтинчалик ва созланувчи (config.ts)."
];
