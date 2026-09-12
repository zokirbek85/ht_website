import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { getDb } from "./db.ts";
import { getTempLinkTtlMinutes } from "./settings.ts";

const PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I to avoid confusion

function generatePassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

export type CreatedTempAccess = { token: string; password: string; expiresAt: string };

export function createTempAccess(reportId: number, createdFor: string | null): CreatedTempAccess {
  const token = randomBytes(24).toString("base64url");
  const password = generatePassword();
  const salt = randomBytes(16);
  const passwordHash = hashPassword(password, salt);

  const ttlMinutes = getTempLinkTtlMinutes();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60_000);

  getDb()
    .prepare(
      `INSERT INTO temp_access (token_hash, report_id, password_hash, password_salt, created_at, expires_at, created_for)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      hashToken(token),
      reportId,
      passwordHash.toString("hex"),
      salt.toString("hex"),
      createdAt.toISOString(),
      expiresAt.toISOString(),
      createdFor
    );

  return { token, password, expiresAt: expiresAt.toISOString() };
}

export type TempAccessCheck =
  | { ok: true; reportId: number }
  | { ok: false; reason: "not_found" | "expired" | "wrong_password" };

export function checkTempAccess(token: string, password: string): TempAccessCheck {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, report_id, password_hash, password_salt, expires_at FROM temp_access WHERE token_hash = ?`
    )
    .get(hashToken(token)) as
    | { id: number; report_id: number; password_hash: string; password_salt: string; expires_at: string }
    | undefined;

  if (!row) return { ok: false, reason: "not_found" };

  const logAttempt = (success: boolean) =>
    db
      .prepare("INSERT INTO temp_access_log (temp_access_id, ts, success) VALUES (?, ?, ?)")
      .run(row.id, new Date().toISOString(), success ? 1 : 0);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    logAttempt(false);
    return { ok: false, reason: "expired" };
  }

  const salt = Buffer.from(row.password_salt, "hex");
  const expected = Buffer.from(row.password_hash, "hex");
  const actual = hashPassword(password, salt);

  const match = actual.length === expected.length && timingSafeEqual(actual, expected);
  logAttempt(match);

  if (!match) return { ok: false, reason: "wrong_password" };
  return { ok: true, reportId: row.report_id };
}

/** Token-only lookup (no password) — used to render the password gate / expired page and, once a
 * session cookie proves the password was already checked, to load the report without asking again. */
export function getTempAccessRecord(token: string): { reportId: number; expiresAt: string; expired: boolean } | null {
  const row = getDb()
    .prepare("SELECT report_id, expires_at FROM temp_access WHERE token_hash = ?")
    .get(hashToken(token)) as { report_id: number; expires_at: string } | undefined;
  if (!row) return null;
  return {
    reportId: row.report_id,
    expiresAt: row.expires_at,
    expired: new Date(row.expires_at).getTime() < Date.now()
  };
}
