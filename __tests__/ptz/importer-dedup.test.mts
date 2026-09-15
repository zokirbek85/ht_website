import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildLedgerWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-import-dedup-"));

const { importExcelReport } = await import("../../src/lib/ptz/importer.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

test("a byte-identical re-upload is a no-op, not a new import", async () => {
  const buffer = await buildLedgerWorkbook();
  const actor = { telegramId: "1", username: "tester" };

  const first = await importExcelReport(buffer, "basket.xlsx", new Date(), actor);
  assert.equal(first.status, "success");
  if (first.status !== "success") throw new Error("unreachable");

  const second = await importExcelReport(buffer, "basket.xlsx", new Date(), actor);
  assert.equal(second.status, "duplicate");
  if (second.status !== "duplicate") throw new Error("unreachable");
  assert.equal(second.importId, first.importId);

  const count = (getDb().prepare("SELECT COUNT(*) AS c FROM imports").get() as { c: number }).c;
  assert.equal(count, 1);
});
