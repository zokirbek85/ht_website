import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./db.ts";
import { kdb } from "./kunlik/repository.ts";
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

export type TempAccessCheck =
  | { ok: true; importId: number }
  | { ok: false; reason: "not_found" | "expired" | "wrong_password" };

// Two link kinds share the same token/password/TTL mechanics but point at
// different things: the legacy "Пахта қабули" import (temp_access → imports)
// and a Кунлик терим batch (kt_temp_access → kt_import_batches).
type Store = { db: () => DatabaseSync; table: string; refColumn: string; logTable: string };

const LEGACY: Store = { db: getDb, table: "temp_access", refColumn: "import_id", logTable: "temp_access_log" };
const KUNLIK: Store = { db: kdb, table: "kt_temp_access", refColumn: "batch_id", logTable: "kt_temp_access_log" };

function create(store: Store, refId: number, createdFor: string | null): CreatedTempAccess {
  const token = randomBytes(24).toString("base64url");
  const password = generatePassword();
  const salt = randomBytes(16);
  const passwordHash = hashPassword(password, salt);

  const ttlMinutes = getTempLinkTtlMinutes();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60_000);

  store
    .db()
    .prepare(
      `INSERT INTO ${store.table} (token_hash, ${store.refColumn}, password_hash, password_salt, created_at, expires_at, created_for)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(hashToken(token), refId, passwordHash.toString("hex"), salt.toString("hex"), createdAt.toISOString(), expiresAt.toISOString(), createdFor);

  return { token, password, expiresAt: expiresAt.toISOString() };
}

function check(store: Store, token: string, password: string): { ok: true; refId: number } | { ok: false; reason: "not_found" | "expired" | "wrong_password" } {
  const db = store.db();
  const row = db
    .prepare(`SELECT id, ${store.refColumn} AS ref_id, password_hash, password_salt, expires_at FROM ${store.table} WHERE token_hash = ?`)
    .get(hashToken(token)) as { id: number; ref_id: number; password_hash: string; password_salt: string; expires_at: string } | undefined;

  if (!row) return { ok: false, reason: "not_found" };

  const logAttempt = (success: boolean) =>
    db.prepare(`INSERT INTO ${store.logTable} (temp_access_id, ts, success) VALUES (?, ?, ?)`).run(row.id, new Date().toISOString(), success ? 1 : 0);

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
  return { ok: true, refId: row.ref_id };
}

function record(store: Store, token: string): { refId: number; expiresAt: string; expired: boolean } | null {
  const row = store
    .db()
    .prepare(`SELECT ${store.refColumn} AS ref_id, expires_at FROM ${store.table} WHERE token_hash = ?`)
    .get(hashToken(token)) as { ref_id: number; expires_at: string } | undefined;
  if (!row) return null;
  return { refId: row.ref_id, expiresAt: row.expires_at, expired: new Date(row.expires_at).getTime() < Date.now() };
}

export function createTempAccess(importId: number, createdFor: string | null): CreatedTempAccess {
  return create(LEGACY, importId, createdFor);
}

export function checkTempAccess(token: string, password: string): TempAccessCheck {
  const r = check(LEGACY, token, password);
  return r.ok ? { ok: true, importId: r.refId } : r;
}

/** Token-only lookup (no password) — used to render the password gate / expired page and, once a
 * session cookie proves the password was already checked, to load the report without asking again. */
export function getTempAccessRecord(token: string): { importId: number; expiresAt: string; expired: boolean } | null {
  const r = record(LEGACY, token);
  return r ? { importId: r.refId, expiresAt: r.expiresAt, expired: r.expired } : null;
}

export function createKunlikTempAccess(batchId: number, createdFor: string | null): CreatedTempAccess {
  return create(KUNLIK, batchId, createdFor);
}

export function checkKunlikTempAccess(token: string, password: string): { ok: true; batchId: number } | { ok: false; reason: "not_found" | "expired" | "wrong_password" } {
  const r = check(KUNLIK, token, password);
  return r.ok ? { ok: true, batchId: r.refId } : r;
}

export function getKunlikTempAccessRecord(token: string): { batchId: number; expiresAt: string; expired: boolean } | null {
  const r = record(KUNLIK, token);
  return r ? { batchId: r.refId, expiresAt: r.expiresAt, expired: r.expired } : null;
}
