import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { parseWorkbook } = await import("../../src/lib/ptz/parser.ts");

/**
 * These reproduce three real-world quirks found in an actual PTZ report
 * that a hand-built fixture didn't anticipate (see docs/ptz-architecture.md
 * §6). Each one silently corrupted parsing in a different way before being
 * fixed, so they're pinned here individually rather than folded back into
 * the main fixtures.mts scenario.
 */

async function buildWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Факт");

  // A full-width title banner sitting above the real header (26 columns,
  // like the real file's A2:Z2) — and it happens to contain "фермер" as a
  // substring, which must not hijack farmer-column detection.
  ws.mergeCells("A1:Z1");
  ws.getCell("A1").value =
    "Хазорасп туманидаги фермер хўжаликларининг пахта хосили тўғрисида маълумот";

  // A stray report-date banner, narrow and unmerged, sitting inside the
  // "Жами" zone's own column range (column D) — it must not become part of
  // that column's header path.
  ws.getCell("D2").value = "11.09.2026 й";

  ws.mergeCells("A3:A4");
  ws.getCell("A3").value = "№";
  ws.mergeCells("B3:B4");
  ws.getCell("B3").value = "Фермер хўжалик номи";

  ws.mergeCells("C3:D3");
  ws.getCell("C3").value = "Жами";
  ws.getCell("C4").value = "Бир кунда";
  ws.getCell("D4").value = "Жами";

  ws.getCell("B5").value = "Тест ҳудуди";

  ws.getCell("A6").value = 1;
  ws.getCell("B6").value = "Test Farmer";
  ws.getCell("C6").value = 5;
  ws.getCell("D6").value = 50;

  // Subtotal row that repeats the previous row's number instead of leaving
  // it blank — must still be recognized as a subtotal, not a farmer named
  // "1" (or a DUPLICATE_FARMER_ROW warning against the real farmer above).
  ws.getCell("A7").value = 1;
  ws.getCell("B7").value = "Ҳудуд жами";
  ws.getCell("C7").value = 5;
  ws.getCell("D7").value = 50;

  // A grand-total row using a different keyword than "Жами".
  ws.getCell("A8").value = 99;
  ws.getCell("B8").value = "Хаммаси";
  ws.getCell("C8").value = 5;
  ws.getCell("D8").value = 50;

  return wb;
}

test("a title banner containing a farmer-like keyword doesn't hijack column detection", async () => {
  const wb = await buildWorkbook();
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const parsed = await parseWorkbook(buffer, "test.xlsx", new Date("2026-09-11"));

  assert.equal(parsed.rows.length, 1, "only the one real farmer row, not the title/subtotal rows");
  assert.equal(parsed.rows[0]?.farmer, "Test Farmer");
  assert.equal(parsed.rows[0]?.region, "Тест ҳудуди");
});

test("a date banner inside a zone's column range doesn't pollute that column's header path", async () => {
  const wb = await buildWorkbook();
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const parsed = await parseWorkbook(buffer, "test.xlsx", new Date("2026-09-11"));

  const colD = parsed.columnMap.find((c) => c.columnIndex === 4);
  assert.equal(colD?.canonicalField, "TOTAL.CUMULATIVE");
  assert.ok(!colD?.headerPath.includes("2026"), `header path leaked the date banner: "${colD?.headerPath}"`);
});

test("subtotal rows are recognized by label even when the row-number column repeats", async () => {
  const wb = await buildWorkbook();
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const parsed = await parseWorkbook(buffer, "test.xlsx", new Date("2026-09-11"));

  const subtotalWarnings = parsed.warnings.filter((w) => w.code === "SUBTOTAL_ROW_SKIPPED");
  assert.equal(subtotalWarnings.length, 2, "both 'Ҳудуд жами' and 'Хаммаси' rows should be skipped");
  assert.ok(!parsed.rows.some((r) => r.farmer === "Ҳудуд жами" || r.farmer === "Хаммаси"));

  const dupWarnings = parsed.warnings.filter((w) => w.code === "DUPLICATE_FARMER_ROW");
  assert.equal(dupWarnings.length, 0, "the repeated row number must not be read as a duplicate farmer");
});
