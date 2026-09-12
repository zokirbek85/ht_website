import { logAudit } from "./audit.ts";
import { importExcelReport, reprocessReport } from "./importer.ts";
import { generatePdfReport } from "./pdf.ts";
import { buildReportBundle, type ReportBundle } from "./reportBundle.ts";
import { downloadTelegramFile, sendDocument, sendMessage, type TelegramUpdate } from "./telegram.ts";
import { createTempAccess } from "./tempAccess.ts";
import { getLatestActiveReport, listActiveReports } from "./analytics.ts";
import { addTelegramUser, getAuthorizedUser, isAdmin, listTelegramUsers, removeTelegramUser } from "./telegramUsers.ts";
import { getAllSettings } from "./settings.ts";

const STATUS_LABEL_UZ: Record<string, string> = {
  GREEN: "🟢 РЕЖА БЎЙИЧА",
  YELLOW: "🟡 ХАВФ ОСТИДА",
  RED: "🔴 РЕЖАДАН ОРТДА",
  UNKNOWN: "⚪ МАЪЛУМОТ ЕТАРЛИ ЭМАС"
};

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://hazorasp-textil.uz";
}

function summaryText(bundle: ReportBundle): string {
  const growthPct =
    bundle.previousDailyQty && bundle.previousDailyQty !== 0
      ? ((bundle.overall.dailyQty - bundle.previousDailyQty) / bundle.previousDailyQty) * 100
      : null;

  return [
    "📊 PTZ SVODKA",
    `📅 ${fmtDate(bundle.report.reportDate)}`,
    "",
    `Умумий режа: ${fmt(bundle.overall.planQty)} т`,
    `Жами қабул: ${fmt(bundle.overall.cumulativeQty)} т`,
    `Бажарилиши: ${fmt(bundle.forecast.completionPct)}%`,
    "",
    `Бугунги қабул: ${fmt(bundle.overall.dailyQty)} т`,
    `Кечаги қабул: ${fmt(bundle.previousDailyQty)} т`,
    `Ўсиш: ${growthPct != null ? `${growthPct >= 0 ? "+" : ""}${fmt(growthPct)}%` : "—"}`,
    "",
    `Қолдиқ: ${fmt(bundle.forecast.remainingQty)} т`,
    `Керакли темп: ${fmt(bundle.forecast.requiredDailyRate)} т/кун`,
    `Амалдаги темп: ${fmt(bundle.forecast.currentRunRate)} т/кун`,
    "",
    `Прогноз: ${fmtDate(bundle.forecast.forecastDate)}`,
    `Ҳолат: ${STATUS_LABEL_UZ[bundle.forecast.status]}`
  ].join("\n");
}

async function sendReportPackage(chatId: number, telegramId: string, bundle: ReportBundle): Promise<void> {
  await sendMessage(chatId, "📄 PDF tayyorlanmoqda...");
  const pdfBuffer = await generatePdfReport({
    report: bundle.report,
    overall: bundle.overall,
    previousDailyQty: bundle.previousDailyQty,
    forecast: bundle.forecast,
    contractTypes: bundle.contractTypes,
    topRegions: bundle.topRegions,
    bottomRegions: bundle.bottomRegions,
    topFarmers: bundle.topFarmers,
    bottomFarmers: bundle.bottomFarmers,
    riskFarmers: bundle.riskFarmers,
    warningMessages: bundle.warningMessages
  });

  const access = createTempAccess(bundle.report.id, `telegram:${telegramId}`);
  const link = `${siteUrl()}/ptz/report/${access.token}`;

  await sendMessage(chatId, summaryText(bundle));
  await sendDocument(
    chatId,
    pdfBuffer,
    `HAZORASP-TEXTIL_PTZ_${bundle.report.reportDate}.pdf`,
    "✅ Hisobot tayyor."
  );
  await sendMessage(
    chatId,
    ["📊 PTZ DASHBOARD", "", "🔗 Link:", link, "", "🔐 Парол:", access.password, "", "⏳ Амал қилиш муддати:", "1 соат"].join("\n")
  );

  logAudit("DASHBOARD_LINK_SENT", { telegramId }, { reportId: bundle.report.id, expiresAt: access.expiresAt });
}

