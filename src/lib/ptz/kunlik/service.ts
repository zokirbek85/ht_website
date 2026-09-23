// ReportService — the single entry point for producing a Кунлик терим report.
// No Telegram types here: the bot, the CLI script and a future 30/60-minute
// scheduler all call processBatch() with whatever files they have, and
// buildReport() regenerates the latest report from stored state.
//
// Flow: parse (async, no DB) → one write transaction (upserts) → load the
// current state of every source → validate → calculate → export.
import { parseBasket } from "./parsers/basket.ts";
import { parsePayments } from "./parsers/payments.ts";
import { parseAccounts } from "./parsers/accounts.ts";
import { parseShipments } from "./parsers/shipments.ts";
import { validateHarvest } from "./validation.ts";
import { calculate, type KunlikReport } from "./calculation.ts";
import { loadDirectory, type DirectoryEntry } from "./directory.ts";
import { exportExcel } from "./exporters/excel.ts";
import { exportPdf } from "./exporters/pdf.ts";
import { nowInTashkent } from "./utils/dates.ts";
import { sha256 } from "./utils/hashing.ts";
import {
  countCompletedForDate,
  countHarvestNotInSnapshot,
  createBatch,
  currentFiles,
  finishBatch,
  insertAccountsSnapshot,
  kdb,
  latestBatchWithFile,
  latestCompletedBatch,
  loadAccounts,
  loadHarvest,
  loadPayments,
  loadShipments,
  logProcessing,
  recordImportFile,
  transaction,
  upsertHarvest,
  upsertPayments,
  upsertShipments,
  type ImportFileRow,
  type InFileDuplicate,
  type UpsertStats
} from "./repository.ts";
import { UserFacingError, type DataIssue, type ParseResult, type SourceType } from "./types.ts";

export type InputFile = { type: SourceType; filename: string; buffer: Buffer };

export type ProcessOptions = {
  trigger: "telegram" | "scheduler" | "cli";
  sessionId?: string | null;
  userId?: string | null;
  now?: Date;
  /** Override for tests; defaults to the directory file in the data dir. */
  directory?: DirectoryEntry[];
  onProgress?: (step: ProgressStep) => void | Promise<void>;
};

export type ProgressStep = "parsed" | "matching" | "calculating" | "excel" | "pdf" | "done";

export type FileStat = { type: SourceType; filename: string; rows: number; inserted: number; updated: number; duplicates: number; errors: number; warnings: number };

export type DataQualitySummary = { critical: number; warning: number; info: number; valid: number; pending: number };

export type ReportOutput = {
  batchId: number;
  report: KunlikReport;
  issues: DataIssue[];
  dq: DataQualitySummary;
  files: FileStat[];
  excel: Buffer;
  pdf: Buffer;
  baseName: string;
  processingMs: number;
};

type ParsedAny = { file: InputFile; result: ParseResult<unknown>; ms: number };

async function parseOne(file: InputFile, now: Date): Promise<ParsedAny> {
  try {
    return await parseByType(file, now);
  } catch (err) {
    if (err instanceof UserFacingError) err.source = file.type;
    throw err;
  }
}

async function parseByType(file: InputFile, now: Date): Promise<ParsedAny> {
  const t0 = performance.now();
  let result: ParseResult<unknown>;
  switch (file.type) {
    case "BASKET":
      result = await parseBasket(file.buffer, file.filename, now);
      break;
    case "PAYMENTS":
      result = await parsePayments(file.buffer);
      break;
    case "ACCOUNTS":
      result = await parseAccounts(file.buffer);
      break;
    case "SHIPMENTS":
      result = await parseShipments(file.buffer);
      break;
  }
  return { file, result, ms: Math.round(performance.now() - t0) };
}

