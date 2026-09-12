import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-grandtotal-"));

const { importExcelReport } = await import("../../src/lib/ptz/importer.ts");
const { listWarningsForReport } = await import("../../src/lib/ptz/warnings.ts");

/**
 * Reproduces a real-world case: a "Хаммаси" (grand total) row at the bottom
 * of the sheet holds pasted figures that predate later farmer rows added to
 * the sheet, so it silently understates the true total. See
 * docs/ptz-architecture.md — this was reported as "the dashboard total
 * doesn't match the sheet" before the check below existed.
 */
async function buildWorkbook(staleGrandTotal: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Факт");

  ws.mergeCells("A1:A2");
  ws.getCell("A1").value = "№";
  ws.mergeCells("B1:B2");
  ws.getCell("B1").value = "Фермер хўжалик номи";
  ws.getCell("C1").value = "Жами";
  ws.getCell("C2").value = "Режа";
  ws.getCell("D1").value = "Жами";
  ws.getCell("D2").value = "Жами";

  ws.getCell("B3").value = "Тест ҳудуди";
  ws.getCell("A4").value = 1;
  ws.getCell("B4").value = "Farmer One";
  ws.getCell("C4").value = 100;
  ws.getCell("D4").value = 10;
  ws.getCell("A5").value = 2;
  ws.getCell("B5").value = "Farmer Two";
  ws.getCell("C5").value = 100;
  ws.getCell("D5").value = 10;
  // Real sum of column C (TOTAL.planQty) across both farmers is 200.

  ws.getCell("A6").value = 99;
  ws.getCell("B6").value = "Хаммаси";
  ws.getCell("C6").value = staleGrandTotal;
  ws.getCell("D6").value = 20;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("flags a stale grand-total row that undercounts the real farmer sum", async () => {
  const buffer = await buildWorkbook(120); // sheet claims 120, farmers actually sum to 200
  const outcome = await importExcelReport(buffer, "test.xlsx", new Date("2026-09-11"), {
    telegramId: "1",
    username: "t"
  });
  if (outcome.status === "duplicate" || outcome.status === "failed") throw new Error("unexpected: " + outcome.status);

  const warnings = listWarningsForReport(outcome.reportId);
  const mismatch = warnings.find((w) => w.code === "GRAND_TOTAL_MISMATCH" && w.message.includes("TOTAL.planQty"));
  assert.ok(mismatch, "expected a GRAND_TOTAL_MISMATCH warning for TOTAL.planQty");
  assert.ok(mismatch?.message.includes("120"));
  assert.ok(mismatch?.message.includes("200"));
});

test("does not flag a grand-total row that actually agrees with the farmer sum", async () => {
  const buffer = await buildWorkbook(200); // matches the real sum exactly
  const outcome = await importExcelReport(buffer, "test2.xlsx", new Date("2026-09-11"), {
    telegramId: "1",
    username: "t"
  });
  if (outcome.status === "duplicate" || outcome.status === "failed") throw new Error("unexpected: " + outcome.status);

  const warnings = listWarningsForReport(outcome.reportId);
  const mismatch = warnings.filter((w) => w.code === "GRAND_TOTAL_MISMATCH");
  assert.equal(mismatch.length, 0);
});
