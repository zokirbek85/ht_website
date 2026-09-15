// Wipes all imported PTZ acceptance-ledger data (imports, operations,
// farmers, contracts, clusters, buyers, preparation points, warnings,
// temporary dashboard links) so the season can start clean.
// Telegram user permissions and settings (temp-link TTL, season deadline)
// are intentionally kept — no need to reconfigure bot access.
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
  console.error("This PERMANENTLY deletes every imported PTZ acceptance operation, farmer, contract,");
  console.error("cluster, buyer, preparation point, warning and temporary dashboard link. This cannot be undone.");
  console.error("");
  console.error("Telegram user permissions and settings are kept.");
  console.error("");
  console.error("Re-run with --confirm to proceed:");
  console.error("  node --experimental-strip-types scripts/ptz-reset.mts --confirm");
  process.exit(1);
}

const db = getDb();

const countOf = (table: string): number => (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

const before = {
  imports: countOf("imports"),
  operations: countOf("operations"),
  farmers: countOf("farmers"),
  contracts: countOf("contracts")
};

db.exec("BEGIN");
try {
  db.exec("DELETE FROM operations");
  db.exec("DELETE FROM import_warnings");
  db.exec("DELETE FROM temp_access_log");
  db.exec("DELETE FROM temp_access");
  db.exec("DELETE FROM imports");
  db.exec("DELETE FROM contracts");
  db.exec("DELETE FROM farmers");
  db.exec("DELETE FROM clusters");
  db.exec("DELETE FROM buyers");
  db.exec("DELETE FROM preparation_points");
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

logAudit("DATA_RESET", { telegramId: null, username: "cli:ptz-reset" }, { ...before, filesDeleted });

console.log(
  `Deleted ${before.imports} import(s), ${before.operations} operation(s), ${before.farmers} farmer(s), ${before.contracts} contract(s), ${filesDeleted} stored file(s).`
);
console.log("Telegram user permissions and settings were kept. Ready for a fresh import.");
