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
const HEADER_HEIGHT = 54;
const CONTENT_TOP = PAGE_MARGIN + HEADER_HEIGHT + 20;

// Brand palette (matches tailwind.config.ts / globals.css on the public site).
const COLOR = {
  forest: "#0b315f",
  forestDeep: "#031a38",
  forestMid: "#075f9f",
  brass: "#62e52d",
  ink: "#071b35",
  inkSoft: "#40546b",
  border: "#d3dde6",
  stripe: "#eef3f7",
  white: "#ffffff",
  green: "#2e7d3f",
  amber: "#a8901f",
  red: "#b23a3a"
};

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

// No emoji here — the embedded PT Sans TTF has no color-emoji glyphs, so a
// 🟢/🔴 character would render as a broken ".notdef" box. A drawn dot next
// to the text (see pageHeader) carries the same traffic-light meaning.
const STATUS_LABEL: Record<ForecastStatus, string> = {
  GREEN: "РЕЖА БЎЙИЧА",
  YELLOW: "ХАВФ ОСТИДА",
  RED: "РЕЖАДАН ОРТДА",
  UNKNOWN: "МАЪЛУМОТ ЕТАРЛИ ЭМАС"
};

const STATUS_COLOR: Record<ForecastStatus, string> = {
  GREEN: COLOR.green,
  YELLOW: COLOR.amber,
  RED: COLOR.red,
  UNKNOWN: COLOR.inkSoft
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
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("regular", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);
    doc.font("regular");

    const pages: { title: string; render: () => void }[] = [
      { title: "ИЖРОЧИ ХУЛОСА", render: () => renderExecutiveSummary(doc, input) },
      { title: "ШАРТНОМА ТУРЛАРИ", render: () => renderContractTypes(doc, input) },
      { title: "ҲУДУДЛАР ТАҲЛИЛИ", render: () => renderRegions(doc, input) },
      { title: "ФЕРМЕРЛАР ТАҲЛИЛИ", render: () => renderFarmers(doc, input) },
      { title: "ПРОГНОЗ ВА РИСКЛАР", render: () => renderForecastAndRisks(doc, input) }
    ];

    pages.forEach((page, i) => {
      if (i > 0) doc.addPage();
      pageHeader(doc, input, page.title);
      page.render();
      footer(doc);
    });

    doc.end();
  });
}

function pageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

/** Forest-navy band repeated at the top of every page, echoing the site's dark hero/stat bands. */
function pageHeader(doc: PDFKit.PDFDocument, input: PdfInput, sectionTitle: string): void {
  doc.rect(0, 0, doc.page.width, PAGE_MARGIN + HEADER_HEIGHT).fill(COLOR.forestDeep);

  doc
    .fillColor(COLOR.white)
    .font("bold")
    .fontSize(13)
    .text("HAZORASP-TEXTIL", PAGE_MARGIN, PAGE_MARGIN + 6, { characterSpacing: 0.6 });

  doc
    .font("regular")
    .fontSize(8)
    .fillColor("#b7c9d9")
    .text("PTZ ANALYTICS", PAGE_MARGIN, PAGE_MARGIN + 24, { characterSpacing: 1.4 });

  doc
    .font("bold")
    .fontSize(10)
    .fillColor(COLOR.white)
    .text(sectionTitle, PAGE_MARGIN, PAGE_MARGIN + 6, { width: pageWidth(doc), align: "center", characterSpacing: 0.8 });

  doc
    .font("regular")
    .fontSize(8.5)
    .fillColor("#b7c9d9")
    .text(`Ҳисобот санаси: ${fmtDate(input.report.reportDate)}`, PAGE_MARGIN, PAGE_MARGIN + 24, {
      width: pageWidth(doc),
      align: "center"
    });

  const statusText = STATUS_LABEL[input.forecast.status];
  doc.font("bold").fontSize(9);
  const statusTextWidth = doc.widthOfString(statusText);
  const statusRightEdge = PAGE_MARGIN + pageWidth(doc);
  const dotRadius = 3;
  const dotX = statusRightEdge - statusTextWidth - dotRadius * 2 - 6;
  const dotY = PAGE_MARGIN + 6 + 5;
  doc.circle(dotX, dotY, dotRadius).fill(STATUS_COLOR[input.forecast.status]);
  doc
    .fillColor(STATUS_COLOR[input.forecast.status] === COLOR.inkSoft ? "#b7c9d9" : "#ffffff")
    .text(statusText, PAGE_MARGIN, PAGE_MARGIN + 6, { width: pageWidth(doc), align: "right" });

  doc
    .font("regular")
    .fontSize(8)
    .fillColor("#b7c9d9")
    .text(`Бажарилиши: ${fmtPct(input.forecast.completionPct)}`, PAGE_MARGIN, PAGE_MARGIN + 24, {
      width: pageWidth(doc),
      align: "right"
    });

  doc.fillColor(COLOR.ink);
  doc.y = CONTENT_TOP;
}

