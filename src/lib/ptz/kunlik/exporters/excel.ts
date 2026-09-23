// ExcelExporter — Кунлик_терим_YYYY-MM-DD.xlsx.
//
// Every cell is a value computed by calculation.ts; the workbook contains no
// formulas at all, so #REF!/#VALUE!/#DIV/0! cannot appear (the hand-made
// report broke exactly because its formulas pointed at deleted sheets).
// Sheet 1 keeps the hand-made report's layout and units (tons, thousand so'm);
// the analytical sheets use so'm.
import ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import { SHIPMENT_REMAINING_RULE_CONFIRMED, PICKING_MONEY_SHARE_PCT } from "../config.ts";
import { tiyinToSum, tiyinToThousand } from "../utils/numbers.ts";
import { formatDate, formatDateTime } from "../utils/dates.ts";
import { SOURCE_LABELS } from "../classifier.ts";
import type { DayCell, LayoutRow, Totals } from "../calculation.ts";
import type { ExportContext } from "../service.ts";

const C = {
  navy: "FF0B315F",
  navyText: "FFFFFFFF",
  headerFill: "FFDCE6F0",
  hududFill: "FFEEF3F7",
  subtotalFill: "FFF3F6E8",
  sectionFill: "FFE3ECD0",
  grandFill: "FFC9DDA8",
  critical: "FFF8D7D7",
  warning: "FFFCEFD2",
  info: "FFE8F0F8",
  border: "FFB7C4D1"
};

const FMT = {
  tons: "#,##0.000",
  kg: "#,##0.00",
  money: "#,##0.00;[Red]-#,##0.00",
  pct: "0.0",
  int: "#,##0"
};

const thin = { style: "thin" as const, color: { argb: C.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const FONT = "Arial";

function fill(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

function styleHeaderCell(cell: ExcelJS.Cell): void {
  cell.font = { name: FONT, bold: true, size: 9, color: { argb: C.navyText } };
  cell.fill = fill(C.navy);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = BORDER;
}

/** Flat table with frozen header, autofilter and an optional bold totals row. */
function writeTable<T>(
  ws: Worksheet,
  startRow: number,
  cols: { header: string; width: number; fmt?: string; value: (row: T) => unknown }[],
  rows: T[],
  totals?: Record<number, unknown> & { label?: string }
): number {
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (!col.width || col.width < c.width) col.width = c.width;
    styleHeaderCell(ws.getRow(startRow).getCell(i + 1));
    ws.getRow(startRow).getCell(i + 1).value = c.header;
  });
  ws.getRow(startRow).height = 32;
  let r = startRow + 1;
  for (const row of rows) {
    const xr = ws.getRow(r);
    cols.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      cell.value = c.value(row) as ExcelJS.CellValue;
      cell.font = { name: FONT, size: 9 };
      cell.border = BORDER;
      if (c.fmt) cell.numFmt = c.fmt;
    });
    r++;
  }
  if (rows.length) ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: r - 1, column: cols.length } };
  if (totals) {
    const xr = ws.getRow(r);
    xr.getCell(1).value = totals.label ?? "Жами";
    cols.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      if (i in totals) cell.value = totals[i] as ExcelJS.CellValue;
      cell.font = { name: FONT, size: 9, bold: true };
      cell.fill = fill(C.grandFill);
      cell.border = BORDER;
      if (c.fmt) cell.numFmt = c.fmt;
    });
    r++;
  }
  return r;
}

function pageSetup(ws: Worksheet, printTitlesRow?: string, paper: "A4" | "A3" = "A4"): void {
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: (paper === "A3" ? 8 : 9) as ExcelJS.PaperSize,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    ...(printTitlesRow ? { printTitlesRow } : {})
  };
}

