// End-to-end pipeline tests against an isolated SQLite DB: four files in →
// stored, deduplicated, calculated, exported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  FARMERS,
  buildAccounts,
  buildBasket,
  buildEmptyWorkbook,
  buildShipments,
  buildStatement,
  standardBasket,
  standardPayments,
  standardShipments
} from "./kunlik-fixtures.mts";

const dir = mkdtempSync(path.join(tmpdir(), "ptz-kunlik-pipeline-"));
process.env.PTZ_DATA_DIR = dir;
process.env.PTZ_TMP_DIR = path.join(dir, "tmp");
process.env.PTZ_DIRECTORY_PATH = path.join(dir, "no-directory.xlsx");

const { processBatch } = await import("../../src/lib/ptz/kunlik/service.ts");
const { UserFacingError } = await import("../../src/lib/ptz/kunlik/types.ts");
const { kdb } = await import("../../src/lib/ptz/kunlik/repository.ts");

const directory = [
  { order: 1, section: "Хазорасп ҳудуди", hudud: "Янгибозор ҳудуди", displayName: "Исмоил ок ота", inn: FARMERS.a.inn, planT: 223.989, basketName: null, matchMethod: "VECTOR", confidence: 1 },
  { order: 2, section: "Хазорасп ҳудуди", hudud: "Карвак ҳудуди", displayName: "Полвон қўшар", inn: FARMERS.b.inn, planT: 248.593, basketName: null, matchMethod: "VECTOR", confidence: 1 },
  { order: 3, section: "Кластер", hudud: "Кластер", displayName: "HAZORASP AGROTEX MCHJ", inn: FARMERS.c.inn, planT: 800, basketName: null, matchMethod: "VECTOR", confidence: 1 },
  { order: 4, section: "Шартнома килмаганлар", hudud: "Шартнома килмаганлар", displayName: "Янги фермер", inn: null, planT: 50, basketName: null, matchMethod: null, confidence: null }
];

async function fourFiles() {
  return [
    { type: "BASKET" as const, filename: "basket_HAZORASP.xlsx", buffer: await buildBasket(standardBasket()) },
    { type: "PAYMENTS" as const, filename: "300074865_Историческая_выписка_1.xlsx", buffer: await buildStatement(standardPayments()) },
    { type: "ACCOUNTS" as const, filename: "Мои_лицевые_счета_в_ркп_1.xlsx", buffer: await buildAccounts() },
    { type: "SHIPMENTS" as const, filename: "Shipments23_09_2026.xlsx", buffer: await buildShipments(standardShipments()) }
  ];
}

