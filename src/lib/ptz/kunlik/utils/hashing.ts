import { createHash } from "node:crypto";

export function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Stable record fingerprint: fields joined with a separator that cannot
 * appear in any normalized value, so ("12","3") and ("1","23") differ.
 */
export function fingerprint(parts: (string | number | bigint | null | undefined)[]): string {
  return sha256(parts.map((p) => (p == null ? "∅" : String(p))).join("␟")).slice(0, 32);
}
