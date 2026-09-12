import { test } from "node:test";
import assert from "node:assert/strict";

const { detectDateFromFilename } = await import("../../src/lib/ptz/dateDetect.ts");

test("detects the trailing date and ignores stray digits earlier in the name", () => {
  assert.equal(detectDateFromFilename("Сводка 11,09,26.xlsx"), "2026-09-11");
  assert.equal(detectDateFromFilename("day2-11,09,26.xlsx"), "2026-09-11");
  assert.equal(detectDateFromFilename("report_v2_15.03.2026.xlsx"), "2026-03-15");
  assert.equal(detectDateFromFilename("no-date-here.xlsx"), null);
});

test("treats a 2-digit year as 20xx", () => {
  assert.equal(detectDateFromFilename("hisobot-01.01.09.xlsx"), "2009-01-01");
});
