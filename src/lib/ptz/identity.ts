// Duplicate-operation identity key (§26). Isolated from parser.ts/importer.ts
// so the strategy can be changed in one place — see config.ts.
import { createHash } from "node:crypto";
import { DUPLICATE_KEY_STRATEGY } from "./config.ts";

type IdentitySource = {
  pk17Number: string | null;
  contractNumber: string | null;
  farmerName: string;
  vehiclePlate: string | null;
  acceptanceDate: string | null;
  conditionedKg: number | null;
};

export function getOperationIdentityKey(row: IdentitySource): string {
  if (DUPLICATE_KEY_STRATEGY !== "pk17_or_composite") {
    throw new Error(`Unknown duplicate key strategy: ${DUPLICATE_KEY_STRATEGY}`);
  }

  if (row.pk17Number) return `pk17:${row.pk17Number}`;

  const composite = [
    row.contractNumber ?? "",
    row.farmerName,
    row.vehiclePlate ?? "",
    row.acceptanceDate ?? "",
    row.conditionedKg ?? ""
  ].join("|");
  return `composite:${createHash("sha1").update(composite).digest("hex").slice(0, 16)}`;
}
