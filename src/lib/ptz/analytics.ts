// Central analytics engine (§24). One dataset (an import's operations, loaded
// once), one engine — PDF, XLSX and the web dashboard all read from the same
// CottonAcceptanceAnalytics instance via reportBundle.ts, so the three
// outputs can never disagree on a number.
import { getDb } from "./db.ts";
import {
  CONTRACT_QTY_TO_KG,
  CONTRACT_STATUS_THRESHOLDS,
  CONTROL_THRESHOLDS,
  DEFAULT_BUYER_NAME,
  PRICE_WEIGHT_BASIS,
  QUALITY_THRESHOLDS,
  REPORTING_WEIGHT_FIELD,
  REPORT_TIMEZONE
} from "./config.ts";
import type { Alert, AlertSeverity, ContractStatus, ImportRecord } from "./types.ts";

export type OperationEntity = {
  id: number;
  importId: number;
  rowNumber: number;
  isDuplicate: boolean;
  isValid: boolean;

  farmerId: number;
  farmerName: string;
  farmerInn: string | null;
  farmerRegion: string | null;
  farmerDistrict: string | null;
  clusterName: string | null;

  contractId: number | null;
  contractNumber: string | null;
  contractType: string | null;
  contractQty: number | null; // in configured unit (tons by default)

  acceptanceDate: string | null;
  pk17Number: string | null;
  pk17SignedAt: string | null;

  varietyDeclared: string | null;
  pickingMethod: string | null;
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
  preparationPointName: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
};

function mapOperationRow(r: Record<string, unknown>): OperationEntity {
  return {
    id: r.id as number,
    importId: r.import_id as number,
    rowNumber: r.row_number as number,
    isDuplicate: Boolean(r.is_duplicate),
    isValid: Boolean(r.is_valid),
    farmerId: r.farmer_id as number,
    farmerName: r.farmer_name as string,
    farmerInn: (r.farmer_inn as string) ?? null,
    farmerRegion: (r.farmer_region as string) ?? null,
    farmerDistrict: (r.farmer_district as string) ?? null,
    clusterName: (r.cluster_name as string) ?? null,
    contractId: (r.contract_id as number) ?? null,
    contractNumber: (r.contract_number as string) ?? null,
    contractType: (r.contract_type as string) ?? null,
    contractQty: (r.contract_qty as number) ?? null,
    acceptanceDate: (r.acceptance_date as string) ?? null,
    pk17Number: (r.pk17_number as string) ?? null,
    pk17SignedAt: (r.pk17_signed_at as string) ?? null,
    varietyDeclared: (r.variety_declared as string) ?? null,
    pickingMethod: (r.picking_method as string) ?? null,
    industrialGradeLab: (r.industrial_grade_lab as string) ?? null,
    classLab: (r.class_lab as string) ?? null,
    grossKg: (r.gross_kg as number) ?? null,
    tareKg: (r.tare_kg as number) ?? null,
    physicalKg: (r.physical_kg as number) ?? null,
    impurityPct: (r.impurity_pct as number) ?? null,
    calculatedKg: (r.calculated_kg as number) ?? null,
    moisturePct: (r.moisture_pct as number) ?? null,
    conditionedKg: (r.conditioned_kg as number) ?? null,
    markup: (r.markup as number) ?? null,
    discount: (r.discount as number) ?? null,
    unitPrice: (r.unit_price as number) ?? null,
    amount: (r.amount as number) ?? null,
    transportFee: (r.transport_fee as number) ?? null,
    seedCottonFee: (r.seed_cotton_fee as number) ?? null,
    otherFeeTotal: (r.other_fee_total as number) ?? null,
    buyerName: (r.buyer_name as string) ?? null,
    preparationPointName: (r.preparation_point_name as string) ?? null,
    vehicleType: (r.vehicle_type as string) ?? null,
    vehiclePlate: (r.vehicle_plate as string) ?? null
  };
}

