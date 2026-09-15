// Row-level validation at import time (§25). Never drops a row outright —
// invalid rows are still imported (so the operational/control-center views
// can surface them) but counted separately and warned about individually.
import { REPORTING_WEIGHT_FIELD } from "./config.ts";
import type { ImportWarning, ParsedOperationRow } from "./types.ts";

export type ValidationReport = {
  rowsDetected: number;
  validRows: number;
  invalidRows: number;
};

const NUMERIC_FIELDS: (keyof ParsedOperationRow)[] = [
  "grossKg",
  "tareKg",
  "physicalKg",
  "calculatedKg",
  "conditionedKg",
  "impurityPct",
  "moisturePct",
  "markup",
  "discount",
  "unitPrice",
  "amount",
  "transportFee",
  "seedCottonFee",
  "otherFeeTotal"
];

// "Invalid" here means structurally unusable for weight-based totals (the
// number every KPI in this system is built on) — not "has any data
// problem". A row with real weight but a missing price still counts toward
// contract achievement; it's flagged separately as a ZERO_OR_NEGATIVE_PRICE
// control-center alert (analytics.ts) rather than excluded here.
function isRowValid(row: ParsedOperationRow): boolean {
  const weight = row[REPORTING_WEIGHT_FIELD];
  return weight != null && weight > 0;
}

export function validateRows(rows: ParsedOperationRow[], warnings: ImportWarning[]): ValidationReport {
  let validRows = 0;

  for (const row of rows) {
    for (const field of NUMERIC_FIELDS) {
      const value = row[field];
      if (typeof value === "number" && value < 0) {
        warnings.push({
          severity: "WARNING",
          code: "NEGATIVE_VALUE",
          message: `Row ${row.rowNumber} ("${row.farmerName}"): negative value for ${field} (${value}).`,
          context: { row: row.rowNumber, farmer: row.farmerName, field, value }
        });
      }
    }

    if (!row.contractNumber) {
      warnings.push({
        severity: "WARNING",
        code: "MISSING_CONTRACT_NUMBER",
        message: `Row ${row.rowNumber} ("${row.farmerName}"): missing contract number.`,
        context: { row: row.rowNumber, farmer: row.farmerName }
      });
    }
    if (row.contractQty == null) {
      warnings.push({
        severity: "WARNING",
        code: "MISSING_CONTRACT_QTY",
        message: `Row ${row.rowNumber} ("${row.farmerName}"): missing contract quantity.`,
        context: { row: row.rowNumber, farmer: row.farmerName }
      });
    }

    const valid = isRowValid(row);
    if (valid) validRows++;
    else {
      warnings.push({
        severity: "ERROR",
        code: "INVALID_OPERATION_ROW",
        message: `Row ${row.rowNumber} ("${row.farmerName}"): missing or zero reporting weight — row imported but excluded from weight/achievement totals.`,
        context: { row: row.rowNumber, farmer: row.farmerName }
      });
    }
  }

  return { rowsDetected: rows.length, validRows, invalidRows: rows.length - validRows };
}

export { isRowValid };
