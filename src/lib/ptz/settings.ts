import { getDb } from "./db.ts";

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function getNumberSetting(key: string, fallback: number): number {
  const raw = getSetting(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getSeasonDeadline(reportYear: number): string {
  const configured = getSetting("season_deadline");
  if (configured) return configured;
  return `${reportYear}-12-31`;
}

export function getForecastWindowDays(): number {
  return getNumberSetting("forecast_window_days", 7);
}

export function getTempLinkTtlMinutes(): number {
  return getNumberSetting("temp_link_ttl_minutes", 60);
}