const HELP_TEXT = [
  "PTZ Analytics bot buyruqlari:",
  "/report — oxirgi hisobotni qayta yuborish",
  "/today — bugungi qisqa xulosa",
  "/history — so'nggi hisobotlar ro'yxati",
  "/dashboard — yangi vaqtinchalik dashboard havolasi",
  "/reprocess — oxirgi hisobotni saqlangan asl fayldan qayta tahlil qilish (faqat admin, parser yangilanganda foydali)",
  "/settings — joriy sozlamalar (faqat admin)",
  "",
  "Excel faylni shu botga yuborsangiz, avtomatik tahlil qilinadi."
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
    await sendMessage(chatId, "❌ Faqat .xlsx formatidagi fayllar qabul qilinadi.");
    return;
  }
  if ((document.file_size ?? 0) > 20 * 1024 * 1024) {
    await sendMessage(chatId, "❌ Fayl hajmi 20MB dan katta. Telegram bot API bunday faylni yuklab bera olmaydi.");
    return;
  }

  await sendMessage(chatId, "📥 Fayl qabul qilindi");
  await sendMessage(chatId, "🔍 Excel strukturasi tahlil qilinmoqda...");

  let buffer: Buffer;
  try {
    buffer = await downloadTelegramFile(document.file_id);
  } catch (err) {
    await sendMessage(chatId, "❌ Faylni yuklab olishda xato yuz berdi.");
    console.error("PTZ bot: file download failed", err);
    return;
  }

  await sendMessage(chatId, "📊 Ma'lumotlar qayta ishlanmoqda...");

  const outcome = await importExcelReport(buffer, filename, new Date(messageDate * 1000), {
    telegramId,
    username
  });

  if (outcome.status === "duplicate") {
    await sendMessage(
      chatId,
      `ℹ️ Bu fayl allaqachon ${outcome.reportDate} sanasi uchun yuklangan. Qayta ishlanmadi.`
    );
    return;
  }

  if (outcome.status === "failed") {
    const errors = outcome.warnings.filter((w) => w.severity === "ERROR");
    await sendMessage(
      chatId,
      [
        "❌ Faylni qayta ishlashda xato.",
        ...errors.slice(0, 5).map((e) => `• ${e.message}`)
      ].join("\n")
    );
    return;
  }

  await sendMessage(chatId, "📈 Analitika hisoblanmoqda...");
  const bundle = buildReportBundle(outcome.reportId);
  if (!bundle) {
    await sendMessage(chatId, "❌ Hisobot tayyorlashda kutilmagan xato yuz berdi.");
    return;
  }

  if (outcome.status === "partial") {
    const errors = outcome.warnings.filter((w) => w.severity === "ERROR").length;
    const warns = outcome.warnings.filter((w) => w.severity === "WARNING").length;
    await sendMessage(
      chatId,
      `⚠️ Import qisman muvaffaqiyatli yakunlandi (${errors} xato, ${warns} ogohlantirish). Tekshirilgan ma'lumotlar bilan davom etilmoqda.`
    );
  }

  await sendReportPackage(chatId, telegramId, bundle);
}

async function handleCommand(
  chatId: number,
  telegramId: string,
  role: "admin" | "uploader",
  command: string
): Promise<void> {
  const base = command.split(/[@\s]/)[0];

  switch (base) {
    case "/start":
    case "/help":
      await sendMessage(chatId, HELP_TEXT);
      return;

    case "/report": {
      const latest = getLatestActiveReport();
      if (!latest) {
        await sendMessage(chatId, "Hozircha hech qanday hisobot yuklanmagan.");
        return;
      }
      const bundle = buildReportBundle(latest.id);
      if (bundle) await sendReportPackage(chatId, telegramId, bundle);
      return;
    }

    case "/today": {
      const latest = getLatestActiveReport();
      if (!latest) {
        await sendMessage(chatId, "Hozircha hech qanday hisobot yuklanmagan.");
        return;
      }
      const bundle = buildReportBundle(latest.id);
      if (bundle) await sendMessage(chatId, summaryText(bundle));
      return;
    }

    case "/history": {
      const reports = listActiveReports().slice(-10).reverse();
      if (reports.length === 0) {
        await sendMessage(chatId, "Tarix bo'sh.");
        return;
      }
      const lines = reports.map((r) => `${fmtDate(r.reportDate)} — ${r.status} (${r.warningCount} ogohlantirish)`);
      await sendMessage(chatId, ["So'nggi hisobotlar:", ...lines].join("\n"));
      return;
    }

    case "/dashboard": {
      const latest = getLatestActiveReport();
      if (!latest) {
        await sendMessage(chatId, "Hozircha hech qanday hisobot yuklanmagan.");
        return;
      }
      const access = createTempAccess(latest.id, `telegram:${telegramId}`);
      const link = `${siteUrl()}/ptz/report/${access.token}`;
      await sendMessage(
        chatId,
        ["📊 PTZ DASHBOARD", "", "🔗 Link:", link, "", "🔐 Парол:", access.password, "", "⏳ Амал қилиш муддати:", "1 соат"].join(
          "\n"
        )
      );
      return;
    }

    case "/reprocess": {
      if (role !== "admin") {
        await sendMessage(chatId, "❌ Bu buyruq faqat administratorlar uchun.");
        return;
      }
      const latest = getLatestActiveReport();
      if (!latest) {
        await sendMessage(chatId, "Hozircha hech qanday hisobot yuklanmagan.");
        return;
      }
      await sendMessage(chatId, "🔄 Hisobot saqlangan asl fayldan qayta tahlil qilinmoqda...");
      const outcome = await reprocessReport(latest.id, { telegramId, username: null });
      if (outcome.status === "failed") {
        await sendMessage(
          chatId,
          ["❌ Qayta tahlil qilib bo'lmadi.", ...outcome.warnings.slice(0, 5).map((w) => `• ${w.message}`)].join("\n")
        );
        return;
      }
      const bundle = buildReportBundle(outcome.reportId);
      if (!bundle) {
        await sendMessage(chatId, "❌ Qayta tahlildan so'ng hisobotni tayyorlashda xato yuz berdi.");
        return;
      }
      await sendMessage(
        chatId,
        `✅ Qayta tahlil tugadi: ${outcome.farmerCount} fermer, ${outcome.warnings.length} ogohlantirish.`
      );
      await sendReportPackage(chatId, telegramId, bundle);
      return;
    }

    case "/settings": {
      if (role !== "admin") {
        await sendMessage(chatId, "❌ Bu buyruq faqat administratorlar uchun.");
        return;
      }
      const settings = getAllSettings();
      const users = listTelegramUsers();
      await sendMessage(
        chatId,
        [
          "Joriy sozlamalar:",
          ...Object.entries(settings).map(([k, v]) => `${k} = ${v}`),
          "",
          `Ruxsat berilgan foydalanuvchilar: ${users.length}`
        ].join("\n")
      );
      return;
    }

    default:
      await sendMessage(chatId, "Noma'lum buyruq. /help ni sinab ko'ring.");
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
    await sendMessage(
      chatId,
      "⛔ Sizda ushbu botdan foydalanish huquqi yo'q. Administrator bilan bog'laning."
    );
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
