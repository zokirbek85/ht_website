import { test } from "node:test";
import assert from "node:assert/strict";
import { getOperationIdentityKey } from "../../src/lib/ptz/identity.ts";

test("PK-17 number is the identity key when present", () => {
  const key = getOperationIdentityKey({
    pk17Number: "XH123",
    contractNumber: "C1",
    farmerName: "A",
    vehiclePlate: "90 A 001",
    acceptanceDate: "2026-09-11",
    conditionedKg: 100
  });
  assert.equal(key, "pk17:XH123");
});

test("falls back to a composite key when PK-17 is missing (not yet signed)", () => {
  const key = getOperationIdentityKey({
    pk17Number: null,
    contractNumber: "C1",
    farmerName: "A",
    vehiclePlate: "90 A 001",
    acceptanceDate: "2026-09-11",
    conditionedKg: 100
  });
  assert.ok(key.startsWith("composite:"));
});

test("composite keys are stable for identical inputs and differ when any field changes", () => {
  const base = { pk17Number: null, contractNumber: "C1", farmerName: "A", vehiclePlate: "90 A 001", acceptanceDate: "2026-09-11", conditionedKg: 100 };
  const same = getOperationIdentityKey(base);
  const again = getOperationIdentityKey({ ...base });
  const different = getOperationIdentityKey({ ...base, conditionedKg: 101 });
  assert.equal(same, again);
  assert.notEqual(same, different);
});
