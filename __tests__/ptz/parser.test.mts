import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedgerWorkbook } from "./fixtures.mts";
import { parseWorkbook } from "../../src/lib/ptz/parser.ts";

test("parses farmer rows, ignoring the wide title/МАЪЛУМОТ banners", async () => {
  const buffer = await buildLedgerWorkbook();
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date("2026-09-11T12:00:00Z"));

  assert.equal(result.warnings.filter((w) => w.severity === "ERROR").length, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]?.farmerName, "ISMOIL OQ OTA FX");
  assert.equal(result.rows[1]?.farmerName, "MAXKAM JUMANAZAROV FX");
});

test("the title banner's embedded 'фермер' substring does not hijack farmer-column detection", async () => {
  // buildLedgerWorkbook's row-1 banner deliberately contains "фермер" — this
  // regression is exactly what broke the old Сводка parser (commit
  // 6eff5f5): the farmer-name column search must land on the real header
  // (row 5/6, merged B5:B6), not the title banner in row 1.
  const buffer = await buildLedgerWorkbook();
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());
  assert.equal(result.rows[0]?.farmerName, "ISMOIL OQ OTA FX");
});

test("maps every mapped column correctly, including weight/quality/price fields", async () => {
  const buffer = await buildLedgerWorkbook();
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());
  const row = result.rows[0]!;

  assert.equal(row.contractNumber, "159025");
  assert.equal(row.contractQty, 200);
  assert.equal(row.acceptanceDate, "2026-09-11");
  assert.equal(row.physicalKg, 4230);
  assert.equal(row.tareKg, 7330);
  assert.equal(row.impurityPct, 4.8);
  assert.equal(row.moisturePct, 9.5);
  assert.equal(row.conditionedKg, 4090);
  assert.equal(row.unitPrice, 7862);
  assert.equal(row.amount, 4090 * 7862);
  assert.equal(row.buyerName, "HAZORASP-TEXTIL MCHJ");
  assert.equal(row.vehiclePlate, "90 LA 043");
});

test("maps the mislabeled ПК-17 sub-columns positionally, not by their (wrong) row-6 text", async () => {
  // Real export quirk: row 6's sub-labels for this zone read "Кластер" /
  // "Фермер" but the data is actually a registration timestamp then a
  // signing timestamp — see fixtures.mts and excel-mapping.ts.
  const buffer = await buildLedgerWorkbook();
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());
  const row = result.rows[0]!;

  assert.equal(row.pk17Number, "XH0000000001");
  assert.equal(row.pk17RegisteredAt, "2026-09-10T18:35:47");
  assert.equal(row.pk17SignedAt, "2026-09-10T20:23:43");
});

test("a PK-17 not yet signed parses as null, not as missing data", async () => {
  const buffer = await buildLedgerWorkbook({
    extraRows: [{ farmer: "NAZAR ABDULLAYEV FX", contract: "149565", pk17: null, physicalKg: 2690, conditionedKg: 2576 }]
  });
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());
  const row = result.rows.find((r) => r.farmerName === "NAZAR ABDULLAYEV FX")!;
  assert.equal(row.pk17Number, null);
  assert.equal(row.pk17SignedAt, null);
});

test("detects the grand-total row by its row-number-column label and excludes it from farmer rows", async () => {
  const buffer = await buildLedgerWorkbook({ grandTotal: { physicalKg: 8330, conditionedKg: 8082 } });
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());

  assert.equal(result.rows.length, 2); // grand-total row not counted as an operation
  assert.deepEqual(result.grandTotalFromSheet, { physicalKg: 8330, conditionedKg: 8082 });
  assert.ok(result.warnings.some((w) => w.code === "GRAND_TOTAL_ROW_SKIPPED"));
});

test("flags duplicate PK-17 numbers within the same import without dropping either row", async () => {
  const buffer = await buildLedgerWorkbook({
    extraRows: [{ farmer: "MAXKAM JUMANAZAROV FX", contract: "159050", pk17: "XH0000000002", physicalKg: 4100, conditionedKg: 3992 }]
  });
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());

  assert.equal(result.rows.length, 3);
  assert.ok(result.warnings.some((w) => w.code === "DUPLICATE_OPERATION"));
});

test("report date is detected from the title banner (day + English month, year inferred from acceptance dates)", async () => {
  const buffer = await buildLedgerWorkbook();
  const result = await parseWorkbook(buffer, "basket.xlsx", new Date());
  assert.equal(result.reportGeneratedAt, "2026-09-12T09:00:00");
  assert.equal(result.dateDetectionMethod, "title_banner");
  assert.equal(result.dataPeriodStart, "2026-09-11");
  assert.equal(result.dataPeriodEnd, "2026-09-11");
});
