// Pure-logic tests for the Кунлик терим pipeline (no DB): normalization,
// classification, matching priority, validation and the calculation engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFarmerName, normalizeHarvestMethod, nameSimilarity } from "../../src/lib/ptz/kunlik/utils/text.ts";
import { normalizeDecimalString, parseMoney, percentOf, formatSum } from "../../src/lib/ptz/kunlik/utils/numbers.ts";
import { parseDate, parseDateTime } from "../../src/lib/ptz/kunlik/utils/dates.ts";
import { classifyByFilename, classifyByContent } from "../../src/lib/ptz/kunlik/classifier.ts";
import { FarmerIndex } from "../../src/lib/ptz/kunlik/matching.ts";
import { validateHarvest } from "../../src/lib/ptz/kunlik/validation.ts";
import { calculate } from "../../src/lib/ptz/kunlik/calculation.ts";
import { normalizeShipmentStatus } from "../../src/lib/ptz/kunlik/parsers/shipments.ts";
import type { PaymentRecord, ShipmentRecord } from "../../src/lib/ptz/kunlik/types.ts";
import { buildShipments, buildStatement, harvest, paymentPair } from "./kunlik-fixtures.mts";

test("harvest method variants normalize to HAND / MACHINE / UNKNOWN", () => {
  for (const v of ["1-Qo`l terimi", "Qo'l terimi", "Қўл терими", "Qo'l", "Кул терим", "QO‘L TERIMI"]) assert.equal(normalizeHarvestMethod(v), "HAND", v);
  for (const v of ["Mashina terimi", "Машина терими", "Mashina", "машинный сбор"]) assert.equal(normalizeHarvestMethod(v), "MACHINE", v);
  for (const v of ["", null, "Aralash", "3-usul"]) assert.equal(normalizeHarvestMethod(v), "UNKNOWN", String(v));
});

test("farmer names normalize across scripts, quotes, apostrophe glyphs and legal-form suffixes", () => {
  assert.equal(normalizeFarmerName('"POLVON QO_SHAR" FX'), "polvon qoshar");
  assert.equal(normalizeFarmerName("POLVON QO'SHAR FX"), "polvon qoshar");
  assert.equal(normalizeFarmerName("Полвон қўшар"), "polvon qoshar");
  assert.equal(normalizeFarmerName("﻿DILFUZA-AZIZA  МЧЖ"), "dilfuza aziza");
  assert.ok(nameSimilarity(normalizeFarmerName("Абдували Аллаёр"), normalizeFarmerName("ABDUVALI OLLAYOROV FX")) > 0.6);
});

test("numbers: '1 234,56', '1.234,56', '1234.56' and float noise parse exactly; money is exact tiyin", () => {
  assert.equal(normalizeDecimalString("1 234,56"), "1234.56");
  assert.equal(normalizeDecimalString("1.234,56"), "1234.56");
  assert.equal(normalizeDecimalString("1,234.56"), "1234.56");
  assert.equal(normalizeDecimalString("1234.56"), "1234.56");
  assert.equal(normalizeDecimalString("1.234.567"), "1234567");
  assert.equal(parseMoney("32155580.0"), 3215558000n);
  assert.equal(parseMoney(7862.000000000001), 786200n);
  assert.equal(parseMoney("1 234,565"), 123457n); // half-up at the 3rd decimal
  assert.equal(percentOf(6354068400n, 20n), 1270813680n);
  assert.equal(formatSum(-1301686360n), "-13 016 863,60");
});

test("dates: Excel serials, dd.mm.yyyy, ПК-17 'hh:mm:ss dd.mm.yyyy'; impossible dates rejected", () => {
  assert.equal(parseDate("11.09.2026"), "2026-09-11");
  assert.equal(parseDate(46276), "2026-09-11");
  assert.equal(parseDateTime("18:35:47 14.09.2026"), "2026-09-14T18:35:47");
  assert.equal(parseDateTime(new Date(Date.UTC(2026, 8, 18, 23, 48, 6))), "2026-09-18T23:48:06");
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("45.13.2026"), null);
});

