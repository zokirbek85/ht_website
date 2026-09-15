import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { dataDir, getDb, PARSER_VERSION, SCHEMA_VERSION } from "./db.ts";
import { parseWorkbook } from "./parser.ts";
import { validateRows, isRowValid } from "./validation.ts";
import { logAudit } from "./audit.ts";
import type { GrandTotalCheck, ImportWarning, ParsedOperationRow } from "./types.ts";

export type ImportOutcome =
  | { status: "duplicate"; importId: number }
  | { status: "success" | "partial"; importId: number; warnings: ImportWarning[]; rowCount: number; validRowCount: number }
  | { status: "failed"; warnings: ImportWarning[] };

export type ImportActor = { telegramId: string; username: string | null };

const CONSISTENCY_ABS_THRESHOLD_KG = 50;
const CONSISTENCY_REL_THRESHOLD = 0.02; // 2%

export async function importExcelReport(
  buffer: Buffer,
  filename: string,
  uploadTimestamp: Date,
  actor: ImportActor
): Promise<ImportOutcome> {
  const db = getDb();
  const sourceHash = createHash("sha256").update(buffer).digest("hex");

  const existing = db.prepare("SELECT id FROM imports WHERE source_hash = ?").get(sourceHash) as
    | { id: number }
    | undefined;
  if (existing) {
    logAudit("IMPORT_DUPLICATE", actor, { filename, sourceHash });
    return { status: "duplicate", importId: existing.id };
  }

  const parsed = await parseWorkbook(buffer, filename, uploadTimestamp);
  const warnings = [...parsed.warnings];

  if (parsed.rows.length === 0) {
    logAudit("IMPORT_FAILED", actor, { filename, reason: "no_rows_parsed", warnings: warnings.length });
    return { status: "failed", warnings };
  }

  const validation = validateRows(parsed.rows, warnings);
  const rawFilePath = saveRawFile(buffer, filename, sourceHash);
  const errorCountPre = warnings.filter((w) => w.severity === "ERROR").length;
  const status: "success" | "partial" = errorCountPre > 0 ? "partial" : "success";

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE imports SET is_active = 0 WHERE is_active = 1").run();

    const info = db
      .prepare(
        `INSERT INTO imports
          (report_generated_at, date_detection_method, data_period_start, data_period_end, source_filename,
           source_hash, imported_at, imported_by, telegram_user_id, status, parser_version, schema_version,
           is_active, row_count, valid_row_count, invalid_row_count, warning_count, error_count, raw_file_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.reportGeneratedAt,
        parsed.dateDetectionMethod,
        parsed.dataPeriodStart,
        parsed.dataPeriodEnd,
        filename,
        sourceHash,
        new Date().toISOString(),
        actor.username,
        actor.telegramId,
        status,
        PARSER_VERSION,
        SCHEMA_VERSION,
        parsed.rows.length,
        validation.validRows,
        validation.invalidRows,
        warnings.length,
        errorCountPre,
        rawFilePath
      );
    const importId = Number(info.lastInsertRowid);

    writeOperations(db, importId, parsed.rows);
    checkGrandTotalConsistency(db, importId, parsed.grandTotalFromSheet, warnings);

    const finalErrorCount = warnings.filter((w) => w.severity === "ERROR").length;
    db.prepare("UPDATE imports SET warning_count = ?, error_count = ? WHERE id = ?").run(
      warnings.length,
      finalErrorCount,
      importId
    );

    const insertWarning = db.prepare(
      "INSERT INTO import_warnings (import_id, severity, code, message, context) VALUES (?, ?, ?, ?, ?)"
    );
    for (const w of warnings.slice(0, 1000)) {
      insertWarning.run(importId, w.severity, w.code, w.message, w.context ? JSON.stringify(w.context) : null);
    }

    db.exec("COMMIT");

    logAudit("IMPORT", actor, {
      filename,
      importId,
      rows: parsed.rows.length,
      validRows: validation.validRows,
      warnings: warnings.length,
      errors: finalErrorCount,
      status
    });

    return { status, importId, warnings, rowCount: parsed.rows.length, validRowCount: validation.validRows };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function writeOperations(db: DatabaseSync, importId: number, rows: ParsedOperationRow[]): void {
  const insertOp = db.prepare(
    `INSERT INTO operations
      (import_id, row_number, identity_key, is_duplicate, is_valid, farmer_id, contract_id, buyer_id,
       preparation_point_id, cluster_id, acceptance_date, acceptance_record_no, pk17_number, pk17_registered_at,
       pk17_signed_at, batch_no, plot_type, plot_no, variety_declared, generation_declared,
       industrial_grade_declared, class_declared, picking_method, lab_2hl_number, industrial_grade_lab, class_lab,
       gross_kg, tare_kg, physical_kg, impurity_pct, calculated_kg, moisture_pct, conditioned_kg, markup,
       discount, unit_price, amount, transport_fee, seed_cotton_fee, other_fee_total, vehicle_type,
       vehicle_plate, trailer_count, trailer_plate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const seenIdentityKeys = new Set<string>();

  for (const row of rows) {
    const farmerId = getOrCreateFarmer(db, row.farmerName, row.farmerInn, row.farmerRegion, row.farmerDistrict);
    const contractId = row.contractNumber
      ? getOrCreateContract(db, row.contractNumber, row.contractType, row.contractQty, farmerId)
      : null;
    const buyerId = row.buyerName ? getOrCreateBuyer(db, row.buyerName, row.buyerInn) : null;
    const preparationPointId = row.preparationPointName
      ? getOrCreatePreparationPoint(db, row.preparationPointName, row.preparationDistrict, row.preparationRegion)
      : null;
    const clusterId = row.clusterName ? getOrCreateCluster(db, row.clusterName) : null;

    const isDuplicate = seenIdentityKeys.has(row.identityKey);
    seenIdentityKeys.add(row.identityKey);
    const isValid = isRowValid(row);

    insertOp.run(
      importId,
      row.rowNumber,
      row.identityKey,
      isDuplicate ? 1 : 0,
      isValid ? 1 : 0,
      farmerId,
      contractId,
      buyerId,
      preparationPointId,
      clusterId,
      row.acceptanceDate,
      row.acceptanceRecordNo,
      row.pk17Number,
      row.pk17RegisteredAt,
      row.pk17SignedAt,
      row.batchNo,
      row.plotType,
      row.plotNo,
      row.varietyDeclared,
      row.generationDeclared,
      row.industrialGradeDeclared,
      row.classDeclared,
      row.pickingMethod,
      row.lab2hlNumber,
      row.industrialGradeLab,
      row.classLab,
      row.grossKg,
      row.tareKg,
      row.physicalKg,
      row.impurityPct,
      row.calculatedKg,
      row.moisturePct,
      row.conditionedKg,
      row.markup,
      row.discount,
      row.unitPrice,
      row.amount,
      row.transportFee,
      row.seedCottonFee,
      row.otherFeeTotal,
      row.vehicleType,
      row.vehiclePlate,
      row.trailerCount,
      row.trailerPlate
    );
  }
}

function checkGrandTotalConsistency(
  db: DatabaseSync,
  importId: number,
  grandTotalFromSheet: GrandTotalCheck | null,
  warnings: ImportWarning[]
): void {
  if (!grandTotalFromSheet) return;
  const columnByField: Record<string, string> = { physicalKg: "physical_kg", conditionedKg: "conditioned_kg", amount: "amount" };

  for (const [field, sheetValue] of Object.entries(grandTotalFromSheet)) {
    if (sheetValue == null) continue;
    const column = columnByField[field];
    if (!column) continue;
    const row = db
      .prepare(`SELECT SUM(${column}) AS total FROM operations WHERE import_id = ? AND is_duplicate = 0`)
      .get(importId) as { total: number | null };
    const computed = row.total ?? 0;
    const diff = Math.abs(computed - sheetValue);
    if (diff > Math.max(CONSISTENCY_ABS_THRESHOLD_KG, CONSISTENCY_REL_THRESHOLD * Math.abs(sheetValue))) {
      warnings.push({
        severity: "WARNING",
        code: "GRAND_TOTAL_MISMATCH",
        message: `Файлнинг ўзидаги "Жами" қатори (${field}: ${sheetValue.toFixed(2)}) операциялар йиғиндисидан (${computed.toFixed(2)}) фарқ қилади.`,
        context: { field, sheetValue, computed, diff }
      });
    }
  }
}

export type ReprocessOutcome =
  | { status: "success" | "partial"; importId: number; warnings: ImportWarning[]; rowCount: number }
  | { status: "failed"; warnings: ImportWarning[] };

/** Re-runs the current parser against an import's stored original file and overwrites its operations/warnings in place. */
export async function reprocessImport(importId: number, actor: ImportActor): Promise<ReprocessOutcome> {
  const db = getDb();
  const imp = db.prepare("SELECT * FROM imports WHERE id = ?").get(importId) as
    | { id: number; source_filename: string; raw_file_path: string | null; report_generated_at: string | null }
    | undefined;

  if (!imp) {
    return { status: "failed", warnings: [{ severity: "ERROR", code: "IMPORT_NOT_FOUND", message: `Import #${importId} not found.` }] };
  }
  if (!imp.raw_file_path) {
    return {
      status: "failed",
      warnings: [{ severity: "ERROR", code: "RAW_FILE_MISSING", message: `Import #${importId} has no stored original file to reprocess from.` }]
    };
  }

  const buffer = readFileSync(path.join(dataDir(), imp.raw_file_path));
  const parsed = await parseWorkbook(buffer, imp.source_filename, new Date());
  const warnings = [...parsed.warnings];

  if (parsed.rows.length === 0) return { status: "failed", warnings };

  const validation = validateRows(parsed.rows, warnings);

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM operations WHERE import_id = ?").run(importId);
    db.prepare("DELETE FROM import_warnings WHERE import_id = ?").run(importId);

    writeOperations(db, importId, parsed.rows);
    checkGrandTotalConsistency(db, importId, parsed.grandTotalFromSheet, warnings);

    const finalErrorCount = warnings.filter((w) => w.severity === "ERROR").length;
    const status: "success" | "partial" = finalErrorCount > 0 ? "partial" : "success";

    db.prepare(
      `UPDATE imports SET parser_version = ?, row_count = ?, valid_row_count = ?, invalid_row_count = ?,
       warning_count = ?, error_count = ?, status = ? WHERE id = ?`
    ).run(
      PARSER_VERSION,
      parsed.rows.length,
      validation.validRows,
      validation.invalidRows,
      warnings.length,
      finalErrorCount,
      status,
      importId
    );

    const insertWarning = db.prepare(
      "INSERT INTO import_warnings (import_id, severity, code, message, context) VALUES (?, ?, ?, ?, ?)"
    );
    for (const w of warnings.slice(0, 1000)) {
      insertWarning.run(importId, w.severity, w.code, w.message, w.context ? JSON.stringify(w.context) : null);
    }

    db.exec("COMMIT");

    logAudit("REPROCESSED", actor, { importId, parserVersion: PARSER_VERSION, rows: parsed.rows.length, warnings: warnings.length, status });

    return { status, importId, warnings, rowCount: parsed.rows.length };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function getOrCreateFarmer(db: DatabaseSync, name: string, inn: string | null, region: string | null, district: string | null): number {
  const existing = inn
    ? (db.prepare("SELECT id FROM farmers WHERE inn = ?").get(inn) as { id: number } | undefined)
    : (db.prepare("SELECT id FROM farmers WHERE name = ? AND inn IS NULL").get(name) as { id: number } | undefined);
  if (existing) {
    db.prepare("UPDATE farmers SET name = ?, region = ?, district = ? WHERE id = ?").run(name, region, district, existing.id);
    return existing.id;
  }
  const info = db.prepare("INSERT INTO farmers (name, inn, region, district) VALUES (?, ?, ?, ?)").run(name, inn, region, district);
  return Number(info.lastInsertRowid);
}

function getOrCreateContract(db: DatabaseSync, contractNumber: string, contractType: string | null, contractQty: number | null, farmerId: number): number {
  const existing = db.prepare("SELECT id, contract_qty FROM contracts WHERE contract_number = ?").get(contractNumber) as
    | { id: number; contract_qty: number | null }
    | undefined;
  if (existing) {
    if (contractQty != null && existing.contract_qty != null && Math.abs(contractQty - existing.contract_qty) > 0.01) {
      db.prepare("UPDATE contracts SET contract_qty = ? WHERE id = ?").run(contractQty, existing.id);
    }
    return existing.id;
  }
  const info = db
    .prepare("INSERT INTO contracts (contract_number, contract_type, farmer_id, contract_qty) VALUES (?, ?, ?, ?)")
    .run(contractNumber, contractType, farmerId, contractQty);
  return Number(info.lastInsertRowid);
}

function getOrCreateBuyer(db: DatabaseSync, name: string, inn: string | null): number {
  const existing = db.prepare("SELECT id FROM buyers WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO buyers (name, inn) VALUES (?, ?)").run(name, inn);
  return Number(info.lastInsertRowid);
}

function getOrCreatePreparationPoint(db: DatabaseSync, name: string, district: string | null, region: string | null): number {
  const existing = db.prepare("SELECT id FROM preparation_points WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO preparation_points (name, district, region) VALUES (?, ?, ?)").run(name, district, region);
  return Number(info.lastInsertRowid);
}

function getOrCreateCluster(db: DatabaseSync, name: string): number {
  const existing = db.prepare("SELECT id FROM clusters WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO clusters (name) VALUES (?)").run(name);
  return Number(info.lastInsertRowid);
}

function saveRawFile(buffer: Buffer, filename: string, hash: string): string {
  const dir = path.join(dataDir(), "uploads");
  mkdirSync(dir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._\-]+/g, "_").slice(-80);
  const storedName = `${hash.slice(0, 16)}-${safeName}`;
  writeFileSync(path.join(dir, storedName), buffer);
  return path.join("uploads", storedName);
}
