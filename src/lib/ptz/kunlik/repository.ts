// Persistence for the Кунлик терим pipeline. Adds kt_* tables next to the
// existing PTZ schema (db.ts) without touching it — plain CREATE IF NOT
// EXISTS, so the migration is additive and safe on the production DB.
//
// Incremental import semantics (per source, see DATA_MODEL.md):
// - every record has a natural key (weighbridge record №, transaction ID,
//   deal+document) and a content fingerprint;
// - key unseen → INSERT; key seen with same fingerprint → DUPLICATE (skip);
//   key seen with a different fingerprint → UPDATE (the source corrected it).
// A re-sent file therefore never double-counts harvest or payments.
//
// Everything here is synchronous (node:sqlite) and each import runs in one
// transaction with no awaits inside — concurrent webhook handlers cannot
// interleave writes.
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db.ts";
import type { HarvestRecord, PaymentRecord, RkpAccountRecord, ShipmentRecord, SourceType } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kt_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  user_id TEXT,
  trigger TEXT NOT NULL DEFAULT 'telegram',
  created_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  basket_file_id INTEGER,
  payments_file_id INTEGER,
  accounts_file_id INTEGER,
  shipments_file_id INTEGER,
  report_date TEXT,
  report_generated_at TEXT,
  output_name TEXT,
  processing_ms INTEGER,
  error TEXT
);
CREATE TABLE IF NOT EXISTS kt_import_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES kt_import_batches(id),
  file_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kt_files_batch ON kt_import_files(batch_id);

CREATE TABLE IF NOT EXISTS kt_harvest_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  natural_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  inn TEXT,
  farmer_name TEXT NOT NULL,
  region TEXT,
  district TEXT,
  contract_type TEXT,
  contract_number TEXT,
  contract_qty_t REAL,
  acceptance_date TEXT,
  acceptance_date_invalid INTEGER NOT NULL DEFAULT 0,
  record_no TEXT,
  pk17 TEXT,
  method TEXT NOT NULL,
  method_raw TEXT,
  physical_kg REAL,
  conditioned_kg REAL,
  amount_tiyin INTEGER,
  unit_price REAL,
  source_row INTEGER,
  first_batch_id INTEGER NOT NULL,
  last_batch_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kt_harvest_batch ON kt_harvest_records(last_batch_id);
CREATE INDEX IF NOT EXISTS idx_kt_harvest_inn ON kt_harvest_records(inn);

CREATE TABLE IF NOT EXISTS kt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  natural_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  tx_id TEXT,
  op_datetime TEXT,
  op_date TEXT,
  counterparty_name TEXT,
  counterparty_inn TEXT,
  counterparty_account TEXT,
  account_name TEXT,
  debit_tiyin INTEGER NOT NULL,
  credit_tiyin INTEGER NOT NULL,
  details TEXT,
  deal_number TEXT,
  clearing_contract TEXT,
  invoice_no TEXT,
  is_reversal INTEGER NOT NULL,
  is_company_side INTEGER NOT NULL,
  statement_account TEXT,
  client_inn TEXT,
  source_row INTEGER,
  first_batch_id INTEGER NOT NULL,
  last_batch_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kt_payments_date ON kt_payments(op_date);

CREATE TABLE IF NOT EXISTS kt_rkp_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  bank_account TEXT,
  currency TEXT,
  account_name TEXT,
  category TEXT NOT NULL,
  account TEXT,
  balance_tiyin INTEGER NOT NULL,
  is_default INTEGER,
  holder_inn TEXT,
  holder_name TEXT,
  source_row INTEGER
);
CREATE INDEX IF NOT EXISTS idx_kt_accounts_batch ON kt_rkp_accounts(batch_id);

