// Business rules and tunables for the Кунлик терим pipeline. Every rule here
// was either reproduced from the hand-maintained "Кунлик терим.xlsx" against
// the real source files (docs/kunlik-terim/DATA_PROFILE.md §6) or is marked
// BUSINESS_RULE_REQUIRED — nothing is a silent assumption.
import os from "node:os";
import path from "node:path";

export { REPORT_TIMEZONE } from "../config.ts";

/**
 * "20 % суммаси" = 100 % суммаси × 20 %, and
 * "Терим пули учун колдик" = 20 % суммаси − терим учун ўтказилган маблағ.
 * Verified: reference formulas `=+H10*20%` and `=+I10-K10`.
 */
export const PICKING_MONEY_SHARE_PCT = 20n;

/**
 * Daily weight = SUM(Кондицион вазни) grouped by Кабул қилиш санаси × Терим услуби.
 * Verified to the kilogram against the reference report for 11–19.09.2026.
 * (Same field the existing analytics module uses — config.ts REPORTING_WEIGHT_FIELD.)
 */
export const HARVEST_WEIGHT_FIELD = "conditionedKg" as const;

/**
 * Which shipment statuses count toward shipped quantity. Every real row is
 * "Approved" (→ ACTIVE); anything else is shown but not summed until the
 * business says otherwise.
 */
export const SHIPMENT_COUNTED_STATUSES: readonly string[] = ["ACTIVE"];

/**
 * BUSINESS_RULE_REQUIRED: whether "Кол-во сделки − Σ Кол-во отгрузки" is an
 * economic remainder. Until confirmed, reports show both quantities side by
 * side and never label a difference as "қолдиқ".
 */
export const SHIPMENT_REMAINING_RULE_CONFIRMED = false;

/** Minimum confidence for an automatic match; anything lower goes to manual review. */
export const MATCH_MIN_CONFIDENCE = 0.8;

export const MATCH_CONFIDENCE = {
  INN: 1.0,
  CONTRACT: 0.95,
  ACCOUNT: 0.9,
  NAME_STRONG: 0.8
} as const;

/**
 * RKP personal-account numbers end in a 9-digit client code shared by every
 * account of the same client (all six company accounts end in the same code;
 * each farmer's in-transit account has its own). Used only as the 3rd-priority
 * account match — see DATA_MODEL.md.
 */
export const RKP_CLIENT_CODE_LENGTH = 9;

/** Scheduled refresh interval (minutes). Allowed values; overridable via settings key `refresh_interval_minutes`. */
export const REFRESH_INTERVAL_OPTIONS = [30, 60] as const;
export const DEFAULT_REFRESH_INTERVAL_MINUTES = Number(process.env.PTZ_REFRESH_INTERVAL_MINUTES ?? 60);

/** Per-session temp files live under <root>/<session_id>/ and are deleted after processing. */
export function tempRoot(): string {
  return process.env.PTZ_TMP_DIR ?? path.join(os.tmpdir(), "harvest");
}

/** Abandoned upload sessions (never completed) are discarded after this long. */
export const SESSION_TTL_HOURS = 24;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
