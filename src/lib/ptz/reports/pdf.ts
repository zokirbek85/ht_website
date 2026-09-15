import PDFDocument from "pdfkit";
import path from "node:path";
import type { ReportBundle } from "../reportBundle.ts";
import type { Alert, AlertSeverity } from "../types.ts";

const FONT_REGULAR = path.join(process.cwd(), "src/lib/ptz/assets/fonts/PTSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "src/lib/ptz/assets/fonts/PTSans-Bold.ttf");

const PAGE_MARGIN = 36;
const HEADER_HEIGHT = 54;
const CONTENT_TOP = PAGE_MARGIN + HEADER_HEIGHT + 20;

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
function fmtTons(kg: number | null | undefined): string {
  return `${fmt((kg ?? 0) / 1000)} т`;
}
function fmtPct(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "—" : `${fmt(n)}%`;
}
function fmtSum(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("ru-RU")} сўм`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join(".");
}

function overallStatus(alerts: Alert[]): { label: string; color: string } {
  if (alerts.some((a) => a.severity === "RED")) return { label: "КРИТИК ОГОҲЛАНТИРИШЛАР МАВЖУД", color: COLOR.red };
  if (alerts.some((a) => a.severity === "YELLOW")) return { label: "ДИҚҚАТ ТАЛАБ ЭТАДИ", color: COLOR.amber };
  return { label: "ЯХШИ ҲОЛАТДА", color: COLOR.green };
}

export function generatePdfReport(bundle: ReportBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("regular", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);
    doc.font("regular");

    const status = overallStatus(bundle.alerts);

    const sections: { title: string; render: () => void }[] = [
      { title: "ИЖРОЧИ ХУЛОСА", render: () => renderExecutiveSummary(doc, bundle) },
      { title: "ШАРТНОМАЛАР БЎЙИЧА БАЖАРИЛИШ", render: () => renderContracts(doc, bundle) },
      { title: "ҚАБУЛ ДИНАМИКАСИ", render: () => renderAcceptanceDynamics(doc, bundle) },
      { title: "ФЕРМЕРЛАР РЕЙТИНГИ", render: () => renderFarmers(doc, bundle) },
      { title: "КЛАСТЕРЛАР ТАҲЛИЛИ", render: () => renderClusters(doc, bundle) },
      { title: "СИФАТ КЎРСАТКИЧЛАРИ", render: () => renderQuality(doc, bundle) },
      { title: "МОЛИЯВИЙ ТАҲЛИЛ", render: () => renderFinance(doc, bundle) },
      { title: "ВАЗН КЎПРИГИ", render: () => renderWeightBridge(doc, bundle) },
      { title: "НАЗОРАТ МАРКАЗИ", render: () => renderControlCenter(doc, bundle) },
      { title: "МЕТОДОЛОГИЯ ВА ИЗОҲЛАР", render: () => renderMethodology(doc, bundle) }
    ];

    let currentSectionTitle = sections[0]?.title ?? "";
    doc.on("pageAdded", () => pageHeader(doc, bundle, currentSectionTitle, status));
    pageHeader(doc, bundle, currentSectionTitle, status);

    sections.forEach((section, i) => {
      currentSectionTitle = section.title;
      if (i > 0) doc.addPage();
      section.render();
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      footer(doc);
    }

    doc.end();
  });
}

function pageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function pageHeader(doc: PDFKit.PDFDocument, bundle: ReportBundle, sectionTitle: string, status: { label: string; color: string }): void {
  doc.rect(0, 0, doc.page.width, PAGE_MARGIN + HEADER_HEIGHT).fill(COLOR.forestDeep);

  doc.fillColor(COLOR.white).font("bold").fontSize(13).text("HAZORASP-TEXTIL", PAGE_MARGIN, PAGE_MARGIN + 6, { characterSpacing: 0.6 });
  doc.font("regular").fontSize(8).fillColor("#b7c9d9").text("ПАХТА ҚАБУЛИ АНАЛИТИКАСИ", PAGE_MARGIN, PAGE_MARGIN + 24, { characterSpacing: 1.4 });

  doc
    .font("bold")
    .fontSize(10)
    .fillColor(COLOR.white)
    .text(sectionTitle, PAGE_MARGIN, PAGE_MARGIN + 6, { width: pageWidth(doc), align: "center", characterSpacing: 0.8 });
  doc
    .font("regular")
    .fontSize(8.5)
    .fillColor("#b7c9d9")
    .text(`Ҳисобот санаси: ${fmtDate(bundle.import.reportGeneratedAt)}`, PAGE_MARGIN, PAGE_MARGIN + 24, { width: pageWidth(doc), align: "center" });

  doc.font("bold").fontSize(9);
  const statusTextWidth = doc.widthOfString(status.label);
  const statusRightEdge = PAGE_MARGIN + pageWidth(doc);
  const dotRadius = 3;
  const dotX = statusRightEdge - statusTextWidth - dotRadius * 2 - 6;
  const dotY = PAGE_MARGIN + 6 + 5;
  doc.circle(dotX, dotY, dotRadius).fill(status.color);
  doc.fillColor(COLOR.white).text(status.label, PAGE_MARGIN, PAGE_MARGIN + 6, { width: pageWidth(doc), align: "right" });
  doc
    .font("regular")
    .fontSize(8)
    .fillColor("#b7c9d9")
    .text(
      `Маълумот даври: ${fmtDate(bundle.import.dataPeriodStart)} — ${fmtDate(bundle.import.dataPeriodEnd)}`,
      PAGE_MARGIN,
      PAGE_MARGIN + 24,
      { width: pageWidth(doc), align: "right" }
    );

  doc.fillColor(COLOR.ink);
  doc.y = CONTENT_TOP;
}

function footer(doc: PDFKit.PDFDocument): void {
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.moveTo(PAGE_MARGIN, doc.page.height - 34).lineTo(doc.page.width - PAGE_MARGIN, doc.page.height - 34).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  doc
    .font("regular")
    .fontSize(7)
    .fillColor(COLOR.inkSoft)
    .text("АВТОМАТИК РАВИШДА HAZORASP-TEXTIL ПАХТА ҚАБУЛИ АНАЛИТИКАСИ ТОМОНИДАН ЯРАТИЛГАН", PAGE_MARGIN, doc.page.height - 26, {
      width: pageWidth(doc),
      align: "center",
      characterSpacing: 0.6,
      lineBreak: false
    });
  doc.fillColor(COLOR.ink);
  doc.page.margins.bottom = originalBottomMargin;
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string): void {
  doc.font("bold").fontSize(12.5).fillColor(COLOR.forest).text(text, PAGE_MARGIN, doc.y, { width: pageWidth(doc), characterSpacing: 0.3 });
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
    doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text(label.toUpperCase(), x, y, { width: colWidth - 8, characterSpacing: 0.3 });
    doc.font("bold").fontSize(14).fillColor(COLOR.forest).text(value, x, y + 13, { width: colWidth - 8 });
  });
  doc.fillColor(COLOR.ink);
  doc.y = y + 44;
}

function progressBar(doc: PDFKit.PDFDocument, pct: number, width: number): void {
  const clamped = Math.max(0, Math.min(100, pct));
  const x = PAGE_MARGIN;
  const y = doc.y;
  const height = 12;
  const fillColor = clamped >= 100 ? COLOR.green : clamped >= 60 ? COLOR.forestMid : COLOR.red;
  doc.roundedRect(x, y, width, height, 2).fill(COLOR.stripe);
  if (clamped > 0) doc.roundedRect(x, y, (width * clamped) / 100, height, 2).fill(fillColor);
  doc.fillColor(COLOR.forest).font("bold").fontSize(9).text(`${fmt(clamped)}%`, x + width + 8, y + 1);
  doc.y = y + height + 10;
}

function table(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], colWidths: number[]): void {
  const startX = PAGE_MARGIN;
  let y = doc.y;
  const rowHeight = 18;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  function drawHeader() {
    doc.rect(startX, y, totalWidth, rowHeight).fill(COLOR.forest);
    doc.font("bold").fontSize(8).fillColor(COLOR.white);
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
  doc.font("regular").fontSize(8);

  if (rows.length === 0) {
    doc.fillColor(COLOR.inkSoft).text("Маълумот йўқ", startX + 4, y + 5);
    doc.fillColor(COLOR.ink);
    doc.y = y + rowHeight + 12;
    return;
  }

  rows.forEach((row, idx) => {
    if (y > doc.page.height - PAGE_MARGIN - 34 - rowHeight) {
      doc.addPage();
      y = CONTENT_TOP;
      drawHeader();
      doc.font("regular").fontSize(8);
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

  doc.moveTo(startX, y).lineTo(startX + totalWidth, y).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  doc.y = y + 12;
}

function renderExecutiveSummary(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const s = b.summary;
  kpiRow(doc, [
    ["Шартнома миқдори", fmtTons(s.contractQtyKg)],
    ["Қабул қилинган", fmtTons(s.acceptedKg)],
    ["Қолдиқ", fmtTons(s.remainingKg)],
    ["Бажарилиши", fmtPct(s.achievementPct)]
  ]);
  kpiRow(doc, [
    ["Бугунги қабул", fmtTons(s.todayAcceptedKg)],
    ["Харид суммаси", fmtSum(s.totalAmount)],
    ["Ўртача нарх (тортилган)", s.weightedAvgPrice != null ? `${fmt(s.weightedAvgPrice, 0)} сўм/кг` : "—"],
    ["Фермерлар / шартномалар", `${s.farmerCount} / ${s.contractCount}`]
  ]);
  kpiRow(doc, [
    ["Қабул операциялари", String(s.operationCount)],
    ["Шартномадан ортиқча", fmtTons(s.overDeliveryKg)],
    ["Огоҳлантиришлар", String(b.alerts.reduce((a, al) => a + al.count, 0))],
    ["", ""]
  ]);

  doc.moveDown(0.6);
  sectionHeading(doc, "РЕЖА БАЖАРИЛИШИ (ЖАМИ)");
  progressBar(doc, s.achievementPct ?? 0, pageWidth(doc) - 80);
}

function renderContracts(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const STATUS_LABEL: Record<string, string> = {
    NOT_STARTED: "Бошланмаган",
    IN_PROGRESS: "Жараёнда",
    NEAR_COMPLETION: "Якунга яқин",
    COMPLETED: "Якунланган",
    OVER_CONTRACT: "Ортиқча"
  };
  const headers = ["Шартнома", "Фермер", "Тури", "Шартнома, т", "Қабул, т", "Қолдиқ, т", "%", "Ҳолат"];
  const widths = [80, 190, 70, 80, 80, 80, 55, 95];
  const rows = b.contracts
    .slice(0, 60)
    .map((c) => [c.contractNumber, c.farmerName, c.contractType ?? "—", fmt(c.contractQtyKg / 1000), fmt(c.acceptedKg / 1000), fmt(c.remainingKg / 1000), fmtPct(c.achievementPct), STATUS_LABEL[c.status] ?? c.status]);
  table(doc, headers, rows, widths);
  if (b.contracts.length > 60) {
    doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text(`... яна ${b.contracts.length - 60} та шартнома (тўлиқ рўйхат учун XLSX ҳисоботга қаранг).`);
    doc.fillColor(COLOR.ink);
  }
}

function renderAcceptanceDynamics(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const points = b.dailyTrend;
  const headers = ["Сана", "Кунлик, т", "Жами (ўсиб борувчи), т"];
  const widths = [120, 120, 160];
  const rows = points.map((p) => [fmtDate(p.date), fmt(p.dailyAcceptedKg / 1000), fmt(p.cumulativeAcceptedKg / 1000)]);
  table(doc, headers, rows, widths);

  if (points.length > 0) {
    doc.moveDown(0.4);
    sectionHeading(doc, "КУНЛИК ҚАБУЛ ГРАФИГИ");
    const chartWidth = pageWidth(doc) - 40;
    const chartHeight = 120;
    const maxVal = Math.max(...points.map((p) => p.dailyAcceptedKg), 1);
    const barGap = 6;
    const barWidth = (chartWidth - barGap * (points.length - 1)) / points.length;
    const baseY = doc.y + chartHeight;
    points.forEach((p, i) => {
      const barHeight = (p.dailyAcceptedKg / maxVal) * (chartHeight - 16);
      const x = PAGE_MARGIN + i * (barWidth + barGap);
      doc.rect(x, baseY - barHeight, barWidth, barHeight).fill(COLOR.forestMid);
      doc.fillColor(COLOR.inkSoft).font("regular").fontSize(7).text(fmtDate(p.date).slice(0, 5), x, baseY + 4, { width: barWidth, align: "center" });
    });
    doc.fillColor(COLOR.ink);
    doc.y = baseY + 18;
  }
}

function rankingTable(doc: PDFKit.PDFDocument, heading: string, entries: import("../analytics.ts").FarmerAnalytics[]): void {
  sectionHeading(doc, heading.toUpperCase());
  const headers = ["Номи", "Шартнома, т", "Қабул, т", "Топшириқлар", "%"];
  const widths = [260, 90, 90, 80, 70];
  const rows = entries.map((e) => [e.farmerName, fmt(e.contractQtyKg / 1000), fmt(e.acceptedKg / 1000), String(e.deliveries), fmtPct(e.achievementPct)]);
  table(doc, headers, rows, widths);
}

function renderFarmers(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  rankingTable(doc, "ТОП-10 фермер хўжаликлари", b.topFarmers);
  rankingTable(doc, "Орқада қолган 10 фермер хўжалиги", b.bottomFarmers);
}

function renderClusters(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const headers = ["Кластер", "Шартнома, т", "Қабул, т", "Қолдиқ, т", "%", "Фермерлар"];
  const widths = [200, 90, 90, 90, 70, 90];
  const rows = b.clusters.map((c) => [c.clusterName, fmt(c.contractQtyKg / 1000), fmt(c.acceptedKg / 1000), fmt(c.remainingKg / 1000), fmtPct(c.achievementPct), String(c.farmerCount)]);
  table(doc, headers, rows, widths);
}

function renderQuality(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const q = b.quality;
  kpiRow(doc, [
    ["Намлик (ўртача)", `${fmt(q.moisture.avg)}%`],
    ["Намлик (мин/макс)", `${fmt(q.moisture.min)}% / ${fmt(q.moisture.max)}%`],
    ["Ифлослик (ўртача)", `${fmt(q.impurity.avg)}%`],
    ["Ифлослик (мин/макс)", `${fmt(q.impurity.min)}% / ${fmt(q.impurity.max)}%`]
  ]);
  doc.moveDown(0.3);
  sectionHeading(doc, "ТЕРИМ УСЛУБИ БЎЙИЧА ТАҚСИМОТ");
  table(
    doc,
    ["Услуб", "Сони", "%"],
    q.pickingMethodDistribution.map((d) => [d.label, String(d.count), fmtPct(d.pct)]),
    [200, 100, 100]
  );
  if (!q.thresholdsConfigured) {
    doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text("Огоҳлантириш: сифат меъёрлари (намлик/ифлослик чегаралари) мижоз томонидан тасдиқланмаган — config.ts даги вақтинчалик қийматлар ишлатилмоқда.", { width: pageWidth(doc) });
    doc.fillColor(COLOR.ink);
  }
}

function renderFinance(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const f = b.finance;
  kpiRow(doc, [
    ["Жами харид суммаси", fmtSum(f.totalAmount)],
    ["Бугунги харид суммаси", fmtSum(f.todayAmount)],
    ["Ўртача нарх (оддий)", f.simpleAvgPrice != null ? `${fmt(f.simpleAvgPrice, 0)} сўм/кг` : "—"],
    ["Ўртача нарх (тортилган)", f.weightedAvgPrice != null ? `${fmt(f.weightedAvgPrice, 0)} сўм/кг` : "—"]
  ]);
  kpiRow(doc, [
    ["Мин / Макс нарх", `${fmt(f.minPrice, 0)} / ${fmt(f.maxPrice, 0)} сўм/кг`],
    ["Жами устама", fmtSum(f.totalMarkup)],
    ["Жами чегирма", fmtSum(f.totalDiscount)],
    ["Қўшимча тўловлар", fmtSum(f.totalTransportFee + f.totalSeedCottonFee + f.totalOtherFee)]
  ]);
}

function renderWeightBridge(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  const headers = ["Босқич", "Жами, кг", "Ўзгариш, кг", "Ўзгариш, %"];
  const widths = [180, 140, 140, 100];
  const rows = b.weightBridge.map((s) => [s.stage, fmt(s.totalKg, 0), s.diffFromPrevKg == null ? "—" : fmt(s.diffFromPrevKg, 0), s.diffFromPrevPct == null ? "—" : fmtPct(s.diffFromPrevPct)]);
  table(doc, headers, rows, widths);
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = { RED: "КРИТИК", YELLOW: "ОГОҲЛАНТИРИШ", GREEN: "НОРМА", INFO: "МАЪЛУМОТ" };
const SEVERITY_COLOR: Record<AlertSeverity, string> = { RED: COLOR.red, YELLOW: COLOR.amber, GREEN: COLOR.green, INFO: COLOR.inkSoft };

function renderControlCenter(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  if (b.alerts.length === 0) {
    doc.font("regular").fontSize(10).fillColor(COLOR.inkSoft).text("Огоҳлантиришлар аниқланмади.");
    doc.fillColor(COLOR.ink);
    return;
  }
  for (const category of ["CONTRACT", "DATA", "QUALITY"] as const) {
    const alerts = b.alerts.filter((a) => a.category === category);
    if (alerts.length === 0) continue;
    sectionHeading(doc, category === "CONTRACT" ? "ШАРТНОМА ОГОҲЛАНТИРИШЛАРИ" : category === "DATA" ? "МАЪЛУМОТ СИФАТИ ОГОҲЛАНТИРИШЛАРИ" : "СИФАТ ОГОҲЛАНТИРИШЛАРИ");
    for (const a of alerts) {
      doc.font("bold").fontSize(9).fillColor(SEVERITY_COLOR[a.severity]).text(`[${SEVERITY_LABEL[a.severity]}] ${a.title} — ${a.count}`, { continued: false });
      if (a.sampleRecords.length > 0) {
        doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text(a.sampleRecords.slice(0, 6).join("; "), { width: pageWidth(doc) });
      }
      doc.moveDown(0.3);
    }
    doc.fillColor(COLOR.ink);
    doc.moveDown(0.3);
  }
}

function renderMethodology(doc: PDFKit.PDFDocument, b: ReportBundle): void {
  doc.font("regular").fontSize(9).fillColor(COLOR.inkSoft);
  doc.text(`Манба файл: ${b.import.sourceFilename}`);
  doc.text(`Импорт вақти: ${new Date(b.import.importedAt).toLocaleString("ru-RU")}`);
  doc.text(`Қаторлар: ${b.import.rowCount} (яроқли: ${b.import.validRowCount}, яроқсиз: ${b.import.invalidRowCount})`);
  doc.moveDown(0.6);
  doc.fillColor(COLOR.ink);
  sectionHeading(doc, "ҲИСОБЛАШ УСУЛЛАРИ ВА ТАХМИНЛАР");
  doc.font("regular").fontSize(9).fillColor(COLOR.inkSoft);
  for (const a of b.assumptions) doc.text(`•  ${a}`, { lineGap: 3 });
  doc.fillColor(COLOR.ink);
}
