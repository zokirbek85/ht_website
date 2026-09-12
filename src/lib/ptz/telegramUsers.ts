import { getDb } from "./db.ts";

export type TelegramRole = "admin" | "uploader";

export type TelegramUserRecord = {
  id: number;
  telegramId: string;
  username: string | null;
  role: TelegramRole;
  addedAt: string;
  addedBy: string | null;
};

// Seed admins from env so the very first admin can be granted without
// already having DB access (chicken-and-egg problem for /settings).
function envAdminIds(): Set<string> {
  const raw = process.env.PTZ_ADMIN_TELEGRAM_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function mapRow(row: {
  id: number;
  telegram_id: string;
  username: string | null;
  role: string;
  added_at: string;
  added_by: string | null;
}): TelegramUserRecord {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    role: row.role as TelegramRole,
    addedAt: row.added_at,
    addedBy: row.added_by
  };
}

export function getAuthorizedUser(telegramId: string): TelegramUserRecord | null {
  const row = getDb().prepare("SELECT * FROM telegram_users WHERE telegram_id = ?").get(telegramId) as
    | Parameters<typeof mapRow>[0]
    | undefined;
  if (row) return mapRow(row);

  if (envAdminIds().has(telegramId)) {
    return {
      id: -1,
      telegramId,
      username: null,
      role: "admin",
      addedAt: new Date(0).toISOString(),
      addedBy: "env"
    };
  }
  return null;
}

export function isAuthorized(telegramId: string): boolean {
  return getAuthorizedUser(telegramId) !== null;
}

export function isAdmin(telegramId: string): boolean {
  return getAuthorizedUser(telegramId)?.role === "admin";
}

export function listTelegramUsers(): TelegramUserRecord[] {
  const rows = getDb().prepare("SELECT * FROM telegram_users ORDER BY added_at DESC").all() as Parameters<
    typeof mapRow
  >[0][];
  return rows.map(mapRow);
}

export function addTelegramUser(
  telegramId: string,
  role: TelegramRole,
  username: string | null,
  addedBy: string | null
): void {
  getDb()
    .prepare(
      `INSERT INTO telegram_users (telegram_id, username, role, added_at, added_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET role = excluded.role, username = excluded.username`
    )
    .run(telegramId, username, role, new Date().toISOString(), addedBy);
}

export function removeTelegramUser(telegramId: string): void {
  getDb().prepare("DELETE FROM telegram_users WHERE telegram_id = ?").run(telegramId);
}
