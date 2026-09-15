import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildLedgerWorkbook } from "./fixtures.mts";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-reprocess-"));

const { importExcelReport, reprocessImport } = await import("../../src/lib/ptz/importer.ts");
const { loadOperations } = await import("../../src/lib/ptz/analytics.ts");

test("reprocessing re-parses the stored original file in place, keeping the same import id", async () => {
  const buffer = await buildLedgerWorkbook();
  const outcome = await importExcelReport(buffer, "basket.xlsx", new Date(), { telegramId: "1", username: null });
  assert.equal(outcome.status, "success");
  if (outcome.status !== "success") throw new Error("unreachable");

  const before = loadOperations(outcome.importId);
  assert.equal(before.length, 2);

  const reprocessed = await reprocessImport(outcome.importId, { telegramId: "1", username: null });
  assert.equal(reprocessed.status, "success");
  if (reprocessed.status !== "success") throw new Error("unreachable");
  assert.equal(reprocessed.importId, outcome.importId);

  const after = loadOperations(outcome.importId);
  assert.equal(after.length, 2);
});

test("reprocessing an import with no stored raw file fails clearly", async () => {
  const result = await reprocessImport(999999, { telegramId: "1", username: null });
  assert.equal(result.status, "failed");
  if (result.status !== "failed") throw new Error("unreachable");
  assert.ok(result.warnings.some((w) => w.code === "IMPORT_NOT_FOUND"));
});
