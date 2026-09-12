import PDFDocument from "pdfkit";
import path from "node:path";
import type {
  ContractTypeSummary,
  Forecast,
  RankingEntry,
  ReportRow
} from "./analytics.ts";
import { CONTRACT_TYPE_LABELS_UZ } from "./excel-mapping.ts";
import type { ContractType, ForecastStatus } from "./types.ts";

const FONT_REGULAR = path.join(process.cwd(), "src/lib/ptz/assets/fonts/PTSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "src/lib/ptz/assets/fonts/PTSans-Bold.ttf");

const PAGE_MARGIN = 36;

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${fmt(n)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const STATUS_LABEL: Record<ForecastStatus, string> = {
  GREEN: "🟢 РЕЖА БЎЙИЧА",
  YELLOW: "🟡 ХАВФ ОСТИДА",
  RED: "🔴 РЕЖАДАН ОРТДА",
  UNKNOWN: "⚪ МАЪЛУМОТ ЕТАРЛИ ЭМАС"
};

export type PdfInput = {
  report: ReportRow;
  overall: { planQty: number; cumulativeQty: number; dailyQty: number };
  previousDailyQty: number | null;
  forecast: Forecast;
  contractTypes: ContractTypeSummary[];
  topRegions: RankingEntry[];
  bottomRegions: RankingEntry[];
  topFarmers: RankingEntry[];
  bottomFarmers: RankingEntry[];
  riskFarmers: RankingEntry[];
  warningMessages: string[];
};

export function generatePdfReport(input: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("regular", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);
    doc.font("regular");

    renderExecutiveSummary(doc, input);
    doc.addPage();
    renderContractTypes(doc, input);
    doc.addPage();
    renderRegions(doc, input);
    doc.addPage();
    renderFarmers(doc, input);
    doc.addPage();
    renderForecastAndRisks(doc, input);

    doc.end();
  });
}

function pageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function footer(doc: PDFKit.PDFDocument): void {
  doc
    .font("regular")
    .fontSize(7)
    .fillColor("#888888")
    .text("Generated automatically by HAZORASP-TEXTIL PTZ Analytics", PAGE_MARGIN, doc.page.height - 24, {
      width: pageWidth(doc),
      align: "center"
    });
  doc.fillColor("#000000");
}

function title(doc: PDFKit.PDFDocument, text: string): void {
  doc.font("bold").fontSize(16).text(text, { align: "left" });
  doc.moveDown(0.5);
}

function kpiRow(doc: PDFKit.PDFDocument, items: [string, string][]): void {
  const colWidth = pageWidth(doc) / items.length;
  const y = doc.y;
  items.forEach(([label, value], i) => {
    const x = PAGE_MARGIN + i * colWidth;
    doc.font("regular").fontSize(9).fillColor("#555555").text(label, x, y, { width: colWidth - 8 });
    doc.font("bold").fontSize(14).fillColor("#111111").text(value, x, y + 13, { width: colWidth - 8 });
  });
  doc.fillColor("#000000");
  doc.y = y + 42;
}

function progressBar(doc: PDFKit.PDFDocument, pct: number, width: number): void {
  const clamped = Math.max(0, Math.min(100, pct));
  const x = doc.x;
  const y = doc.y;
  const height = 14;
  doc.rect(x, y, width, height).fill("#e5e7eb");
  doc.rect(x, y, (width * clamped) / 100, height).fill(clamped >= 100 ? "#16a34a" : clamped >= 60 ? "#2563eb" : "#dc2626");
  doc.fillColor("#000000").font("regular").fontSize(9).text(`${fmt(clamped)}%`, x + width + 8, y + 2);
  doc.y = y + height + 10;
}

function renderExecutiveSummary(doc: PDFKit.PDFDocument, input: PdfInput): void {
  title(doc, `HAZORASP-TEXTIL — PTZ ҲИСОБОТИ · ${fmtDate(input.report.reportDate)}`);
  doc.font("regular").fontSize(10).fillColor("#555555").text("Ижрочи хулоса (Executive Summary)");
  doc.moveDown(0.5);
  doc.fillColor("#000000");

  const growthPct =
    input.previousDailyQty && input.previousDailyQty !== 0
      ? ((input.overall.dailyQty - input.previousDailyQty) / input.previousDailyQty) * 100
      : null;

  kpiRow(doc, [
    ["Умумий режа, тн", fmt(input.overall.planQty)],
    ["Жами қабул, тн", fmt(input.overall.cumulativeQty)],
    ["Бажарилиши", fmtPct(input.forecast.completionPct)],
    ["Бугунги қабул, тн", fmt(input.overall.dailyQty)]
  ]);
  kpiRow(doc, [
    ["Кечаги қабул, тн", fmt(input.previousDailyQty)],
    ["Ўсиш", growthPct != null ? `${growthPct >= 0 ? "+" : ""}${fmt(growthPct)}%` : "—"],
    ["Қолдиқ, тн", fmt(input.forecast.remainingQty)],
    ["Керакли темп, тн/кун", fmt(input.forecast.requiredDailyRate)]
  ]);
  kpiRow(doc, [
    ["Амалдаги темп, тн/кун", fmt(input.forecast.currentRunRate)],
    ["Прогноз санаси", fmtDate(input.forecast.forecastDate)],
    ["Муддат", fmtDate(input.forecast.deadline)],
    ["Ҳолат", STATUS_LABEL[input.forecast.status]]
  ]);

  doc.moveDown(1);
  doc.font("bold").fontSize(11).text("Режа бажарилиши");
  doc.moveDown(0.3);
  progressBar(doc, input.forecast.completionPct ?? 0, pageWidth(doc) - 80);

  footer(doc);
}

