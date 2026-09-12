import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSampleWorkbook } from "./fixtures.mts";

const { parseWorkbook } = await import("../../src/lib/ptz/parser.ts");

test("parses multi-row headers, regions, subtotals and formula errors", async () => {
  const buffer = await buildSampleWorkbook();
  const parsed = await parseWorkbook(buffer, "Сводка 11,09,26.xlsx", new Date("2026-09-12T09:00:00Z"));

  assert.equal(parsed.reportDate, "2026-09-11", "filename date should win over upload time");
  assert.equal(parsed.dateDetectionMethod, "filename");

  assert.equal(parsed.rows.length, 3, "subtotal row must not become a 4th farmer");

  const [aliyev, karimov, yusupova] = parsed.rows;
  assert.equal(aliyev?.farmer, "Aliyev Vali fermer xo'jaligi");
  assert.equal(aliyev?.region, "Янгибозор ҳудуди");
  assert.equal(karimov?.region, "Янгибозор ҳудуди");
  assert.equal(yusupova?.region, "Хива ҳудуди");

  assert.equal(aliyev?.metrics.FUTURES?.planQty, 100);
  assert.equal(aliyev?.metrics.FUTURES?.sourceDailyQty, 5);
  assert.equal(aliyev?.metrics.FUTURES?.sourceCumulativeQty, 50);
  assert.equal(aliyev?.metrics.TOTAL?.sourceCumulativeQty, 75);

  // The #REF! cell must become null, never a silently-invented zero.
  assert.equal(karimov?.metrics.FUTURES?.sourceCumulativeQty, null);

  const formulaWarning = parsed.warnings.find((w) => w.code === "FORMULA_ERROR");
  assert.ok(formulaWarning, "expected a FORMULA_ERROR warning for the #REF! cell");

  const subtotalWarning = parsed.warnings.find((w) => w.code === "SUBTOTAL_ROW_SKIPPED");
  assert.ok(subtotalWarning, "expected the 'Жами:' row to be flagged as a skipped subtotal");
});

test("falls back to upload time when no date is found anywhere", async () => {
  const buffer = await buildSampleWorkbook();
  const parsed = await parseWorkbook(buffer, "report.xlsx", new Date("2026-01-15T00:00:00Z"));
  assert.equal(parsed.dateDetectionMethod, "upload_time");
  assert.equal(parsed.reportDate, "2026-01-15");
});
