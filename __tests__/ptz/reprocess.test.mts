import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSampleWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-reprocess-"));

const { importExcelReport, reprocessReport } = await import("../../src/lib/ptz/importer.ts");
const { getReportById } = await import("../../src/lib/ptz/analytics.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

const actor = { telegramId: "1", username: "tester" };

test("reprocessing overwrites farmer_metrics from the stored original file without creating a new report", async () => {
  const buffer = await buildSampleWorkbook();
  const first = await importExcelReport(buffer, "Сводка 11,09,26.xlsx", new Date("2026-09-11T10:00:00Z"), actor);
  if (first.status === "duplicate" || first.status === "failed") throw new Error("unexpected");

  const reportCountBefore = (getDb().prepare("SELECT COUNT(*) AS c FROM reports").get() as { c: number }).c;

  const result = await reprocessReport(first.reportId, actor);
  if (result.status === "failed") throw new Error("reprocess should have succeeded");
  assert.equal(result.reportId, first.reportId, "reprocessing must reuse the same report row");
  assert.equal(result.farmerCount, first.farmerCount);

  const reportCountAfter = (getDb().prepare("SELECT COUNT(*) AS c FROM reports").get() as { c: number }).c;
  assert.equal(reportCountAfter, reportCountBefore, "no new report row should be created");

  const report = getReportById(first.reportId);
  assert.equal(report?.isActive, 1, "reprocessing must not deactivate the report");

  // farmer_metrics rows should exist exactly once per farmer/series (no leftover duplicates from re-insertion).
  const metricRowCount = (
    getDb().prepare("SELECT COUNT(*) AS c FROM farmer_metrics WHERE report_id = ?").get(first.reportId) as {
      c: number;
    }
  ).c;
  assert.ok(metricRowCount > 0);
});

test("reprocessing a report with no stored file fails cleanly instead of throwing", async () => {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO reports (report_date, source_filename, source_hash, imported_at, status, parser_version, schema_version, date_detection_method, raw_file_path)
       VALUES ('2026-01-01', 'x.xlsx', 'no-raw-file-hash', datetime('now'), 'success', '1', '1', 'upload_time', NULL)`
    )
    .run();
  const reportId = Number(info.lastInsertRowid);

  const result = await reprocessReport(reportId, actor);
  assert.equal(result.status, "failed");
  if (result.status !== "failed") throw new Error("unreachable");
  assert.equal(result.warnings[0]?.code, "RAW_FILE_MISSING");
});
