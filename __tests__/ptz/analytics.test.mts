import { test } from "node:test";
import assert from "node:assert/strict";
import { CottonAcceptanceAnalytics, type OperationEntity } from "../../src/lib/ptz/analytics.ts";

let nextId = 1;
function op(partial: Partial<OperationEntity>): OperationEntity {
  return {
    id: nextId++,
    importId: 1,
    rowNumber: nextId,
    isDuplicate: false,
    isValid: true,
    farmerId: 1,
    farmerName: "Test Farmer",
    farmerInn: null,
    farmerRegion: null,
    farmerDistrict: null,
    clusterName: null,
    contractId: 1,
    contractNumber: "C1",
    contractType: "Fyuchers",
    contractQty: 100, // tons
    acceptanceDate: "2026-09-11",
    pk17Number: "PK1",
    pk17SignedAt: "2026-09-11T10:00:00",
    varietyDeclared: null,
    pickingMethod: "1-Qo`l terimi",
    industrialGradeLab: "1",
    classLab: "2",
    grossKg: null,
    tareKg: null,
    physicalKg: 1000,
    impurityPct: 5,
    calculatedKg: 980,
    moisturePct: 10,
    conditionedKg: 950,
    markup: 0,
    discount: 0,
    unitPrice: 8000,
    amount: 950 * 8000,
    transportFee: 0,
    seedCottonFee: 0,
    otherFeeTotal: 0,
    buyerName: "HAZORASP-TEXTIL MCHJ",
    preparationPointName: null,
    vehicleType: null,
    vehiclePlate: null,
    ...partial
  };
}

test("summary(): contract achievement uses the configured reporting weight (conditionedKg by default)", () => {
  const rows = [op({ conditionedKg: 950, contractQty: 100 }), op({ conditionedKg: 550, contractQty: 100, contractNumber: "C1" })];
  const engine = new CottonAcceptanceAnalytics(rows);
  const s = engine.summary();

  assert.equal(s.contractQtyKg, 100_000); // one contract counted once, tons -> kg
  assert.equal(s.acceptedKg, 1500);
  assert.equal(s.remainingKg, 98_500);
  assert.equal(s.overDeliveryKg, 0);
  assert.ok(Math.abs((s.achievementPct ?? 0) - 1.5) < 1e-9);
});

test("over-delivery is reported separately and remaining never goes negative", () => {
  const rows = [op({ contractNumber: "C1", contractQty: 1, conditionedKg: 1500 })]; // 1 ton contract, 1.5t delivered
  const engine = new CottonAcceptanceAnalytics(rows);
  const s = engine.summary();
  assert.equal(s.remainingKg, 0);
  assert.equal(s.overDeliveryKg, 500);
});

test("weighted average price = SUM(amount) / SUM(conditionedKg), not a simple average", () => {
  const rows = [
    op({ conditionedKg: 1000, unitPrice: 6000, amount: 1000 * 6000 }),
    op({ conditionedKg: 100, unitPrice: 9000, amount: 100 * 9000 })
  ];
  const engine = new CottonAcceptanceAnalytics(rows);
  const weighted = engine.summary().weightedAvgPrice!;
  const simple = (6000 + 9000) / 2;
  assert.ok(Math.abs(weighted - 6272.7) < 1); // dominated by the larger delivery
  assert.notEqual(Math.round(weighted), simple);
});

test("contract status thresholds: NOT_STARTED / IN_PROGRESS / NEAR_COMPLETION / COMPLETED / OVER_CONTRACT", () => {
  const rows = [
    op({ contractNumber: "A", contractQty: 0.001, conditionedKg: 0 }), // no operations at all handled separately below
    op({ contractNumber: "B", contractQty: 1, conditionedKg: 500 }), // 50%
    op({ contractNumber: "C", contractQty: 1, conditionedKg: 950 }), // 95%
    op({ contractNumber: "D", contractQty: 1, conditionedKg: 1000 }), // 100%
    op({ contractNumber: "E", contractQty: 1, conditionedKg: 1200 }) // 120%
  ];
  const engine = new CottonAcceptanceAnalytics(rows);
  const byContract = Object.fromEntries(engine.contracts().map((c) => [c.contractNumber, c.status]));
  assert.equal(byContract.B, "IN_PROGRESS");
  assert.equal(byContract.C, "NEAR_COMPLETION");
  assert.equal(byContract.D, "COMPLETED");
  assert.equal(byContract.E, "OVER_CONTRACT");
});

