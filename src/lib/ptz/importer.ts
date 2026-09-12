import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir, getDb, PARSER_VERSION, SCHEMA_VERSION } from "./db.ts";
import { parseWorkbook } from "./parser.ts";
import { logAudit } from "./audit.ts";
import { SERIES, type ImportWarning, type ParsedFarmerRow, type Series } from "./types.ts";

export type ImportOutcome =
  | { status: "duplicate"; reportId: number; reportDate: string }
  | {
      status: "success" | "partial";
      reportId: number;
      reportDate: string;
      warnings: ImportWarning[];
      farmerCount: number;
    }
  | { status: "failed"; warnings: ImportWarning[] };

export type ImportActor = { telegramId: string; username: string | null };

const CONSISTENCY_ABS_THRESHOLD = 1; // tons
const CONSISTENCY_REL_THRESHOLD = 0.05; // 5%

export async function importExcelReport(
  buffer: Buffer,
  filename: string,
  uploadTimestamp: Date,
  actor: ImportActor
): Promise<ImportOutcome> {
  const db = getDb();
  const sourceHash = createHash("sha256").update(buffer).digest("hex");

  const existing = db.prepare("SELECT id, report_date FROM reports WHERE source_hash = ?").get(sourceHash) as
    | { id: number; report_date: string }
    | undefined;
  if (existing) {
    logAudit("IMPORT_DUPLICATE", actor, { filename, sourceHash });
    return { status: "duplicate", reportId: existing.id, reportDate: existing.report_date };
  }

  const parsed = await parseWorkbook(buffer, filename, uploadTimestamp);
  const warnings = [...parsed.warnings];

  if (parsed.rows.length === 0) {
    logAudit("IMPORT_FAILED", actor, { filename, reason: "no_rows_parsed", warnings: warnings.length });
    return { status: "failed", warnings };
  }

  validateRows(parsed.rows, warnings);

  const isFirstReportEver = (db.prepare("SELECT COUNT(*) AS c FROM reports").get() as { c: number }).c === 0;
  if (isFirstReportEver) {
    warnings.push({
      severity: "INFO",
      code: "BASELINE_SNAPSHOT",
      message: "This is the first imported report — no prior data exists for daily-delta comparisons."
    });
  }

  const rawFilePath = saveRawFile(buffer, filename, sourceHash);

  const previousForDate = db
    .prepare("SELECT id FROM reports WHERE report_date = ? AND is_active = 1")
    .get(parsed.reportDate) as { id: number } | undefined;

  const errorCountPre = warnings.filter((w) => w.severity === "ERROR").length;
  const status: "success" | "partial" = errorCountPre > 0 ? "partial" : "success";

  db.exec("BEGIN");
  try {
    if (previousForDate) {
      db.prepare("UPDATE reports SET is_active = 0 WHERE id = ?").run(previousForDate.id);
      warnings.push({
        severity: "INFO",
        code: "REPORT_REPLACED",
        message: `Replaced the previous import for ${parsed.reportDate} (report #${previousForDate.id}).`
      });
    }

    const insertReport = db.prepare(
      `INSERT INTO reports
        (report_date, source_filename, source_hash, imported_at, imported_by, telegram_user_id, status,
         parser_version, schema_version, date_detection_method, is_active, warning_count, error_count, raw_file_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    );
    const info = insertReport.run(
      parsed.reportDate,
      filename,
      sourceHash,
      new Date().toISOString(),
      actor.username,
      actor.telegramId,
      status,
      PARSER_VERSION,
      SCHEMA_VERSION,
      parsed.dateDetectionMethod,
      warnings.length,
      errorCountPre,
      rawFilePath
    );
    const reportId = Number(info.lastInsertRowid);

    const upsertMetric = db.prepare(
      `INSERT INTO farmer_metrics
        (report_id, farmer_id, series, plan_qty, source_daily_qty, source_cumulative_qty, calculated_daily_delta, completion_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(report_id, farmer_id, series) DO UPDATE SET
         plan_qty = excluded.plan_qty,
         source_daily_qty = excluded.source_daily_qty,
         source_cumulative_qty = excluded.source_cumulative_qty,
         calculated_daily_delta = excluded.calculated_daily_delta,
         completion_pct = excluded.completion_pct`
    );
    const previousCumStmt = db.prepare(
      `SELECT fm.source_cumulative_qty AS cum
       FROM farmer_metrics fm
       JOIN reports r ON r.id = fm.report_id
       WHERE fm.farmer_id = ? AND fm.series = ? AND r.is_active = 1 AND r.report_date < ?
       ORDER BY r.report_date DESC LIMIT 1`
    );

    for (const row of parsed.rows) {
      const regionId = row.region ? getOrCreateRegion(row.region) : null;
      const farmerId = getOrCreateFarmer(row.farmer, regionId);

      for (const series of SERIES) {
        const values = row.metrics[series];
        if (!values) continue;

        const planQty = values.planQty ?? null;
        const cumulativeQty = values.sourceCumulativeQty ?? null;
        let completionPct = values.completionPct ?? null;

        if (completionPct == null && planQty != null && planQty !== 0 && cumulativeQty != null) {
          completionPct = (cumulativeQty / planQty) * 100;
        } else if (completionPct == null && planQty === 0 && cumulativeQty != null) {
          warnings.push({
            severity: "WARNING",
            code: "PLAN_IS_ZERO",
            message: `Plan is zero for "${row.farmer}" (${series}); completion % cannot be computed.`,
            context: { farmer: row.farmer, series }
          });
        }

        const previous = previousCumStmt.get(farmerId, series, parsed.reportDate) as
          | { cum: number | null }
          | undefined;

        let calculatedDelta: number | null = null;
        if (previous && previous.cum != null && cumulativeQty != null) {
          calculatedDelta = cumulativeQty - previous.cum;
        }

        if (
          calculatedDelta != null &&
          values.sourceDailyQty != null &&
          Math.abs(calculatedDelta - values.sourceDailyQty) >
            Math.max(CONSISTENCY_ABS_THRESHOLD, CONSISTENCY_REL_THRESHOLD * Math.abs(values.sourceDailyQty))
        ) {
          warnings.push({
            severity: "WARNING",
            code: "DATA_CONSISTENCY_WARNING",
            message: `"Бир кунда" (${values.sourceDailyQty}) does not match the calculated delta (${calculatedDelta.toFixed(
              2
            )}) for "${row.farmer}" (${series}).`,
            context: { farmer: row.farmer, series, sourceDaily: values.sourceDailyQty, calculatedDelta }
          });
        }

        upsertMetric.run(
          reportId,
          farmerId,
          series,
          planQty,
          values.sourceDailyQty ?? null,
          cumulativeQty,
          calculatedDelta,
          completionPct
        );
      }
    }

    checkTotalsConsistency(reportId, warnings);

    const finalErrorCount = warnings.filter((w) => w.severity === "ERROR").length;
    db.prepare("UPDATE reports SET warning_count = ?, error_count = ? WHERE id = ?").run(
      warnings.length,
      finalErrorCount,
      reportId
    );

    const insertWarning = db.prepare(
      "INSERT INTO import_warnings (report_id, severity, code, message, context) VALUES (?, ?, ?, ?, ?)"
    );
    for (const w of warnings.slice(0, 500)) {
      insertWarning.run(reportId, w.severity, w.code, w.message, w.context ? JSON.stringify(w.context) : null);
    }

    db.exec("COMMIT");

    logAudit("IMPORT", actor, {
      filename,
      reportId,
      reportDate: parsed.reportDate,
      rows: parsed.rows.length,
      warnings: warnings.length,
      errors: finalErrorCount,
      status
    });

    return { status, reportId, reportDate: parsed.reportDate, warnings, farmerCount: parsed.rows.length };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function validateRows(rows: ParsedFarmerRow[], warnings: ImportWarning[]): void {
  for (const row of rows) {
    for (const [series, values] of Object.entries(row.metrics) as [Series, ParsedFarmerRow["metrics"][Series]][]) {
      if (!values) continue;
      for (const [field, val] of Object.entries(values)) {
        if (typeof val === "number" && val < 0) {
          warnings.push({
            severity: "WARNING",
            code: "NEGATIVE_VALUE",
            message: `Negative value for "${row.farmer}" (${series}.${field}): ${val}.`,
            context: { farmer: row.farmer, series, field, value: val }
          });
        }
      }
    }
  }
}

function checkTotalsConsistency(reportId: number, warnings: ImportWarning[]): void {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.name AS farmer, fm.series AS series, fm.source_cumulative_qty AS cum
       FROM farmer_metrics fm JOIN farmers f ON f.id = fm.farmer_id
       WHERE fm.report_id = ?`
    )
    .all(reportId) as { farmer: string; series: Series; cum: number | null }[];

  const byFarmer = new Map<string, Partial<Record<Series, number | null>>>();
  for (const r of rows) {
    const entry = byFarmer.get(r.farmer) ?? {};
    entry[r.series] = r.cum;
    byFarmer.set(r.farmer, entry);
  }

  for (const [farmer, series] of byFarmer.entries()) {
    if (series.TOTAL == null) continue;
    const sum = (series.FUTURES ?? 0) + (series.FORWARD ?? 0) + (series.TEMPORARY_STORAGE ?? 0);
    const diff = Math.abs(sum - series.TOTAL);
    if (diff > Math.max(CONSISTENCY_ABS_THRESHOLD, CONSISTENCY_REL_THRESHOLD * Math.abs(series.TOTAL))) {
      warnings.push({
        severity: "WARNING",
        code: "TOTALS_MISMATCH",
        message: `Шартнома турлари йиғиндиси (${sum.toFixed(2)}) умумий қиймат (${series.TOTAL.toFixed(
          2
        )}) билан мос келмайди: "${farmer}".`,
        context: { farmer, sum, total: series.TOTAL, diff }
      });
    }
  }
}

function getOrCreateRegion(name: string): number {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM regions WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO regions (name) VALUES (?)").run(name);
  return Number(info.lastInsertRowid);
}

function getOrCreateFarmer(name: string, regionId: number | null): number {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM farmers WHERE name = ? AND region_id IS ?").get(name, regionId) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO farmers (name, region_id) VALUES (?, ?)").run(name, regionId);
  return Number(info.lastInsertRowid);
}

function saveRawFile(buffer: Buffer, filename: string, hash: string): string {
  const dir = path.join(dataDir(), "uploads");
  mkdirSync(dir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._\-]+/g, "_").slice(-80);
  const storedName = `${hash.slice(0, 16)}-${safeName}`;
  writeFileSync(path.join(dir, storedName), buffer);
  return path.join("uploads", storedName);
}
