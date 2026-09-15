"use server";

import { checkTempAccess, getTempAccessRecord } from "@/lib/ptz/tempAccess";
import { grantTempSession } from "@/lib/ptz/tempSession";
import { logAudit } from "@/lib/ptz/audit";

export type UnlockState = { error?: string };

export async function unlockReport(token: string, _prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const password = String(formData.get("password") ?? "");
  const result = checkTempAccess(token, password);

  if (!result.ok) {
    logAudit("TEMP_ACCESS_DENIED", {}, { token: token.slice(0, 8), reason: result.reason });
    if (result.reason === "expired") return { error: "Ушбу ҳавола муддати тугаган." };
    return { error: "Парол нотўғри." };
  }

  const record = getTempAccessRecord(token);
  if (record) await grantTempSession(token, record.expiresAt);

  logAudit("TEMP_ACCESS_GRANTED", {}, { token: token.slice(0, 8), importId: result.importId });
  return {};
}
