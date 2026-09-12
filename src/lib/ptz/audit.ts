import { getDb } from "./db.ts";

export type AuditActor = { telegramId?: string | null; username?: string | null };

export function logAudit(action: string, actor: AuditActor, details?: Record<string, unknown>): void {
  getDb()
    .prepare(
      "INSERT INTO audit_log (ts, telegram_id, username, action, details) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      new Date().toISOString(),
      actor.telegramId ?? null,
      actor.username ?? null,
      action,
      details ? JSON.stringify(details) : null
    );
}

export type AuditEntry = {
  id: number;
  ts: string;
  telegramId: string | null;
  username: string | null;
  action: string;
  details: Record<string, unknown> | null;
};

export function listAuditLog(limit = 100): AuditEntry[] {
  const rows = getDb()
    .prepare("SELECT id, ts, telegram_id, username, action, details FROM audit_log ORDER BY id DESC LIMIT ?")
    .all(limit) as {
    id: number;
    ts: string;
    telegram_id: string | null;
    username: string | null;
    action: string;
    details: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    telegramId: r.telegram_id,
    username: r.username,
    action: r.action,
    details: r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null
  }));
}
