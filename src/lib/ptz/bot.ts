// PTZ Telegram bot — Кунлик терим flow. Handlers only receive files,
// classify them, manage the user's upload session, call the report service
// and send results; all parsing/matching/calculation lives in ./kunlik/.
//
// The single-file "Пахта қабули" package was removed from Telegram on
// 2026-09-23 (the business chose the 4-file Кунлик терим report instead);
// its library code still backs /admin/ptz and the web dashboard.
import { logAudit } from "./audit.ts";
import { answerCallbackQuery, downloadTelegramFile, editMessageText, sendDocument, sendMessage, type InlineKeyboardButton, type TelegramUpdate } from "./telegram.ts";
import { addTelegramUser, getAuthorizedUser, isAdmin, removeTelegramUser, listTelegramUsers } from "./telegramUsers.ts";
import { getAllSettings, getTempLinkTtlMinutes } from "./settings.ts";
import { createKunlikTempAccess } from "./tempAccess.ts";
import { classifyFile, SOURCE_LABELS } from "./kunlik/classifier.ts";
import { MAX_UPLOAD_BYTES } from "./kunlik/config.ts";
import { buildLatestReport, processBatch, type ReportOutput } from "./kunlik/service.ts";
import { currentFiles, latestCompletedBatch } from "./kunlik/repository.ts";
import { getRefreshIntervalMinutes, setRefreshIntervalMinutes } from "./kunlik/refresh.ts";
import {
  addFile,
  claimForProcessing,
  cleanupExpiredSessions,
  finishSession,
  getOpenSession,
  getOrStartSession,
  isComplete,
  isProcessing,
  reopenWithout,
  resolvePending,
  sessionInputFiles,
  setPending,
  startSession,
  type UploadSession
} from "./kunlik/session.ts";
import * as V from "./kunlik/telegramViews.ts";
import { SOURCE_TYPES, UserFacingError, type SourceType } from "./kunlik/types.ts";

type Chat = { chatId: number; telegramId: string; username: string | null };

const TYPE_BUTTONS: InlineKeyboardButton[][] = SOURCE_TYPES.map((t) => [{ text: SOURCE_LABELS[t], callback_data: `kt:type:${t}` }]);
const RESULT_BUTTONS: InlineKeyboardButton[][] = [[{ text: "🔎 Батафсил", callback_data: "kt:detail" }]];

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://hazorasp-textil.uz").replace(/\/$/, "");
}

/** Temporary password-protected web dashboard for one report batch (same mechanism as the old /ptz/report link). */
async function sendDashboardLink(c: Chat, batchId: number): Promise<void> {
  const access = createKunlikTempAccess(batchId, `telegram:${c.telegramId}`);
  const url = `${siteUrl()}/ptz/terim/${access.token}`;
  await sendMessage(c.chatId, V.dashboardLinkText(access.password, getTempLinkTtlMinutes()), [[{ text: "🌐 WEB DASHBOARD", url }]]);
  logAudit("KUNLIK_DASHBOARD_LINK", { telegramId: c.telegramId, username: c.username }, { batchId });
}

async function sendReportFiles(chatId: number, out: ReportOutput): Promise<void> {
  await sendDocument(chatId, out.excel, `${out.baseName}.xlsx`, "📥 Excel");
  await sendDocument(chatId, out.pdf, `${out.baseName}.pdf`, "📊 PDF");
}

/** Every failure gets a specific reason; stack traces go to the server log only. */
async function reportFailure(c: Chat, err: unknown, ref: string): Promise<void> {
  if (err instanceof UserFacingError) {
    await sendMessage(c.chatId, V.errorText(err.message, err.details));
    return;
  }
  console.error(`PTZ kunlik: unexpected error [${ref}]`, err);
  await sendMessage(
    c.chatId,
    V.errorText(`Кутилмаган ички хато (${err instanceof Error ? err.name : "Error"}). Администраторга хабар берилди, мурожаат коди: ${ref}.`, [])
  );
}

