import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildLedgerWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-grand-total-"));

const { importExcelReport } = await import("../../src/lib/ptz/importer.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

function warningsFor(importId: number): { code: string }[] {
  return getDb().prepare("SELECT code FROM import_warnings WHERE import_id = ?").all(importId) as { code: string }[];
}

test("a grand-total row matching the computed sum produces no mismatch warning", async () => {
  // fixture rows: physicalKg 4230 + 4100 = 8330; conditionedKg 4090 + 3992 = 8082
  const buffer = await buildLedgerWorkbook({ grandTotal: { physicalKg: 8330, conditionedKg: 8082 } });
  const outcome = await importExcelReport(buffer, "basket.xlsx", new Date(), { telegramId: "1", username: null });
  assert.equal(outcome.status, "success");
  if (outcome.status !== "success") throw new Error("unreachable");
  assert.ok(!warningsFor(outcome.importId).some((w) => w.code === "GRAND_TOTAL_MISMATCH"));
});

test("a stale grand-total row (sheet total disagrees with the sum of parsed rows) is flagged", async () => {
  const buffer = await buildLedgerWorkbook({ grandTotal: { physicalKg: 99000, conditionedKg: 82000 } });
  const outcome = await importExcelReport(buffer, "basket.xlsx", new Date(), { telegramId: "1", username: null });
  assert.equal(outcome.status, "success");
  if (outcome.status !== "success") throw new Error("unreachable");
  assert.ok(warningsFor(outcome.importId).some((w) => w.code === "GRAND_TOTAL_MISMATCH"));
});
