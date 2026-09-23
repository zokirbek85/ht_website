// Telegram message texts for the Кунлик терим flow — formatting only, no
// business logic: every number comes from a ReportOutput / KunlikReport.
import { SOURCE_LABELS } from "./classifier.ts";
import { PICKING_MONEY_SHARE_PCT } from "./config.ts";
import { formatNumber, formatSum } from "./utils/numbers.ts";
import { formatDate, formatDateTime } from "./utils/dates.ts";
import { SOURCE_TYPES, type SourceType } from "./types.ts";
import type { ProgressStep, ReportOutput } from "./service.ts";
import type { UploadSession } from "./session.ts";
import type { ImportFileRow, BatchRow } from "./repository.ts";

const t = (kg: number) => `${formatNumber(kg / 1000, 2)} т`;
const sum = (tiyin: bigint) => `${formatSum(tiyin).replace(/,\d\d$/, "")} сўм`;

export const PROMPTS: Record<SourceType, string> = {
  BASKET: "Basket файлини юборинг.",
  PAYMENTS: "Историческая выписка файлини юборинг.",
  ACCOUNTS: "Мои лицевые счета в РКП файлини юборинг.",
  SHIPMENTS: "Shipments файлини юборинг."
};

export function startText(): string {
  return ["📊 КУНЛИК ТЕРИМ ҲИСОБОТИ", "", "4 та Excel файл керак (исталган тартибда юбориш мумкин).", "", `1/4`, PROMPTS.BASKET].join("\n");
}

export function checklist(s: UploadSession): string {
  return SOURCE_TYPES.map((type) => `${s.files[type] ? "✅" : "⬜️"} ${SOURCE_LABELS[type]}`).join("\n");
}

export function acceptedText(s: UploadSession, type: SourceType, replaced: boolean): string {
  const have = SOURCE_TYPES.filter((x) => s.files[x]).length;
  const next = SOURCE_TYPES.find((x) => !s.files[x]);
  return [
    `✅ ${SOURCE_LABELS[type]} ${replaced ? "янгиланди (олдинги файл алмаштирилди)" : "қабул қилинди"}.`,
    "",
    next ? `${have + 1}/4\n${PROMPTS[next]}` : "4/4 — барча файллар олинди.",
    "",
    checklist(s)
  ].join("\n");
}

export const ASK_TYPE_TEXT = "❓ Файл турини аниқлаб бўлмади.\n\nБу файл қайси турга тегишли?";

const STEP_ORDER: ProgressStep[] = ["parsed", "matching", "calculating", "excel", "pdf", "done"];
const STEP_LABELS: Record<Exclude<ProgressStep, "done">, string> = {
  parsed: "Файллар ўқилмоқда",
  matching: "Фермерлар ва шартномалар боғланмоқда",
  calculating: "Терим, тўлов ва отгрузка ҳисобланмоқда",
  excel: "Excel тайёрланмоқда",
  pdf: "PDF тайёрланмоқда"
};

/** Progress screen: finished steps ✓, the current one ⏳, the rest dimmed. */
export function progressText(done: ProgressStep | null): string {
  const doneIdx = done ? STEP_ORDER.indexOf(done) : -1;
  const lines = (Object.keys(STEP_LABELS) as Exclude<ProgressStep, "done">[]).map((step, i) => {
    if (i <= doneIdx) return `✓ ${STEP_LABELS[step]}`;
    if (i === doneIdx + 1) return `⏳ ${STEP_LABELS[step]}...`;
    return `· ${STEP_LABELS[step]}`;
  });
  return ["⏳ ҲИСОБОТ ТАЙЁРЛАНМОҚДА...", "", ...SOURCE_TYPES.map((x) => `✓ ${SOURCE_LABELS[x]}`), "", ...lines].join("\n");
}

