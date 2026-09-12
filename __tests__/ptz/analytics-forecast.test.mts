import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-forecast-"));
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

const { computeForecast } = await import("../../src/lib/ptz/analytics.ts");
const { setSetting } = await import("../../src/lib/ptz/settings.ts");

test("GREEN when current pace already meets the required pace", () => {
  setSetting("season_deadline", "2026-12-31");
  const trend = [
    { date: "2026-09-01", cumulativeQty: 0, dailyQty: 0 },
    { date: "2026-09-08", cumulativeQty: 700, dailyQty: 100 }
  ];
  const forecast = computeForecast(1000, trend);
  assert.equal(forecast.status, "GREEN");
  assert.ok(forecast.currentRunRate && forecast.currentRunRate >= (forecast.requiredDailyRate ?? Infinity));
});

test("RED when the deadline has already passed and the plan is incomplete", () => {
  setSetting("season_deadline", "2026-09-05");
  const trend = [
    { date: "2026-09-01", cumulativeQty: 0, dailyQty: 0 },
    { date: "2026-09-10", cumulativeQty: 100, dailyQty: 10 }
  ];
  const forecast = computeForecast(1000, trend);
  assert.equal(forecast.status, "RED");
  assert.equal(forecast.requiredDailyRate, null);
});

test("UNKNOWN when there is only one snapshot (no run rate to compute)", () => {
  setSetting("season_deadline", "2026-12-31");
  const trend = [{ date: "2026-09-01", cumulativeQty: 100, dailyQty: 100 }];
  const forecast = computeForecast(1000, trend);
  assert.equal(forecast.status, "UNKNOWN");
  assert.equal(forecast.currentRunRate, null);
});

test("GREEN immediately once the plan is fully met, regardless of pace", () => {
  setSetting("season_deadline", "2026-12-31");
  const trend = [
    { date: "2026-09-01", cumulativeQty: 0, dailyQty: 0 },
    { date: "2026-09-02", cumulativeQty: 1000, dailyQty: 1000 }
  ];
  const forecast = computeForecast(1000, trend);
  assert.equal(forecast.status, "GREEN");
  assert.equal(forecast.remainingQty, 0);
});

test("run-rate window tolerates gaps in reporting (anchors to the latest snapshot at or before the window cutoff)", () => {
  setSetting("season_deadline", "2026-12-31");
  setSetting("forecast_window_days", "7");
  // Cutoff = Sep 9 - 7d = Sep 2. Sep 3 is already past the cutoff, so the
  // window anchors further back, to Sep 1 — never interpolating between
  // snapshots, only ever using a real reported date.
  const trend = [
    { date: "2026-09-01", cumulativeQty: 0, dailyQty: 0 },
    { date: "2026-09-03", cumulativeQty: 60, dailyQty: 30 },
    { date: "2026-09-09", cumulativeQty: 200, dailyQty: 0 }
  ];
  const forecast = computeForecast(1000, trend);
  // (200 - 0) / (Sep 9 - Sep 1 = 8 days) = 25
  assert.ok(forecast.currentRunRate);
  assert.ok(Math.abs((forecast.currentRunRate ?? 0) - 25) < 0.01);
});