export function loadOperations(importId: number): OperationEntity[] {
  const rows = getDb()
    .prepare(
      `SELECT o.*, f.name AS farmer_name, f.inn AS farmer_inn, f.region AS farmer_region, f.district AS farmer_district,
              c.name AS cluster_name, ct.contract_number AS contract_number, ct.contract_type AS contract_type,
              ct.contract_qty AS contract_qty, b.name AS buyer_name, pp.name AS preparation_point_name
       FROM operations o
       JOIN farmers f ON f.id = o.farmer_id
       LEFT JOIN clusters c ON c.id = o.cluster_id
       LEFT JOIN contracts ct ON ct.id = o.contract_id
       LEFT JOIN buyers b ON b.id = o.buyer_id
       LEFT JOIN preparation_points pp ON pp.id = o.preparation_point_id
       WHERE o.import_id = ?`
    )
    .all(importId) as Record<string, unknown>[];
  return rows.map(mapOperationRow);
}

// --- import lookups -------------------------------------------------------

function mapImportRow(r: Record<string, unknown>): ImportRecord {
  return {
    id: r.id as number,
    reportGeneratedAt: (r.report_generated_at as string) ?? null,
    dataPeriodStart: (r.data_period_start as string) ?? null,
    dataPeriodEnd: (r.data_period_end as string) ?? null,
    sourceFilename: r.source_filename as string,
    sourceHash: r.source_hash as string,
    importedAt: r.imported_at as string,
    importedBy: (r.imported_by as string) ?? null,
    telegramUserId: (r.telegram_user_id as string) ?? null,
    status: r.status as ImportRecord["status"],
    parserVersion: r.parser_version as string,
    schemaVersion: r.schema_version as string,
    isActive: r.is_active as number,
    rowCount: r.row_count as number,
    validRowCount: r.valid_row_count as number,
    invalidRowCount: r.invalid_row_count as number,
    warningCount: r.warning_count as number,
    errorCount: r.error_count as number,
    rawFilePath: (r.raw_file_path as string) ?? null
  };
}

const IMPORT_COLUMNS = `id, report_generated_at, data_period_start, data_period_end, source_filename, source_hash,
  imported_at, imported_by, telegram_user_id, status, parser_version, schema_version, is_active,
  row_count, valid_row_count, invalid_row_count, warning_count, error_count, raw_file_path`;

export function getActiveImport(): ImportRecord | null {
  const row = getDb()
    .prepare(`SELECT ${IMPORT_COLUMNS} FROM imports WHERE is_active = 1 ORDER BY imported_at DESC LIMIT 1`)
    .get() as Record<string, unknown> | undefined;
  return row ? mapImportRow(row) : null;
}

export function getImportById(id: number): ImportRecord | null {
  const row = getDb().prepare(`SELECT ${IMPORT_COLUMNS} FROM imports WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapImportRow(row) : null;
}

export function listAllImports(limit = 50): ImportRecord[] {
  const rows = getDb()
    .prepare(`SELECT ${IMPORT_COLUMNS} FROM imports ORDER BY imported_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapImportRow);
}

// --- formatting-agnostic aggregate types -----------------------------------

export type ManagementSummary = {
  contractQtyKg: number;
  acceptedKg: number;
  remainingKg: number;
  overDeliveryKg: number;
  achievementPct: number | null;
  todayAcceptedKg: number;
  totalAmount: number;
  weightedAvgPrice: number | null;
  farmerCount: number;
  contractCount: number;
  operationCount: number;
};

export type ContractPerformance = {
  contractNumber: string;
  farmerName: string;
  clusterName: string | null;
  contractType: string | null;
  contractQtyKg: number;
  acceptedKg: number;
  remainingKg: number;
  overDeliveryKg: number;
  achievementPct: number | null;
  status: ContractStatus;
  operationCount: number;
};

export type FarmerAnalytics = {
  farmerName: string;
  farmerInn: string | null;
  clusterName: string | null;
  contractQtyKg: number;
  acceptedKg: number;
  remainingKg: number;
  achievementPct: number | null;
  deliveries: number;
  avgMoisturePct: number | null;
  avgImpurityPct: number | null;
  weightedAvgPrice: number | null;
  totalAmount: number;
};

export type ClusterAnalytics = {
  clusterName: string;
  contractQtyKg: number;
  acceptedKg: number;
  remainingKg: number;
  achievementPct: number | null;
  farmerCount: number;
  avgMoisturePct: number | null;
  avgImpurityPct: number | null;
  totalAmount: number;
};

