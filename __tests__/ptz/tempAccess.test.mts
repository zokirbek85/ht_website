import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PTZ_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ptz-tempaccess-"));

const { createTempAccess, checkTempAccess, getTempAccessRecord } = await import("../../src/lib/ptz/tempAccess.ts");
const { setSetting } = await import("../../src/lib/ptz/settings.ts");
const { getDb } = await import("../../src/lib/ptz/db.ts");

// A temp_access row needs a real imports.id to satisfy the foreign key.
function fakeImportId(): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO imports (date_detection_method, source_filename, source_hash, imported_at, status, parser_version, schema_version)
         VALUES ('upload_time', 'x.xlsx', ?, datetime('now'), 'success', '1', '1')`
      )
      .run(`hash-${Math.random()}`).lastInsertRowid
  );
}

test("correct token + correct password grants access", () => {
  const importId = fakeImportId();
  const access = createTempAccess(importId, "telegram:1");
  const result = checkTempAccess(access.token, access.password);
  assert.deepEqual(result, { ok: true, importId });
});

test("wrong password is rejected", () => {
  const importId = fakeImportId();
  const access = createTempAccess(importId, "telegram:1");
  const result = checkTempAccess(access.token, "WRONGPASS");
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.reason, "wrong_password");
});

test("unknown token is rejected", () => {
  const result = checkTempAccess("not-a-real-token", "whatever");
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.reason, "not_found");
});

test("expired link is rejected even with the correct password", () => {
  setSetting("temp_link_ttl_minutes", "-1"); // force immediate expiry
  const importId = fakeImportId();
  const access = createTempAccess(importId, "telegram:1");
  const result = checkTempAccess(access.token, access.password);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.reason, "expired");

  const record = getTempAccessRecord(access.token);
  assert.equal(record?.expired, true);

  setSetting("temp_link_ttl_minutes", "60"); // restore default for subsequent tests
});
