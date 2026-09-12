import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { buildSampleWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-importer-replace-"));

const { importExcelReport } = await import("../../src/lib/ptz/importer.ts");
const { getReportById } = await import("../../src/lib/ptz/analytics.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

const actor = { telegramId: "12345", username: "tester" };

async function bumpTotalCumulative(amount: number): Promise<Buffer> {
  const base = await buildSampleWorkbook();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(base);
  const sheet = workbook.worksheets[0];
  for (const rowNum of [6, 7, 9]) {
    const cell = sheet.getRow(rowNum).getCell(14); // column N = TOTAL cumulative
    if (typeof cell.value === "number") cell.value = cell.value + amount;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function sumCalculatedDelta(reportId: number): number {
  const row = getDb()
    .prepare(
      "SELECT SUM(calculated_daily_delta) AS total FROM farmer_metrics WHERE report_id = ? AND series = 'TOTAL'"
    )
    .get(reportId) as { total: number | null };
  return row.total ?? 0;
}

test("replacing a same-date report deactivates the old one and recomputes deltas against the prior day", async () => {
  const day1 = await buildSampleWorkbook(); // TOTAL cumulative sum = 75 + 90 + 10 = 175
  const r1 = await importExcelReport(day1, "day1-10,09,26.xlsx", new Date("2026-09-10T10:00:00Z"), actor);
  // "partial" is expected: the fixture deliberately contains a #REF! cell (ERROR-severity warning),
  // which must not abort the whole import — the rest of the valid data still gets stored.
  assert.equal(r1.status, "partial");

  const day2 = await bumpTotalCumulative(10); // +10 tons/farmer vs day1 => +30 total
  const r2 = await importExcelReport(day2, "day2-11,09,26.xlsx", new Date("2026-09-11T10:00:00Z"), actor);
  assert.equal(r2.status, "partial");
  if (r2.status !== "partial") throw new Error("unreachable");

  assert.equal(sumCalculatedDelta(r2.reportId), 30);

  // The source sheet's own "Бир кунда" wasn't bumped, so the calculated delta
  // (30) now disagrees with the source daily figure — that must be flagged,
  // never silently reconciled.
  const consistencyWarning = getDb()
    .prepare("SELECT COUNT(*) AS c FROM import_warnings WHERE report_id = ? AND code = 'DATA_CONSISTENCY_WARNING'")
    .get(r2.reportId) as { c: number };
  assert.ok(consistencyWarning.c > 0);

  // Replace day2 with a corrected re-upload: +30 tons/farmer vs day1 => +90 total.
  const correctedBuffer = await bumpTotalCumulative(30);
  const r3 = await importExcelReport(correctedBuffer, "day2-corrected-11,09,26.xlsx", new Date("2026-09-11T14:00:00Z"), actor);
  assert.equal(r3.status, "partial");
  if (r3.status !== "partial") throw new Error("unreachable");

  const oldReport = getReportById(r2.reportId);
  assert.equal(oldReport?.isActive, 0, "the superseded same-day report must be marked inactive, not deleted");

  const newReport = getReportById(r3.reportId);
  assert.equal(newReport?.isActive, 1);

  // Delta must be computed against day1 (the latest active *prior-date* snapshot), not against the
  // now-inactive first day2 import.
  assert.equal(sumCalculatedDelta(r3.reportId), 90);
});
