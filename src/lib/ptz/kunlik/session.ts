// Upload sessions — one per Telegram user collecting the four source files.
// Files live under <tempRoot>/<session_id>/ (mode 700), never shared between
// users, and the directory is deleted as soon as the session finishes.
// State is in SQLite (kt_upload_sessions) so a process restart mid-upload
// doesn't lose which files a user already sent.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SESSION_TTL_HOURS, tempRoot } from "./config.ts";
import { kdb } from "./repository.ts";
import { sha256 } from "./utils/hashing.ts";
import { SOURCE_TYPES, type SourceType } from "./types.ts";
import type { InputFile } from "./service.ts";

export type SessionStatus =
  | "WAITING_BASKET"
  | "WAITING_PAYMENTS"
  | "WAITING_ACCOUNTS"
  | "WAITING_SHIPMENTS"
  | "PROCESSING"
  | "COMPLETED"
  | "ERROR";

type StoredFile = { file: string; filename: string; sha256: string; receivedAt: string };

export type UploadSession = {
  id: string;
  userId: string;
  chatId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  files: Partial<Record<SourceType, StoredFile>>;
  pending: { file: string; filename: string } | null;
  batchId: number | null;
  error: string | null;
};

const OPEN_STATUSES = ["WAITING_BASKET", "WAITING_PAYMENTS", "WAITING_ACCOUNTS", "WAITING_SHIPMENTS"] as const;

function dirOf(id: string): string {
  return path.join(tempRoot(), id);
}

function map(r: Record<string, unknown>): UploadSession {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    chatId: r.chat_id as string,
    status: r.status as SessionStatus,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    files: JSON.parse((r.files as string) || "{}") as UploadSession["files"],
    pending: r.pending_file ? (JSON.parse(r.pending_file as string) as UploadSession["pending"]) : null,
    batchId: (r.batch_id as number) ?? null,
    error: (r.error as string) ?? null
  };
}

function save(s: UploadSession): UploadSession {
  s.updatedAt = new Date().toISOString();
  kdb()
    .prepare("UPDATE kt_upload_sessions SET status = ?, updated_at = ?, files = ?, pending_file = ?, batch_id = ?, error = ? WHERE id = ?")
    .run(s.status, s.updatedAt, JSON.stringify(s.files), s.pending ? JSON.stringify(s.pending) : null, s.batchId, s.error, s.id);
  return s;
}

export function missingTypes(s: UploadSession): SourceType[] {
  return SOURCE_TYPES.filter((t) => !s.files[t]);
}

function statusFor(s: UploadSession): SessionStatus {
  const next = missingTypes(s)[0];
  return next ? (`WAITING_${next}` as SessionStatus) : "WAITING_SHIPMENTS";
}

export function isComplete(s: UploadSession): boolean {
  return missingTypes(s).length === 0;
}