test("classifier: filenames (with _ or spaces), then workbook content", async () => {
  assert.equal(classifyByFilename("basket_HAZORASP-TEXTIL MAS'ULIYATI CHEKLANGAN JAMIYAT (6).xlsx"), "BASKET");
  assert.equal(classifyByFilename("300074865_Историческая_выписка_260923140841.xlsx"), "PAYMENTS");
  assert.equal(classifyByFilename("Историческая выписка_1.xlsx"), "PAYMENTS");
  assert.equal(classifyByFilename("Мои_лицевые_счета_в_ркп_260923140827.xlsx"), "ACCOUNTS");
  assert.equal(classifyByFilename("Shipments23_09_2026 09_11_57-20260923091157407.xlsx"), "SHIPMENTS");
  assert.equal(classifyByFilename("Книга1.xlsx"), null);
  assert.equal(await classifyByContent(await buildShipments([{ deal: "1", seller: "X FX", doc: "HF-1", docDate: "20.09.2026", qtyKg: 1, dealQtyKg: 1 }])), "SHIPMENTS");
  const legs = paymentPair({ txId: 1, at: new Date(2026, 8, 20), farmer: "X FX", inn: "1", farmerAccount: "2", amount: 1, deal: "1" });
  assert.equal(await classifyByContent(await buildStatement(legs)), "PAYMENTS");
});

test("shipment status mapping: Approved → ACTIVE, others mapped, unknown → UNKNOWN", () => {
  assert.equal(normalizeShipmentStatus("Approved"), "ACTIVE");
  assert.equal(normalizeShipmentStatus("Pending"), "PENDING");
  assert.equal(normalizeShipmentStatus("Rejected"), "REJECTED");
  assert.equal(normalizeShipmentStatus("Cancelled"), "CANCELLED");
  assert.equal(normalizeShipmentStatus("Draft"), "UNKNOWN");
});

// ---- matching (spec tests 5, 6, 7) ---------------------------------------------

const H = [
  harvest({ inn: "204858134", farmerName: "ISMOIL OQ OTA FX", contractNumber: "159025", conditionedKg: 100 }),
  harvest({ inn: "303575374", farmerName: "POLVON QO_SHAR FX", contractNumber: "159050", conditionedKg: 100 })
];

test("Test 5 — farmer matched by INN even when the name is spelled differently", () => {
  const m = new FarmerIndex(H).match({ inn: "204858134", name: '"ИСМОИЛ ОК ОТА" ФХ' });
  assert.deepEqual([m.inn, m.method, m.confidence], ["204858134", "INN", 1]);
});

test("Test 6 — no INN: matched through the contract (deal) number", () => {
  const m = new FarmerIndex(H).match({ inn: null, contract: "159050", name: "unrelated" });
  assert.deepEqual([m.inn, m.method, m.confidence], ["303575374", "CONTRACT", 0.95]);
});

test("Test 7 — last-resort normalized name match; weak names are never auto-accepted", () => {
  const idx = new FarmerIndex(H);
  const strong = idx.match({ name: "Полвон Қўшар ФХ" });
  assert.deepEqual([strong.inn, strong.method], ["303575374", "NAME"]);
  assert.ok(strong.confidence >= 0.8);
  const weak = idx.match({ name: "Бутунлай бошқа фермер" });
  assert.equal(weak.inn, null);
  assert.equal(weak.method, "NONE");
});

test("account-number match via RKP client code (3rd priority)", () => {
  const legs: PaymentRecord[] = [
    { naturalKey: "tx:1", fingerprint: "", sourceRow: 9, txId: "1", opDateTime: null, opDate: null, counterpartyName: "X", counterpartyInn: "204858134", counterpartyAccount: "221018600010390000133150001", accountName: null, debit: 1n, credit: 0n, details: null, dealNumber: null, clearingContract: null, invoiceNo: null, isReversal: false, isCompanySide: false, statementAccount: null, clientInn: null }
  ];
  const m = new FarmerIndex(H, legs).match({ account: "201018600010100000133150001" });
  assert.deepEqual([m.inn, m.method], ["204858134", "ACCOUNT"]);
});