function footer(doc: PDFKit.PDFDocument): void {
  // A y this close to the page edge sits right on PDFKit's bottom-margin
  // boundary, which silently triggers an auto page-break mid-draw — so the
  // footer must be drawn with the bottom margin temporarily disabled.
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc
    .moveTo(PAGE_MARGIN, doc.page.height - 34)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.page.height - 34)
    .lineWidth(0.5)
    .strokeColor(COLOR.border)
    .stroke();
  doc
    .font("regular")
    .fontSize(7)
    .fillColor(COLOR.inkSoft)
    .text("GENERATED AUTOMATICALLY BY HAZORASP-TEXTIL PTZ ANALYTICS", PAGE_MARGIN, doc.page.height - 26, {
      width: pageWidth(doc),
      align: "center",
      characterSpacing: 0.6,
      lineBreak: false
    });
  doc.fillColor(COLOR.ink);

  doc.page.margins.bottom = originalBottomMargin;
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string): void {
  doc
    .font("bold")
    .fontSize(12.5)
    .fillColor(COLOR.forest)
    .text(text, PAGE_MARGIN, doc.y, { width: pageWidth(doc), characterSpacing: 0.3 });
  const y = doc.y + 4;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + 32, y).lineWidth(2).strokeColor(COLOR.brass).stroke();
  doc.fillColor(COLOR.ink);
  doc.y = y + 10;
}

function kpiRow(doc: PDFKit.PDFDocument, items: [string, string][]): void {
  const colWidth = pageWidth(doc) / items.length;
  const y = doc.y;
  items.forEach(([label, value], i) => {
    const x = PAGE_MARGIN + i * colWidth;
    doc
      .font("regular")
      .fontSize(8)
      .fillColor(COLOR.inkSoft)
      .text(label.toUpperCase(), x, y, { width: colWidth - 8, characterSpacing: 0.3 });
    doc.font("bold").fontSize(15).fillColor(COLOR.forest).text(value, x, y + 13, { width: colWidth - 8 });
  });
  doc.fillColor(COLOR.ink);
  doc.y = y + 44;
}

function progressBar(doc: PDFKit.PDFDocument, pct: number, width: number): void {
  const clamped = Math.max(0, Math.min(100, pct));
  // Explicit PAGE_MARGIN, not doc.x: after kpiRow's absolute-positioned text
  // calls, PDFKit leaves doc.x wherever the last column's text ended, not
  // back at the left margin — reading it here previously drew this bar
  // starting from the middle of the page instead of the left edge.
  const x = PAGE_MARGIN;
  const y = doc.y;
  const height = 12;
  const fillColor = clamped >= 100 ? COLOR.green : clamped >= 60 ? COLOR.forestMid : COLOR.red;
  doc.roundedRect(x, y, width, height, 2).fill(COLOR.stripe);
  if (clamped > 0) doc.roundedRect(x, y, (width * clamped) / 100, height, 2).fill(fillColor);
  doc.fillColor(COLOR.forest).font("bold").fontSize(9).text(`${fmt(clamped)}%`, x + width + 8, y + 1);
  doc.y = y + height + 10;
}

function renderExecutiveSummary(doc: PDFKit.PDFDocument, input: PdfInput): void {
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
    ["Огоҳлантиришлар", String(input.warningMessages.length)]
  ]);

  doc.moveDown(0.6);
  sectionHeading(doc, "РЕЖА БАЖАРИЛИШИ");
  progressBar(doc, input.forecast.completionPct ?? 0, pageWidth(doc) - 80);
}

