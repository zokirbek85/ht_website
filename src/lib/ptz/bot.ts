import { logAudit } from "./audit.ts";
import { importExcelReport, reprocessImport } from "./importer.ts";
import { generateReportPackage, buildReportBundle } from "./reportBundle.ts";
import { downloadTelegramFile, sendDocument, sendMessage, type TelegramUpdate } from "./telegram.ts";
import { getActiveImport, listAllImports } from "./analytics.ts";
import { addTelegramUser, getAuthorizedUser, isAdmin, listTelegramUsers, removeTelegramUser } from "./telegramUsers.ts";
import { getAllSettings } from "./settings.ts";
import type { ReportBundle } from "./reportBundle.ts";

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtTons(kg: number | null | undefined): string {
  return `${fmt((kg ?? 0) / 1000)} т`;
}
function fmtSum(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("ru-RU")} сўм`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join(".");
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://hazorasp-textil.uz";
}

function finalSummaryText(bundle: ReportBundle): string {
  const s = bundle.summary;
  const red = bundle.alerts.filter((a) => a.severity === "RED").reduce((a, al) => a + al.count, 0);
  const yellow = bundle.alerts.filter((a) => a.severity === "YELLOW").reduce((a, al) => a + al.count, 0);
  const green = bundle.alerts.filter((a) => a.severity === "GREEN" || a.severity === "INFO").reduce((a, al) => a + al.count, 0);

  return [
    "✅ ПАХТА ҚАБУЛИ ҲИСОБОТИ ТАЙЁР",
    "",
    `📋 Шартнома миқдори:  ${fmtTons(s.contractQtyKg)}`,
    `🌿 Қабул қилинган:     ${fmtTons(s.acceptedKg)}`,
    `📌 Қолдиқ:             ${fmtTons(s.remainingKg)}`,
    `📈 Бажарилиши:         ${s.achievementPct != null ? `${fmt(s.achievementPct)}%` : "—"}`,
    "",
    `🚛 Қабул операциялари: ${s.operationCount}`,
    `👨‍🌾 Фермерлар: ${s.farmerCount}`,
    `📑 Шартномалар: ${s.contractCount}`,
    "",
    "💰 Харид суммаси:",
    fmtSum(s.totalAmount),
    "",
    "📊 Ўртача харид нархи:",
    s.weightedAvgPrice != null ? `${fmt(s.weightedAvgPrice, 0)} сўм/кг` : "—",
    "",
    "⚠️ Назорат:",
    `🔴 ${red} та   🟡 ${yellow} та   🟢 ${green} та`,
    "",
    `📅 Ҳисобот санаси: ${fmtDate(bundle.import.reportGeneratedAt)}`,
    `Маълумот даври: ${fmtDate(bundle.import.dataPeriodStart)} — ${fmtDate(bundle.import.dataPeriodEnd)}`
  ].join("\n");
}

function todayShortSummary(bundle: ReportBundle): string {
  const s = bundle.summary;
  return [
    "📊 ПАХТА ҚАБУЛИ — ҚИСҚА ХУЛОСА",
    `📅 ${fmtDate(bundle.import.reportGeneratedAt)}`,
    "",
    `Шартнома: ${fmtTons(s.contractQtyKg)}`,
    `Қабул: ${fmtTons(s.acceptedKg)}  (${s.achievementPct != null ? `${fmt(s.achievementPct)}%` : "—"})`,
    `Бугунги қабул: ${fmtTons(s.todayAcceptedKg)}`,
    `Қолдиқ: ${fmtTons(s.remainingKg)}`
  ].join("\n");
}

async function sendReportPackage(chatId: number, telegramId: string, importId: number): Promise<void> {
  await sendMessage(chatId, "📄 PDF тайёрланмоқда...\n📊 XLSX тайёрланмоқда...\n🌐 Web Dashboard тайёрланмоқда...");

  const pkg = await generateReportPackage(importId, siteUrl(), `telegram:${telegramId}`);
  if (!pkg) {
    await sendMessage(chatId, "❌ Ҳисоботни тайёрлашда кутилмаган хато юз берди.");
    return;
  }

  await sendMessage(chatId, finalSummaryText(pkg.bundle), [
    [{ text: "🌐 WEB DASHBOARD", url: pkg.webUrl }]
  ]);
  await sendMessage(chatId, ["🔐 Dashboard пароли:", pkg.webPassword, "⏳ Амал қилиш муддати: 1 соат"].join("\n"));
  await sendDocument(chatId, pkg.pdf, `Hazorasp_Textil_Paxta_Qabuli_Report_${pkg.bundle.import.dataPeriodEnd ?? "report"}.pdf`, "📄 PDF ҲИСОБОТ");
  await sendDocument(chatId, pkg.xlsx, `Hazorasp_Textil_Paxta_Qabuli_Report_${pkg.bundle.import.dataPeriodEnd ?? "report"}.xlsx`, "📊 XLSX ҲИСОБОТ");

  logAudit("REPORT_PACKAGE_SENT", { telegramId }, { importId });
}

const HELP_TEXT = [
  "Пахта қабули аналитика боти буйруқлари:",
  "/report — охирги ҳисоботни қайта юбориш",
  "/today — бугунги қисқа хулоса",
  "/history — сўнгги импортлар рўйхати",
  "/dashboard — янги вақтинчалик dashboard ҳаволаси",
  "/reprocess — охирги импортни сақланган асл файлдан қайта таҳлил қилиш (фақат админ)",
  "/settings — жорий созламалар (фақат админ)",
  "",
  "Excel файлни шу ботга юборсангиз, автоматик таҳлил қилинади."
].join("\n");

async function handleDocument(
  chatId: number,
  telegramId: string,
  username: string | null,
  document: NonNullable<NonNullable<TelegramUpdate["message"]>["document"]>,
  messageDate: number
): Promise<void> {
  const filename = document.file_name ?? "report.xlsx";
  const isXlsx =
    filename.toLowerCase().endsWith(".xlsx") ||
    document.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (!isXlsx) {
    await sendMessage(chatId, "❌ Фақат .xlsx форматидаги файллар қабул қилинади.");
    return;
  }
  if ((document.file_size ?? 0) > 20 * 1024 * 1024) {
    await sendMessage(chatId, "❌ Файл ҳажми 20MB дан катта. Telegram bot API бундай файлни юклаб бера олмайди.");
    return;
  }

  await sendMessage(chatId, "📊 Файл қабул қилинди.\n\nМаълумотлар текширилмоқда...");

  let buffer: Buffer;
  try {
    buffer = await downloadTelegramFile(document.file_id);
  } catch (err) {
    await sendMessage(chatId, "❌ Файлни юклаб олишда хато юз берди.");
    console.error("PTZ bot: file download failed", err);
    return;
  }

  await sendMessage(chatId, "🔄 Excel таҳлил қилинмоқда...\n📈 Кўрсаткичлар ҳисобланмоқда...");

  const outcome = await importExcelReport(buffer, filename, new Date(messageDate * 1000), { telegramId, username });

  if (outcome.status === "duplicate") {
    await sendMessage(chatId, "ℹ️ Бу файл аллақачон юкланган (байт-байтгача бир хил). Қайта ишланмади.");
    return;
  }

  if (outcome.status === "failed") {
    const errors = outcome.warnings.filter((w) => w.severity === "ERROR");
    await sendMessage(
      chatId,
      [
        "❌ Ҳисобот яратишда хатолик юз берди.",
        "",
        "Муаммо:",
        ...errors.slice(0, 5).map((e) => `• ${e.message}`)
      ].join("\n")
    );
    return;
  }

  if (outcome.status === "partial") {
    const errors = outcome.warnings.filter((w) => w.severity === "ERROR").length;
    const warns = outcome.warnings.filter((w) => w.severity === "WARNING").length;
    await sendMessage(
      chatId,
      `⚠️ Импорт қисман муваффақиятли якунланди (${errors} хато, ${warns} огоҳлантириш). Текширилган маълумотлар билан давом этилмоқда.\n\nҚаторлар: ${outcome.rowCount} (яроқли: ${outcome.validRowCount})`
    );
  }

  await sendReportPackage(chatId, telegramId, outcome.importId);
}

async function handleCommand(chatId: number, telegramId: string, role: "admin" | "uploader", command: string): Promise<void> {
  const base = command.split(/[@\s]/)[0];

  switch (base) {
    case "/start":
    case "/help":
      await sendMessage(chatId, HELP_TEXT);
      return;

    case "/report": {
      const latest = getActiveImport();
      if (!latest) {
        await sendMessage(chatId, "Ҳозирча ҳеч қандай ҳисобот юкланмаган.");
        return;
      }
      await sendReportPackage(chatId, telegramId, latest.id);
      return;
    }

    case "/today": {
      const latest = getActiveImport();
      if (!latest) {
        await sendMessage(chatId, "Ҳозирча ҳеч қандай ҳисобот юкланмаган.");
        return;
      }
      const bundle = buildReportBundle(latest.id);
      if (bundle) await sendMessage(chatId, todayShortSummary(bundle));
      return;
    }

    case "/history": {
      const imports = listAllImports(10);
      if (imports.length === 0) {
        await sendMessage(chatId, "Тарих бўш.");
        return;
      }
      const lines = imports.map((i) => `${fmtDate(i.dataPeriodEnd)} — ${i.status} (${i.rowCount} қатор, ${i.warningCount} огоҳлантириш)${i.isActive ? " [фаол]" : ""}`);
      await sendMessage(chatId, ["Сўнгги импортлар:", ...lines].join("\n"));
      return;
    }

    case "/dashboard": {
      const latest = getActiveImport();
      if (!latest) {
        await sendMessage(chatId, "Ҳозирча ҳеч қандай ҳисобот юкланмаган.");
        return;
      }
      const { createTempAccess } = await import("./tempAccess.ts");
      const access = createTempAccess(latest.id, `telegram:${telegramId}`);
      const link = `${siteUrl()}/ptz/report/${access.token}`;
      await sendMessage(chatId, ["📊 PAXTA QABULI DASHBOARD", "", "🔐 Парол:", access.password, "", "⏳ Амал қилиш муддати:", "1 соат"].join("\n"), [
        [{ text: "🌐 Dashboardni ochish", url: link }]
      ]);
      return;
    }

    case "/reprocess": {
      if (role !== "admin") {
        await sendMessage(chatId, "❌ Бу буйруқ фақат администраторлар учун.");
        return;
      }
      const latest = getActiveImport();
      if (!latest) {
        await sendMessage(chatId, "Ҳозирча ҳеч қандай ҳисобот юкланмаган.");
        return;
      }
      await sendMessage(chatId, "🔄 Ҳисобот сақланган асл файлдан қайта таҳлил қилинмоқда...");
      const outcome = await reprocessImport(latest.id, { telegramId, username: null });
      if (outcome.status === "failed") {
        await sendMessage(chatId, ["❌ Қайта таҳлил қилиб бўлмади.", ...outcome.warnings.slice(0, 5).map((w) => `• ${w.message}`)].join("\n"));
        return;
      }
      await sendMessage(chatId, `✅ Қайта таҳлил тугади: ${outcome.rowCount} қатор, ${outcome.warnings.length} огоҳлантириш.`);
      await sendReportPackage(chatId, telegramId, outcome.importId);
      return;
    }

    case "/settings": {
      if (role !== "admin") {
        await sendMessage(chatId, "❌ Бу буйруқ фақат администраторлар учун.");
        return;
      }
      const settings = getAllSettings();
      const users = listTelegramUsers();
      await sendMessage(
        chatId,
        ["Жорий созламалар:", ...Object.entries(settings).map(([k, v]) => `${k} = ${v}`), "", `Рухсат берилган фойдаланувчилар: ${users.length}`].join("\n")
      );
      return;
    }

    default:
      await sendMessage(chatId, "Номаълум буйруқ. /help ни синаб кўринг.");
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.from || message.from.is_bot) return;

  const chatId = message.chat.id;
  const telegramId = String(message.from.id);
  const username = message.from.username ?? null;

  const user = getAuthorizedUser(telegramId);
  if (!user) {
    logAudit("UNAUTHORIZED_ACCESS_ATTEMPT", { telegramId, username }, { text: message.text ?? "[document]" });
    await sendMessage(chatId, "⛔ Сизда ушбу ботдан фойдаланиш ҳуқуқи йўқ. Администратор билан боғланинг.");
    return;
  }

  if (message.document) {
    await handleDocument(chatId, telegramId, username, message.document, message.date);
    return;
  }

  if (message.text?.startsWith("/")) {
    await handleCommand(chatId, telegramId, user.role, message.text);
  }
}

export { addTelegramUser, removeTelegramUser, isAdmin };