const count = (table: string) => (kdb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

test("Test 1 — four source files produce the expected Кунлик терим report", async () => {
  const out = await processBatch(await fourFiles(), { trigger: "cli", directory });
  const k = out.report.kpi;
  assert.equal(out.report.reportDate, "2026-09-23");
  assert.equal(k.todayHandKg, 3992 + 3111 + 1000);
  assert.equal(k.todayMachineKg, 20000);
  assert.equal(k.seasonTotalKg, 4090 + 3992 + 11995 + 3111 + 20000 + 1000);
  assert.equal(k.farmersWithHarvest, 3);
  assert.equal(k.contracts, 4);
  assert.equal(k.paidTotal, 2572500040n); // farmer a; farmer b paid then reversed
  assert.equal(k.paidToday, 0n);
  assert.equal(k.rkpFreeBalance, 100000050n);
  assert.equal(k.shippedKg, 4090 + 3992 + 11995);
  assert.equal(k.shipmentDeals, 2);

  const a = out.report.lines.find((l) => l.inn === FARMERS.a.inn)!;
  assert.equal(a.displayName, "Исмоил ок ота");
  assert.equal(a.hudud, "Янгибозор ҳудуди");
  assert.equal(a.sum100, BigInt((4090 + 3992) * 7862) * 100n);
  assert.equal(a.sum20, 1270813680n);
  assert.equal(a.pickingBalance, 1270813680n - 2572500040n);

  // Layout keeps the hand-made report's structure: ҳудуд headers, subtotals, sections, grand total.
  const labels = out.report.layout.map((x) => (x.kind === "farmer" ? `  ${x.line.displayName}` : x.label));
  assert.deepEqual(labels, [
    "Янгибозор ҳудуди", "  Исмоил ок ота", "Ҳудуд жами",
    "Карвак ҳудуди", "  Полвон қўшар", "Ҳудуд жами",
    "Хазорасп ҳудуди жами",
    "Кластер", "  HAZORASP AGROTEX MCHJ", "Жами",
    "Шартнома килмаганлар", "  Янги фермер", "Жами",
    "Хаммаси"
  ]);
  const noContract = out.report.lines.find((l) => l.displayName === "Янги фермер")!;
  assert.equal(noContract.planT, 50);

  assert.equal(out.dq.critical, 0);
  assert.equal(out.baseName, "Кунлик_терим_2026-09-23");
  assert.ok(out.pdf.subarray(0, 4).toString() === "%PDF");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.excel as unknown as ExcelJS.Buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Кунлик терим", "Фермерлар", "Динамика", "Тўловлар", "Отгрузки", "Отгрузки по фермерам", "Отгрузки по контрактам", "Data Quality", "Import Info"]);
});

test("Test 2 — the same basket sent twice adds no harvest (all duplicates) and totals don't change", async () => {
  const before = count("kt_harvest_records");
  const out = await processBatch([{ type: "BASKET", filename: "basket_again.xlsx", buffer: await buildBasket(standardBasket()) }], { trigger: "cli", directory });
  const f = out.files.find((x) => x.type === "BASKET")!;
  assert.deepEqual([f.inserted, f.updated, f.duplicates], [0, 0, 6]);
  assert.equal(count("kt_harvest_records"), before);
  assert.equal(out.report.kpi.seasonTotalKg, 44188);
  // Second report of the same day gets a time suffix.
  assert.match(out.baseName, /^Кунлик_терим_2026-09-23_\d\d-\d\d$/);
});

test("a corrected basket row is UPDATED in place, not added twice", async () => {
  const rows = standardBasket();
  rows[0] = { ...rows[0]!, conditionedKg: 4100 };
  const out = await processBatch([{ type: "BASKET", filename: "basket_fixed.xlsx", buffer: await buildBasket(rows) }], { trigger: "cli", directory });
  const f = out.files.find((x) => x.type === "BASKET")!;
  assert.deepEqual([f.inserted, f.updated, f.duplicates], [0, 1, 5]);
  assert.equal(out.report.kpi.seasonTotalKg, 44198);
});

test("Test 3 — the same statement sent twice adds no payments", async () => {
  const before = count("kt_payments");
  const out = await processBatch([{ type: "PAYMENTS", filename: "выписка_again.xlsx", buffer: await buildStatement(standardPayments()) }], { trigger: "cli", directory });
  const f = out.files.find((x) => x.type === "PAYMENTS")!;
  assert.deepEqual([f.inserted, f.duplicates], [0, 6]);
  assert.equal(count("kt_payments"), before);
  assert.equal(out.report.kpi.paidTotal, 2572500040n);
});

test("Test 4 — the same Shipments file sent twice adds no shipments", async () => {
  const before = count("kt_shipments");
  const out = await processBatch([{ type: "SHIPMENTS", filename: "Shipments_again.xlsx", buffer: await buildShipments(standardShipments()) }], { trigger: "cli", directory });
  const f = out.files.find((x) => x.type === "SHIPMENTS")!;
  assert.deepEqual([f.inserted, f.duplicates], [0, 3]);
  assert.equal(count("kt_shipments"), before);
  assert.equal(out.report.kpi.shippedKg, 20077);
});

test("Test 11 — an empty workbook gives a specific, user-facing error", async () => {
  for (const type of ["BASKET", "PAYMENTS", "ACCOUNTS", "SHIPMENTS"] as const) {
    await assert.rejects(
      processBatch([{ type, filename: `${type}.xlsx`, buffer: await buildEmptyWorkbook() }], { trigger: "cli", directory }),
      (err: unknown) => err instanceof UserFacingError && err.source === type && /топилмади|бўш/.test(err.message)
    );
  }
});

test("missing 'Терим услуби' column names the column and lists the headers that were found", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildBasket(standardBasket())) as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0]!;
  ws.unMergeCells("N5:N6");
  ws.getCell("N5").value = "Изоҳ";
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await assert.rejects(processBatch([{ type: "BASKET", filename: "basket.xlsx", buffer }], { trigger: "cli", directory }), (err: unknown) => {
    assert.ok(err instanceof UserFacingError);
    assert.match(err.message, /"Терим услуби"/);
    assert.ok(err.details.some((d) => d.includes("Хўжалик ИННси")));
    return true;
  });
});

test("Test 12 — #REF!/#VALUE! in inputs never reach the output: the generated workbook has no formulas and no error cells", async () => {
  const out = await processBatch(
    [{ type: "BASKET", filename: "basket_ref.xlsx", buffer: await buildBasket(standardBasket(), { formulaErrorRow: 1 }) }],
    { trigger: "cli", directory }
  );
  // The #REF! amount is caught as data quality, not propagated.
  assert.ok(out.issues.some((i) => i.code === "INVALID_AMOUNT" && i.severity === "CRITICAL"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.excel as unknown as ExcelJS.Buffer);
  let cells = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        cells++;
        const v = cell.value as unknown;
        assert.ok(!(v && typeof v === "object" && ("formula" in v || "sharedFormula" in v || "error" in v)), `${ws.name}!${cell.address} holds a formula/error`);
        assert.ok(!(typeof v === "string" && /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?)/.test(v)), `${ws.name}!${cell.address} = ${String(v)}`);
        assert.ok(!(typeof v === "number" && !Number.isFinite(v)), `${ws.name}!${cell.address} is not finite`);
      })
    );
  }
  assert.ok(cells > 500);
});

test("every run is logged per file with row/insert/update/duplicate counts", () => {
  const rows = kdb().prepare("SELECT file_type, rows, inserted, updated, duplicates FROM kt_processing_log ORDER BY id").all() as { file_type: string }[];
  assert.ok(rows.length >= 8);
  assert.deepEqual([...new Set(rows.map((r) => r.file_type))].sort(), ["ACCOUNTS", "BASKET", "PAYMENTS", "SHIPMENTS"]);
});
