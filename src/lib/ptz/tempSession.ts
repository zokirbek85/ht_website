import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET is not set.");
  return s;
}

function sign(token: string): string {
  return createHmac("sha256", secret()).update(`ptz-temp:${token}`).digest("hex");
}

function cookieName(token: string): string {
  return `ptz_temp_${token}`;
}

export async function grantTempSession(token: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(cookieName(token), sign(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/ptz/report/${token}`,
    expires: new Date(expiresAt)
  });
}

export async function hasTempSession(token: string): Promise<boolean> {
  const store = await cookies();
  const value = store.get(cookieName(token))?.value;
  if (!value) return false;
  const expected = sign(token);
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