async function processSession(c: Chat, session: UploadSession): Promise<void> {
  if (!claimForProcessing(session)) return; // another update already started it
  const progressId = await sendMessage(c.chatId, V.progressText(null));
  let lastEdit = 0;
  try {
    const out = await processBatch(sessionInputFiles(session), {
      trigger: "telegram",
      sessionId: session.id,
      userId: c.telegramId,
      onProgress: async (step) => {
        if (!progressId || Date.now() - lastEdit < 700) return; // stay under Telegram's edit rate limit
        lastEdit = Date.now();
        await editMessageText(c.chatId, progressId, V.progressText(step));
      }
    });
    if (progressId) await editMessageText(c.chatId, progressId, V.progressText("done"));
    finishSession(session, "COMPLETED", { batchId: out.batchId });
    await sendMessage(c.chatId, V.finalText(out), RESULT_BUTTONS);
    await sendReportFiles(c.chatId, out);
    await sendDashboardLink(c, out.batchId);
    logAudit("KUNLIK_REPORT_SENT", { telegramId: c.telegramId, username: c.username }, { batchId: out.batchId, sessionId: session.id, ms: out.processingMs });
  } catch (err) {
    if (err instanceof UserFacingError && err.source) {
      // Keep the three good files; ask only for the one that failed.
      const reopened = reopenWithout(session, err.source);
      await reportFailure(c, err, session.id);
      await sendMessage(c.chatId, [`🔁 ${SOURCE_LABELS[err.source]} файлини тузатиб, қайта юборинг.`, "", V.checklist(reopened)].join("\n"));
    } else {
      finishSession(session, "ERROR", { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      await reportFailure(c, err, session.id);
    }
  }
}

async function acceptFile(c: Chat, session: UploadSession, type: SourceType, filename: string, buffer: Buffer): Promise<void> {
  const { session: s, replaced } = addFile(session, type, filename, buffer);
  logAudit("KUNLIK_FILE_RECEIVED", { telegramId: c.telegramId, username: c.username }, { sessionId: s.id, type, filename });
  await sendMessage(c.chatId, V.acceptedText(s, type, replaced));
  if (isComplete(s)) await processSession(c, s);
}

async function handleDocument(c: Chat, document: NonNullable<NonNullable<TelegramUpdate["message"]>["document"]>): Promise<void> {
  const filename = document.file_name ?? "file.xlsx";
  const isXlsx = /\.xlsx$/i.test(filename) || document.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!isXlsx) {
    await sendMessage(c.chatId, "❌ Фақат .xlsx форматидаги файллар қабул қилинади.");
    return;
  }
  if ((document.file_size ?? 0) > MAX_UPLOAD_BYTES) {
    await sendMessage(c.chatId, "❌ Файл ҳажми 20MB дан катта — Telegram bot API уни юклаб бера олмайди.");
    return;
  }
  if (isProcessing(c.telegramId)) {
    await sendMessage(c.chatId, "⏳ Олдинги ҳисобот ҳали тайёрланмоқда. Тугагач, янги файлларни юборинг.");
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await downloadTelegramFile(document.file_id);
  } catch (err) {
    console.error("PTZ bot: file download failed", err);
    await sendMessage(c.chatId, "❌ Файлни Telegram'дан юклаб олиб бўлмади. Қайта юбориб кўринг.");
    return;
  }

  const session = getOrStartSession(c.telegramId, String(c.chatId));
  const cls = await classifyFile(filename, buffer);
  if (!cls) {
    setPending(session, filename, buffer);
    await sendMessage(c.chatId, V.ASK_TYPE_TEXT, TYPE_BUTTONS);
    return;
  }
  await acceptFile(c, session, cls.type, filename, buffer);
}

async function withLatest(c: Chat, fn: (out: ReportOutput) => Promise<void>): Promise<void> {
  try {
    const out = await buildLatestReport();
    if (!out) {
      await sendMessage(c.chatId, "Ҳозирча ҳисобот йўқ. 4 та файлни юборинг (/start).");
      return;
    }
    await fn(out);
  } catch (err) {
    await reportFailure(c, err, `latest-${Date.now()}`);
  }
}

async function handleCommand(c: Chat, role: "admin" | "uploader", text: string): Promise<void> {
  const [raw, ...args] = text.trim().split(/\s+/);
  const command = (raw ?? "").split("@")[0];

  switch (command) {
    case "/start":
      startSession(c.telegramId, String(c.chatId));
      await sendMessage(c.chatId, V.startText());
      return;
    case "/help":
      await sendMessage(c.chatId, V.HELP_TEXT);
      return;
    case "/cancel": {
      const s = getOpenSession(c.telegramId);
      if (s) finishSession(s, "ERROR", { error: "cancelled" });
      await sendMessage(c.chatId, s ? "🗑 Жорий сессия бекор қилинди, юборилган файллар ўчирилди." : "Очиқ сессия йўқ.");
      return;
    }
    case "/report":
      await withLatest(c, async (out) => {
        await sendMessage(c.chatId, V.finalText(out), RESULT_BUTTONS);
        await sendReportFiles(c.chatId, out);
        await sendDashboardLink(c, out.batchId);
      });
      return;
    case "/dashboard": {
      const latest = latestCompletedBatch();
      if (!latest) {
        await sendMessage(c.chatId, "Ҳозирча ҳисобот йўқ. 4 та файлни юборинг (/start).");
        return;
      }
      await sendDashboardLink(c, latest.id);
      return;
    }
    case "/today":
      await withLatest(c, (out) => sendMessage(c.chatId, V.todayText(out)).then(() => undefined));
      return;
    case "/farmers":
      await withLatest(c, (out) => sendMessage(c.chatId, V.farmersText(out)).then(() => undefined));
      return;
    case "/payments":
      await withLatest(c, (out) => sendMessage(c.chatId, V.paymentsText(out)).then(() => undefined));
      return;
    case "/shipments":
      await withLatest(c, (out) => sendMessage(c.chatId, V.shipmentsText(out)).then(() => undefined));
      return;
    case "/status": {
      const batch = latestCompletedBatch();
      let out: ReportOutput | null = null;
      try {
        out = batch ? await buildLatestReport() : null;
      } catch (err) {
        console.error("PTZ kunlik: /status could not rebuild the latest report", err);
      }
      await sendMessage(
        c.chatId,
        V.statusText({ batch, files: batch ? currentFiles(batch.id) : {}, out, session: getOpenSession(c.telegramId), refreshMinutes: getRefreshIntervalMinutes() })
      );
      return;
    }
    case "/settings": {
      if (role !== "admin") {
        await sendMessage(c.chatId, "❌ Бу буйруқ фақат администраторлар учун.");
        return;
      }
      if (args[0] === "refresh" && args[1]) {
        try {
          setRefreshIntervalMinutes(Number(args[1]));
          logAudit("KUNLIK_SETTING_CHANGED", { telegramId: c.telegramId, username: c.username }, { refresh_interval_minutes: Number(args[1]) });
          await sendMessage(c.chatId, `✅ Автоматик янгиланиш интервали: ${args[1]} дақиқа.`);
        } catch {
          await sendMessage(c.chatId, "❌ Рухсат этилган қийматлар: 30 ёки 60. Мисол: /settings refresh 30");
        }
        return;
      }
      const settings = getAllSettings();
      await sendMessage(
        c.chatId,
        [
          "⚙️ Созламалар:",
          ...Object.entries(settings).map(([k, v]) => `${k} = ${v}`),
          `refresh_interval_minutes = ${getRefreshIntervalMinutes()}`,
          "",
          `Рухсат берилган фойдаланувчилар: ${listTelegramUsers().length}`,
          "",
          "Ўзгартириш: /settings refresh 30|60"
        ].join("\n")
      );
      return;
    }
    default:
      await sendMessage(c.chatId, "Номаълум буйруқ. /help ни синаб кўринг.");
  }
}

async function handleCallback(c: Chat, cq: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const data = cq.data ?? "";
  if (data.startsWith("kt:type:")) {
    const type = data.slice("kt:type:".length) as SourceType;
    const session = getOpenSession(c.telegramId);
    const resolved = session && SOURCE_TYPES.includes(type) ? resolvePending(session, type) : null;
    await answerCallbackQuery(cq.id, resolved ? SOURCE_LABELS[type] : "Файл топилмади — қайта юборинг.");
    if (!resolved) return;
    logAudit("KUNLIK_FILE_RECEIVED", { telegramId: c.telegramId, username: c.username }, { sessionId: resolved.session.id, type, filename: resolved.filename, classifiedBy: "user" });
    await sendMessage(c.chatId, V.acceptedText(resolved.session, type, resolved.replaced));
    if (isComplete(resolved.session)) await processSession(c, resolved.session);
    return;
  }
  if (data === "kt:detail") {
    await answerCallbackQuery(cq.id);
    await withLatest(c, (out) => sendMessage(c.chatId, V.detailText(out)).then(() => undefined));
    return;
  }
  await answerCallbackQuery(cq.id);
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  cleanupExpiredSessions();
  const from = update.message?.from ?? update.callback_query?.from;
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  if (!from || from.is_bot || chatId == null) return;
  const c: Chat = { chatId, telegramId: String(from.id), username: from.username ?? null };

  const user = getAuthorizedUser(c.telegramId);
  if (!user) {
    logAudit("UNAUTHORIZED_ACCESS_ATTEMPT", { telegramId: c.telegramId, username: c.username }, { text: update.message?.text ?? (update.callback_query ? "[callback]" : "[document]") });
    if (update.callback_query) await answerCallbackQuery(update.callback_query.id);
    await sendMessage(chatId, "⛔ Сизда ушбу ботдан фойдаланиш ҳуқуқи йўқ. Администратор билан боғланинг.");
    return;
  }

  if (update.callback_query) {
    await handleCallback(c, update.callback_query);
    return;
  }
  const message = update.message!;
  if (message.document) {
    await handleDocument(c, message.document);
    return;
  }
  if (message.text?.startsWith("/")) await handleCommand(c, user.role, message.text);
}

export { addTelegramUser, removeTelegramUser, isAdmin };
