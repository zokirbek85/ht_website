// PDFExporter — Кунлик_терим_YYYY-MM-DD.pdf, a 3-page A4-landscape dashboard.
//   1: KPI tiles, daily harvest (hand/machine stacked), hand vs machine share
//   2: ҳудуд breakdown, top farmers, shipments vs deal quantity
//   3: data quality, payments & RKP summary
// Reads the same KunlikReport as the Excel export. Chart colors are the
// validated reference palette slots 1–2 (hand = blue, machine = orange);
// identity is never color-only: every two-series chart carries a legend and
// direct labels.
import PDFDocument from "pdfkit";
import path from "node:path";
import { PICKING_MONEY_SHARE_PCT } from "../config.ts";
import { formatNumber, formatSum, tiyinToSum } from "../utils/numbers.ts";
import { formatDate, formatDateTime } from "../utils/dates.ts";
import type { ExportContext } from "../service.ts";

const FONT_REGULAR = path.join(process.cwd(), "src/lib/ptz/assets/fonts/PTSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "src/lib/ptz/assets/fonts/PTSans-Bold.ttf");

const M = 32;
const COLOR = {
  brand: "#0b315f",
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  inkSoft: "#52514e",
  muted: "#8a8984",
  grid: "#e6e5e1",
  tile: "#f3f4f2",
  hand: "#2a78d6",
  machine: "#eb6834",
  critical: "#c0392b",
  warning: "#b7791f",
  good: "#2e7d3f",
  white: "#ffffff"
};

type Doc = PDFKit.PDFDocument;

const tons = (kg: number, d = 1) => `${formatNumber(kg / 1000, d)} т`;
const mln = (tiyin: bigint) => `${formatNumber(tiyinToSum(tiyin) / 1_000_000, 1)} млн сўм`;

function pageWidth(doc: Doc): number {
  return doc.page.width - M * 2;
}

function header(doc: Doc, ctx: ExportContext, subtitle: string): void {
  doc.rect(0, 0, doc.page.width, 58).fill(COLOR.brand);
  doc.font("bold").fontSize(20).fillColor(COLOR.white).text("КУНЛИК ТЕРИМ", M, 14, { lineBreak: false });
  doc.font("regular").fontSize(10).fillColor("#cfe0f2").text(subtitle, M, 38, { lineBreak: false });
  doc.font("bold").fontSize(16).fillColor(COLOR.white).text(formatDate(ctx.report.reportDate), M, 18, { width: pageWidth(doc), align: "right", lineBreak: false });
  doc.y = 74;
}

function footer(doc: Doc, ctx: ExportContext, page: number, pages: number): void {
  const y = doc.page.height - 24;
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.moveTo(M, y - 6).lineTo(doc.page.width - M, y - 6).lineWidth(0.5).strokeColor(COLOR.grid).stroke();
  doc.font("regular").fontSize(7.5).fillColor(COLOR.inkSoft);
  doc.text(
    `Маълумот янгиланди: ${formatDateTime(ctx.report.sourceUpdatedAt ?? ctx.report.generatedAt)}   ·   Ҳисобот яратилди: ${formatDateTime(ctx.report.generatedAt)} (Asia/Tashkent)   ·   Batch #${ctx.batchId}`,
    M,
    y,
    { lineBreak: false }
  );
  doc.text(`${page} / ${pages}`, M, y, { width: pageWidth(doc), align: "right", lineBreak: false });
  doc.page.margins.bottom = bottom;
}

function heading(doc: Doc, text: string, x: number, y: number, w: number): number {
  doc.font("bold").fontSize(11).fillColor(COLOR.ink).text(text, x, y, { width: w, lineBreak: false });
  return y + 18;
}

function tile(doc: Doc, x: number, y: number, w: number, h: number, label: string, value: string, note?: string): void {
  doc.roundedRect(x, y, w, h, 4).fill(COLOR.tile);
  doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text(label, x + 10, y + 8, { width: w - 20, lineBreak: false });
  doc.font("bold").fontSize(17).fillColor(COLOR.ink).text(value, x + 10, y + 21, { width: w - 20, lineBreak: false });
  if (note) doc.font("regular").fontSize(7.5).fillColor(COLOR.muted).text(note, x + 10, y + h - 14, { width: w - 20, lineBreak: false });
}

function legend(doc: Doc, x: number, y: number, items: [string, string][]): void {
  let cx = x;
  doc.font("regular").fontSize(8);
  for (const [label, color] of items) {
    doc.roundedRect(cx, y + 1, 8, 8, 2).fill(color);
    doc.fillColor(COLOR.inkSoft).text(label, cx + 12, y, { lineBreak: false });
    cx += 12 + doc.widthOfString(label) + 14;
  }
}

/** Nice axis maximum and tick step for 0..max. */
function niceScale(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  return { top: Math.ceil(max / step) * step, step };
}

/** Vertical bar segment with only its top (data end) rounded. */
function vBar(doc: Doc, x: number, yTop: number, w: number, h: number, color: string, roundTop: boolean): void {
  if (h <= 0) return;
  const r = roundTop ? Math.min(3, w / 2, h) : 0;
  doc.moveTo(x, yTop + h).lineTo(x, yTop + r);
  if (r) doc.quadraticCurveTo(x, yTop, x + r, yTop).lineTo(x + w - r, yTop).quadraticCurveTo(x + w, yTop, x + w, yTop + r);
  else doc.lineTo(x + w, yTop);
  doc.lineTo(x + w, yTop + h).closePath().fill(color);
}

/** Horizontal bar segment with only its right (data end) rounded. */
function hBar(doc: Doc, x: number, y: number, w: number, h: number, color: string, roundEnd: boolean): void {
  if (w <= 0) return;
  const r = roundEnd ? Math.min(3, h / 2, w) : 0;
  doc.moveTo(x, y).lineTo(x + w - r, y);
  if (r) doc.quadraticCurveTo(x + w, y, x + w, y + r).lineTo(x + w, y + h - r).quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  else doc.lineTo(x + w, y + h);
  doc.lineTo(x, y + h).closePath().fill(color);
}

function dailyChart(doc: Doc, ctx: ExportContext, x: number, y: number, w: number, h: number): void {
  const days = ctx.report.daily;
  y = heading(doc, "Кунлик терим динамикаси, т", x, y, w);
  legend(doc, x, y - 2, [["Қўл терими", COLOR.hand], ["Машина терими", COLOR.machine]]);
  y += 16;
  const axisW = 34;
  const plotX = x + axisW;
  const plotW = w - axisW;
  const plotH = h - 50;
  const { top, step } = niceScale(Math.max(...days.map((d) => d.totalKg / 1000), 0));
  doc.font("regular").fontSize(7).fillColor(COLOR.muted);
  for (let v = 0; v <= top + 1e-9; v += step) {
    const gy = y + plotH - (v / top) * plotH;
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(COLOR.grid).stroke();
    doc.fillColor(COLOR.muted).text(formatNumber(v, 0), x, gy - 4, { width: axisW - 6, align: "right", lineBreak: false });
  }
  const slot = plotW / Math.max(days.length, 1);
  const bw = Math.min(28, slot * 0.62);
  const labelEvery = days.length > 16 ? Math.ceil(days.length / 12) : 1;
  days.forEach((d, i) => {
    const bx = plotX + i * slot + (slot - bw) / 2;
    const hH = (d.handKg / 1000 / top) * plotH;
    const mH = (d.machineKg / 1000 / top) * plotH;
    const gap = hH > 0 && mH > 0 ? 1 : 0; // surface gap between stacked fills
    vBar(doc, bx, y + plotH - hH, bw, hH, COLOR.hand, mH === 0);
    vBar(doc, bx, y + plotH - hH - mH - gap, bw, Math.max(mH - gap, 0), COLOR.machine, true);
    if (i % labelEvery === 0) {
      doc.font("regular").fontSize(7).fillColor(COLOR.inkSoft).text(formatDate(d.date).slice(0, 5), bx - 6, y + plotH + 4, { width: bw + 12, align: "center", lineBreak: false });
    }
  });
  // Direct label on the report date only (selective, not every bar).
  const last = days.findIndex((d) => d.date === ctx.report.reportDate);
  const li = last >= 0 ? last : days.length - 1;
  const ld = days[li];
  if (ld) {
    const bx = plotX + li * slot + slot / 2;
    const by = y + plotH - (ld.totalKg / 1000 / top) * plotH;
    doc.font("bold").fontSize(8).fillColor(COLOR.ink).text(formatNumber(ld.totalKg / 1000, 1), bx - 30, by - 12, { width: 60, align: "center", lineBreak: false });
  }
  doc.moveTo(plotX, y + plotH).lineTo(plotX + plotW, y + plotH).lineWidth(0.8).strokeColor(COLOR.muted).stroke();
}

function shareChart(doc: Doc, ctx: ExportContext, x: number, y: number, w: number): void {
  const k = ctx.report.kpi;
  y = heading(doc, "Қўл ва машина терими улуши", x, y, w);
  legend(doc, x, y - 2, [["Қўл", COLOR.hand], ["Машина", COLOR.machine]]);
  y += 20;
  const rows: [string, number, number][] = [
    [`Бугун (${formatDate(ctx.report.reportDate).slice(0, 5)})`, k.todayHandKg, k.todayMachineKg],
    ["Мавсум бўйича", k.seasonHandKg, k.seasonMachineKg]
  ];
  for (const [label, hand, machine] of rows) {
    const total = hand + machine;
    doc.font("regular").fontSize(8.5).fillColor(COLOR.inkSoft).text(`${label}: ${tons(total)}`, x, y, { lineBreak: false });
    y += 13;
    const barH = 20;
    if (total > 0) {
      const hw = (hand / total) * w;
      const mw = w - hw;
      hBar(doc, x, y, Math.max(hw - (mw > 0 ? 1 : 0), 0), barH, COLOR.hand, mw === 0);
      hBar(doc, x + hw + (hw > 0 ? 1 : 0), y, Math.max(mw - (hw > 0 ? 1 : 0), 0), barH, COLOR.machine, true);
      doc.font("bold").fontSize(8.5).fillColor(COLOR.white);
      if (hw > 60) doc.text(`${formatNumber((hand / total) * 100, 1)}% · ${tons(hand)}`, x + 6, y + 6, { width: hw - 10, lineBreak: false });
      if (mw > 60) doc.text(`${formatNumber((machine / total) * 100, 1)}% · ${tons(machine)}`, x + hw + 6, y + 6, { width: mw - 10, align: "right", lineBreak: false });
    } else {
      doc.rect(x, y, w, barH).fill(COLOR.tile);
      doc.font("regular").fontSize(8).fillColor(COLOR.muted).text("Терим йўқ", x + 6, y + 6, { lineBreak: false });
    }
    y += barH + 16;
  }
}

/** Horizontal ranked bars; `segments` stack left→right with a 1pt surface gap. */
function rankedBars(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: { label: string; segments: { value: number; color: string }[]; valueLabel: string }[],
  legendItems?: [string, string][]
): number {
  y = heading(doc, title, x, y, w);
  if (legendItems) {
    legend(doc, x, y - 2, legendItems);
    y += 16;
  }
  const labelW = Math.min(150, w * 0.38);
  const valueW = 58;
  const barW = w - labelW - valueW - 8;
  const max = Math.max(...rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0)), 1);
  const rowH = 15;
  for (const r of rows) {
    doc.font("regular").fontSize(8).fillColor(COLOR.ink).text(r.label, x, y + 3, { width: labelW - 6, height: rowH - 4, ellipsis: true });
    let cx = x + labelW;
    const nonZero = r.segments.filter((s) => s.value > 0);
    nonZero.forEach((s, i) => {
      const sw = (s.value / max) * barW;
      const isLast = i === nonZero.length - 1;
      hBar(doc, cx, y + 2, Math.max(sw - (isLast ? 0 : 1), 0.5), rowH - 5, s.color, isLast);
      cx += sw;
    });
    doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text(r.valueLabel, cx + 4, y + 3, { width: valueW + 8, lineBreak: false });
    y += rowH;
  }
  if (rows.length === 0) {
    doc.font("regular").fontSize(8).fillColor(COLOR.muted).text("Маълумот йўқ", x, y, { lineBreak: false });
    y += rowH;
  }
  return y;
}

