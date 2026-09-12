import { getDb } from "./db.ts";
import type { Severity } from "./types.ts";

export type StoredWarning = {
  id: number;
  severity: Severity;
  code: string;
  message: string;
  context: Record<string, unknown> | null;
};

export function listWarningsForReport(reportId: number): StoredWarning[] {
  const rows = getDb()
    .prepare("SELECT id, severity, code, message, context FROM import_warnings WHERE report_id = ? ORDER BY id ASC")
    .all(reportId) as { id: number; severity: string; code: string; message: string; context: string | null }[];

  return rows.map((r) => ({
    id: r.id,
    severity: r.severity as Severity,
    code: r.code,
    message: r.message,
    context: r.context ? (JSON.parse(r.context) as Record<string, unknown>) : null
  }));
}
