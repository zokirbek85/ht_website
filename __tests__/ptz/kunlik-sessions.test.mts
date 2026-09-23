// Test 15 — parallel users: sessions, temp files and reports never mix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildAccounts, buildBasket, buildShipments, buildStatement, standardBasket, standardPayments, standardShipments } from "./kunlik-fixtures.mts";

const dir = mkdtempSync(path.join(tmpdir(), "ptz-kunlik-sessions-"));
process.env.PTZ_DATA_DIR = dir;
process.env.PTZ_TMP_DIR = path.join(dir, "harvest");
process.env.PTZ_DIRECTORY_PATH = path.join(dir, "none.xlsx");

const S = await import("../../src/lib/ptz/kunlik/session.ts");
const { processBatch } = await import("../../src/lib/ptz/kunlik/service.ts");

test("Test 15 — two users uploading in parallel keep separate sessions, files and results", async () => {
  const basketA = await buildBasket(standardBasket());
  const basketB = await buildBasket(standardBasket().slice(0, 2));
  const pays = await buildStatement(standardPayments());
  const accts = await buildAccounts();
  const ships = await buildShipments(standardShipments());

  let a = S.getOrStartSession("111", "111");
  let b = S.getOrStartSession("222", "222");
  assert.notEqual(a.id, b.id);

  // Interleaved uploads, in different orders per user.
  a = S.addFile(a, "SHIPMENTS", "Shipments.xlsx", ships).session;
  b = S.addFile(b, "BASKET", "basket_b.xlsx", basketB).session;
  a = S.addFile(a, "BASKET", "basket_a.xlsx", basketA).session;
  b = S.addFile(b, "PAYMENTS", "выписка.xlsx", pays).session;
  a = S.addFile(a, "PAYMENTS", "выписка.xlsx", pays).session;
  b = S.addFile(b, "ACCOUNTS", "лицевые счета.xlsx", accts).session;
  assert.equal(b.status, "WAITING_SHIPMENTS");
  a = S.addFile(a, "ACCOUNTS", "лицевые счета.xlsx", accts).session;
  b = S.addFile(b, "SHIPMENTS", "Shipments.xlsx", ships).session;

  // Each user's files are in their own mode-700 directory and are their own bytes.
  const dirA = path.dirname(a.files.BASKET!.file);
  const dirB = path.dirname(b.files.BASKET!.file);
  assert.notEqual(dirA, dirB);
  assert.equal(path.basename(dirA), a.id);
  assert.equal(statSync(dirA).mode & 0o777, 0o700);
  assert.deepEqual(readFileSync(a.files.BASKET!.file), basketA);
  assert.deepEqual(readFileSync(b.files.BASKET!.file), basketB);

  // A session can be claimed for processing exactly once.
  assert.equal(S.claimForProcessing(a), true);
  assert.equal(S.claimForProcessing({ ...a, status: "WAITING_SHIPMENTS" }), false);
  assert.equal(S.claimForProcessing(b), true);

  const [outA, outB] = await Promise.all([
    processBatch(S.sessionInputFiles(a), { trigger: "telegram", sessionId: a.id, userId: "111" }),
    processBatch(S.sessionInputFiles(b), { trigger: "telegram", sessionId: b.id, userId: "222" })
  ]);
  assert.notEqual(outA.batchId, outB.batchId);
  assert.equal(outA.files.find((f) => f.type === "BASKET")!.filename, "basket_a.xlsx");
  assert.equal(outB.files.find((f) => f.type === "BASKET")!.filename, "basket_b.xlsx");

  S.finishSession(a, "COMPLETED", { batchId: outA.batchId });
  S.finishSession(b, "COMPLETED", { batchId: outB.batchId });
  assert.equal(existsSync(dirA), false, "temp files are removed after processing");
  assert.equal(existsSync(dirB), false);
  assert.equal(S.getOpenSession("111"), null);
});

test("an unclassified file waits in the session until the user picks its type", async () => {
  let s = S.startSession("333", "333");
  s = S.setPending(s, "Книга1.xlsx", await buildShipments(standardShipments()));
  const resolved = S.resolvePending(s, "SHIPMENTS")!;
  assert.equal(resolved.filename, "Книга1.xlsx");
  assert.ok(resolved.session.files.SHIPMENTS);
  assert.equal(resolved.session.pending, null);
});

test("re-sending a type replaces the earlier file; a failed file can be dropped and re-requested", async () => {
  let s = S.startSession("444", "444");
  s = S.addFile(s, "BASKET", "v1.xlsx", await buildBasket(standardBasket())).session;
  const second = S.addFile(s, "BASKET", "v2.xlsx", await buildBasket(standardBasket()));
  assert.equal(second.replaced, true);
  assert.equal(second.session.files.BASKET!.filename, "v2.xlsx");
  s = S.reopenWithout(second.session, "BASKET");
  assert.equal(s.status, "WAITING_BASKET");
  assert.equal(s.files.BASKET, undefined);
});