// ---- validation (spec tests 8, 9, 10) -------------------------------------------

test("Test 8 — unknown harvest type is a CRITICAL data-quality issue and excluded from totals", () => {
  const v = validateHarvest([harvest({ inn: "1", conditionedKg: 500, method: "UNKNOWN", methodRaw: "Aralash" })]);
  assert.ok(v.issues.some((i) => i.code === "UNKNOWN_HARVEST_TYPE" && i.severity === "CRITICAL"));
  assert.equal(v.counted.length, 0);
});

test("Test 9 — missing contract is CRITICAL", () => {
  const v = validateHarvest([harvest({ inn: "1", conditionedKg: 500, contractNumber: null })]);
  assert.ok(v.issues.some((i) => i.code === "MISSING_CONTRACT" && i.severity === "CRITICAL"));
});

test("Test 10 — invalid date is CRITICAL (distinct from a missing date) and not counted", () => {
  const v = validateHarvest([
    harvest({ inn: "1", conditionedKg: 500, acceptanceDate: null, acceptanceDateInvalid: true }),
    harvest({ inn: "1", conditionedKg: 500, acceptanceDate: null })
  ]);
  assert.deepEqual(v.issues.filter((i) => i.severity === "CRITICAL").map((i) => i.code).sort(), ["INVALID_DATE", "MISSING_DATE"]);
  assert.equal(v.counted.length, 0);
});

test("pipeline states are not errors: unweighed truck → INFO, lab pending → WARNING, signed with no weight → CRITICAL", () => {
  const v = validateHarvest([
    harvest({ inn: "1", conditionedKg: null, physicalKg: null, method: "UNKNOWN", methodRaw: null, pk17: null }),
    harvest({ inn: "1", conditionedKg: 0, physicalKg: 4950, pk17: null }),
    harvest({ inn: "1", conditionedKg: 0, physicalKg: 4950, pk17: "XH9" }),
    harvest({ inn: "1", conditionedKg: -5 })
  ]);
  const codes = v.issues.map((i) => `${i.severity}:${i.code}`);
  assert.ok(codes.includes("INFO:PENDING_WEIGHING"));
  assert.ok(codes.includes("WARNING:CONDITIONED_WEIGHT_PENDING"));
  assert.ok(codes.includes("CRITICAL:INVALID_WEIGHT"));
  assert.ok(codes.includes("CRITICAL:NEGATIVE_WEIGHT"));
  assert.equal(v.counted.length, 0);
});

// ---- calculation (spec tests 13, 14) ---------------------------------------------

function ship(p: Partial<ShipmentRecord> & { dealNumber: string; shipmentQtyKg: number }): ShipmentRecord {
  return {
    naturalKey: `shp:${p.dealNumber}:${p.documentNumber ?? Math.random()}`,
    fingerprint: "",
    sourceRow: 2,
    dealDate: null,
    contractNumber: "119020",
    sellerName: null,
    sellerBroker: null,
    sellerInn: null,
    buyerName: null,
    buyerBroker: null,
    productName: null,
    documentNumber: "HF-1",
    documentDate: "2026-09-20",
    deliveryCost: BigInt(Math.round(p.shipmentQtyKg * 786200)),
    dealQtyKg: 100000,
    dealAmount: null,
    unit: "килограмм",
    shipmentTimer: "0",
    status: "ACTIVE",
    statusRaw: "Approved",
    ...p
  };
}

function calc(h: ReturnType<typeof harvest>[], shipments: ShipmentRecord[] = [], payments: PaymentRecord[] = []) {
  const v = validateHarvest(h);
  return calculate({ harvest: h, counted: v.counted, payments, accounts: [], shipments, directory: [], reportDate: "2026-09-23", generatedAt: "2026-09-23T14:30:00", sourceUpdatedAt: null });
}

