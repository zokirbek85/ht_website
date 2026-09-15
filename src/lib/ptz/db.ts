import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Overridable so tests (and any one-off scripts) can point at an isolated,
// disposable database instead of the real dev/production one.
const DATA_DIR = process.env.PTZ_DATA_DIR ?? path.join(process.cwd(), "data", "ptz");
const DB_PATH = path.join(DATA_DIR, "ptz.sqlite");

export const PARSER_VERSION = "2.0.0";
export const SCHEMA_VERSION = "2.0.0";

let instance: DatabaseSync | null = null;

// The cotton-acceptance-ledger model (this schema) replaces the old
// farmer-progress-snapshot ("Сводка") model entirely — see
// docs/ptz-architecture.md, decision dated 2026-09-15. A fresh dev/prod
// database created before that decision has the old tables (`farmer_metrics`,
// old-shape `reports`/`farmers`/`regions`); this one-time migration drops
// them so CREATE TABLE IF NOT EXISTS below can lay down the new shape.
// Telegram user permissions, settings and the audit log are preserved.
function migrateFromOldSchemaIfNeeded(db: DatabaseSync): void {
  const hasOldSchema = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'farmer_metrics'")
    .get();
  if (!hasOldSchema) return;

  // Foreign keys are off for this one-time drop of obsolete tables — some
  // reference each other in an order that's awkward to hand-sequence
  // correctly (e.g. temp_access -> reports), and every table involved is
  // being deleted anyway, so there's nothing left to protect afterward.
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN");
  try {
    for (const table of [
      "farmer_metrics",
      "farmers",
      "regions",
      "temp_access_log",
      "temp_access",
      "import_warnings",
      "reports"
    ]) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_generated_at TEXT,
  date_detection_method TEXT NOT NULL,
  data_period_start TEXT,
  data_period_end TEXT,
  source_filename TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  imported_by TEXT,
  telegram_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  parser_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  row_count INTEGER NOT NULL DEFAULT 0,
  valid_row_count INTEGER NOT NULL DEFAULT 0,
  invalid_row_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  raw_file_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_imports_active ON imports(is_active);

CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  inn TEXT
);

CREATE TABLE IF NOT EXISTS clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS preparation_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  district TEXT,
  region TEXT
);

CREATE TABLE IF NOT EXISTS farmers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  inn TEXT,
  region TEXT,
  district TEXT,
  cluster_id INTEGER REFERENCES clusters(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_farmers_inn ON farmers(inn) WHERE inn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_farmers_name_no_inn ON farmers(name) WHERE inn IS NULL;

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_number TEXT NOT NULL UNIQUE,
  contract_type TEXT,
  farmer_id INTEGER NOT NULL REFERENCES farmers(id),
  contract_qty REAL,
  contract_qty_unit TEXT NOT NULL DEFAULT 'tons'
);
CREATE INDEX IF NOT EXISTS idx_contracts_farmer ON contracts(farmer_id);

CREATE TABLE IF NOT EXISTS operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES imports(id),
  row_number INTEGER NOT NULL,
  identity_key TEXT NOT NULL,
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  is_valid INTEGER NOT NULL DEFAULT 1,

  farmer_id INTEGER NOT NULL REFERENCES farmers(id),
  contract_id INTEGER REFERENCES contracts(id),
  buyer_id INTEGER REFERENCES buyers(id),
  preparation_point_id INTEGER REFERENCES preparation_points(id),
  cluster_id INTEGER REFERENCES clusters(id),

  acceptance_date TEXT,
  acceptance_record_no TEXT,

  pk17_number TEXT,
  pk17_registered_at TEXT,
  pk17_signed_at TEXT,

  batch_no TEXT,
  plot_type TEXT,
  plot_no TEXT,

  variety_declared TEXT,
  generation_declared TEXT,
  industrial_grade_declared TEXT,
  class_declared TEXT,

  picking_method TEXT,

  lab_2hl_number TEXT,
  industrial_grade_lab TEXT,
  class_lab TEXT,

  gross_kg REAL,
  tare_kg REAL,
  physical_kg REAL,
  impurity_pct REAL,
  calculated_kg REAL,
  moisture_pct REAL,
  conditioned_kg REAL,

  markup REAL,
  discount REAL,
  unit_price REAL,
  amount REAL,
  transport_fee REAL,
  seed_cotton_fee REAL,
  other_fee_total REAL,

  vehicle_type TEXT,
  vehicle_plate TEXT,
  trailer_count INTEGER,
  trailer_plate TEXT
);
CREATE INDEX IF NOT EXISTS idx_operations_import ON operations(import_id);
CREATE INDEX IF NOT EXISTS idx_operations_farmer ON operations(farmer_id);
CREATE INDEX IF NOT EXISTS idx_operations_contract ON operations(contract_id);
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(acceptance_date);
CREATE INDEX IF NOT EXISTS idx_operations_identity ON operations(import_id, identity_key);

CREATE TABLE IF NOT EXISTS import_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES imports(id),
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT
);
CREATE INDEX IF NOT EXISTS idx_warnings_import ON import_warnings(import_id);

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
  import_id INTEGER NOT NULL REFERENCES imports(id),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_for TEXT
);
CREATE INDEX IF NOT EXISTS idx_temp_access_import ON temp_access(import_id);

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
  temp_link_ttl_minutes: "60",
  season_deadline: ""
};

export function getDb(): DatabaseSync {
  if (instance) return instance;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  migrateFromOldSchemaIfNeeded(db);
  db.exec(SCHEMA);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!value) continue;
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  instance = db;
  return db;
}

export function dataDir(): string {
  return DATA_DIR;
}