export async function processBatch(files: InputFile[], opts: ProcessOptions): Promise<ReportOutput> {
  const started = performance.now();
  const now = opts.now ?? new Date();
  const types = files.map((f) => f.type);
  if (new Set(types).size !== types.length) throw new UserFacingError("Битта турдаги файл икки марта берилди.", types);

  const batchId = createBatch({ sessionId: opts.sessionId ?? null, userId: opts.userId ?? null, trigger: opts.trigger });
  try {
    const parsed = await Promise.all(files.map((f) => parseOne(f, now)));
    await opts.onProgress?.("parsed");

    const perFile = transaction((db) => {
      const out: { p: ParsedAny; stats: UpsertStats; inFileDuplicates: InFileDuplicate[] }[] = [];
      for (const p of parsed) {
        let stats: UpsertStats;
        let inFileDuplicates: InFileDuplicate[] = [];
        switch (p.file.type) {
          case "BASKET": {
            const s = upsertHarvest(db, p.result.records as never, batchId);
            stats = s;
            inFileDuplicates = s.inFileDuplicates;
            break;
          }
          case "PAYMENTS": {
            const s = upsertPayments(db, p.result.records as never, batchId);
            stats = s;
            inFileDuplicates = s.inFileDuplicates;
            break;
          }
          case "SHIPMENTS": {
            const s = upsertShipments(db, p.result.records as never, batchId);
            stats = s;
            inFileDuplicates = s.inFileDuplicates;
            break;
          }
          case "ACCOUNTS":
            stats = insertAccountsSnapshot(db, p.result.records as never, batchId);
            break;
        }
        const dupIssues: DataIssue[] =
          p.file.type === "BASKET"
            ? [] // basket in-file duplicates are reported by validateHarvest with row context
            : inFileDuplicates.map((d) => ({ severity: "WARNING", code: "DUPLICATE", source: p.file.type, row: d.sourceRow, ref: d.naturalKey, message: "Файл ичида такрорланган қатор — иккинчи марта ҳисобланмади." }));
        const issues = [...p.result.issues, ...dupIssues];
        recordImportFile(db, batchId, {
          type: p.file.type,
          filename: p.file.filename,
          sha256: sha256(p.file.buffer),
          rows: p.result.rowCount,
          stats,
          errors: issues.filter((i) => i.severity === "CRITICAL").length,
          warnings: issues.filter((i) => i.severity === "WARNING").length,
          meta: { ...p.result.meta, issues, inFileDuplicates }
        });
        out.push({ p, stats, inFileDuplicates });
      }
      return out;
    });

    for (const { p, stats } of perFile) {
      const issues = p.result.issues;
      logProcessing({
        userId: opts.userId ?? null,
        sessionId: opts.sessionId ?? null,
        batchId,
        file: p.file.filename,
        fileType: p.file.type,
        rows: p.result.rowCount,
        stats,
        errors: issues.filter((i) => i.severity === "CRITICAL").length,
        warnings: issues.filter((i) => i.severity === "WARNING").length,
        processingMs: p.ms
      });
    }

    const output = await buildReport(batchId, { now, directory: opts.directory, onProgress: opts.onProgress, started });
    finishBatch(batchId, {
      status: "COMPLETED",
      reportDate: output.report.reportDate,
      reportGeneratedAt: output.report.generatedAt,
      outputName: output.baseName,
      processingMs: output.processingMs
    });
    return output;
  } catch (err) {
    finishBatch(batchId, { status: "ERROR", processingMs: Math.round(performance.now() - started), error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    throw err;
  }
}

function fileMeta(row: ImportFileRow | undefined): { issues: DataIssue[]; inFileDuplicates: InFileDuplicate[]; reportGeneratedAt?: string | null } {
  if (!row?.meta) return { issues: [], inFileDuplicates: [] };
  const m = JSON.parse(row.meta) as { issues?: DataIssue[]; inFileDuplicates?: InFileDuplicate[]; reportGeneratedAt?: string | null };
  return { issues: m.issues ?? [], inFileDuplicates: m.inFileDuplicates ?? [], reportGeneratedAt: m.reportGeneratedAt ?? null };
}

/** Builds the report from the stored state as of `batchId` (every source's latest import up to that batch). */
export async function buildReport(
  batchId: number,
  opts: { now?: Date; directory?: DirectoryEntry[]; onProgress?: ProcessOptions["onProgress"]; started?: number } = {}
): Promise<ReportOutput> {
  const started = opts.started ?? performance.now();
  const db = kdb();
  const basketBatch = latestBatchWithFile(db, "BASKET", batchId + 1);
  if (basketBatch == null) throw new UserFacingError("Ҳали битта ҳам basket файли юкланмаган — ҳисобот тузиб бўлмайди.");
  const accountsBatch = latestBatchWithFile(db, "ACCOUNTS", batchId + 1);
  const files = currentFiles(batchId);

  const harvest = loadHarvest(basketBatch);
  const basketMeta = fileMeta(files.BASKET);
  const validation = validateHarvest(harvest, basketMeta.inFileDuplicates);
  await opts.onProgress?.("matching");

  const nowT = nowInTashkent(opts.now ?? new Date());
  const reportDate =
    basketMeta.reportGeneratedAt?.slice(0, 10) ??
    validation.counted.map((r) => r.acceptanceDate!).sort().pop() ??
    nowT.date;

  const directory = opts.directory ?? (await loadDirectory());
  await opts.onProgress?.("calculating");
  const report = calculate({
    harvest,
    counted: validation.counted,
    payments: loadPayments(),
    accounts: loadAccounts(accountsBatch),
    shipments: loadShipments(),
    directory,
    reportDate,
    generatedAt: nowT.iso,
    sourceUpdatedAt: basketMeta.reportGeneratedAt ?? null
  });

  const removed = countHarvestNotInSnapshot(basketBatch);
  const issues: DataIssue[] = [
    ...validation.issues,
    ...(["PAYMENTS", "ACCOUNTS", "SHIPMENTS"] as const).flatMap((t) => fileMeta(files[t]).issues),
    ...basketMeta.issues,
    ...report.issues,
    ...(directory.length === 0
      ? [{ severity: "WARNING" as const, code: "DIRECTORY_MISSING", source: "REPORT" as const, message: "Ҳудуд маълумотномаси (farmer_directory.xlsx) топилмади — барча фермерлар ҳудудсиз кўрсатилди." }]
      : []),
    ...(removed > 0
      ? [{ severity: "INFO" as const, code: "REMOVED_FROM_SOURCE", source: "BASKET" as const, message: `${removed} та аввал юкланган қабул ёзуви охирги basketда йўқ — ҳисобга киритилмади.` }]
      : [])
  ];
  const dq: DataQualitySummary = {
    critical: issues.filter((i) => i.severity === "CRITICAL").length,
    warning: issues.filter((i) => i.severity === "WARNING").length,
    info: issues.filter((i) => i.severity === "INFO").length,
    valid: validation.validCount,
    pending: validation.pendingCount
  };
  const fileStats: FileStat[] = (["BASKET", "PAYMENTS", "ACCOUNTS", "SHIPMENTS"] as const)
    .map((t) => files[t])
    .filter((f): f is ImportFileRow => !!f)
    .map((f) => ({ type: f.file_type, filename: f.filename, rows: f.rows, inserted: f.inserted, updated: f.updated, duplicates: f.duplicates, errors: f.errors, warnings: f.warnings }));

  const sameDay = countCompletedForDate(report.reportDate, batchId);
  const baseName = `Кунлик_терим_${report.reportDate}${sameDay > 0 ? `_${report.generatedAt.slice(11, 16).replace(":", "-")}` : ""}`;

  await opts.onProgress?.("excel");
  const ctx = { report, issues, dq, files: fileStats, batchId };
  const excel = await exportExcel(ctx);
  await opts.onProgress?.("pdf");
  const pdf = await exportPdf(ctx);
  await opts.onProgress?.("done");

  return { batchId, report, issues, dq, files: fileStats, excel, pdf, baseName, processingMs: Math.round(performance.now() - started) };
}

/** Regenerates the latest completed report (for /report, /today…), or null if none exists yet. */
export async function buildLatestReport(opts: { now?: Date } = {}): Promise<ReportOutput | null> {
  const latest = latestCompletedBatch();
  if (!latest) return null;
  const out = await buildReport(latest.id, opts);
  return { ...out, baseName: latest.output_name ?? out.baseName };
}

export type ExportContext = { report: KunlikReport; issues: DataIssue[]; dq: DataQualitySummary; files: FileStat[]; batchId: number };
