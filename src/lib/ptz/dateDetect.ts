import type { Worksheet } from "exceljs";

export type DateDetectionResult = {
  reportDate: string; // YYYY-MM-DD
  method: "filename" | "sheet_content" | "upload_time";
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(day: number, month: number, year: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null; // rolled over -> invalid day
  return `${fullYear}-${pad(month)}-${pad(day)}`;
}

// Matches "11,09,26" / "11.09.2026" / "11-09-26" etc. The lookaround pair
// keeps the match from starting/ending mid-token — without it, a filename
// like "day2-11,09,26.xlsx" would misfire on "2-11,09" (from "day2-11").
const FILENAME_DATE_RE = /(?<![\p{L}\p{N}])(\d{1,2})[.,\-_](\d{1,2})[.,\-_](\d{2,4})(?![\p{L}\p{N}])/gu;

export function detectDateFromFilename(filename: string): string | null {
  const matches = [...filename.matchAll(FILENAME_DATE_RE)];
  const last = matches.at(-1);
  if (!last) return null;
  const [, d, m, y] = last;
  return toIso(Number(d), Number(m), Number(y));
}

const CONTENT_DATE_RE = /(\d{1,2})[.,\-\/](\d{1,2})[.,\-\/](\d{2,4})/;

export function detectDateFromSheet(sheet: Worksheet, maxRows = 10): string | null {
  for (let r = 1; r <= Math.min(maxRows, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.min(row.cellCount || 0, sheet.columnCount || 40); c++) {
      const cell = row.getCell(c);
      if (!cell.value) continue;
      if (cell.value instanceof Date) {
        const d = cell.value;
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
      if (typeof cell.value === "string") {
        const match = CONTENT_DATE_RE.exec(cell.value);
        if (match) {
          const [, d, m, y] = match;
          const iso = toIso(Number(d), Number(m), Number(y));
          if (iso) return iso;
        }
      }
    }
  }
  return null;
}

export function detectReportDate(
  filename: string,
  sheet: Worksheet,
  uploadTimestamp: Date
): DateDetectionResult {
  const fromFilename = detectDateFromFilename(filename);
  if (fromFilename) return { reportDate: fromFilename, method: "filename" };

  const fromSheet = detectDateFromSheet(sheet);
  if (fromSheet) return { reportDate: fromSheet, method: "sheet_content" };

  const d = uploadTimestamp;
  return {
    reportDate: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    method: "upload_time"
  };
}
