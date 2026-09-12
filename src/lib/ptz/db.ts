import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Overridable so tests (and any one-off scripts) can point at an isolated,
// disposable database instead of the real dev/production one.
const DATA_DIR = process.env.PTZ_DATA_DIR ?? path.join(process.cwd(), "data", "ptz");
const DB_PATH = path.join(DATA_DIR, "ptz.sqlite");

export const PARSER_VERSION = "1.0.0";
export const SCHEMA_VERSION = "1.0.0";

let instance: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS farmers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region_id INTEGER REFERENCES regions(id),
  UNIQUE(name, region_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  imported_by TEXT,
  telegram_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  parser_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  date_detection_method TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  raw_file_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_active ON reports(report_date, is_active);

CREATE TABLE IF NOT EXISTS farmer_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  farmer_id INTEGER NOT NULL REFERENCES farmers(id),
  series TEXT NOT NULL,
  plan_qty REAL,
  source_daily_qty REAL,
  source_cumulative_qty REAL,
  calculated_daily_delta REAL,
  completion_pct REAL,
  UNIQUE(report_id, farmer_id, series)
);
CREATE INDEX IF NOT EXISTS idx_fm_report ON farmer_metrics(report_id);
CREATE INDEX IF NOT EXISTS idx_fm_farmer ON farmer_metrics(farmer_id);
CREATE INDEX IF NOT EXISTS idx_fm_series ON farmer_metrics(series);

CREATE TABLE IF NOT EXISTS import_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT
);
CREATE INDEX IF NOT EXISTS idx_warnings_report ON import_warnings(report_id);

CREATE TABLE IF NOT EXISTS telegram_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'uploader',
  added_at TEXT NOT NULL,
  added_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  telegram_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);

CREATE TABLE IF NOT EXISTS temp_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_for TEXT
);
CREATE INDEX IF NOT EXISTS idx_temp_access_report ON temp_access(report_id);

CREATE TABLE IF NOT EXISTS temp_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  temp_access_id INTEGER NOT NULL REFERENCES temp_access(id),
  ts TEXT NOT NULL,
  success INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  forecast_window_days: "7",
  temp_link_ttl_minutes: "60",
  status_yellow_threshold_pct: "90" // current pace below this % of required pace => YELLOW/RED boundary
};

export function getDb(): DatabaseSync {
  if (instance) return instance;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  instance = db;
  return db;
}

export function dataDir(): string {
  return DATA_DIR;
}
