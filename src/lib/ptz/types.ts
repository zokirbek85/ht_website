// Shared types for the Cotton Acceptance (Paxta qabuli) analytics module.
// Replaces the old farmer-progress-snapshot ("Сводка") model entirely — see
// docs/ptz-architecture.md for the 2026-09-15 decision and why.

export type Severity = "INFO" | "WARNING" | "ERROR";

export type ImportWarning = {
  severity: Severity;
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

/** One raw Excel row = one weighing/acceptance operation, after normalization. */
export type ParsedOperationRow = {
  rowNumber: number; // 1-based row number from the source sheet (for tracing back to Excel)

  farmerName: string;
  farmerInn: string | null;
  farmerRegion: string | null;
  farmerDistrict: string | null;

  contractType: string | null;
  contractNumber: string | null;
  contractQty: number | null; // in CONTRACT_QTY_UNIT (see config.ts), as read from the sheet

  acceptanceDate: string | null; // YYYY-MM-DD, Asia/Tashkent
  acceptanceRecordNo: string | null;

  pk17Number: string | null;
  pk17RegisteredAt: string | null; // ISO datetime, Asia/Tashkent
  pk17SignedAt: string | null; // ISO datetime, null = not yet signed

  batchNo: string | null;
  plotType: string | null;
  plotNo: string | null;

  varietyDeclared: string | null;
  generationDeclared: string | null;
  industrialGradeDeclared: string | null;
  classDeclared: string | null;

  pickingMethod: string | null;

  lab2hlNumber: string | null;
  industrialGradeLab: string | null;
  classLab: string | null;

  grossKg: number | null;
  tareKg: number | null;
  physicalKg: number | null;
  impurityPct: number | null;
  calculatedKg: number | null;
  moisturePct: number | null;
  conditionedKg: number | null;

  markup: number | null;
  discount: number | null;
  unitPrice: number | null;
  amount: number | null;
  transportFee: number | null;
  seedCottonFee: number | null;
  otherFeeTotal: number | null;

  buyerName: string | null;
  buyerInn: string | null;

  preparationPointName: string | null;
  preparationDistrict: string | null;
  preparationRegion: string | null;

  vehicleType: string | null;
  vehiclePlate: string | null;
  trailerCount: number | null;
  trailerPlate: string | null;

  clusterName: string | null;

  identityKey: string; // dedup key (see config.ts / validation.ts)
};

export type ColumnMapping = {
  columnIndex: number;
  headerPath: string;
  canonicalField: string | null;
  confidence: number;
};

export type GrandTotalCheck = Partial<Record<"physicalKg" | "conditionedKg" | "amount", number>>;

export type ParsedReport = {
  reportGeneratedAt: string | null; // ISO datetime parsed from the title banner, if found
  dateDetectionMethod: "title_banner" | "max_acceptance_date" | "upload_time";
  dataPeriodStart: string | null; // min acceptance date across parsed rows
  dataPeriodEnd: string | null; // max acceptance date across parsed rows
  sheetName: string;
  rows: ParsedOperationRow[];
  warnings: ImportWarning[];
  columnMap: ColumnMapping[];
  grandTotalFromSheet: GrandTotalCheck | null;
};

export type ImportRecord = {
  id: number;
  reportGeneratedAt: string | null;
  dataPeriodStart: string | null;
  dataPeriodEnd: string | null;
  sourceFilename: string;
  sourceHash: string;
  importedAt: string;
  importedBy: string | null;
  telegramUserId: string | null;
  status: "success" | "partial" | "failed";
  parserVersion: string;
  schemaVersion: string;
  isActive: number;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  warningCount: number;
  errorCount: number;
  rawFilePath: string | null;
};

export type ContractStatus = "NOT_STARTED" | "IN_PROGRESS" | "NEAR_COMPLETION" | "COMPLETED" | "OVER_CONTRACT";

export type AlertSeverity = "RED" | "YELLOW" | "GREEN" | "INFO";

export type Alert = {
  category: "CONTRACT" | "DATA" | "QUALITY";
  code: string;
  severity: AlertSeverity;
  title: string;
  count: number;
  details: string;
  sampleRecords: string[]; // human-readable identifiers (farmer / contract / PK-17), capped
};
