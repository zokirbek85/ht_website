// Wipes all imported PTZ report data (reports, farmers, regions, metrics,
// warnings, temporary dashboard links) so the season can start clean.
// Telegram user permissions and settings (season deadline, forecast window,
// link TTL) are intentionally kept — no need to reconfigure bot access.
//
// Run on the VPS, from the app directory:
//   node --experimental-strip-types scripts/ptz-reset.mts --confirm
//
// (or `npm run ptz:reset -- --confirm`)

import { readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { getDb, dataDir } from "../src/lib/ptz/db.ts";
import { logAudit } from "../src/lib/ptz/audit.ts";

if (!process.argv.includes("--confirm")) {
  console.error("This PERMANENTLY deletes every imported PTZ report, farmer, region, metric,");
  console.error("warning and temporary dashboard link. This cannot be undone.");
  console.error("");
  console.error("Telegram user permissions and settings are kept.");
  console.error("");
  console.error("Re-run with --confirm to proceed:");
  console.error("  node --experimental-strip-types scripts/ptz-reset.mts --confirm");
  process.exit(1);
}

const db = getDb();

const countOf = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

const before = {
  reports: countOf("reports"),
  farmers: countOf("farmers"),
  regions: countOf("regions")
};

db.exec("BEGIN");
try {
  db.exec("DELETE FROM farmer_metrics");
  db.exec("DELETE FROM import_warnings");
  db.exec("DELETE FROM temp_access_log");
  db.exec("DELETE FROM temp_access");
  db.exec("DELETE FROM reports");
  db.exec("DELETE FROM farmers");
  db.exec("DELETE FROM regions");
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

let filesDeleted = 0;
const uploadsDir = path.join(dataDir(), "uploads");
try {
  for (const f of readdirSync(uploadsDir)) {
    unlinkSync(path.join(uploadsDir, f));
    filesDeleted++;
  }
} catch {
  // no uploads directory yet — nothing to remove
}

logAudit(
  "DATA_RESET",
  { telegramId: null, username: "cli:ptz-reset" },
  { ...before, filesDeleted }
);

console.log(
  `Deleted ${before.reports} report(s), ${before.farmers} farmer(s), ${before.regions} region(s), ${filesDeleted} stored file(s).`
);
console.log("Telegram user permissions and settings were kept. Ready for a fresh import.");