function table(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[]
): void {
  const startX = PAGE_MARGIN;
  let y = doc.y;
  const rowHeight = 18;

  function drawHeader() {
    doc.font("bold").fontSize(9).fillColor("#ffffff");
    doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#1f2937");
    doc.fillColor("#ffffff");
    let x = startX;
    headers.forEach((h, i) => {
      const w = colWidths[i] ?? 80;
      doc.text(h, x + 4, y + 5, { width: w - 8 });
      x += w;
    });
    doc.fillColor("#000000");
    y += rowHeight;
  }

  drawHeader();
  doc.font("regular").fontSize(8.5);

  rows.forEach((row, idx) => {
    if (y > doc.page.height - PAGE_MARGIN - rowHeight) {
      doc.addPage();
      y = PAGE_MARGIN;
      drawHeader();
      doc.font("regular").fontSize(8.5);
    }
    if (idx % 2 === 1) {
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#f3f4f6");
      doc.fillColor("#000000");
    }
    let x = startX;
    row.forEach((cell, i) => {
      const w = colWidths[i] ?? 80;
      doc.text(cell, x + 4, y + 5, { width: w - 8, ellipsis: true });
      x += w;
    });
    y += rowHeight;
  });

  doc.y = y + 10;
}

function renderContractTypes(doc: PDFKit.PDFDocument, input: PdfInput): void {
  title(doc, "Шартнома турлари бўйича таҳлил");
  const headers = ["Шартнома тури", "Режа, тн", "Қабул, тн", "%", "Бугун, тн", "Қолдиқ, тн", "Керакли темп", "Прогноз"];
  const widths = [140, 90, 90, 60, 80, 90, 100, 90];
  const rows = input.contractTypes.map((ct) => [
    CONTRACT_TYPE_LABELS_UZ[ct.contractType as ContractType],
    fmt(ct.planQty),
    fmt(ct.cumulativeQty),
    fmtPct(ct.completionPct),
    fmt(ct.dailyQty),
    fmt(ct.forecast.remainingQty),
    fmt(ct.forecast.requiredDailyRate),
    fmtDate(ct.forecast.forecastDate)
  ]);
  table(doc, headers, rows, widths);
  footer(doc);
}

function rankingTable(doc: PDFKit.PDFDocument, heading: string, entries: RankingEntry[]): void {
  doc.font("bold").fontSize(12).text(heading);
  doc.moveDown(0.2);
  const headers = ["Номи", "Ҳудуд", "Режа, тн", "Қабул, тн", "Бугун, тн", "%"];
  const widths = [220, 150, 90, 90, 80, 60];
  const rows = entries.map((e) => [e.name, e.region ?? "—", fmt(e.planQty), fmt(e.cumulativeQty), fmt(e.dailyQty), fmtPct(e.completionPct)]);
  table(doc, headers, rows, widths);
}

function renderRegions(doc: PDFKit.PDFDocument, input: PdfInput): void {
  title(doc, "Ҳудудлар бўйича таҳлил");
  rankingTable(doc, "ТОП-10 ҳудудлар", input.topRegions);
  doc.moveDown(0.5);
  rankingTable(doc, "Орқада қолган 10 ҳудуд", input.bottomRegions);
  footer(doc);
}

function renderFarmers(doc: PDFKit.PDFDocument, input: PdfInput): void {
  title(doc, "Фермерлар бўйича таҳлил");
  rankingTable(doc, "ТОП-10 фермер хўжаликлари", input.topFarmers);
  doc.moveDown(0.5);
  rankingTable(doc, "Орқада қолган 10 фермер хўжалиги", input.bottomFarmers);
  footer(doc);
}

function renderForecastAndRisks(doc: PDFKit.PDFDocument, input: PdfInput): void {
  title(doc, "Прогноз ва рисклар");

  kpiRow(doc, [
    ["Муддат", fmtDate(input.forecast.deadline)],
    ["Амалдаги темп, тн/кун", fmt(input.forecast.currentRunRate)],
    ["Керакли темп, тн/кун", fmt(input.forecast.requiredDailyRate)],
    ["Ҳолат", STATUS_LABEL[input.forecast.status]]
  ]);

  doc.moveDown(0.5);
  if (input.riskFarmers.length > 0) {
    rankingTable(doc, "Риск остидаги фермерлар (бажарилиши < 50%)", input.riskFarmers);
  } else {
    doc.font("regular").fontSize(10).text("Риск остидаги фермерлар аниқланмади.");
  }

  doc.moveDown(0.5);
  doc.font("bold").fontSize(12).text("Маълумот сифати бўйича огоҳлантиришлар");
  doc.moveDown(0.2);
  doc.font("regular").fontSize(9);
  if (input.warningMessages.length === 0) {
    doc.text("Огоҳлантиришлар йўқ.");
  } else {
    input.warningMessages.slice(0, 25).forEach((w) => doc.text(`• ${w}`));
    if (input.warningMessages.length > 25) {
      doc.text(`... яна ${input.warningMessages.length - 25} та огоҳлантириш (тўлиқ рўйхат учун admin панелга қаранг).`);
    }
  }

  footer(doc);
}
