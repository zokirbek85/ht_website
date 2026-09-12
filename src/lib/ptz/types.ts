// Shared types for the PTZ Analytics module.

export const CONTRACT_TYPES = ["FUTURES", "FORWARD", "TEMPORARY_STORAGE"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

// A "series" is a metric group stored per farmer per report: one of the three
// contract types, plus the two aggregate rows the source sheet also provides.
export const SERIES = [...CONTRACT_TYPES, "TOTAL", "DELIVERED"] as const;
export type Series = (typeof SERIES)[number];

export type Severity = "INFO" | "WARNING" | "ERROR";

export type ImportWarning = {
  severity: Severity;
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export type ParsedFarmerRow = {
  region: string | null;
  farmer: string;
  metrics: Partial<Record<Series, SeriesValues>>;
};

export type SeriesValues = {
  planQty?: number | null;
  sourceDailyQty?: number | null;
  sourceCumulativeQty?: number | null;
  completionPct?: number | null;
};

export type ParsedReport = {
  reportDate: string; // YYYY-MM-DD
  dateDetectionMethod: "filename" | "sheet_content" | "upload_time";
  sheetName: string;
  rows: ParsedFarmerRow[];
  warnings: ImportWarning[];
  columnMap: ColumnMapping[];
};

export type ColumnMapping = {
  columnIndex: number;
  headerPath: string;
  canonicalField: string | null;
  confidence: number;
};

export type ReportRecord = {
  id: number;
  reportDate: string;
  sourceFilename: string;
  sourceHash: string;
  importedAt: string;
  importedBy: string | null;
  telegramUserId: string | null;
  status: "success" | "partial" | "failed";
  parserVersion: string;
  schemaVersion: string;
  dateDetectionMethod: string;
  isActive: number;
  warningCount: number;
  errorCount: number;
  rawFilePath: string | null;
};

export type FarmerMetricRow = {
  reportId: number;
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

export type ForecastStatus = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export type SeriesAnalytics = {
  series: Series;
  planQty: number;
  cumulativeQty: number;
  dailyQty: number;
  previousDailyQty: number | null;
  growthPct: number | null;
  completionPct: number | null;
  remainingQty: number;
  currentRunRate: number | null;
  requiredDailyRate: number | null;
  forecastDate: string | null;
  status: ForecastStatus;
  isBaseline: boolean;
};