export function finalText(out: ReportOutput): string {
  const r = out.report;
  const k = r.kpi;
  return [
    "✅ КУНЛИК ТЕРИМ ТАЙЁР",
    "",
    `📅 Сана: ${formatDate(r.reportDate)}`,
    `🕐 Янгиланди: ${r.generatedAt.slice(11, 16)}${r.sourceUpdatedAt ? ` (basket: ${formatDateTime(r.sourceUpdatedAt)})` : ""}`,
    "",
    `🌾 Бугунги терим: ${t(k.todayTotalKg)}`,
    `🤲 Қўл терими: ${t(k.todayHandKg)}`,
    `🚜 Машина терими: ${t(k.todayMachineKg)}`,
    `📈 Мавсум жами: ${t(k.seasonTotalKg)} (қўл ${t(k.seasonHandKg)} · машина ${t(k.seasonMachineKg)})`,
    "",
    `👨‍🌾 Фермерлар: ${k.farmersWithHarvest} (бугун ${k.farmersToday})`,
    `📄 Шартномалар: ${k.contracts}`,
    "",
    `📦 Жами отгрузка: ${t(k.shippedKg)}`,
    `📄 Shipment шартномалари: ${k.shipmentDeals}`,
    "",
    `💰 Бугунги тўлов: ${sum(k.paidToday)}`,
    `💰 Жами тўлов: ${sum(k.paidTotal)}`,
    `💳 Терим пули қолдиғи (${PICKING_MONEY_SHARE_PCT}%): ${sum(k.pickingBalance)}`,
    `🏦 РКП свободные средства: ${sum(k.rkpFreeBalance)}`,
    "",
    "⚠️ Data quality:",
    `🔴 Critical: ${out.dq.critical}`,
    `🟠 Warnings: ${out.dq.warning}`,
    `🟢 Valid: ${formatNumber(out.dq.valid, 0)}`
  ].join("\n");
}

export function todayText(out: ReportOutput): string {
  const k = out.report.kpi;
  return [
    `📊 БУГУН — ${formatDate(out.report.reportDate)}`,
    "",
    `🌾 Жами: ${t(k.todayTotalKg)}`,
    `🤲 Қўл: ${t(k.todayHandKg)}`,
    `🚜 Машина: ${t(k.todayMachineKg)}`,
    `👨‍🌾 Топширган фермерлар: ${k.farmersToday}`,
    `💰 Бугунги тўлов: ${sum(k.paidToday)}`,
    "",
    `Мавсум: ${t(k.seasonTotalKg)}`
  ].join("\n");
}

export function farmersText(out: ReportOutput, limit = 25): string {
  const lines = out.report.lines.filter((l) => l.total.handKg + l.total.machineKg > 0);
  const today = [...lines].filter((l) => l.today.handKg + l.today.machineKg > 0).sort((a, b) => b.today.handKg + b.today.machineKg - (a.today.handKg + a.today.machineKg));
  return [
    `👨‍🌾 ФЕРМЕРЛАР — ${formatDate(out.report.reportDate)}`,
    "",
    `Бугун топширганлар (${today.length}):`,
    ...today.slice(0, limit).map((l, i) => `${i + 1}. ${l.displayName} — ${t(l.today.handKg + l.today.machineKg)}`),
    ...(today.length > limit ? [`… яна ${today.length - limit} та (Excel → "Фермерлар")`] : []),
    "",
    `Мавсум бўйича фермерлар: ${lines.length}`
  ].join("\n");
}

export function paymentsText(out: ReportOutput, limit = 10): string {
  const r = out.report;
  const unmatched = r.payments.filter((p) => !p.match.inn);
  const top = [...r.lines].filter((l) => l.paidTotal !== 0n).sort((a, b) => (b.paidTotal > a.paidTotal ? 1 : b.paidTotal < a.paidTotal ? -1 : 0));
  return [
    "💰 ТЎЛОВЛАР",
    "",
    `Бугун (${formatDate(r.reportDate)}): ${sum(r.kpi.paidToday)}`,
    `Жами (нетто): ${sum(r.kpi.paidTotal)}`,
    `Терим пули қолдиғи: ${sum(r.kpi.pickingBalance)}`,
    `Выписка қаторлари: ${r.payments.length} (боғланмаган: ${unmatched.length})`,
    "",
    "🏦 РКП:",
    `Свободные: ${sum(r.accountTotals.FREE)}`,
    `Блокированные: ${sum(r.accountTotals.BLOCKED)}`,
    `В пути: ${sum(r.accountTotals.IN_TRANSIT)}`,
    "",
    `Энг кўп тўланган ${Math.min(limit, top.length)} фермер:`,
    ...top.slice(0, limit).map((l, i) => `${i + 1}. ${l.displayName} — ${sum(l.paidTotal)}`)
  ].join("\n");
}

