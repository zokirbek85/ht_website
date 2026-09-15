// Unifies the analytics engine into one "Report" object model (§23/§24):
// one dataset, one CottonAcceptanceAnalytics instance, three outputs that
// can never disagree because they all read from this same bundle.
import { DOCUMENTED_ASSUMPTIONS } from "./config.ts";
import {
  CottonAcceptanceAnalytics,
  getImportById,
  loadOperations,
  type ClusterAnalytics,
  type ContractPerformance,
  type FarmerAnalytics,
  type FinanceDashboard,
  type ManagementSummary,
  type QualityDashboard,
  type TrendPoint,
  type WeightBridgeStage
} from "./analytics.ts";
import type { Alert, ImportRecord } from "./types.ts";
import { generatePdfReport } from "./reports/pdf.ts";
import { generateXlsxReport } from "./reports/xlsx.ts";
import { createTempAccess } from "./tempAccess.ts";

export type ReportBundle = {
  import: ImportRecord;
  engine: CottonAcceptanceAnalytics;
  summary: ManagementSummary;
  contracts: ContractPerformance[];
  farmers: FarmerAnalytics[];
  topFarmers: FarmerAnalytics[];
  bottomFarmers: FarmerAnalytics[];
  clusters: ClusterAnalytics[];
  quality: QualityDashboard;
  finance: FinanceDashboard;
  weightBridge: WeightBridgeStage[];
  dailyTrend: TrendPoint[];
  alerts: Alert[];
  assumptions: string[];
};

export function buildReportBundle(importId: number): ReportBundle | null {
  const imp = getImportById(importId);
  if (!imp) return null;

  const rows = loadOperations(importId);
  const engine = new CottonAcceptanceAnalytics(rows);

  return {
    import: imp,
    engine,
    summary: engine.summary(),
    contracts: engine.contracts(),
    farmers: engine.farmers(),
    topFarmers: engine.topFarmers(10),
    bottomFarmers: engine.bottomFarmers(10),
    clusters: engine.clusters(),
    quality: engine.quality(),
    finance: engine.finance(),
    weightBridge: engine.weightBridge(),
    dailyTrend: engine.dailyTrend(),
    alerts: engine.controls(),
    assumptions: DOCUMENTED_ASSUMPTIONS
  };
}

export type ReportPackage = {
  bundle: ReportBundle;
  pdf: Buffer;
  xlsx: Buffer;
  webUrl: string;
  webPassword: string;
};

/** report.pdf / report.xlsx / report.webUrl / report.metrics, from a single generation call (§23). */
export async function generateReportPackage(
  importId: number,
  siteUrl: string,
  createdFor: string | null
): Promise<ReportPackage | null> {
  const bundle = buildReportBundle(importId);
  if (!bundle) return null;

  const [pdf, xlsx] = await Promise.all([generatePdfReport(bundle), generateXlsxReport(bundle)]);
  const access = createTempAccess(importId, createdFor);
  const webUrl = `${siteUrl}/ptz/report/${access.token}`;

  return { bundle, pdf, xlsx, webUrl, webPassword: access.password };
}
