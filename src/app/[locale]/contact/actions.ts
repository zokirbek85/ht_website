"use server";

import { contactSchema, type ContactFormValues } from "@/lib/contact-schema";

export type ContactActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramMessage(data: ContactFormValues): string {
  const lines = [
    "<b>New website inquiry</b>",
    `<b>Company:</b> ${escapeHtml(data.company)}`,
    `<b>Country:</b> ${escapeHtml(data.country)}`,
    `<b>Person:</b> ${escapeHtml(data.person)}`,
    `<b>Email:</b> ${escapeHtml(data.email)}`
  ];
  if (data.phone) lines.push(`<b>Phone:</b> ${escapeHtml(data.phone)}`);
  if (data.product) lines.push(`<b>Product:</b> ${escapeHtml(data.product)}`);
  if (data.volume) lines.push(`<b>Volume:</b> ${escapeHtml(data.volume)}`);
  if (data.message) lines.push(`<b>Message:</b> ${escapeHtml(data.message)}`);
  return lines.join("\n");
}

async function sendToTelegram(data: ContactFormValues): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("Telegram not configured: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatTelegramMessage(data),
        parse_mode: "HTML"
      })
    });

    if (!response.ok) {
      console.error("Telegram API error:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to reach Telegram API:", error);
    return false;
  }
}

export async function submitInquiry(
  _prevState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.safeParse(raw);

  if (!parsed.success) {
    return { status: "error", message: "invalid" };
  }

  const delivered = await sendToTelegram(parsed.data);
  if (!delivered) {
    return { status: "error", message: "delivery_failed" };
  }

  return { status: "success" };
}
