"use server";

import { isAuthenticated } from "@/lib/auth";
import { addTelegramUser, removeTelegramUser, type TelegramRole } from "@/lib/ptz/telegramUsers";
import { logAudit } from "@/lib/ptz/audit";
import { reprocessReport } from "@/lib/ptz/importer";

export type PtzUserFormState = { error?: string };

export async function addPtzUser(_prev: PtzUserFormState, formData: FormData): Promise<PtzUserFormState> {
  if (!(await isAuthenticated())) return { error: "You must be signed in." };

  const telegramId = String(formData.get("telegramId") ?? "").trim();
  const role = String(formData.get("role") ?? "uploader") as TelegramRole;

  if (!/^\d+$/.test(telegramId)) {
    return { error: "Telegram ID must be numeric (ask the user to message @userinfobot)." };
  }
  if (role !== "admin" && role !== "uploader") {
    return { error: "Invalid role." };
  }

  addTelegramUser(telegramId, role, null, "website-admin");
  logAudit("PTZ_USER_ADDED", {}, { telegramId, role, via: "website-admin" });
  return {};
}

export async function removePtzUser(telegramId: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  removeTelegramUser(telegramId);
  logAudit("PTZ_USER_REMOVED", {}, { telegramId, via: "website-admin" });
}

export async function reprocessPtzReport(reportId: number): Promise<void> {
  if (!(await isAuthenticated())) return;
  await reprocessReport(reportId, { telegramId: "website-admin", username: null });
}
