import { getDb } from "./db.ts";
import { getForecastWindowDays, getNumberSetting, getSeasonDeadline } from "./settings.ts";
import { CONTRACT_TYPES, SERIES, type ContractType, type ForecastStatus, type Series } from "./types.ts";

export type ReportRow = {
  id: number;
  reportDate: string;
  sourceFilename: string;
  importedAt: string;
  status: string;
  isActive: number;
  warningCount: number;
  errorCount: number;
};

function mapReportRow(r: {
  id: number;
  report_date: string;
  source_filename: string;
  imported_at: string;
  status: string;
  is_active: number;
  warning_count: number;
  error_count: number;
}): ReportRow {
  return {
    id: r.id,
    reportDate: r.report_date,
    sourceFilename: r.source_filename,
    importedAt: r.imported_at,
    status: r.status,
    isActive: r.is_active,
    warningCount: r.warning_count,
    errorCount: r.error_count
  };
}

export function getLatestActiveReport(): ReportRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, report_date, source_filename, imported_at, status, is_active, warning_count, error_count
       FROM reports WHERE is_active = 1 ORDER BY report_date DESC LIMIT 1`
    )
    .get() as Parameters<typeof mapReportRow>[0] | undefined;
  return row ? mapReportRow(row) : null;
}

export function getReportById(id: number): ReportRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, report_date, source_filename, imported_at, status, is_active, warning_count, error_count
       FROM reports WHERE id = ?`
    )
    .get(id) as Parameters<typeof mapReportRow>[0] | undefined;
  return row ? mapReportRow(row) : null;
}

export function listAllReports(limit = 50): ReportRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, report_date, source_filename, imported_at, status, is_active, warning_count, error_count
       FROM reports ORDER BY imported_at DESC LIMIT ?`
    )
    .all(limit) as Parameters<typeof mapReportRow>[0][];
  return rows.map(mapReportRow);
}

export function listActiveReports(): ReportRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, report_date, source_filename, imported_at, status, is_active, warning_count, error_count
       FROM reports WHERE is_active = 1 ORDER BY report_date ASC`
    )
    .all() as Parameters<typeof mapReportRow>[0][];
  return rows.map(mapReportRow);
}