CREATE TABLE IF NOT EXISTS kt_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  natural_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  deal_number TEXT,
  deal_date TEXT,
  contract_number TEXT,
  seller_name TEXT,
  seller_broker TEXT,
  seller_inn TEXT,
  buyer_name TEXT,
  buyer_broker TEXT,
  product_name TEXT,
  document_number TEXT,
  document_date TEXT,
  shipment_qty_kg REAL,
  delivery_cost_tiyin INTEGER,
  deal_qty_kg REAL,
  deal_amount_tiyin INTEGER,
  unit TEXT,
  shipment_timer TEXT,
  status TEXT NOT NULL,
  status_raw TEXT,
  source_row INTEGER,
  first_batch_id INTEGER NOT NULL,
  last_batch_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kt_shipments_deal ON kt_shipments(deal_number);

CREATE TABLE IF NOT EXISTS kt_upload_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '{}',
  pending_file TEXT,
  batch_id INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_kt_sessions_user ON kt_upload_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS kt_temp_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  batch_id INTEGER NOT NULL REFERENCES kt_import_batches(id),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_for TEXT
);
CREATE TABLE IF NOT EXISTS kt_temp_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  temp_access_id INTEGER NOT NULL REFERENCES kt_temp_access(id),
  ts TEXT NOT NULL,
  success INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kt_processing_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  batch_id INTEGER,
  file TEXT,
  file_type TEXT,
  rows INTEGER,
  inserted INTEGER,
  updated INTEGER,
  duplicates INTEGER,
  errors INTEGER,
  warnings INTEGER,
  processing_ms INTEGER
);
`;

let schemaReady: DatabaseSync | null = null;

export function kdb(): DatabaseSync {
  const db = getDb();
  if (schemaReady !== db) {
    db.exec(SCHEMA);
    schemaReady = db;
  }
  return db;
}

export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = kdb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn(db);
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export type UpsertStats = { inserted: number; updated: number; duplicates: number };

/** Natural keys repeated inside one file — the later rows are counted as duplicates and not stored. */
export type InFileDuplicate = { naturalKey: string; sourceRow: number };

type Upsertable = { naturalKey: string; fingerprint: string; sourceRow: number };

function upsertRecords<T extends Upsertable>(
  db: DatabaseSync,
  table: string,
  records: T[],
  batchId: number,
  columns: string[],
  values: (r: T) => (string | number | bigint | null)[]
): UpsertStats & { inFileDuplicates: InFileDuplicate[] } {
  const select = db.prepare(`SELECT id, fingerprint FROM ${table} WHERE natural_key = ?`);
  const insert = db.prepare(
    `INSERT INTO ${table} (natural_key, fingerprint, ${columns.join(", ")}, source_row, first_batch_id, last_batch_id)
     VALUES (?, ?, ${columns.map(() => "?").join(", ")}, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE ${table} SET fingerprint = ?, ${columns.map((c) => `${c} = ?`).join(", ")}, source_row = ?, last_batch_id = ? WHERE id = ?`
  );
  const touch = db.prepare(`UPDATE ${table} SET last_batch_id = ?, source_row = ? WHERE id = ?`);

  const stats = { inserted: 0, updated: 0, duplicates: 0, inFileDuplicates: [] as InFileDuplicate[] };
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.naturalKey)) {
      stats.duplicates++;
      stats.inFileDuplicates.push({ naturalKey: r.naturalKey, sourceRow: r.sourceRow });
      continue;
    }
    seen.add(r.naturalKey);
    const existing = select.get(r.naturalKey) as { id: number; fingerprint: string } | undefined;
    if (!existing) {
      insert.run(r.naturalKey, r.fingerprint, ...values(r), r.sourceRow, batchId, batchId);
      stats.inserted++;
    } else if (existing.fingerprint === r.fingerprint) {
      touch.run(batchId, r.sourceRow, existing.id);
      stats.duplicates++;
    } else {
      update.run(r.fingerprint, ...values(r), r.sourceRow, batchId, existing.id);
      stats.updated++;
    }
  }
  return stats;
}

const b = (v: boolean) => (v ? 1 : 0);

export function upsertHarvest(db: DatabaseSync, records: HarvestRecord[], batchId: number) {
  return upsertRecords(
    db,
    "kt_harvest_records",
    records,
    batchId,
    ["inn", "farmer_name", "region", "district", "contract_type", "contract_number", "contract_qty_t", "acceptance_date",
      "acceptance_date_invalid", "record_no", "pk17", "method", "method_raw", "physical_kg", "conditioned_kg", "amount_tiyin", "unit_price"],
    (r) => [r.inn, r.farmerName, r.region, r.district, r.contractType, r.contractNumber, r.contractQtyT, r.acceptanceDate,
      b(r.acceptanceDateInvalid), r.recordNo, r.pk17, r.method, r.methodRaw, r.physicalKg, r.conditionedKg, r.amount, r.unitPrice]
  );
}

export function upsertPayments(db: DatabaseSync, records: PaymentRecord[], batchId: number) {
  return upsertRecords(
    db,
    "kt_payments",
    records,
    batchId,
    ["tx_id", "op_datetime", "op_date", "counterparty_name", "counterparty_inn", "counterparty_account", "account_name", "debit_tiyin",
      "credit_tiyin", "details", "deal_number", "clearing_contract", "invoice_no", "is_reversal", "is_company_side", "statement_account", "client_inn"],
    (r) => [r.txId, r.opDateTime, r.opDate, r.counterpartyName, r.counterpartyInn, r.counterpartyAccount, r.accountName, r.debit,
      r.credit, r.details, r.dealNumber, r.clearingContract, r.invoiceNo, b(r.isReversal), b(r.isCompanySide), r.statementAccount, r.clientInn]
  );
}

export function upsertShipments(db: DatabaseSync, records: ShipmentRecord[], batchId: number) {
  return upsertRecords(
    db,
    "kt_shipments",
    records,
    batchId,
    ["deal_number", "deal_date", "contract_number", "seller_name", "seller_broker", "seller_inn", "buyer_name", "buyer_broker",
      "product_name", "document_number", "document_date", "shipment_qty_kg", "delivery_cost_tiyin", "deal_qty_kg", "deal_amount_tiyin",
      "unit", "shipment_timer", "status", "status_raw"],
    (r) => [r.dealNumber, r.dealDate, r.contractNumber, r.sellerName, r.sellerBroker, r.sellerInn, r.buyerName, r.buyerBroker,
      r.productName, r.documentNumber, r.documentDate, r.shipmentQtyKg, r.deliveryCost, r.dealQtyKg, r.dealAmount,
      r.unit, r.shipmentTimer, r.status, r.statusRaw]
  );
}

/** RKP balances are a point-in-time snapshot: each accounts file replaces the previous one (kept per batch for history). */
export function insertAccountsSnapshot(db: DatabaseSync, records: RkpAccountRecord[], batchId: number): UpsertStats {
  const insert = db.prepare(
    `INSERT INTO kt_rkp_accounts (batch_id, bank_account, currency, account_name, category, account, balance_tiyin, is_default, holder_inn, holder_name, source_row)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const prevBatch = latestBatchWithFile(db, "ACCOUNTS", batchId);
  const prev = new Map<string, bigint>();
  if (prevBatch != null) {
    for (const r of db.prepare("SELECT account, balance_tiyin FROM kt_rkp_accounts WHERE batch_id = ?").all(prevBatch) as { account: string; balance_tiyin: number }[]) {
      prev.set(r.account, BigInt(r.balance_tiyin));
    }
  }
  const stats = { inserted: 0, updated: 0, duplicates: 0 };
  for (const r of records) {
    insert.run(batchId, r.bankAccount, r.currency, r.accountName, r.category, r.account, r.balance, r.isDefault == null ? null : b(r.isDefault), r.holderInn, r.holderName, r.sourceRow);
    const before = r.account ? prev.get(r.account) : undefined;
    if (before == null) stats.inserted++;
    else if (before === r.balance) stats.duplicates++;
    else stats.updated++;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Batches, files, logs

export function createBatch(input: { sessionId: string | null; userId: string | null; trigger: string }): number {
  const info = kdb()
    .prepare("INSERT INTO kt_import_batches (session_id, user_id, trigger, created_at, status) VALUES (?, ?, ?, ?, 'PROCESSING')")
    .run(input.sessionId, input.userId, input.trigger, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

const FILE_COLUMN: Record<SourceType, string> = {
  BASKET: "basket_file_id",
  PAYMENTS: "payments_file_id",
  ACCOUNTS: "accounts_file_id",
  SHIPMENTS: "shipments_file_id"
};

export function recordImportFile(
  db: DatabaseSync,
  batchId: number,
  f: { type: SourceType; filename: string; sha256: string; rows: number; stats: UpsertStats; errors: number; warnings: number; meta: unknown }
): number {
  const info = db
    .prepare(
      `INSERT INTO kt_import_files (batch_id, file_type, filename, sha256, rows, inserted, updated, duplicates, errors, warnings, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(batchId, f.type, f.filename, f.sha256, f.rows, f.stats.inserted, f.stats.updated, f.stats.duplicates, f.errors, f.warnings,
      JSON.stringify(f.meta, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), new Date().toISOString());
  const fileId = Number(info.lastInsertRowid);
  db.prepare(`UPDATE kt_import_batches SET ${FILE_COLUMN[f.type]} = ? WHERE id = ?`).run(fileId, batchId);
  return fileId;
}

export function finishBatch(
  batchId: number,
  f: { status: "COMPLETED" | "ERROR"; reportDate?: string | null; reportGeneratedAt?: string | null; outputName?: string | null; processingMs: number; error?: string | null }
): void {
  kdb()
    .prepare(
      `UPDATE kt_import_batches SET status = ?, finished_at = ?, report_date = ?, report_generated_at = ?, output_name = ?, processing_ms = ?, error = ? WHERE id = ?`
    )
    .run(f.status, new Date().toISOString(), f.reportDate ?? null, f.reportGeneratedAt ?? null, f.outputName ?? null, f.processingMs, f.error ?? null, batchId);
}

export function logProcessing(entry: {
  userId: string | null;
  sessionId: string | null;
  batchId: number;
  file: string;
  fileType: SourceType;
  rows: number;
  stats: UpsertStats;
  errors: number;
  warnings: number;
  processingMs: number;
}): void {
  kdb()
    .prepare(
      `INSERT INTO kt_processing_log (ts, user_id, session_id, batch_id, file, file_type, rows, inserted, updated, duplicates, errors, warnings, processing_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(new Date().toISOString(), entry.userId, entry.sessionId, entry.batchId, entry.file, entry.fileType, entry.rows, entry.stats.inserted,
      entry.stats.updated, entry.stats.duplicates, entry.errors, entry.warnings, entry.processingMs);
  // Structured line for the developer log (journalctl); never sent to users.
  console.info(JSON.stringify({ event: "kt_import_file", ...entry, stats: undefined, ...entry.stats }));
}

/** Latest batch (optionally strictly before `beforeBatchId`) that imported a file of this type. */
export function latestBatchWithFile(db: DatabaseSync, type: SourceType, beforeBatchId?: number): number | null {
  const row = db
    .prepare(
      `SELECT id FROM kt_import_batches WHERE ${FILE_COLUMN[type]} IS NOT NULL ${beforeBatchId != null ? "AND id < ?" : ""} ORDER BY id DESC LIMIT 1`
    )
    .get(...(beforeBatchId != null ? [beforeBatchId] : [])) as { id: number } | undefined;
  return row?.id ?? null;
}

export type BatchRow = {
  id: number;
  session_id: string | null;
  user_id: string | null;
  trigger: string;
  created_at: string;
  finished_at: string | null;
  status: string;
  report_date: string | null;
  report_generated_at: string | null;
  output_name: string | null;
  processing_ms: number | null;
  error: string | null;
};

export function getBatch(id: number): BatchRow | null {
  return (kdb().prepare("SELECT * FROM kt_import_batches WHERE id = ?").get(id) as BatchRow | undefined) ?? null;
}

export function latestCompletedBatch(): BatchRow | null {
  return (kdb().prepare("SELECT * FROM kt_import_batches WHERE status = 'COMPLETED' ORDER BY id DESC LIMIT 1").get() as BatchRow | undefined) ?? null;
}

export function countCompletedForDate(reportDate: string, excludeBatchId: number): number {
  return (kdb().prepare("SELECT COUNT(*) AS c FROM kt_import_batches WHERE status = 'COMPLETED' AND report_date = ? AND id != ?").get(reportDate, excludeBatchId) as { c: number }).c;
}

export type ImportFileRow = {
  id: number;
  batch_id: number;
  file_type: SourceType;
  filename: string;
  sha256: string;
  rows: number;
  inserted: number;
  updated: number;
  duplicates: number;
  errors: number;
  warnings: number;
  meta: string | null;
  created_at: string;
};

/** The file of each type that the current state is built from (latest import of that type up to `batchId`). */
export function currentFiles(batchId: number): Partial<Record<SourceType, ImportFileRow>> {
  const db = kdb();
  const out: Partial<Record<SourceType, ImportFileRow>> = {};
  for (const type of Object.keys(FILE_COLUMN) as SourceType[]) {
    const row = db
      .prepare(
        `SELECT f.* FROM kt_import_files f JOIN kt_import_batches b ON b.id = f.batch_id
         WHERE f.file_type = ? AND b.id <= ? AND b.status != 'ERROR' ORDER BY f.id DESC LIMIT 1`
      )
      .get(type, batchId) as ImportFileRow | undefined;
    if (row) out[type] = row;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading current state

const toBig = (v: unknown): bigint | null => (v == null ? null : BigInt(v as number));

export function loadHarvest(basketBatchId: number): HarvestRecord[] {
  const rows = kdb().prepare("SELECT * FROM kt_harvest_records WHERE last_batch_id = ? ORDER BY source_row").all(basketBatchId) as Record<string, unknown>[];
  return rows.map(mapHarvest);
}

/** Records imported earlier that are absent from the latest basket snapshot (deleted/cancelled at source). */
export function countHarvestNotInSnapshot(basketBatchId: number): number {
  return (kdb().prepare("SELECT COUNT(*) AS c FROM kt_harvest_records WHERE last_batch_id != ?").get(basketBatchId) as { c: number }).c;
}

function mapHarvest(r: Record<string, unknown>): HarvestRecord {
  return {
    naturalKey: r.natural_key as string,
    fingerprint: r.fingerprint as string,
    sourceRow: r.source_row as number,
    inn: (r.inn as string) ?? null,
    farmerName: r.farmer_name as string,
    region: (r.region as string) ?? null,
    district: (r.district as string) ?? null,
    contractType: (r.contract_type as string) ?? null,
    contractNumber: (r.contract_number as string) ?? null,
    contractQtyT: (r.contract_qty_t as number) ?? null,
    acceptanceDate: (r.acceptance_date as string) ?? null,
    acceptanceDateInvalid: Boolean(r.acceptance_date_invalid),
    recordNo: (r.record_no as string) ?? null,
    pk17: (r.pk17 as string) ?? null,
    method: r.method as HarvestRecord["method"],
    methodRaw: (r.method_raw as string) ?? null,
    physicalKg: (r.physical_kg as number) ?? null,
    conditionedKg: (r.conditioned_kg as number) ?? null,
    amount: toBig(r.amount_tiyin),
    unitPrice: (r.unit_price as number) ?? null
  };
}

/** Payments known as of `asOfBatchId` (all of them when omitted). */
export function loadPayments(asOfBatchId?: number): PaymentRecord[] {
  const rows = kdb()
    .prepare(`SELECT * FROM kt_payments ${asOfBatchId != null ? "WHERE first_batch_id <= ?" : ""} ORDER BY op_datetime, id`)
    .all(...(asOfBatchId != null ? [asOfBatchId] : [])) as Record<string, unknown>[];
  return rows.map((r) => ({
    naturalKey: r.natural_key as string,
    fingerprint: r.fingerprint as string,
    sourceRow: r.source_row as number,
    txId: (r.tx_id as string) ?? null,
    opDateTime: (r.op_datetime as string) ?? null,
    opDate: (r.op_date as string) ?? null,
    counterpartyName: (r.counterparty_name as string) ?? null,
    counterpartyInn: (r.counterparty_inn as string) ?? null,
    counterpartyAccount: (r.counterparty_account as string) ?? null,
    accountName: (r.account_name as string) ?? null,
    debit: BigInt(r.debit_tiyin as number),
    credit: BigInt(r.credit_tiyin as number),
    details: (r.details as string) ?? null,
    dealNumber: (r.deal_number as string) ?? null,
    clearingContract: (r.clearing_contract as string) ?? null,
    invoiceNo: (r.invoice_no as string) ?? null,
    isReversal: Boolean(r.is_reversal),
    isCompanySide: Boolean(r.is_company_side),
    statementAccount: (r.statement_account as string) ?? null,
    clientInn: (r.client_inn as string) ?? null
  }));
}

export function loadAccounts(accountsBatchId: number | null): RkpAccountRecord[] {
  if (accountsBatchId == null) return [];
  const rows = kdb().prepare("SELECT * FROM kt_rkp_accounts WHERE batch_id = ? ORDER BY source_row").all(accountsBatchId) as Record<string, unknown>[];
  return rows.map((r) => ({
    sourceRow: r.source_row as number,
    bankAccount: (r.bank_account as string) ?? null,
    currency: (r.currency as string) ?? null,
    accountName: (r.account_name as string) ?? null,
    category: r.category as RkpAccountRecord["category"],
    account: (r.account as string) ?? null,
    balance: BigInt(r.balance_tiyin as number),
    isDefault: r.is_default == null ? null : Boolean(r.is_default),
    holderInn: (r.holder_inn as string) ?? null,
    holderName: (r.holder_name as string) ?? null
  }));
}

/** Shipments known as of `asOfBatchId` (all of them when omitted). */
export function loadShipments(asOfBatchId?: number): ShipmentRecord[] {
  const rows = kdb()
    .prepare(`SELECT * FROM kt_shipments ${asOfBatchId != null ? "WHERE first_batch_id <= ?" : ""} ORDER BY deal_number, document_date, id`)
    .all(...(asOfBatchId != null ? [asOfBatchId] : [])) as Record<string, unknown>[];
  return rows.map((r) => ({
    naturalKey: r.natural_key as string,
    fingerprint: r.fingerprint as string,
    sourceRow: r.source_row as number,
    dealNumber: (r.deal_number as string) ?? null,
    dealDate: (r.deal_date as string) ?? null,
    contractNumber: (r.contract_number as string) ?? null,
    sellerName: (r.seller_name as string) ?? null,
    sellerBroker: (r.seller_broker as string) ?? null,
    sellerInn: (r.seller_inn as string) ?? null,
    buyerName: (r.buyer_name as string) ?? null,
    buyerBroker: (r.buyer_broker as string) ?? null,
    productName: (r.product_name as string) ?? null,
    documentNumber: (r.document_number as string) ?? null,
    documentDate: (r.document_date as string) ?? null,
    shipmentQtyKg: (r.shipment_qty_kg as number) ?? null,
    deliveryCost: toBig(r.delivery_cost_tiyin),
    dealQtyKg: (r.deal_qty_kg as number) ?? null,
    dealAmount: toBig(r.deal_amount_tiyin),
    unit: (r.unit as string) ?? null,
    shipmentTimer: (r.shipment_timer as string) ?? null,
    status: r.status as ShipmentRecord["status"],
    statusRaw: (r.status_raw as string) ?? null
  }));
}

