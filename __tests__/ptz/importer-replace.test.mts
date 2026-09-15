import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildLedgerWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-import-replace-"));

const { importExcelReport } = await import("../../src/lib/ptz/importer.ts");
const { getActiveImport, loadOperations, CottonAcceptanceAnalytics } = await import("../../src/lib/ptz/analytics.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

test("each new import fully replaces the active snapshot (the source file is a growing full export, not a delta)", async () => {
  const actor = { telegramId: "1", username: "tester" };

  const firstBuffer = await buildLedgerWorkbook();
  const first = await importExcelReport(firstBuffer, "basket.xlsx", new Date(), actor);
  assert.equal(first.status, "success");
  if (first.status !== "success") throw new Error("unreachable");

  const grownBuffer = await buildLedgerWorkbook({
    extraRows: [{ farmer: "NAZAR ABDULLAYEV FX", contract: "149565", pk17: "XH0000000099", physicalKg: 2690, conditionedKg: 2576 }]
  });
  const second = await importExcelReport(grownBuffer, "basket.xlsx", new Date(), actor);
  assert.equal(second.status, "success");
  if (second.status !== "success") throw new Error("unreachable");

  const active = getActiveImport();
  assert.equal(active?.id, second.importId);
  assert.equal(active?.rowCount, 3);

  const previous = getDb().prepare("SELECT is_active FROM imports WHERE id = ?").get(first.importId) as { is_active: number };
  assert.equal(previous.is_active, 0);

  const analytics = new CottonAcceptanceAnalytics(loadOperations(active!.id));
  assert.equal(analytics.summary().farmerCount, 3);
});
