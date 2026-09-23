// Real-data regression test (spec Test 1 on the real exports). The source
// files hold INNs and payment amounts and are never committed, so this runs
// only when KT_REAL_DIR points at a folder containing the four exports and
// the hand-made "Кунлик терим.xlsx"; otherwise it is skipped.
//
//   KT_REAL_DIR=~/Downloads/kt-real npm test
//
// Expected numbers were reconciled by hand against the hand-made report
// (docs/kunlik-terim/DATA_PROFILE.md §6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const realDir = process.env.KT_REAL_DIR;
const dir = mkdtempSync(path.join(tmpdir(), "ptz-kunlik-real-"));
process.env.PTZ_DATA_DIR = dir;
process.env.PTZ_DIRECTORY_PATH = path.join(dir, "none.xlsx");

test("real exports reproduce the hand-made Кунлик терим figures", { skip: !realDir && "KT_REAL_DIR not set" }, async () => {
  const { classifyFile } = await import("../../src/lib/ptz/kunlik/classifier.ts");
  const { processBatch } = await import("../../src/lib/ptz/kunlik/service.ts");
  const names = readdirSync(realDir!).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$") && !/кунлик/i.test(f));
  const files = [];
  for (const name of names) {
    const buffer = readFileSync(path.join(realDir!, name));
    const cls = await classifyFile(name, buffer);
    if (cls) files.push({ type: cls.type, filename: name, buffer });
  }
  assert.equal(files.length, 4, `expected the 4 source exports in ${realDir}, found: ${names.join(", ")}`);

  const out = await processBatch(files, { trigger: "cli" });
  const k = out.report.kpi;
  const d = new Map(out.report.daily.map((x) => [x.date, x]));

  // Season total equals the basket's own ЖАМИ row (Кондицион вазни).
  assert.equal(k.seasonTotalKg, 5_505_295);
  // 11–19.09 match the hand-made report to the kilogram.
  assert.deepEqual([d.get("2026-09-11")!.handKg, d.get("2026-09-11")!.machineKg], [67_117, 0]);
  assert.deepEqual([d.get("2026-09-15")!.handKg, d.get("2026-09-15")!.machineKg], [229_203, 193_330]);
  assert.deepEqual([d.get("2026-09-19")!.handKg, d.get("2026-09-19")!.machineKg], [582_557, 88_840]);
  assert.equal(d.get("2026-09-11")!.handSum, 52_767_385_400n); // 527 673.854 thousand so'm
  // Payments equal "Терим учун утказилган маблаг" (Жами / Бир кунда).
  assert.equal(k.paidTotal, 254_957_081_032n);
  assert.equal(k.paidToday, 53_898_161_136n);
  assert.equal(k.shipmentDeals, 66);
  assert.equal(out.dq.critical, 0);
});