export function shipmentsText(out: ReportOutput, limit = 10): string {
  const r = out.report;
  return [
    "📦 ОТГРУЗКА",
    "",
    `Битимлар: ${r.kpi.shipmentDeals}`,
    `Отгрузка миқдори: ${t(r.kpi.shippedKg)}`,
    `Отгрузка қиймати: ${sum(r.kpi.shippedValue)}`,
    "",
    `Энг кўп отгрузка (${Math.min(limit, r.shipmentFarmers.length)}):`,
    ...r.shipmentFarmers.slice(0, limit).map((f, i) => `${i + 1}. ${f.name} — ${t(f.shippedKg)} / битим ${t(f.dealQtyKg)}`),
    "",
    "ℹ️ «Битим − отгрузка» фарқи қолдиқ сифатида тасдиқланмаган (BUSINESS_RULE_REQUIRED)."
  ].join("\n");
}

export function detailText(out: ReportOutput): string {
  const byCode = new Map<string, { severity: string; n: number }>();
  for (const i of out.issues) {
    const e = byCode.get(i.code) ?? { severity: i.severity, n: 0 };
    e.n++;
    byCode.set(i.code, e);
  }
  const icon = (s: string) => (s === "CRITICAL" ? "🔴" : s === "WARNING" ? "🟠" : "🔵");
  return [
    "🔎 БАТАФСИЛ",
    "",
    ...out.files.map((f) => `${SOURCE_LABELS[f.type]}: ${formatNumber(f.rows, 0)} қатор (+${f.inserted}, ~${f.updated}, такрор ${f.duplicates})`),
    "",
    "Data quality:",
    ...[...byCode.entries()].sort((a, b) => b[1].n - a[1].n).map(([code, e]) => `${icon(e.severity)} ${code}: ${e.n}`),
    "",
    'Тўлиқ рўйхат — Excel → "Data Quality" варағи.'
  ].join("\n");
}

export function statusText(p: {
  batch: BatchRow | null;
  files: Partial<Record<SourceType, ImportFileRow>>;
  out: ReportOutput | null;
  session: UploadSession | null;
  refreshMinutes: number;
}): string {
  const lines = ["📊 SYSTEM STATUS", ""];
  lines.push("Охирги янгиланиш:", p.batch ? formatDateTime(p.batch.report_generated_at) : "—", "");
  for (const type of SOURCE_TYPES) {
    const f = p.files[type];
    lines.push(`${SOURCE_LABELS[type]}:`, f ? `✅ ${formatNumber(f.rows, 0)} қатор (${formatDateTime(f.created_at.replace("Z", ""))} UTC)` : "❌ юкланмаган", "");
  }
  if (p.out) {
    lines.push(`Фермерлар:\n${p.out.report.kpi.farmersWithHarvest}`, "", `Бугунги терим:\n${t(p.out.report.kpi.todayTotalKg)}`, "");
  }
  if (p.session) lines.push(`Жорий сессия: ${p.session.status}\n${checklist(p.session)}`, "");
  lines.push(`Автоматик янгиланиш интервали: ${p.refreshMinutes} дақиқа (режалаштирувчи ҳали уланмаган)`);
  return lines.join("\n");
}

export function errorText(message: string, details: string[]): string {
  const shown = details.slice(0, 40);
  return [
    "❌ Ҳисобот яратилмади.",
    "",
    "Сабаб:",
    message,
    ...(shown.length ? ["", "Топилган устунлар:", ...shown.map((d) => `• ${d}`), ...(details.length > shown.length ? [`… яна ${details.length - shown.length}`] : [])] : [])
  ].join("\n");
}

export const HELP_TEXT = [
  "📊 Кунлик терим боти",
  "",
  "4 та Excel файлни исталган тартибда юборинг:",
  "• basket_*.xlsx",
  "• Историческая выписка_*.xlsx",
  "• Мои лицевые счета в РКП_*.xlsx",
  "• Shipments*.xlsx",
  "Тўрттаси келгач, Excel + PDF ҳисобот автоматик тайёрланади.",
  "",
  "/start — янги ҳисобот сессиясини бошлаш",
  "/report — охирги ҳисоботни (Excel + PDF) қайта юбориш",
  "/today — бугунги қисқа хулоса",
  "/farmers — бугун топширган фермерлар",
  "/payments — тўловлар ва РКП қолдиқлари",
  "/shipments — отгрузка",
  "/status — тизим ҳолати",
  "/cancel — жорий сессияни бекор қилиш",
  "/settings — созламалар (админ)"
].join("\n");
