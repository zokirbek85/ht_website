"use server";

import { checkKunlikTempAccess, getKunlikTempAccessRecord } from "@/lib/ptz/tempAccess";
import { grantTempSession } from "@/lib/ptz/tempSession";
import { logAudit } from "@/lib/ptz/audit";
import type { UnlockState } from "@/app/ptz/report/[token]/actions";

export async function unlockKunlikReport(token: string, _prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const password = String(formData.get("password") ?? "");
  const result = checkKunlikTempAccess(token, password);

  if (!result.ok) {
    logAudit("KUNLIK_TEMP_ACCESS_DENIED", {}, { token: token.slice(0, 8), reason: result.reason });
    if (result.reason === "expired") return { error: "Ушбу ҳавола муддати тугаган." };
    return { error: "Парол нотўғри." };
  }

  const record = getKunlikTempAccessRecord(token);
  if (record) await grantTempSession(token, record.expiresAt, "/ptz/terim");

  logAudit("KUNLIK_TEMP_ACCESS_GRANTED", {}, { token: token.slice(0, 8), batchId: result.batchId });
  return {};
}