test("Test 13 — several shipments of one contract are summed; statuses outside the counted set are not", () => {
  const h = [harvest({ inn: "1", contractNumber: "D1", conditionedKg: 9000 })];
  const r = calc(h, [
    ship({ dealNumber: "D1", documentNumber: "HF-1", shipmentQtyKg: 4000 }),
    ship({ dealNumber: "D1", documentNumber: "HF-2", shipmentQtyKg: 3500 }),
    ship({ dealNumber: "D1", documentNumber: "HF-3", shipmentQtyKg: 999, status: "PENDING" })
  ]);
  const c = r.shipmentContracts.find((x) => x.dealNumber === "D1")!;
  assert.equal(c.documents, 3);
  assert.equal(c.shippedKg, 7500);
  assert.equal(c.farmerInn, "1");
  assert.equal(c.match.method, "CONTRACT");
  assert.equal(r.kpi.shippedKg, 7500);
});

test("Test 14 — one farmer with several contracts: one line, plan = Σ contract quantities, all harvest summed", () => {
  const h = [
    harvest({ inn: "9", farmerName: "AGRO MCHJ", contractNumber: "C1", contractQtyT: 500, conditionedKg: 20000, method: "MACHINE", methodRaw: "Mashina terimi", recordNo: "1" }),
    harvest({ inn: "9", farmerName: "AGRO MCHJ", contractNumber: "C2", contractQtyT: 300, conditionedKg: 1000, recordNo: "2" }),
    harvest({ inn: "9", farmerName: "AGRO MCHJ", contractNumber: "C2", contractQtyT: 300, conditionedKg: 1500, acceptanceDate: "2026-09-22", recordNo: "3" })
  ];
  const r = calc(h);
  const lines = r.lines.filter((l) => l.inn === "9");
  assert.equal(lines.length, 1);
  const l = lines[0]!;
  assert.equal(l.planT, 800);
  assert.deepEqual(l.contracts.sort(), ["C1", "C2"]);
  assert.equal(l.total.machineKg, 20000);
  assert.equal(l.total.handKg, 2500);
  assert.equal(l.today.handKg + l.today.machineKg, 21000);
  assert.deepEqual(r.days, ["2026-09-22", "2026-09-23"]);
});

test("payments: company legs excluded, reversals netted, 20% and remainder exact to the tiyin", () => {
  const h = [harvest({ inn: "204858134", farmerName: "ISMOIL OQ OTA FX", contractNumber: "159025", conditionedKg: 4090 })];
  const leg = (tx: string, debit: bigint, credit: bigint, company = false, date = "2026-09-23"): PaymentRecord => ({
    naturalKey: `tx:${tx}`, fingerprint: "", sourceRow: 9, txId: tx, opDateTime: `${date}T10:00:00`, opDate: date,
    counterpartyName: company ? "HAZORASP-TEXTIL MCHJ" : '"ISMOIL OQ OTA" FX', counterpartyInn: company ? "300074865" : "204858134",
    counterpartyAccount: null, accountName: null, debit, credit, details: null, dealNumber: "159025", clearingContract: "119020",
    invoiceNo: null, isReversal: credit > 0n && !company, isCompanySide: company, statementAccount: null, clientInn: "300074865"
  });
  const r = calc(h, [], [leg("1", 0n, 900000000n, true), leg("2", 900000000n, 0n, false, "2026-09-22"), leg("3", 500000n, 0n), leg("4", 0n, 200000n)]);
  const l = r.lines.find((x) => x.inn === "204858134")!;
  assert.equal(l.sum100, 3215558000n); // 4090 × 7862 so'm
  assert.equal(l.sum20, 643111600n);
  assert.equal(l.paidTotal, 900300000n);
  assert.equal(l.paidToday, 300000n);
  assert.equal(l.pickingBalance, 643111600n - 900300000n);
  assert.equal(r.ownerLegs.count, 1);
});