function table(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], colWidths: number[]): void {
  const startX = PAGE_MARGIN;
  let y = doc.y;
  const rowHeight = 18;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  function drawHeader() {
    doc.rect(startX, y, totalWidth, rowHeight).fill(COLOR.forest);
    doc.font("bold").fontSize(8.5).fillColor(COLOR.white);
    let x = startX;
    headers.forEach((h, i) => {
      const w = colWidths[i] ?? 80;
      doc.text(h.toUpperCase(), x + 4, y + 5, { width: w - 8, characterSpacing: 0.2 });
      x += w;
    });
    doc.fillColor(COLOR.ink);
    y += rowHeight;
  }

  drawHeader();
  doc.font("regular").fontSize(8.5);

  rows.forEach((row, idx) => {
    if (y > doc.page.height - PAGE_MARGIN - 34 - rowHeight) {
      doc.addPage();
      y = PAGE_MARGIN + 10;
      drawHeader();
      doc.font("regular").fontSize(8.5);
    }
    if (idx % 2 === 1) {
      doc.rect(startX, y, totalWidth, rowHeight).fill(COLOR.stripe);
      doc.fillColor(COLOR.ink);
    }
    let x = startX;
    row.forEach((cell, i) => {
      const w = colWidths[i] ?? 80;
      doc.text(cell, x + 4, y + 5, { width: w - 8, ellipsis: true });
      x += w;
    });
    y += rowHeight;
  });

  doc
    .moveTo(startX, y)
    .lineTo(startX + totalWidth, y)
    .lineWidth(0.5)
    .strokeColor(COLOR.border)
    .stroke();

  doc.y = y + 12;
}

function renderContractTypes(doc: PDFKit.PDFDocument, input: PdfInput): void {
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
}

function rankingTable(doc: PDFKit.PDFDocument, heading: string, entries: RankingEntry[]): void {
  sectionHeading(doc, heading.toUpperCase());
  const headers = ["Номи", "Ҳудуд", "Режа, тн", "Қабул, тн", "Бугун, тн", "%"];
  const widths = [220, 150, 90, 90, 80, 60];
  const rows = entries.map((e) => [e.name, e.region ?? "—", fmt(e.planQty), fmt(e.cumulativeQty), fmt(e.dailyQty), fmtPct(e.completionPct)]);
  table(doc, headers, rows, widths);
}

function renderRegions(doc: PDFKit.PDFDocument, input: PdfInput): void {
  rankingTable(doc, "ТОП-10 ҳудудлар", input.topRegions);
  rankingTable(doc, "Орқада қолган 10 ҳудуд", input.bottomRegions);
}

function renderFarmers(doc: PDFKit.PDFDocument, input: PdfInput): void {
  rankingTable(doc, "ТОП-10 фермер хўжаликлари", input.topFarmers);
  rankingTable(doc, "Орқада қолган 10 фермер хўжалиги", input.bottomFarmers);
}

function renderForecastAndRisks(doc: PDFKit.PDFDocument, input: PdfInput): void {
  kpiRow(doc, [
    ["Муддат", fmtDate(input.forecast.deadline)],
    ["Амалдаги темп, тн/кун", fmt(input.forecast.currentRunRate)],
    ["Керакли темп, тн/кун", fmt(input.forecast.requiredDailyRate)],
    ["Риск остидаги фермерлар", String(input.riskFarmers.length)]
  ]);

  doc.moveDown(0.3);
  if (input.riskFarmers.length > 0) {
    rankingTable(doc, "Риск остидаги фермерлар (бажарилиши < 50%)", input.riskFarmers);
  } else {
    sectionHeading(doc, "РИСК ОСТИДАГИ ФЕРМЕРЛАР");
    doc.font("regular").fontSize(10).fillColor(COLOR.inkSoft).text("Риск остидаги фермерлар аниқланмади.");
    doc.fillColor(COLOR.ink);
    doc.moveDown(0.6);
  }

  sectionHeading(doc, "МАЪЛУМОТ СИФАТИ БЎЙИЧА ОГОҲЛАНТИРИШЛАР");
  doc.font("regular").fontSize(9).fillColor(COLOR.inkSoft);
  if (input.warningMessages.length === 0) {
    doc.text("Огоҳлантиришлар йўқ.");
  } else {
    input.warningMessages.slice(0, 25).forEach((w) => doc.text(`•  ${w}`, { lineGap: 2 }));
    if (input.warningMessages.length > 25) {
      doc.text(`...  яна ${input.warningMessages.length - 25} та огоҳлантириш (тўлиқ рўйхат учун admin панелга қаранг).`);
    }
  }
  doc.fillColor(COLOR.ink);
}