function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d},${m},${y!.slice(2)} й`;
}

// ---------------------------------------------------------------------------
// Sheet 1 — Кунлик терим (layout of the hand-made report)

function writeKunlikSheet(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const { report } = ctx;
  const ws = wb.addWorksheet("Кунлик терим", { views: [{ state: "frozen", xSplit: 3, ySplit: 8 }] });
  const days = report.days;
  const DAY0 = 4;
  const TOTAL0 = DAY0 + days.length * 6;
  const PAID0 = TOTAL0 + 7;
  const BAL = PAID0 + 2;
  const lastCol = BAL;

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 10;
  for (let c = 4; c <= lastCol; c++) ws.getColumn(c).width = 11;

  ws.mergeCells(2, 1, 2, Math.min(lastCol, 30));
  const title = ws.getCell(2, 1);
  title.value = 'Хазорасп туманидаги фермер хўжаликларининг пахта ҳосили бўйича "HAZORASP TEXTIL" MCHJ га топширилган пахта хом-ашёлари тўғрисида';
  title.font = { name: FONT, bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, Math.min(lastCol, 30));
  ws.getCell(3, 1).value = "МАЪЛУМОТ";
  ws.getCell(3, 1).font = { name: FONT, bold: true, size: 12 };
  ws.getCell(3, 1).alignment = { horizontal: "center" };
  ws.getCell(4, 2).value = "Вазн — тонна, сумма — минг сўм";
  ws.getCell(4, 2).font = { name: FONT, italic: true, size: 9, color: { argb: "FF40546B" } };
  ws.mergeCells(4, lastCol - 2, 4, lastCol);
  const [y, m, d] = report.reportDate.split("-");
  ws.getCell(4, lastCol - 2).value = `${d},${m},${y} йил СОАТ ${report.generatedAt.slice(11, 16)} га`;
  ws.getCell(4, lastCol - 2).font = { name: FONT, bold: true, size: 10 };
  ws.getCell(4, lastCol - 2).alignment = { horizontal: "right" };

  const head = (r1: number, c1: number, r2: number, c2: number, text: string) => {
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
    const cell = ws.getCell(r1, c1);
    cell.value = text;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) styleHeaderCell(ws.getCell(r, c));
  };
  head(5, 1, 8, 1, "№");
  head(5, 2, 8, 2, "Фермер хўжаликлар номи");
  head(5, 3, 8, 3, "Режа, т");
  days.forEach((day, i) => {
    const c = DAY0 + i * 6;
    head(5, c, 6, c + 5, ddmmyy(day));
    head(7, c, 8, c, "Кул терим");
    head(7, c + 1, 8, c + 1, "100 % суммаси");
    head(7, c + 2, 8, c + 2, "Машин терим");
    head(7, c + 3, 8, c + 3, "100 % суммаси");
    head(7, c + 4, 7, c + 5, "Жами");
    head(8, c + 4, 8, c + 4, "Кг");
    head(8, c + 5, 8, c + 5, "100 % суммаси");
  });
  head(5, TOTAL0, 6, TOTAL0 + 6, "Хаммаси");
  head(7, TOTAL0, 8, TOTAL0, "Кул терим");
  head(7, TOTAL0 + 1, 8, TOTAL0 + 1, "100 % суммаси");
  head(7, TOTAL0 + 2, 8, TOTAL0 + 2, "Машин терим");
  head(7, TOTAL0 + 3, 8, TOTAL0 + 3, "100 % суммаси");
  head(7, TOTAL0 + 4, 7, TOTAL0 + 6, "Жами");
  head(8, TOTAL0 + 4, 8, TOTAL0 + 4, "Кг");
  head(8, TOTAL0 + 5, 8, TOTAL0 + 5, "100 % суммаси");
  head(8, TOTAL0 + 6, 8, TOTAL0 + 6, `${PICKING_MONEY_SHARE_PCT} % суммаси`);
  head(5, PAID0, 7, PAID0 + 1, "Терим учун утказилган маблаг");
  head(8, PAID0, 8, PAID0, "Бир кунда");
  head(8, PAID0 + 1, 8, PAID0 + 1, "Жами");
  head(5, BAL, 8, BAL, "Терим пули учун колдик");

  const t = (kg: number) => kg / 1000;
  const k = (tiyin: bigint) => tiyinToThousand(tiyin);

  function writeFigures(r: number, x: Totals, style: { bold?: boolean; fillArgb?: string }): void {
    const row = ws.getRow(r);
    const put = (c: number, v: number, fmt: string) => {
      const cell = row.getCell(c);
      cell.value = v;
      cell.numFmt = fmt;
    };
    put(3, x.planT, FMT.tons);
    days.forEach((day, i) => {
      const cell: DayCell = x.days.get(day) ?? { handKg: 0, handSum: 0n, machineKg: 0, machineSum: 0n };
      const c = DAY0 + i * 6;
      put(c, t(cell.handKg), FMT.tons);
      put(c + 1, k(cell.handSum), FMT.money);
      put(c + 2, t(cell.machineKg), FMT.tons);
      put(c + 3, k(cell.machineSum), FMT.money);
      put(c + 4, t(cell.handKg + cell.machineKg), FMT.tons);
      put(c + 5, k(cell.handSum + cell.machineSum), FMT.money);
    });
    put(TOTAL0, t(x.total.handKg), FMT.tons);
    put(TOTAL0 + 1, k(x.total.handSum), FMT.money);
    put(TOTAL0 + 2, t(x.total.machineKg), FMT.tons);
    put(TOTAL0 + 3, k(x.total.machineSum), FMT.money);
    put(TOTAL0 + 4, t(x.total.handKg + x.total.machineKg), FMT.tons);
    put(TOTAL0 + 5, k(x.sum100), FMT.money);
    put(TOTAL0 + 6, k(x.sum20), FMT.money);
    put(PAID0, k(x.paidToday), FMT.money);
    put(PAID0 + 1, k(x.paidTotal), FMT.money);
    put(BAL, k(x.pickingBalance), FMT.money);
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 9, bold: !!style.bold };
      cell.border = BORDER;
      if (style.fillArgb) cell.fill = fill(style.fillArgb);
    }
  }

  let r = 9;
  for (const item of report.layout as LayoutRow[]) {
    if (item.kind === "header") {
      const cell = ws.getCell(r, 2);
      cell.value = item.label;
      for (let c = 1; c <= lastCol; c++) {
        ws.getCell(r, c).fill = fill(C.hududFill);
        ws.getCell(r, c).border = BORDER;
      }
      cell.font = { name: FONT, size: 10, bold: true, italic: true };
    } else if (item.kind === "farmer") {
      writeFigures(r, item.line, {});
      ws.getCell(r, 1).value = item.line.numberInBlock;
      ws.getCell(r, 2).value = item.line.displayName;
    } else {
      const fillArgb = item.level === "grand" ? C.grandFill : item.level === "section" ? C.sectionFill : C.subtotalFill;
      writeFigures(r, item.totals, { bold: true, fillArgb });
      ws.getCell(r, 1).value = item.totals.farmerCount;
      ws.getCell(r, 2).value = item.label;
    }
    r++;
  }
  pageSetup(ws, "5:8", "A3");
}

// ---------------------------------------------------------------------------

function writeFarmersSheet(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const ws = wb.addWorksheet("Фермерлар", { views: [{ state: "frozen", xSplit: 4, ySplit: 1 }] });
  const lines = ctx.report.lines;
  type L = (typeof lines)[number];
  const kgT = (kg: number) => kg / 1000;
  const cols: { header: string; width: number; fmt?: string; value: (l: L) => unknown }[] = [
    { header: "№", width: 5, value: (l) => lines.indexOf(l) + 1 },
    { header: "Бўлим", width: 18, value: (l) => l.section },
    { header: "Ҳудуд", width: 18, value: (l) => l.hudud },
    { header: "Фермер", width: 32, value: (l) => l.displayName },
    { header: "Basket номи", width: 34, value: (l) => l.basketName },
    { header: "ИНН", width: 12, value: (l) => l.inn },
    { header: "Шартномалар", width: 16, value: (l) => l.contracts.join(", ") },
    { header: "Шартнома тури", width: 14, value: (l) => l.contractTypes.join(", ") },
    { header: "Режа, т", width: 11, fmt: FMT.tons, value: (l) => l.planT },
    { header: "Бугун қўл, т", width: 11, fmt: FMT.tons, value: (l) => kgT(l.today.handKg) },
    { header: "Бугун машина, т", width: 11, fmt: FMT.tons, value: (l) => kgT(l.today.machineKg) },
    { header: "Бугун жами, т", width: 11, fmt: FMT.tons, value: (l) => kgT(l.today.handKg + l.today.machineKg) },
    { header: "Жами қўл, т", width: 11, fmt: FMT.tons, value: (l) => kgT(l.total.handKg) },
    { header: "Жами машина, т", width: 11, fmt: FMT.tons, value: (l) => kgT(l.total.machineKg) },
    { header: "Жами терим, т", width: 11, fmt: FMT.tons, value: (l) => kgT(l.total.handKg + l.total.machineKg) },
    { header: "Бажарилиш, %", width: 10, fmt: FMT.pct, value: (l) => (l.achievementPct == null ? null : Math.round(l.achievementPct * 10) / 10) },
    { header: "100 % суммаси, сўм", width: 16, fmt: FMT.money, value: (l) => tiyinToSum(l.sum100) },
    { header: `${PICKING_MONEY_SHARE_PCT} % суммаси, сўм`, width: 15, fmt: FMT.money, value: (l) => tiyinToSum(l.sum20) },
    { header: "Бугунги тўлов, сўм", width: 15, fmt: FMT.money, value: (l) => tiyinToSum(l.paidToday) },
    { header: "Тўланган жами, сўм", width: 15, fmt: FMT.money, value: (l) => tiyinToSum(l.paidTotal) },
    { header: "Терим пули қолдиғи, сўм", width: 16, fmt: FMT.money, value: (l) => tiyinToSum(l.pickingBalance) },
    { header: "Отгрузка, кг", width: 12, fmt: FMT.kg, value: (l) => l.shippedKg },
    { header: "Маълумотнома", width: 16, value: (l) => (l.directoryMatch ? `${l.directoryMatch.method}${l.directoryMatch.confidence != null ? ` (${l.directoryMatch.confidence})` : ""}` : "йўқ") }
  ];
  const g = ctx.report.grand;
  writeTable(ws, 1, cols, lines, {
    label: "Хаммаси",
    8: g.planT,
    9: kgT(g.today.handKg),
    10: kgT(g.today.machineKg),
    11: kgT(g.today.handKg + g.today.machineKg),
    12: kgT(g.total.handKg),
    13: kgT(g.total.machineKg),
    14: kgT(g.total.handKg + g.total.machineKg),
    16: tiyinToSum(g.sum100),
    17: tiyinToSum(g.sum20),
    18: tiyinToSum(g.paidToday),
    19: tiyinToSum(g.paidTotal),
    20: tiyinToSum(g.pickingBalance),
    21: g.shippedKg
  });
  pageSetup(ws, "1:1");
}

function writeDynamicsSheet(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const ws = wb.addWorksheet("Динамика", { views: [{ state: "frozen", ySplit: 1 }] });
  const rows = ctx.report.daily;
  type D = (typeof rows)[number];
  const cols: { header: string; width: number; fmt?: string; value: (d: D) => unknown }[] = [
    { header: "Сана", width: 12, value: (d) => formatDate(d.date) },
    { header: "Қўл терими, т", width: 14, fmt: FMT.tons, value: (d) => d.handKg / 1000 },
    { header: "Машина терими, т", width: 14, fmt: FMT.tons, value: (d) => d.machineKg / 1000 },
    { header: "Жами, т", width: 12, fmt: FMT.tons, value: (d) => d.totalKg / 1000 },
    { header: "Ўсиб борувчи жами, т", width: 16, fmt: FMT.tons, value: (d) => d.cumulativeKg / 1000 },
    { header: "Қўл, %", width: 9, fmt: FMT.pct, value: (d) => (d.totalKg ? Math.round((d.handKg / d.totalKg) * 1000) / 10 : null) },
    { header: "Қўл суммаси, сўм", width: 18, fmt: FMT.money, value: (d) => tiyinToSum(d.handSum) },
    { header: "Машина суммаси, сўм", width: 18, fmt: FMT.money, value: (d) => tiyinToSum(d.machineSum) },
    { header: "Жами сумма, сўм", width: 18, fmt: FMT.money, value: (d) => tiyinToSum(d.totalSum) }
  ];
  const k = ctx.report.kpi;
  const g = ctx.report.grand;
  writeTable(ws, 1, cols, rows, {
    label: "Жами",
    1: k.seasonHandKg / 1000,
    2: k.seasonMachineKg / 1000,
    3: k.seasonTotalKg / 1000,
    6: tiyinToSum(g.total.handSum),
    7: tiyinToSum(g.total.machineSum),
    8: tiyinToSum(g.sum100)
  });
  pageSetup(ws, "1:1");
}

function writePaymentsSheet(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const ws = wb.addWorksheet("Тўловлар");
  const { report } = ctx;
  ws.getCell("A1").value = "ТЎЛОВЛАР ВА РКП ҚОЛДИҚЛАРИ";
  ws.getCell("A1").font = { name: FONT, bold: true, size: 12 };
  const kv: [string, number, string][] = [
    [`Бугунги тўлов (${formatDate(report.reportDate)}), сўм`, tiyinToSum(report.kpi.paidToday), FMT.money],
    ["Жами тўлов (фермерлар, нетто), сўм", tiyinToSum(report.kpi.paidTotal), FMT.money],
    ["Корхона қаторлари (блоклаш/қайтариш): дебет, сўм", tiyinToSum(report.ownerLegs.debit), FMT.money],
    ["Корхона қаторлари: кредит, сўм", tiyinToSum(report.ownerLegs.credit), FMT.money],
    ["РКП: Свободные средства, сўм", tiyinToSum(report.accountTotals.FREE), FMT.money],
    ["РКП: Блокированные средства, сўм", tiyinToSum(report.accountTotals.BLOCKED), FMT.money],
    ["РКП: Денежные средства в пути, сўм", tiyinToSum(report.accountTotals.IN_TRANSIT), FMT.money]
  ];
  kv.forEach(([label, value, fmt], i) => {
    ws.getCell(3 + i, 1).value = label;
    ws.getCell(3 + i, 1).font = { name: FONT, size: 9 };
    ws.getCell(3 + i, 4).value = value;
    ws.getCell(3 + i, 4).numFmt = fmt;
    ws.getCell(3 + i, 4).font = { name: FONT, size: 9, bold: true };
  });

  let r = 3 + kv.length + 1;
  ws.getCell(r, 1).value = "РКП ҲИСОБЛАРИ";
  ws.getCell(r, 1).font = { name: FONT, bold: true, size: 10 };
  const accts = report.accounts;
  type A = (typeof accts)[number];
  r = writeTable<A>(ws, r + 1, [
    { header: "Счет РКП", width: 24, value: (a) => a.bankAccount },
    { header: "Л/с", width: 30, value: (a) => a.account },
    { header: "Наим. л/с", width: 30, value: (a) => a.accountName },
    { header: "Баланс, сўм", width: 18, fmt: FMT.money, value: (a) => tiyinToSum(a.balance) },
    { header: "Эгаси", width: 12, value: (a) => (a.ownerKind === "OWNER" ? "Корхона" : a.ownerKind === "FARMER" ? "Фермер" : "Аниқланмаган") },
    { header: "ИНН", width: 12, value: (a) => a.ownerInn },
    { header: "Боғланиш", width: 12, value: (a) => `${a.match} (${a.confidence})` }
  ], accts);

  r += 1;
  ws.getCell(r, 1).value = "ФЕРМЕРЛАРГА ЎТКАЗМАЛАР (выписка қаторлари)";
  ws.getCell(r, 1).font = { name: FONT, bold: true, size: 10 };
  const pays = report.payments;
  type P = (typeof pays)[number];
  writeTable<P>(
    ws,
    r + 1,
    [
      { header: "Сана/вақт", width: 17, value: (p) => formatDateTime(p.opDateTime) },
      { header: "ID транзакции", width: 13, value: (p) => p.txId },
      { header: "Контрагент", width: 30, value: (p) => p.counterpartyName },
      { header: "ИНН", width: 12, value: (p) => p.counterpartyInn },
      { header: "Битим №", width: 10, value: (p) => p.dealNumber },
      { header: "С/ф №", width: 9, value: (p) => p.invoiceNo },
      { header: "Дебет, сўм", width: 16, fmt: FMT.money, value: (p) => tiyinToSum(p.debit) },
      { header: "Кредит, сўм", width: 16, fmt: FMT.money, value: (p) => tiyinToSum(p.credit) },
      { header: "Нетто, сўм", width: 16, fmt: FMT.money, value: (p) => tiyinToSum(p.net) },
      { header: "Қайтариш", width: 9, value: (p) => (p.isReversal ? "ҳа" : "") },
      { header: "Фермер (ҳисобот)", width: 28, value: (p) => p.farmerDisplayName },
      { header: "Боғланиш", width: 11, value: (p) => p.match.method },
      { header: "Ишонч", width: 7, value: (p) => p.match.confidence },
      { header: "Детали", width: 60, value: (p) => p.details }
    ],
    pays,
    {
      label: "Жами",
      6: tiyinToSum(pays.reduce((a, p) => a + p.debit, 0n)),
      7: tiyinToSum(pays.reduce((a, p) => a + p.credit, 0n)),
      8: tiyinToSum(pays.reduce((a, p) => a + p.net, 0n))
    }
  );
  pageSetup(ws);
}

function writeShipmentSheets(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const { report } = ctx;
  const note = SHIPMENT_REMAINING_RULE_CONFIRMED
    ? null
    : "BUSINESS_RULE_REQUIRED: «Кол-во сделки − Кол-во отгрузки» қолдиқ сифатида тасдиқланмаган — миқдорлар ёнма-ён кўрсатилган, фарқ ҳисобланмаган. «Стоимость доставки» манбада отгрузка қиймати (миқдор × нарх).";

  const raw = wb.addWorksheet("Отгрузки", { views: [{ state: "frozen", ySplit: 1 }] });
  const ships = report.shipments;
  type S = (typeof ships)[number];
  const counted = ships.filter((s) => s.counted);
  writeTable<S>(
    raw,
    1,
    [
      { header: "Номер сделки", width: 11, value: (s) => s.dealNumber },
      { header: "Дата сделки", width: 11, value: (s) => formatDate(s.dealDate) },
      { header: "Номер контракта", width: 11, value: (s) => s.contractNumber },
      { header: "Имя продавца", width: 32, value: (s) => s.sellerName },
      { header: "Фермер (боғланган)", width: 32, value: (s) => s.farmerName },
      { header: "Боғланиш", width: 10, value: (s) => s.match.method },
      { header: "Ишонч", width: 7, value: (s) => s.match.confidence },
      { header: "Брокер продавца", width: 11, value: (s) => s.sellerBroker },
      { header: "Имя покупатель", width: 22, value: (s) => s.buyerName },
      { header: "Брокер покупатель", width: 11, value: (s) => s.buyerBroker },
      { header: "Наименование товара", width: 22, value: (s) => s.productName },
      { header: "Номер документа", width: 10, value: (s) => s.documentNumber },
      { header: "Дата документа", width: 11, value: (s) => formatDate(s.documentDate) },
      { header: "Кол-во отгрузки, кг", width: 13, fmt: FMT.kg, value: (s) => s.shipmentQtyKg },
      { header: "Стоимость доставки, сўм", width: 16, fmt: FMT.money, value: (s) => (s.deliveryCost == null ? null : tiyinToSum(s.deliveryCost)) },
      { header: "Кол-во сделки, кг", width: 13, fmt: FMT.kg, value: (s) => s.dealQtyKg },
      { header: "Сумма сделки, сўм", width: 17, fmt: FMT.money, value: (s) => (s.dealAmount == null ? null : tiyinToSum(s.dealAmount)) },
      { header: "Ед. изм", width: 10, value: (s) => s.unit },
      { header: "Таймер отгрузки", width: 9, value: (s) => s.shipmentTimer },
      { header: "Статус", width: 10, value: (s) => s.status },
      { header: "Статус (манба)", width: 11, value: (s) => s.statusRaw },
      { header: "Ҳисобга кирди", width: 9, value: (s) => (s.counted ? "ҳа" : "йўқ") }
    ],
    ships,
    {
      label: "Жами (ҳисобга кирган)",
      13: counted.reduce((a, s) => a + (s.shipmentQtyKg ?? 0), 0),
      14: tiyinToSum(counted.reduce((a, s) => a + (s.deliveryCost ?? 0n), 0n))
    }
  );
  pageSetup(raw, "1:1");

  const byFarmer = wb.addWorksheet("Отгрузки по фермерам", { views: [{ state: "frozen", ySplit: 1 }] });
  const sf = report.shipmentFarmers;
  type F = (typeof sf)[number];
  let r = writeTable<F>(
    byFarmer,
    1,
    [
      { header: "Фермер", width: 34, value: (f) => f.name },
      { header: "ИНН", width: 12, value: (f) => f.inn },
      { header: "Битимлар", width: 9, fmt: FMT.int, value: (f) => f.deals },
      { header: "Шартнома миқдори (basket), кг", width: 16, fmt: FMT.kg, value: (f) => f.contractQtyKg },
      { header: "Кол-во сделки, кг", width: 14, fmt: FMT.kg, value: (f) => f.dealQtyKg },
      { header: "Қабул (basket), кг", width: 14, fmt: FMT.kg, value: (f) => f.basketAcceptedKg },
      { header: "Кол-во отгрузки, кг", width: 14, fmt: FMT.kg, value: (f) => f.shippedKg },
      { header: "Отгрузка қиймати, сўм", width: 17, fmt: FMT.money, value: (f) => tiyinToSum(f.shippedValue) },
      { header: "Тўланган (нетто), сўм", width: 17, fmt: FMT.money, value: (f) => tiyinToSum(f.paidNet) }
    ],
    sf,
    {
      label: "Жами",
      2: sf.reduce((a, f) => a + f.deals, 0),
      3: sf.reduce((a, f) => a + f.contractQtyKg, 0),
      4: sf.reduce((a, f) => a + f.dealQtyKg, 0),
      5: sf.reduce((a, f) => a + f.basketAcceptedKg, 0),
      6: sf.reduce((a, f) => a + f.shippedKg, 0),
      7: tiyinToSum(sf.reduce((a, f) => a + f.shippedValue, 0n)),
      8: tiyinToSum(sf.reduce((a, f) => a + f.paidNet, 0n))
    }
  );
  if (note) byFarmer.getCell(r + 1, 1).value = note;
  pageSetup(byFarmer, "1:1");

  const byContract = wb.addWorksheet("Отгрузки по контрактам", { views: [{ state: "frozen", ySplit: 1 }] });
  const sc = report.shipmentContracts;
  type K = (typeof sc)[number];
  r = writeTable<K>(
    byContract,
    1,
    [
      { header: "Номер сделки (шартнома)", width: 13, value: (c) => c.dealNumber },
      { header: "Номер контракта (клиринг)", width: 13, value: (c) => c.clearingContracts.join(", ") },
      { header: "Фермер", width: 32, value: (c) => c.farmerName },
      { header: "Имя продавца", width: 32, value: (c) => c.sellerName },
      { header: "ИНН", width: 12, value: (c) => c.farmerInn },
      { header: "Боғланиш", width: 10, value: (c) => `${c.match.method} (${c.match.confidence})` },
      { header: "Шартнома миқдори (basket), кг", width: 15, fmt: FMT.kg, value: (c) => c.contractQtyKg },
      { header: "Кол-во сделки, кг", width: 13, fmt: FMT.kg, value: (c) => c.dealQtyKg },
      { header: "Қабул (basket), кг", width: 13, fmt: FMT.kg, value: (c) => c.basketAcceptedKg },
      { header: "Σ Кол-во отгрузки, кг", width: 13, fmt: FMT.kg, value: (c) => c.shippedKg },
      { header: "Ҳужжатлар", width: 9, fmt: FMT.int, value: (c) => c.documents },
      { header: "Отгрузка қиймати, сўм", width: 16, fmt: FMT.money, value: (c) => tiyinToSum(c.shippedValue) },
      { header: "Сумма сделки, сўм", width: 17, fmt: FMT.money, value: (c) => (c.dealAmount == null ? null : tiyinToSum(c.dealAmount)) },
      { header: "Тўланган (нетто), сўм", width: 16, fmt: FMT.money, value: (c) => tiyinToSum(c.paidNet) },
      { header: "Охирги ҳужжат", width: 11, value: (c) => formatDate(c.lastDocumentDate) },
      { header: "Статуслар", width: 12, value: (c) => c.statuses.join(", ") }
    ],
    sc,
    {
      label: "Жами",
      6: sc.reduce((a, c) => a + (c.contractQtyKg ?? 0), 0),
      7: sc.reduce((a, c) => a + (c.dealQtyKg ?? 0), 0),
      8: sc.reduce((a, c) => a + c.basketAcceptedKg, 0),
      9: sc.reduce((a, c) => a + c.shippedKg, 0),
      10: sc.reduce((a, c) => a + c.documents, 0),
      11: tiyinToSum(sc.reduce((a, c) => a + c.shippedValue, 0n)),
      13: tiyinToSum(sc.reduce((a, c) => a + c.paidNet, 0n))
    }
  );
  if (note) byContract.getCell(r + 1, 1).value = note;
  pageSetup(byContract, "1:1");
}

function writeDataQualitySheet(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const ws = wb.addWorksheet("Data Quality");
  ws.getCell("A1").value = "DATA QUALITY";
  ws.getCell("A1").font = { name: FONT, bold: true, size: 12 };
  const summary: [string, number, string][] = [
    ["🔴 Critical", ctx.dq.critical, C.critical],
    ["🟠 Warning", ctx.dq.warning, C.warning],
    ["🔵 Info", ctx.dq.info, C.info],
    ["🟢 Valid (basket қаторлари)", ctx.dq.valid, C.subtotalFill],
    ["⏳ Тортилмаган (ҳисобга кирмаган)", ctx.dq.pending, C.hududFill]
  ];
  summary.forEach(([label, n, argb], i) => {
    const a = ws.getCell(3 + i, 1);
    const b = ws.getCell(3 + i, 2);
    a.value = label;
    b.value = n;
    for (const c of [a, b]) {
      c.fill = fill(argb);
      c.font = { name: FONT, size: 10, bold: true };
      c.border = BORDER;
    }
  });
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  const issues = [...ctx.issues].sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code) || (a.row ?? 0) - (b.row ?? 0));
  type I = (typeof issues)[number];
  const start = 3 + summary.length + 1;
  writeTable<I>(
    ws,
    start,
    [
      { header: "Даража", width: 10, value: (i) => i.severity },
      { header: "Код", width: 24, value: (i) => i.code },
      { header: "Манба", width: 11, value: (i) => i.source },
      { header: "Қатор", width: 7, value: (i) => i.row ?? null },
      { header: "Объект", width: 34, value: (i) => i.ref ?? null },
      { header: "Изоҳ", width: 90, value: (i) => i.message }
    ],
    issues
  );
  issues.forEach((i, idx) => {
    const argb = i.severity === "CRITICAL" ? C.critical : i.severity === "WARNING" ? C.warning : C.info;
    ws.getCell(start + 1 + idx, 1).fill = fill(argb);
  });
  ws.views = [{ state: "frozen", ySplit: start }];
  pageSetup(ws, `${start}:${start}`);
}

function writeImportInfoSheet(wb: ExcelJS.Workbook, ctx: ExportContext): void {
  const ws = wb.addWorksheet("Import Info");
  const { report } = ctx;
  const kv: [string, unknown][] = [
    ["Ҳисобот санаси", formatDate(report.reportDate)],
    ["Ҳисобот яратилди", formatDateTime(report.generatedAt)],
    ["Basket маълумоти янгиланган", formatDateTime(report.sourceUpdatedAt)],
    ["Import batch ID", ctx.batchId],
    ["Вақт зонаси", "Asia/Tashkent"],
    ["Кунлар", `${formatDate(report.days[0])} — ${formatDate(report.days[report.days.length - 1])} (${report.days.length})`]
  ];
  ws.getCell("A1").value = "IMPORT INFO";
  ws.getCell("A1").font = { name: FONT, bold: true, size: 12 };
  kv.forEach(([k, v], i) => {
    ws.getCell(3 + i, 1).value = k;
    ws.getCell(3 + i, 2).value = v as ExcelJS.CellValue;
    ws.getCell(3 + i, 1).font = { name: FONT, size: 9, bold: true };
  });
  let r = 3 + kv.length + 1;
  const files = ctx.files;
  type F = (typeof files)[number];
  r = writeTable<F>(ws, r, [
    { header: "Тур", width: 26, value: (f) => SOURCE_LABELS[f.type] },
    { header: "Файл", width: 60, value: (f) => f.filename },
    { header: "Қаторлар", width: 10, fmt: FMT.int, value: (f) => f.rows },
    { header: "Қўшилди", width: 10, fmt: FMT.int, value: (f) => f.inserted },
    { header: "Янгиланди", width: 10, fmt: FMT.int, value: (f) => f.updated },
    { header: "Такрор", width: 10, fmt: FMT.int, value: (f) => f.duplicates },
    { header: "Хатолар", width: 10, fmt: FMT.int, value: (f) => f.errors },
    { header: "Огоҳлантиришлар", width: 14, fmt: FMT.int, value: (f) => f.warnings }
  ], files);

  const rules = [
    "ҲИСОБЛАШ ҚОИДАЛАРИ",
    "Кунлик вазн = Σ Кондицион вазни, Кабул қилиш санаси × Терим услуби бўйича (қўлда юритилган ҳисобот билан 11–19.09.2026 кг гача текширилган).",
    "100 % суммаси = Σ Суммаси (basket); Жами = Кул + Машин.",
    `${PICKING_MONEY_SHARE_PCT} % суммаси = 100 % × ${PICKING_MONEY_SHARE_PCT} %; Терим пули учун колдик = ${PICKING_MONEY_SHARE_PCT} % − ўтказилган маблағ (жами).`,
    "Терим учун ўтказилган маблағ = фермернинг выпискадаги Дебет − Кредит (қайтаришлар айрилади); корхонанинг ўз қаторлари (блоклаш) қўшилмайди. Бир кунда = ҳисобот санасидаги нетто.",
    "Режа = фермер шартномаларининг Шартнома миқдори (т) йиғиндиси.",
    "Фермер идентификатори: ИНН → шартнома (битим №) → РКП ҳисоб рақами → номи (≥ 0.80). Паст ишончли мосликлар автоматик қабул қилинмайди.",
    "Ҳудуд блоклари ва кўрсатиладиган номлар — farmer_directory.xlsx маълумотномасидан.",
    "BUSINESS_RULE_REQUIRED: «Кол-во сделки − Кол-во отгрузки» иқтисодий қолдиқ сифатида тасдиқланмаган.",
    "Барча сумма тийин аниқлигида (бутун сон) ҳисобланади; Excel фақат натижани кўрсатади, формула йўқ."
  ];
  r += 1;
  rules.forEach((text, i) => {
    const cell = ws.getCell(r + i, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 9, bold: i === 0 };
  });
  pageSetup(ws);
}

export async function exportExcel(ctx: ExportContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hazorasp-Textil PTZ";
  wb.created = new Date();
  writeKunlikSheet(wb, ctx);
  writeFarmersSheet(wb, ctx);
  writeDynamicsSheet(wb, ctx);
  writePaymentsSheet(wb, ctx);
  writeShipmentSheets(wb, ctx);
  writeDataQualitySheet(wb, ctx);
  writeImportInfoSheet(wb, ctx);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

