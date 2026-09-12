import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSampleWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-importer-dedup-"));

const { importExcelReport } = await import("../../src/lib/ptz/importer.ts");
const { getReportById, loadReportMetrics, aggregateOverall } = await import("../../src/lib/ptz/analytics.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

const actor = { telegramId: "12345", username: "tester" };

test("imports a report, computes baseline metrics, and rejects byte-identical duplicates", async () => {
  const buffer = await buildSampleWorkbook();
  const first = await importExcelReport(buffer, "Сводка 11,09,26.xlsx", new Date("2026-09-11T10:00:00Z"), actor);
  // "partial" is expected here: the fixture deliberately contains a #REF! cell (an ERROR-severity
  // warning), which must not abort the whole import — the rest of the valid data still gets stored.
  assert.equal(first.status, "partial");
  if (first.status === "duplicate" || first.status === "failed") throw new Error("unexpected status");
  assert.equal(first.farmerCount, 3);

  const report = getReportById(first.reportId);
  assert.equal(report?.reportDate, "2026-09-11");

  const overall = aggregateOverall(loadReportMetrics(first.reportId));
  // 170 + 200 + 80 plan across the three farmers' TOTAL series
  assert.equal(overall.planQty, 450);
  assert.equal(overall.cumulativeQty, 175); // 75 + 90 + 10

  // A first-ever import has nothing to diff against.
  const baseline = getDb()
    .prepare("SELECT calculated_daily_delta FROM farmer_metrics WHERE report_id = ? AND series = 'TOTAL' LIMIT 1")
    .get(first.reportId) as { calculated_daily_delta: number | null };
  assert.equal(baseline.calculated_daily_delta, null);

  const duplicate = await importExcelReport(buffer, "Сводка 11,09,26.xlsx", new Date("2026-09-11T10:05:00Z"), actor);
  assert.equal(duplicate.status, "duplicate");
});