export type Distribution = { label: string; count: number; pct: number }[];

export type QualityDashboard = {
  moisture: { avg: number | null; min: number | null; max: number | null; distribution: Distribution };
  impurity: { avg: number | null; min: number | null; max: number | null; distribution: Distribution };
  industrialGradeDistribution: Distribution;
  classDistribution: Distribution;
  pickingMethodDistribution: Distribution;
  thresholdsConfigured: boolean;
};

export type FinanceDashboard = {
  totalAmount: number;
  todayAmount: number;
  simpleAvgPrice: number | null;
  weightedAvgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  totalMarkup: number;
  totalDiscount: number;
  totalTransportFee: number;
  totalSeedCottonFee: number;
  totalOtherFee: number;
};

export type WeightBridgeStage = { stage: string; field: string; totalKg: number; diffFromPrevKg: number | null; diffFromPrevPct: number | null };

export type TrendPoint = { date: string; dailyAcceptedKg: number; cumulativeAcceptedKg: number };

// --- helpers ----------------------------------------------------------------

function reportingWeight(row: OperationEntity): number {
  return row[REPORTING_WEIGHT_FIELD] ?? 0;
}

function todayInTashkent(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE }); // en-CA -> YYYY-MM-DD
}

function weightedAverage(rows: OperationEntity[]): number | null {
  let priceBasisSum = 0;
  let weightSum = 0;
  for (const r of rows) {
    const basis = PRICE_WEIGHT_BASIS === "conditionedKg" ? r.conditionedKg : r.physicalKg;
    if (basis == null || r.amount == null) continue;
    priceBasisSum += r.amount;
    weightSum += basis;
  }
  return weightSum > 0 ? priceBasisSum / weightSum : null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function distributionOf(rows: OperationEntity[], keyFn: (r: OperationEntity) => string | null): Distribution {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const key = keyFn(r) ?? "Номаълум";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

function contractStatus(achievementPct: number | null, hasOperations: boolean): ContractStatus {
  if (!hasOperations) return "NOT_STARTED";
  if (achievementPct == null) return "IN_PROGRESS";
  if (achievementPct > 100) return "OVER_CONTRACT";
  if (achievementPct >= 100) return "COMPLETED";
  if (achievementPct >= CONTRACT_STATUS_THRESHOLDS.nearCompletionPct) return "NEAR_COMPLETION";
  return "IN_PROGRESS";
}

// --- the engine ---------------------------------------------------------

export class CottonAcceptanceAnalytics {
  readonly allRows: OperationEntity[];
  readonly rows: OperationEntity[]; // de-duplicated, buyer-filtered working set

  constructor(rows: OperationEntity[], opts: { buyerFilter?: string | null } = {}) {
    this.allRows = rows;
    const buyer = opts.buyerFilter === undefined ? DEFAULT_BUYER_NAME : opts.buyerFilter;
    this.rows = rows.filter((r) => !r.isDuplicate && r.isValid && (buyer == null || r.buyerName === buyer));
  }

  private contractQtyByNumber(): Map<string, { qtyKg: number; farmerName: string; clusterName: string | null; contractType: string | null }> {
    const map = new Map<string, { qtyKg: number; farmerName: string; clusterName: string | null; contractType: string | null }>();
    for (const r of this.rows) {
      if (!r.contractNumber) continue;
      if (!map.has(r.contractNumber)) {
        map.set(r.contractNumber, {
          qtyKg: (r.contractQty ?? 0) * CONTRACT_QTY_TO_KG,
          farmerName: r.farmerName,
          clusterName: r.clusterName,
          contractType: r.contractType
        });
      }
    }
    return map;
  }

  summary(): ManagementSummary {
    const contracts = this.contractQtyByNumber();
    const contractQtyKg = [...contracts.values()].reduce((a, c) => a + c.qtyKg, 0);
    const acceptedKg = this.rows.reduce((a, r) => a + reportingWeight(r), 0);
    const remainingKg = Math.max(contractQtyKg - acceptedKg, 0);
    const overDeliveryKg = Math.max(acceptedKg - contractQtyKg, 0);
    const today = todayInTashkent();
    const todayAcceptedKg = this.rows.filter((r) => r.acceptanceDate === today).reduce((a, r) => a + reportingWeight(r), 0);
    const totalAmount = this.rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    const farmerCount = new Set(this.rows.map((r) => r.farmerId)).size;

    return {
      contractQtyKg,
      acceptedKg,
      remainingKg,
      overDeliveryKg,
      achievementPct: contractQtyKg > 0 ? (acceptedKg / contractQtyKg) * 100 : null,
      todayAcceptedKg,
      totalAmount,
      weightedAvgPrice: weightedAverage(this.rows),
      farmerCount,
      contractCount: contracts.size,
      operationCount: this.rows.length
    };
  }

  contracts(): ContractPerformance[] {
    const byContract = new Map<string, OperationEntity[]>();
    for (const r of this.rows) {
      if (!r.contractNumber) continue;
      const list = byContract.get(r.contractNumber) ?? [];
      list.push(r);
      byContract.set(r.contractNumber, list);
    }

    return [...byContract.entries()]
      .map(([contractNumber, rows]) => {
        const first = rows[0]!;
        const contractQtyKg = (first.contractQty ?? 0) * CONTRACT_QTY_TO_KG;
        const acceptedKg = rows.reduce((a, r) => a + reportingWeight(r), 0);
        const remainingKg = Math.max(contractQtyKg - acceptedKg, 0);
        const overDeliveryKg = Math.max(acceptedKg - contractQtyKg, 0);
        const achievementPct = contractQtyKg > 0 ? (acceptedKg / contractQtyKg) * 100 : null;
        return {
          contractNumber,
          farmerName: first.farmerName,
          clusterName: first.clusterName,
          contractType: first.contractType,
          contractQtyKg,
          acceptedKg,
          remainingKg,
          overDeliveryKg,
          achievementPct,
          status: contractStatus(achievementPct, rows.length > 0),
          operationCount: rows.length
        };
      })
      .sort((a, b) => (a.achievementPct ?? 0) - (b.achievementPct ?? 0));
  }

  farmers(): FarmerAnalytics[] {
    const byFarmer = new Map<number, OperationEntity[]>();
    for (const r of this.rows) {
      const list = byFarmer.get(r.farmerId) ?? [];
      list.push(r);
      byFarmer.set(r.farmerId, list);
    }

    return [...byFarmer.values()].map((rows) => {
      const first = rows[0]!;
      const contractNumbers = new Set(rows.map((r) => r.contractNumber).filter(Boolean));
      const contractQtyKg = [...contractNumbers]
        .map((num) => rows.find((r) => r.contractNumber === num))
        .reduce((a, r) => a + (r ? (r.contractQty ?? 0) * CONTRACT_QTY_TO_KG : 0), 0);
      const acceptedKg = rows.reduce((a, r) => a + reportingWeight(r), 0);
      const remainingKg = Math.max(contractQtyKg - acceptedKg, 0);
      const achievementPct = contractQtyKg > 0 ? (acceptedKg / contractQtyKg) * 100 : null;

      return {
        farmerName: first.farmerName,
        farmerInn: first.farmerInn,
        clusterName: first.clusterName,
        contractQtyKg,
        acceptedKg,
        remainingKg,
        achievementPct,
        deliveries: rows.length,
        avgMoisturePct: avg(rows.map((r) => r.moisturePct).filter((v): v is number => v != null)),
        avgImpurityPct: avg(rows.map((r) => r.impurityPct).filter((v): v is number => v != null)),
        weightedAvgPrice: weightedAverage(rows),
        totalAmount: rows.reduce((a, r) => a + (r.amount ?? 0), 0)
      };
    });
  }

  topFarmers(limit = 10): FarmerAnalytics[] {
    return [...this.farmers()].sort((a, b) => (b.achievementPct ?? 0) - (a.achievementPct ?? 0)).slice(0, limit);
  }

  bottomFarmers(limit = 10): FarmerAnalytics[] {
    return [...this.farmers()]
      .filter((f) => f.contractQtyKg > 0)
      .sort((a, b) => (a.achievementPct ?? 0) - (b.achievementPct ?? 0))
      .slice(0, limit);
  }

  clusters(): ClusterAnalytics[] {
    const byCluster = new Map<string, OperationEntity[]>();
    for (const r of this.rows) {
      const key = r.clusterName ?? "Кластерсиз";
      const list = byCluster.get(key) ?? [];
      list.push(r);
      byCluster.set(key, list);
    }

    return [...byCluster.entries()]
      .map(([clusterName, rows]) => {
        const farmerIds = new Set(rows.map((r) => r.farmerId));
        const contractNumbers = new Set(rows.map((r) => r.contractNumber).filter(Boolean));
        const contractQtyKg = [...contractNumbers]
          .map((num) => rows.find((r) => r.contractNumber === num))
          .reduce((a, r) => a + (r ? (r.contractQty ?? 0) * CONTRACT_QTY_TO_KG : 0), 0);
        const acceptedKg = rows.reduce((a, r) => a + reportingWeight(r), 0);
        const remainingKg = Math.max(contractQtyKg - acceptedKg, 0);
        return {
          clusterName,
          contractQtyKg,
          acceptedKg,
          remainingKg,
          achievementPct: contractQtyKg > 0 ? (acceptedKg / contractQtyKg) * 100 : null,
          farmerCount: farmerIds.size,
          avgMoisturePct: avg(rows.map((r) => r.moisturePct).filter((v): v is number => v != null)),
          avgImpurityPct: avg(rows.map((r) => r.impurityPct).filter((v): v is number => v != null)),
          totalAmount: rows.reduce((a, r) => a + (r.amount ?? 0), 0)
        };
      })
      .sort((a, b) => (b.achievementPct ?? 0) - (a.achievementPct ?? 0));
  }

  quality(): QualityDashboard {
    const moistureValues = this.rows.map((r) => r.moisturePct).filter((v): v is number => v != null);
    const impurityValues = this.rows.map((r) => r.impurityPct).filter((v): v is number => v != null);

    return {
      moisture: {
        avg: avg(moistureValues),
        min: moistureValues.length ? Math.min(...moistureValues) : null,
        max: moistureValues.length ? Math.max(...moistureValues) : null,
        distribution: distributionOf(this.rows, (r) =>
          r.moisturePct == null
            ? null
            : r.moisturePct < QUALITY_THRESHOLDS.moisturePctWarn
              ? "Норма"
              : r.moisturePct < QUALITY_THRESHOLDS.moisturePctCritical
                ? "Огоҳлантириш"
                : "Критик"
        )
      },
      impurity: {
        avg: avg(impurityValues),
        min: impurityValues.length ? Math.min(...impurityValues) : null,
        max: impurityValues.length ? Math.max(...impurityValues) : null,
        distribution: distributionOf(this.rows, (r) =>
          r.impurityPct == null
            ? null
            : r.impurityPct < QUALITY_THRESHOLDS.impurityPctWarn
              ? "Норма"
              : r.impurityPct < QUALITY_THRESHOLDS.impurityPctCritical
                ? "Огоҳлантириш"
                : "Критик"
        )
      },
      industrialGradeDistribution: distributionOf(this.rows, (r) => r.industrialGradeLab),
      classDistribution: distributionOf(this.rows, (r) => r.classLab),
      pickingMethodDistribution: distributionOf(this.rows, (r) => r.pickingMethod),
      thresholdsConfigured: false // see config.ts QUALITY_THRESHOLDS_CONFIGURED
    };
  }

  finance(): FinanceDashboard {
    const today = todayInTashkent();
    const prices = this.rows.map((r) => r.unitPrice).filter((v): v is number => v != null);
    return {
      totalAmount: this.rows.reduce((a, r) => a + (r.amount ?? 0), 0),
      todayAmount: this.rows.filter((r) => r.acceptanceDate === today).reduce((a, r) => a + (r.amount ?? 0), 0),
      simpleAvgPrice: avg(prices),
      weightedAvgPrice: weightedAverage(this.rows),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      totalMarkup: this.rows.reduce((a, r) => a + (r.markup ?? 0), 0),
      totalDiscount: this.rows.reduce((a, r) => a + (r.discount ?? 0), 0),
      totalTransportFee: this.rows.reduce((a, r) => a + (r.transportFee ?? 0), 0),
      totalSeedCottonFee: this.rows.reduce((a, r) => a + (r.seedCottonFee ?? 0), 0),
      totalOtherFee: this.rows.reduce((a, r) => a + (r.otherFeeTotal ?? 0), 0)
    };
  }

  weightBridge(): WeightBridgeStage[] {
    const stages: { stage: string; field: keyof OperationEntity }[] = [
      { stage: "Брутто", field: "grossKg" },
      { stage: "Тара", field: "tareKg" },
      { stage: "Физик вазн", field: "physicalKg" },
      { stage: "Ҳисобий вазн", field: "calculatedKg" },
      { stage: "Кондицион вазн", field: "conditionedKg" }
    ];
    const totals = stages.map((s) => ({
      stage: s.stage,
      field: s.field,
      total: this.rows.reduce((a, r) => a + ((r[s.field] as number | null) ?? 0), 0)
    }));

    return totals.map((t, i) => {
      const prev = i > 0 ? totals[i - 1] : null;
      const diffFromPrevKg = prev ? t.total - prev.total : null;
      const diffFromPrevPct = prev && prev.total !== 0 ? (diffFromPrevKg! / prev.total) * 100 : null;
      return { stage: t.stage, field: t.field, totalKg: t.total, diffFromPrevKg, diffFromPrevPct };
    });
  }

  dailyTrend(): TrendPoint[] {
    const byDate = new Map<string, number>();
    for (const r of this.rows) {
      if (!r.acceptanceDate) continue;
      byDate.set(r.acceptanceDate, (byDate.get(r.acceptanceDate) ?? 0) + reportingWeight(r));
    }
    const dates = [...byDate.keys()].sort();
    let cumulative = 0;
    return dates.map((date) => {
      const dailyAcceptedKg = byDate.get(date) ?? 0;
      cumulative += dailyAcceptedKg;
      return { date, dailyAcceptedKg, cumulativeAcceptedKg: cumulative };
    });
  }

  controls(): Alert[] {
    const alerts: Alert[] = [];
    const contracts = this.contracts();

    pushAlert(alerts, "CONTRACT", "CONTRACT_OVER", contracts.filter((c) => c.status === "OVER_CONTRACT"), "RED",
      "Шартномадан ортиқча қабул қилинган", (c) => `${c.contractNumber} (${c.farmerName})`);
    pushAlert(alerts, "CONTRACT", "CONTRACT_NEAR_COMPLETION", contracts.filter((c) => c.status === "NEAR_COMPLETION"), "YELLOW",
      "Шартнома якунланишига яқин", (c) => `${c.contractNumber} (${c.farmerName})`);
    pushAlert(alerts, "CONTRACT", "CONTRACT_NO_ACCEPTANCE", contracts.filter((c) => c.operationCount === 0), "RED",
      "Шартнома бўйича ҳали қабул бўлмаган", (c) => c.contractNumber);
    pushAlert(
      alerts,
      "CONTRACT",
      "CONTRACT_LOW_ACHIEVEMENT",
      contracts.filter((c) => c.operationCount > 0 && (c.achievementPct ?? 0) < CONTROL_THRESHOLDS.lowAchievementPct),
      "YELLOW",
      `Бажарилиши ${CONTROL_THRESHOLDS.lowAchievementPct}% дан паст`,
      (c) => `${c.contractNumber} (${(c.achievementPct ?? 0).toFixed(1)}%)`
    );

    pushAlert(alerts, "DATA", "MISSING_CONTRACT_NUMBER", this.rows.filter((r) => !r.contractNumber), "YELLOW",
      "Шартнома рақами кўрсатилмаган", (r) => `${r.farmerName} (${r.acceptanceDate ?? "?"})`);
    pushAlert(alerts, "DATA", "MISSING_CONTRACT_QTY", this.rows.filter((r) => r.contractQty == null), "YELLOW",
      "Шартнома миқдори кўрсатилмаган", (r) => `${r.farmerName} — ${r.contractNumber ?? "?"}`);
    pushAlert(alerts, "DATA", "MISSING_PK17", this.rows.filter((r) => !r.pk17Number), "YELLOW",
      "ПК-17 рақами йўқ", (r) => `${r.farmerName} (${r.acceptanceDate ?? "?"})`);
    pushAlert(alerts, "DATA", "PK17_UNSIGNED", this.rows.filter((r) => r.pk17Number && !r.pk17SignedAt), "YELLOW",
      "ПК-17 имзоланмаган", (r) => `${r.pk17Number}`);
    pushAlert(alerts, "DATA", "MISSING_LAB_RESULT", this.rows.filter((r) => !r.industrialGradeLab && !r.classLab), "YELLOW",
      "Лаборатория хулосаси йўқ", (r) => `${r.farmerName} (${r.acceptanceDate ?? "?"})`);
    pushAlert(alerts, "DATA", "MISSING_VEHICLE", this.rows.filter((r) => !r.vehiclePlate), "INFO",
      "Транспорт рақами йўқ", (r) => `${r.farmerName} (${r.acceptanceDate ?? "?"})`);
    pushAlert(alerts, "DATA", "ZERO_WEIGHT", this.rows.filter((r) => !reportingWeight(r)), "RED",
      "Вазн нол ёки кўрсатилмаган", (r) => `${r.farmerName} (${r.acceptanceDate ?? "?"})`);
    pushAlert(alerts, "DATA", "ZERO_OR_NEGATIVE_PRICE", this.rows.filter((r) => r.unitPrice == null || r.unitPrice <= 0), "RED",
      "Нарх нол ёки манфий", (r) => `${r.farmerName} (${r.acceptanceDate ?? "?"})`);
    const dupCount = this.allRows.filter((r) => r.isDuplicate).length;
    if (dupCount > 0) {
      alerts.push({
        category: "DATA",
        code: "DUPLICATE_OPERATION",
        severity: "YELLOW",
        title: "Такрорланган операциялар",
        count: dupCount,
        details: `${dupCount} та операция такрорланган (бир хил идентификация калити) деб белгиланди.`,
        sampleRecords: []
      });
    }

    pushAlert(alerts, "QUALITY", "HIGH_MOISTURE", this.rows.filter((r) => (r.moisturePct ?? 0) > CONTROL_THRESHOLDS.highMoisturePct), "YELLOW",
      "Юқори намлик", (r) => `${r.farmerName}: ${r.moisturePct}%`);
    pushAlert(alerts, "QUALITY", "HIGH_IMPURITY", this.rows.filter((r) => (r.impurityPct ?? 0) > CONTROL_THRESHOLDS.highImpurityPct), "YELLOW",
      "Юқори ифлослик", (r) => `${r.farmerName}: ${r.impurityPct}%`);
    pushAlert(
      alerts,
      "QUALITY",
      "ABNORMAL_WEIGHT_CONVERSION",
      this.rows.filter((r) => {
        if (r.conditionedKg == null || !r.physicalKg) return false;
        const ratio = r.conditionedKg / r.physicalKg;
        return ratio < CONTROL_THRESHOLDS.abnormalConversionMinRatio || ratio > CONTROL_THRESHOLDS.abnormalConversionMaxRatio;
      }),
      "YELLOW",
      "Ғайритабиий вазн конвертацияси (кондицион/физик нисбати)",
      (r) => `${r.farmerName}: ${r.physicalKg}→${r.conditionedKg} кг`
    );

    return alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }
}

function severityRank(s: AlertSeverity): number {
  return s === "RED" ? 0 : s === "YELLOW" ? 1 : s === "GREEN" ? 2 : 3;
}

function pushAlert<T>(
  alerts: Alert[],
  category: Alert["category"],
  code: string,
  matches: T[],
  severity: AlertSeverity,
  title: string,
  describe: (item: T) => string
): void {
  if (matches.length === 0) return;
  alerts.push({
    category,
    code,
    severity,
    title,
    count: matches.length,
    details: `${matches.length} та ёзувда аниқланди.`,
    sampleRecords: matches.slice(0, 10).map(describe)
  });
}
