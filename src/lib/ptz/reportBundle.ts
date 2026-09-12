import {
  aggregateOverall,
  computeForecast,
  getContractTypeBreakdown,
  getFarmerRanking,
  getOverallTrend,
  getPreviousActiveReport,
  getRegionRanking,
  getReportById,
  getRiskFarmers,
  loadReportMetrics,
  type ContractTypeSummary,
  type Forecast,
  type RankingEntry,
  type ReportRow
} from "./analytics.ts";
import { listWarningsForReport } from "./warnings.ts";

export type ReportBundle = {
  report: ReportRow;
  overall: { planQty: number; cumulativeQty: number; dailyQty: number };
  previousDailyQty: number | null;
  forecast: Forecast;
  contractTypes: ContractTypeSummary[];
  topRegions: RankingEntry[];
  bottomRegions: RankingEntry[];
  topFarmers: RankingEntry[];
  bottomFarmers: RankingEntry[];
  riskFarmers: RankingEntry[];
  warningMessages: string[];
};

export function buildReportBundle(reportId: number): ReportBundle | null {
  const report = getReportById(reportId);
  if (!report) return null;

  const overallAgg = aggregateOverall(loadReportMetrics(reportId));
  const trend = getOverallTrend();
  const forecast = computeForecast(overallAgg.planQty, trend);

  const previousReport = getPreviousActiveReport(report.reportDate);
  const previousDailyQty = previousReport ? aggregateOverall(loadReportMetrics(previousReport.id)).dailyQty : null;

  const contractTypes = getContractTypeBreakdown();
  const regions = getRegionRanking(reportId);
  const { top: topFarmers, bottom: bottomFarmers } = getFarmerRanking(reportId, 10);
  const riskFarmers = getRiskFarmers(reportId);
  const warningMessages = listWarningsForReport(reportId).map((w) => w.message);

  return {
    report,
    overall: overallAgg,
    previousDailyQty,
    forecast,
    contractTypes,
    topRegions: regions.slice(0, 10),
    bottomRegions: regions.slice(-10).reverse(),
    topFarmers,
    bottomFarmers,
    riskFarmers,
    warningMessages
  };
}