test("duplicate and invalid rows are excluded from totals but still visible via allRows", () => {
  const rows = [
    op({ conditionedKg: 1000 }),
    op({ isDuplicate: true, conditionedKg: 1000 }),
    op({ isValid: false, conditionedKg: null })
  ];
  const engine = new CottonAcceptanceAnalytics(rows);
  assert.equal(engine.rows.length, 1);
  assert.equal(engine.allRows.length, 3);
  assert.equal(engine.summary().acceptedKg, 1000);
});

test("dailyTrend(): groups by acceptance date and accumulates cumulative total", () => {
  const rows = [
    op({ acceptanceDate: "2026-09-11", conditionedKg: 100 }),
    op({ acceptanceDate: "2026-09-11", conditionedKg: 50 }),
    op({ acceptanceDate: "2026-09-12", conditionedKg: 200 })
  ];
  const engine = new CottonAcceptanceAnalytics(rows);
  const trend = engine.dailyTrend();
  assert.deepEqual(
    trend.map((p) => [p.date, p.dailyAcceptedKg, p.cumulativeAcceptedKg]),
    [
      ["2026-09-11", 150, 150],
      ["2026-09-12", 200, 350]
    ]
  );
});

test("weightBridge(): five stages in order with running differences", () => {
  const rows = [op({ grossKg: 11560, tareKg: 7330, physicalKg: 4230, calculatedKg: 4109, conditionedKg: 4090 })];
  const engine = new CottonAcceptanceAnalytics(rows);
  const stages = engine.weightBridge().map((s) => s.stage);
  assert.deepEqual(stages, ["Брутто", "Тара", "Физик вазн", "Ҳисобий вазн", "Кондицион вазн"]);
  assert.equal(engine.weightBridge()[0]?.diffFromPrevKg, null);
});

test("controls(): PK17_UNSIGNED and MISSING_PK17 are distinct alerts", () => {
  const rows = [
    op({ pk17Number: "PK9", pk17SignedAt: null }),
    op({ pk17Number: null, pk17SignedAt: null })
  ];
  const engine = new CottonAcceptanceAnalytics(rows);
  const codes = engine.controls().map((a) => a.code);
  assert.ok(codes.includes("PK17_UNSIGNED"));
  assert.ok(codes.includes("MISSING_PK17"));
});

test("controls(): zero weight and non-positive price are flagged RED", () => {
  const rows = [op({ physicalKg: 0, conditionedKg: 0 }), op({ unitPrice: 0 })];
  const engine = new CottonAcceptanceAnalytics(rows.map((r) => ({ ...r, isValid: true })));
  const zeroWeight = engine.controls().find((a) => a.code === "ZERO_WEIGHT");
  const badPrice = engine.controls().find((a) => a.code === "ZERO_OR_NEGATIVE_PRICE");
  assert.equal(zeroWeight?.severity, "RED");
  assert.equal(badPrice?.severity, "RED");
});

test("buyer filter defaults to HAZORASP-TEXTIL MCHJ and excludes other buyers", () => {
  const rows = [op({ buyerName: "HAZORASP-TEXTIL MCHJ", conditionedKg: 100 }), op({ buyerName: "OTHER BUYER MCHJ", conditionedKg: 500 })];
  const engine = new CottonAcceptanceAnalytics(rows);
  assert.equal(engine.rows.length, 1);
  assert.equal(engine.summary().acceptedKg, 100);

  const unfiltered = new CottonAcceptanceAnalytics(rows, { buyerFilter: null });
  assert.equal(unfiltered.rows.length, 2);
});
