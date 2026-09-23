const API_BASE = "https://api.telegram.org";

function botToken(): string {
  const t = process.env.PTZ_BOT_TOKEN;
  if (!t) throw new Error("PTZ_BOT_TOKEN is not set.");
  return t;
}

export type InlineKeyboardButton = { text: string; url: string } | { text: string; callback_data: string };

/** Sends a message; resolves to its message_id (for later edits), or null if Telegram rejected it. */
export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineKeyboardButton[][]
): Promise<number | null> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
    })
  });
  if (!res.ok) {
    console.error("PTZ bot sendMessage failed:", res.status, await res.text());
    return null;
  }
  const body = (await res.json()) as { result?: { message_id?: number } };
  return body.result?.message_id ?? null;
}

export async function editMessageText(chatId: string | number, messageId: number, text: string): Promise<void> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true })
  });
  if (!res.ok) console.error("PTZ bot editMessageText failed:", res.status, await res.text());
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
  });
  if (!res.ok) console.error("PTZ bot answerCallbackQuery failed:", res.status, await res.text());
}

export async function sendDocument(chatId: string | number, buffer: Buffer, filename: string, caption?: string): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([new Uint8Array(buffer)]), filename);

  const res = await fetch(`${API_BASE}/bot${botToken()}/sendDocument`, { method: "POST", body: form });
  if (!res.ok) {
    console.error("PTZ bot sendDocument failed:", res.status, await res.text());
  }
}

type TelegramFile = { file_id: string; file_path?: string };

export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const infoRes = await fetch(`${API_BASE}/bot${botToken()}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const info = (await infoRes.json()) as { ok: boolean; result?: TelegramFile; description?: string };
  if (!info.ok || !info.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${info.description ?? "unknown error"}`);
  }
  const fileRes = await fetch(`${API_BASE}/file/bot${botToken()}/${info.result.file_path}`);
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  return Buffer.from(await fileRes.arrayBuffer());
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number };
    from?: { id: number; username?: string; is_bot?: boolean };
    text?: string;
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; is_bot?: boolean };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};