function table(doc: Doc, x: number, y: number, cols: { label: string; w: number; align?: "left" | "right" }[], rows: string[][]): number {
  const rowH = 14;
  doc.rect(x, y, cols.reduce((a, c) => a + c.w, 0), rowH).fill(COLOR.brand);
  let cx = x;
  doc.font("bold").fontSize(7.5).fillColor(COLOR.white);
  for (const c of cols) {
    doc.text(c.label, cx + 4, y + 3.5, { width: c.w - 8, align: c.align ?? "left", lineBreak: false });
    cx += c.w;
  }
  y += rowH;
  rows.forEach((row, ri) => {
    if (ri % 2 === 1) doc.rect(x, y, cols.reduce((a, c) => a + c.w, 0), rowH).fill(COLOR.tile);
    cx = x;
    doc.font("regular").fontSize(7.5).fillColor(COLOR.ink);
    row.forEach((cell, i) => {
      const c = cols[i]!;
      doc.text(cell, cx + 4, y + 3.5, { width: c.w - 8, height: rowH - 4, align: c.align ?? "left", ellipsis: true });
      cx += c.w;
    });
    y += rowH;
  });
  return y + 6;
}

function page1(doc: Doc, ctx: ExportContext): void {
  const k = ctx.report.kpi;
  header(doc, ctx, `Hazorasp-Textil · пахта терими оператив ҳисоботи · ${formatDate(ctx.report.days[0])} — ${formatDate(ctx.report.reportDate)}`);
  const w = pageWidth(doc);
  const gap = 8;
  const tw = (w - gap * 3) / 4;
  const th = 58;
  const tilesTop = doc.y;
  const tiles: [string, string, string?][] = [
    ["Бугунги терим", tons(k.todayTotalKg), `мавсум: ${tons(k.seasonTotalKg)}`],
    ["Қўл терими (бугун)", tons(k.todayHandKg), `мавсум: ${tons(k.seasonHandKg)}`],
    ["Машина терими (бугун)", tons(k.todayMachineKg), `мавсум: ${tons(k.seasonMachineKg)}`],
    ["Фермерлар", String(k.farmersWithHarvest), `бугун топширган: ${k.farmersToday} · шартномалар: ${k.contracts}`],
    ["Бугунги тўлов", mln(k.paidToday), `жами: ${mln(k.paidTotal)}`],
    [`Терим пули қолдиғи (${PICKING_MONEY_SHARE_PCT}%)`, mln(k.pickingBalance), `${PICKING_MONEY_SHARE_PCT}% − ўтказилган маблағ`],
    ["РКП: свободные средства", mln(k.rkpFreeBalance), "корхона ҳисоблари"],
    ["Отгрузка", tons(k.shippedKg), `${k.shipmentDeals} битим · ${mln(k.shippedValue)}`]
  ];
  tiles.forEach(([label, value, note], i) => tile(doc, M + (i % 4) * (tw + gap), tilesTop + Math.floor(i / 4) * (th + gap), tw, th, label, value, note));
  const top = tilesTop + 2 * (th + gap) + 10;
  const leftW = w * 0.62;
  dailyChart(doc, ctx, M, top, leftW, doc.page.height - top - 40);
  shareChart(doc, ctx, M + leftW + 24, top, w - leftW - 24);
}