export function getPreviousActiveReport(reportDate: string): ReportRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, report_date, source_filename, imported_at, status, is_active, warning_count, error_count
       FROM reports WHERE is_active = 1 AND report_date < ? ORDER BY report_date DESC LIMIT 1`
    )
    .get(reportDate) as Parameters<typeof mapReportRow>[0] | undefined;
  return row ? mapReportRow(row) : null;
}

type MetricRow = {
  farmerId: number;
  farmerName: string;
  regionName: string | null;
  series: Series;
  planQty: number | null;
  sourceDailyQty: number | null;
  sourceCumulativeQty: number | null;
  calculatedDailyDelta: number | null;
  completionPct: number | null;
};

export function loadReportMetrics(reportId: number): MetricRow[] {
  const rows = getDb()
    .prepare(
      `SELECT f.id AS farmer_id, f.name AS farmer_name, r.name AS region_name, fm.series AS series,
              fm.plan_qty AS plan_qty, fm.source_daily_qty AS source_daily_qty,
              fm.source_cumulative_qty AS source_cumulative_qty,
              fm.calculated_daily_delta AS calculated_daily_delta, fm.completion_pct AS completion_pct
       FROM farmer_metrics fm
       JOIN farmers f ON f.id = fm.farmer_id
       LEFT JOIN regions r ON r.id = f.region_id
       WHERE fm.report_id = ?`
    )
    .all(reportId) as {
    farmer_id: number;
    farmer_name: string;
    region_name: string | null;
    series: Series;
    plan_qty: number | null;
    source_daily_qty: number | null;
    source_cumulative_qty: number | null;
    calculated_daily_delta: number | null;
    completion_pct: number | null;
  }[];

  return rows.map((r) => ({
    farmerId: r.farmer_id,
    farmerName: r.farmer_name,
    regionName: r.region_name,
    series: r.series,
    planQty: r.plan_qty,
    sourceDailyQty: r.source_daily_qty,
    sourceCumulativeQty: r.source_cumulative_qty,
    calculatedDailyDelta: r.calculated_daily_delta,
    completionPct: r.completion_pct
  }));
}

export type Aggregate = { planQty: number; cumulativeQty: number; dailyQty: number; farmerCount: number };

export function aggregateSeries(rows: MetricRow[], series: Series): Aggregate {
  let planQty = 0;
  let cumulativeQty = 0;
  let dailyQty = 0;
  let farmerCount = 0;
  for (const r of rows) {
    if (r.series !== series) continue;
    farmerCount++;
    planQty += r.planQty ?? 0;
    cumulativeQty += r.sourceCumulativeQty ?? 0;
    dailyQty += r.sourceDailyQty ?? r.calculatedDailyDelta ?? 0;
  }
  return { planQty, cumulativeQty, dailyQty, farmerCount };
}

function groupByFarmer(rows: MetricRow[]): Map<number, Partial<Record<Series, MetricRow>>> {
  const byFarmer = new Map<number, Partial<Record<Series, MetricRow>>>();
  for (const r of rows) {
    const e = byFarmer.get(r.farmerId) ?? {};
    e[r.series] = r;
    byFarmer.set(r.farmerId, e);
  }
  return byFarmer;
}

/** Overall totals: prefer each farmer's sourced TOTAL row, else sum their three contract types. */
export function aggregateOverall(rows: MetricRow[]): Aggregate {
  const byFarmer = groupByFarmer(rows);
  let planQty = 0;
  let cumulativeQty = 0;
  let dailyQty = 0;
  for (const e of byFarmer.values()) {
    if (e.TOTAL) {
      planQty += e.TOTAL.planQty ?? 0;
      cumulativeQty += e.TOTAL.sourceCumulativeQty ?? 0;
      dailyQty += e.TOTAL.sourceDailyQty ?? e.TOTAL.calculatedDailyDelta ?? 0;
    } else {
      for (const ct of CONTRACT_TYPES) {
        const m = e[ct];
        if (!m) continue;
        planQty += m.planQty ?? 0;
        cumulativeQty += m.sourceCumulativeQty ?? 0;
        dailyQty += m.sourceDailyQty ?? m.calculatedDailyDelta ?? 0;
      }
    }
  }
  return { planQty, cumulativeQty, dailyQty, farmerCount: byFarmer.size };
}

type TrendPoint = { date: string; cumulativeQty: number; dailyQty: number };

export function getOverallTrend(): TrendPoint[] {
  const reports = listActiveReports();
  return reports.map((r) => {
    const agg = aggregateOverall(loadReportMetrics(r.id));
    return { date: r.reportDate, cumulativeQty: agg.cumulativeQty, dailyQty: agg.dailyQty };
  });
}

export function getSeriesTrend(series: Series): TrendPoint[] {
  const reports = listActiveReports();
  return reports.map((r) => {
    const agg = aggregateSeries(loadReportMetrics(r.id), series);
    return { date: r.reportDate, cumulativeQty: agg.cumulativeQty, dailyQty: agg.dailyQty };
  });
}

function computeRunRate(points: TrendPoint[], windowDays: number): number | null {
  if (points.length < 2) return null;
  const latest = points.at(-1);
  const first = points[0];
  if (!latest || !first) return null;
  const latestTime = new Date(latest.date).getTime();
  const cutoff = latestTime - windowDays * 86_400_000;

  let base = first;
  for (const p of points) {
    if (new Date(p.date).getTime() <= cutoff) base = p;
    else break;
  }
  if (base.date === latest.date) return null;

  const days = (latestTime - new Date(base.date).getTime()) / 86_400_000;
  if (days <= 0) return null;
  return (latest.cumulativeQty - base.cumulativeQty) / days;
}

export type Forecast = {
  planQty: number;
  cumulativeQty: number;
  remainingQty: number;
  completionPct: number | null;
  currentRunRate: number | null;
  requiredDailyRate: number | null;
  forecastDate: string | null;
  deadline: string;
  status: ForecastStatus;
};

export function computeForecast(planQty: number, trend: TrendPoint[]): Forecast {
  const windowDays = getForecastWindowDays();
  const yellowThresholdPct = getNumberSetting("status_yellow_threshold_pct", 90);
  const latest = trend[trend.length - 1];
  const cumulativeQty = latest?.cumulativeQty ?? 0;
  const remainingQty = planQty - cumulativeQty;
  const completionPct = planQty > 0 ? (cumulativeQty / planQty) * 100 : null;

  const reportYear = latest ? new Date(latest.date).getUTCFullYear() : new Date().getUTCFullYear();
  const deadline = getSeasonDeadline(reportYear);

  if (!latest || remainingQty <= 0) {
    return {
      planQty,
      cumulativeQty,
      remainingQty: Math.max(remainingQty, 0),
      completionPct,
      currentRunRate: null,
      requiredDailyRate: null,
      forecastDate: latest?.date ?? null,
      deadline,
      status: remainingQty <= 0 ? "GREEN" : "UNKNOWN"
    };
  }

  const currentRunRate = computeRunRate(trend, windowDays);
  const remainingDays = (new Date(deadline).getTime() - new Date(latest.date).getTime()) / 86_400_000;
  const requiredDailyRate = remainingDays > 0 ? remainingQty / remainingDays : null;

  let forecastDate: string | null = null;
  if (currentRunRate != null && currentRunRate > 0) {
    const days = remainingQty / currentRunRate;
    forecastDate = new Date(new Date(latest.date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  }

  let status: ForecastStatus = "UNKNOWN";
  if (currentRunRate == null) {
    status = "UNKNOWN";
  } else if (requiredDailyRate == null) {
    status = "RED"; // deadline already passed and plan incomplete
  } else if (currentRunRate >= requiredDailyRate) {
    status = "GREEN";
  } else if (currentRunRate >= requiredDailyRate * (yellowThresholdPct / 100)) {
    status = "YELLOW";
  } else {
    status = "RED";
  }

  return {
    planQty,
    cumulativeQty,
    remainingQty,
    completionPct,
    currentRunRate,
    requiredDailyRate,
    forecastDate,
    deadline,
    status
  };
}

export type ContractTypeSummary = {
  contractType: ContractType;
  planQty: number;
  cumulativeQty: number;
  dailyQty: number;
  completionPct: number | null;
  forecast: Forecast;
};

export function getContractTypeBreakdown(): ContractTypeSummary[] {
  return CONTRACT_TYPES.map((ct) => {
    const trend = getSeriesTrend(ct);
    const latest = trend[trend.length - 1];
    const planQty = latest?.cumulativeQty != null ? seriesPlanFromLatestReport(ct) : 0;
    const forecast = computeForecast(planQty, trend);
    return {
      contractType: ct,
      planQty,
      cumulativeQty: latest?.cumulativeQty ?? 0,
      dailyQty: latest?.dailyQty ?? 0,
      completionPct: forecast.completionPct,
      forecast
    };
  });
}

function seriesPlanFromLatestReport(series: Series): number {
  const latest = getLatestActiveReport();
  if (!latest) return 0;
  return aggregateSeries(loadReportMetrics(latest.id), series).planQty;
}

export type RankingEntry = {
  name: string;
  region: string | null;
  planQty: number;
  cumulativeQty: number;
  dailyQty: number;
  completionPct: number | null;
};

export function getFarmerRanking(reportId: number, limit = 10): { top: RankingEntry[]; bottom: RankingEntry[] } {
  const rows = loadReportMetrics(reportId);
  const byFarmer = groupByFarmer(rows);
  const entries: RankingEntry[] = [];

  for (const [, series] of byFarmer.entries()) {
    const m = series.TOTAL;
    if (!m || m.planQty == null || m.planQty === 0) continue;
    entries.push({
      name: m.farmerName,
      region: m.regionName,
      planQty: m.planQty,
      cumulativeQty: m.sourceCumulativeQty ?? 0,
      dailyQty: m.sourceDailyQty ?? m.calculatedDailyDelta ?? 0,
      completionPct: m.completionPct
    });
  }

  const sorted = [...entries].sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0));
  return { top: sorted.slice(0, limit), bottom: sorted.slice(-limit).reverse() };
}

export function getRegionRanking(reportId: number): RankingEntry[] {
  const rows = loadReportMetrics(reportId).filter((r) => r.series === "TOTAL");
  const byRegion = new Map<string, RankingEntry>();
  for (const r of rows) {
    const key = r.regionName ?? "Номаълум ҳудуд";
    const entry = byRegion.get(key) ?? { name: key, region: key, planQty: 0, cumulativeQty: 0, dailyQty: 0, completionPct: null };
    entry.planQty += r.planQty ?? 0;
    entry.cumulativeQty += r.sourceCumulativeQty ?? 0;
    entry.dailyQty += r.sourceDailyQty ?? r.calculatedDailyDelta ?? 0;
    byRegion.set(key, entry);
  }
  const list = [...byRegion.values()].map((e) => ({
    ...e,
    completionPct: e.planQty > 0 ? (e.cumulativeQty / e.planQty) * 100 : null
  }));
  return list.sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0));
}

export function getRiskFarmers(reportId: number, thresholdPct = 50, limit = 15): RankingEntry[] {
  const { bottom } = getFarmerRanking(reportId, 10_000);
  return bottom.filter((e) => (e.completionPct ?? 0) < thresholdPct).slice(0, limit);
}

export const CONTRACT_TYPE_LIST = CONTRACT_TYPES;
export const ALL_SERIES = SERIES;