export function getSession(id: string): UploadSession | null {
  const r = kdb().prepare("SELECT * FROM kt_upload_sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? map(r) : null;
}

/** The user's open (still collecting files) session, if any and not expired. */
export function getOpenSession(userId: string): UploadSession | null {
  const r = kdb()
    .prepare(`SELECT * FROM kt_upload_sessions WHERE user_id = ? AND status IN (${OPEN_STATUSES.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 1`)
    .get(userId, ...OPEN_STATUSES) as Record<string, unknown> | undefined;
  if (!r) return null;
  const s = map(r);
  if (Date.now() - Date.parse(s.createdAt) > SESSION_TTL_HOURS * 3_600_000) {
    finishSession(s, "ERROR", { error: "expired" });
    return null;
  }
  return s;
}

export function isProcessing(userId: string): boolean {
  return !!kdb().prepare("SELECT 1 FROM kt_upload_sessions WHERE user_id = ? AND status = 'PROCESSING'").get(userId);
}

/** Starts a fresh session, abandoning (and cleaning up) any open one for this user. */
export function startSession(userId: string, chatId: string): UploadSession {
  const open = getOpenSession(userId);
  if (open) finishSession(open, "ERROR", { error: "superseded" });
  const now = new Date().toISOString();
  const id = randomUUID();
  kdb()
    .prepare("INSERT INTO kt_upload_sessions (id, user_id, chat_id, status, created_at, updated_at) VALUES (?, ?, ?, 'WAITING_BASKET', ?, ?)")
    .run(id, userId, chatId, now, now);
  return getSession(id)!;
}

export function getOrStartSession(userId: string, chatId: string): UploadSession {
  return getOpenSession(userId) ?? startSession(userId, chatId);
}

function writeTemp(s: UploadSession, name: string, buffer: Buffer): string {
  const dir = dirOf(s.id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, name);
  writeFileSync(file, buffer, { mode: 0o600 });
  return file;
}

/** Stores a file under its type; re-sending a type replaces the earlier file. Returns whether it replaced one. */
export function addFile(s: UploadSession, type: SourceType, filename: string, buffer: Buffer): { session: UploadSession; replaced: boolean } {
  const replaced = !!s.files[type];
  const file = writeTemp(s, `${type}.xlsx`, buffer);
  s.files[type] = { file, filename, sha256: sha256(buffer), receivedAt: new Date().toISOString() };
  s.status = statusFor(s);
  return { session: save(s), replaced };
}

export function removeFile(s: UploadSession, type: SourceType): UploadSession {
  const f = s.files[type];
  if (f) rmSync(f.file, { force: true });
  delete s.files[type];
  s.status = statusFor(s);
  return save(s);
}

/** Holds a file whose type could not be detected until the user picks one. */
export function setPending(s: UploadSession, filename: string, buffer: Buffer): UploadSession {
  s.pending = { file: writeTemp(s, "pending.xlsx", buffer), filename };
  return save(s);
}

export function resolvePending(s: UploadSession, type: SourceType): { session: UploadSession; filename: string; replaced: boolean } | null {
  if (!s.pending || !existsSync(s.pending.file)) return null;
  const buffer = readFileSync(s.pending.file);
  const filename = s.pending.filename;
  rmSync(s.pending.file, { force: true });
  s.pending = null;
  const out = addFile(s, type, filename, buffer);
  return { ...out, filename };
}

/** Atomically moves a complete session to PROCESSING; false if another request already did. */
export function claimForProcessing(s: UploadSession): boolean {
  if (!isComplete(s)) return false;
  const info = kdb()
    .prepare(`UPDATE kt_upload_sessions SET status = 'PROCESSING', updated_at = ? WHERE id = ? AND status IN (${OPEN_STATUSES.map(() => "?").join(",")})`)
    .run(new Date().toISOString(), s.id, ...OPEN_STATUSES);
  if (Number(info.changes) === 1) s.status = "PROCESSING";
  return Number(info.changes) === 1;
}

/** Puts a session that failed on one bad file back into collecting mode, minus that file. */
export function reopenWithout(s: UploadSession, type: SourceType): UploadSession {
  return removeFile(s, type); // status is recomputed from the files still present
}

export function sessionInputFiles(s: UploadSession): InputFile[] {
  return SOURCE_TYPES.filter((t) => s.files[t]).map((t) => ({ type: t, filename: s.files[t]!.filename, buffer: readFileSync(s.files[t]!.file) }));
}

export function finishSession(s: UploadSession, status: "COMPLETED" | "ERROR", extra: { batchId?: number | null; error?: string | null } = {}): void {
  s.status = status;
  s.batchId = extra.batchId ?? s.batchId;
  s.error = extra.error ?? null;
  s.pending = null;
  save(s);
  cleanupSessionFiles(s.id);
}

export function cleanupSessionFiles(id: string): void {
  rmSync(dirOf(id), { recursive: true, force: true });
}

/** Deletes temp dirs of sessions that were abandoned past the TTL. Safe to call on every update. */
export function cleanupExpiredSessions(): number {
  const cutoff = new Date(Date.now() - SESSION_TTL_HOURS * 3_600_000).toISOString();
  const rows = kdb()
    .prepare(`SELECT id FROM kt_upload_sessions WHERE status IN (${OPEN_STATUSES.map(() => "?").join(",")}) AND created_at < ?`)
    .all(...OPEN_STATUSES, cutoff) as { id: string }[];
  for (const r of rows) {
    kdb().prepare("UPDATE kt_upload_sessions SET status = 'ERROR', error = 'expired', updated_at = ? WHERE id = ?").run(new Date().toISOString(), r.id);
    cleanupSessionFiles(r.id);
  }
  return rows.length;
}