function page2(doc: Doc, ctx: ExportContext): void {
  const r = ctx.report;
  header(doc, ctx, "Ҳудудлар, фермерлар ва отгрузка");
  const w = pageWidth(doc);
  const colW = (w - 24) / 2;
  const y0 = doc.y;

  const hudud = [...r.hudud].filter((h) => h.totalKg > 0).sort((a, b) => b.totalKg - a.totalKg);
  const yl = rankedBars(
    doc,
    M,
    y0,
    colW,
    "Ҳудудлар бўйича терим (мавсум), т",
    hudud.map((h) => ({ label: h.hudud, segments: [{ value: h.totalKg, color: COLOR.hand }], valueLabel: formatNumber(h.totalKg / 1000, 1) }))
  );

  // The cluster's own farm is an order of magnitude larger than any farmer and
  // would flatten every other bar; it is shown in the ҳудуд chart instead.
  const top = [...r.lines].filter((l) => l.total.handKg + l.total.machineKg > 0 && !/кластер/i.test(l.section)).sort((a, b) => b.total.handKg + b.total.machineKg - (a.total.handKg + a.total.machineKg)).slice(0, 12);
  rankedBars(
    doc,
    M,
    yl + 14,
    colW,
    "Энг кўп топширган 12 фермер (мавсум, кластерсиз), т",
    top.map((l) => ({
      label: l.displayName,
      segments: [{ value: l.total.handKg, color: COLOR.hand }, { value: l.total.machineKg, color: COLOR.machine }],
      valueLabel: formatNumber((l.total.handKg + l.total.machineKg) / 1000, 1)
    })),
    [["Қўл", COLOR.hand], ["Машина", COLOR.machine]]
  );

  const deals = [...r.shipmentFarmers].slice(0, 14);
  const yr = rankedBars(
    doc,
    M + colW + 24,
    y0,
    colW,
    "Отгрузка ва битим миқдори (энг кўп отгрузка), т",
    deals.flatMap((f) => [
      { label: f.name, segments: [{ value: f.dealQtyKg, color: COLOR.machine }], valueLabel: `${formatNumber(f.dealQtyKg / 1000, 1)}` },
      { label: "", segments: [{ value: f.shippedKg, color: COLOR.hand }], valueLabel: `${formatNumber(f.shippedKg / 1000, 1)}` }
    ]),
    [["Кол-во сделки", COLOR.machine], ["Кол-во отгрузки", COLOR.hand]]
  );
  doc.font("regular").fontSize(7).fillColor(COLOR.muted).text(
    "Изоҳ: «Кол-во сделки − отгрузка» қолдиқ сифатида тасдиқланмаган (BUSINESS_RULE_REQUIRED) — миқдорлар фақат ёнма-ён кўрсатилган.",
    M + colW + 24,
    yr + 4,
    { width: colW }
  );
}

