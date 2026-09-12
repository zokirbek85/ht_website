import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/ptz/bot";
import type { TelegramUpdate } from "@/lib/ptz/telegram";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requiredSecret = process.env.PTZ_BOT_WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== requiredSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Acknowledge immediately so Telegram doesn't retry mid-processing; the
  // Excel parse + PDF generation continues in the background on this
  // long-running Node process. importExcelReport() is idempotent on
  // source_hash, so an accidental retry is a safe no-op, not a duplicate.
  handleTelegramUpdate(update).catch((err) => {
    console.error("PTZ bot: unhandled error while processing update", err);
  });

  return NextResponse.json({ ok: true });
}