function page3(doc: Doc, ctx: ExportContext): void {
  const r = ctx.report;
  header(doc, ctx, "Маълумотлар сифати, тўловлар ва ҳудудлар жадвали");
  const w = pageWidth(doc);
  const gap = 8;
  const tw = (w - gap * 4) / 5;
  const y0 = doc.y;
  const dq: [string, number, string][] = [
    ["Critical", ctx.dq.critical, COLOR.critical],
    ["Warning", ctx.dq.warning, COLOR.warning],
    ["Info", ctx.dq.info, COLOR.inkSoft],
    ["Valid (basket)", ctx.dq.valid, COLOR.good],
    ["Тортилмаган", ctx.dq.pending, COLOR.inkSoft]
  ];
  dq.forEach(([label, n, color], i) => {
    const x = M + i * (tw + gap);
    doc.roundedRect(x, y0, tw, 44, 4).fill(COLOR.tile);
    doc.circle(x + 14, y0 + 14, 4).fill(color);
    doc.font("regular").fontSize(8).fillColor(COLOR.inkSoft).text(label, x + 24, y0 + 9, { lineBreak: false });
    doc.font("bold").fontSize(16).fillColor(COLOR.ink).text(formatNumber(n, 0), x + 10, y0 + 22, { lineBreak: false });
  });

  const colW = (w - 24) / 2;
  let yl = heading(doc, "Муаммолар коди бўйича", M, y0 + 58, colW);
  const byCode = new Map<string, { severity: string; n: number; sample: string }>();
  for (const i of ctx.issues) {
    const e = byCode.get(i.code) ?? { severity: i.severity, n: 0, sample: i.message };
    e.n++;
    byCode.set(i.code, e);
  }
  const order: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const codeRows = [...byCode.entries()].sort((a, b) => (order[a[1].severity] ?? 3) - (order[b[1].severity] ?? 3) || b[1].n - a[1].n).slice(0, 14);
  yl = table(
    doc,
    M,
    yl,
    [
      { label: "Даража", w: 58 },
      { label: "Код", w: 118 },
      { label: "Сони", w: 36, align: "right" },
      { label: "Мисол", w: colW - 212 }
    ],
    codeRows.map(([code, e]) => [e.severity, code, String(e.n), e.sample])
  );

  const xr = M + colW + 24;
  let yr = heading(doc, "Тўловлар ва РКП", xr, y0 + 58, colW);
  yr = table(
    doc,
    xr,
    yr,
    [
      { label: "Кўрсаткич", w: colW - 130 },
      { label: "Сумма, сўм", w: 130, align: "right" }
    ],
    [
      [`Бугунги тўлов (${formatDate(r.reportDate)})`, formatSum(r.kpi.paidToday)],
      ["Жами тўлов (фермерларга, нетто)", formatSum(r.kpi.paidTotal)],
      [`${PICKING_MONEY_SHARE_PCT} % суммаси (жами)`, formatSum(r.grand.sum20)],
      ["Терим пули учун қолдиқ", formatSum(r.kpi.pickingBalance)],
      ["РКП: Свободные средства", formatSum(r.accountTotals.FREE)],
      ["РКП: Блокированные средства", formatSum(r.accountTotals.BLOCKED)],
      ["РКП: В пути", formatSum(r.accountTotals.IN_TRANSIT)]
    ]
  );
  yr = heading(doc, "Ҳудудлар", xr, yr + 6, colW);
  table(
    doc,
    xr,
    yr,
    [
      { label: "Ҳудуд", w: colW - 200 },
      { label: "Фермер", w: 50, align: "right" },
      { label: "Бугун, т", w: 70, align: "right" },
      { label: "Мавсум, т", w: 80, align: "right" }
    ],
    [...r.hudud].map((h) => [h.hudud, String(h.farmers), formatNumber(h.todayKg / 1000, 1), formatNumber(h.totalKg / 1000, 1)])
  );
}

export function exportPdf(ctx: ExportContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: M, bufferPages: true, info: { Title: `Кунлик терим ${formatDate(ctx.report.reportDate)}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("regular", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);

    const pages = [page1, page2, page3];
    pages.forEach((render, i) => {
      if (i > 0) doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.surface);
      render(doc, ctx);
    });
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      footer(doc, ctx, i + 1, range.count);
    }
    doc.end();
  });
}
