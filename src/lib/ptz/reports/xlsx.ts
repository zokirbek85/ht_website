import ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import type { ReportBundle } from "../reportBundle.ts";
import { CONTRACT_QTY_TO_KG, CONTRACT_QTY_UNIT, PRICE_WEIGHT_BASIS, REPORTING_WEIGHT_FIELD } from "../config.ts";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B315F" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3F7" } };

const GREEN: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEEDC" } };
const YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6EFD1" } };
const RED: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6DCDC" } };

function styleHeaderRow(ws: Worksheet, row: number): void {
  const r = ws.getRow(row);
  r.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle" };
  });
  r.height = 20;
}

function addTable(
  ws: Worksheet,
  headers: string[],
  rows: (string | number | null)[][],
  opts: { numberCols?: number[]; pctCols?: number[]; currencyCols?: number[]; startRow?: number } = {}
): number {
  const startRow = opts.startRow ?? ws.rowCount + 1;
  ws.getRow(startRow).values = headers;
  styleHeaderRow(ws, startRow);

  rows.forEach((row, i) => {
    const r = ws.getRow(startRow + 1 + i);
    r.values = row;
    (opts.numberCols ?? []).forEach((c) => (r.getCell(c).numFmt = "#,##0.0"));
    (opts.pctCols ?? []).forEach((c) => (r.getCell(c).numFmt = "0.0%"));
    (opts.currencyCols ?? []).forEach((c) => (r.getCell(c).numFmt = '#,##0 "сўм"'));
  });

  const lastRow = startRow + rows.length;
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: headers.length } };
  return lastRow;
}

function autoWidth(ws: Worksheet, headers: string[], minWidth = 12): void {
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    let max = h.length;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.max(minWidth, Math.min(max + 2, 45));
  });
}

const STATUS_LABEL_UZ: Record<string, string> = {
  NOT_STARTED: "Бошланмаган",
  IN_PROGRESS: "Жараёнда",
  NEAR_COMPLETION: "Якунга яқин",
  COMPLETED: "Якунланган",
  OVER_CONTRACT: "Ортиқча"
};

export async function generateXlsxReport(bundle: ReportBundle): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HAZORASP-TEXTIL PTZ Analytics";
  wb.created = new Date();

  buildSummarySheet(wb, bundle);
  buildContractsSheet(wb, bundle);
  buildFarmersSheet(wb, bundle);
  buildClustersSheet(wb, bundle);
  buildAcceptanceSheet(wb, bundle);
  buildQualitySheet(wb, bundle);
  buildFinanceSheet(wb, bundle);
  buildControlSheet(wb, bundle);
  buildRawDataSheet(wb, bundle);
  buildDataDictionarySheet(wb, bundle);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function buildSummarySheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("01_Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 34 }, { width: 22 }];
  ws.getCell("A1").value = "HAZORASP-TEXTIL — ПАХТА ҚАБУЛИ, РАҲБАРИЯТ ХУЛОСАСИ";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A1:B1");

  const s = b.summary;
  const kpis: [string, string | number][] = [
    ["Ҳисобот санаси", b.import.reportGeneratedAt?.slice(0, 10) ?? "—"],
    ["Маълумот даври", `${b.import.dataPeriodStart ?? "—"} — ${b.import.dataPeriodEnd ?? "—"}`],
    ["Жами шартнома миқдори, т", Math.round(s.contractQtyKg / 100) / 10],
    ["Жами қабул қилинган, т", Math.round(s.acceptedKg / 100) / 10],
    ["Қолдиқ, т", Math.round(s.remainingKg / 100) / 10],
    ["Шартнома бажарилиши, %", s.achievementPct != null ? Math.round(s.achievementPct * 10) / 10 : "—"],
    ["Бугунги қабул, т", Math.round(s.todayAcceptedKg / 100) / 10],
    ["Жами харид суммаси, сўм", Math.round(s.totalAmount)],
    ["Ўртача харид нархи (тортилган), сўм/кг", s.weightedAvgPrice != null ? Math.round(s.weightedAvgPrice) : "—"],
    ["Фермерлар сони", s.farmerCount],
    ["Шартномалар сони", s.contractCount],
    ["Қабул операциялари сони", s.operationCount]
  ];

  let row = 3;
  for (const [label, value] of kpis) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 2).value = value;
    row++;
  }
  autoWidth(ws, ["Кўрсаткич", "Қиймат"], 20);
}

function buildContractsSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("02_Contracts", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Шартнома", "Фермер", "Кластер", "Тури", "Шартнома, т", "Қабул, т", "Қолдиқ, т", "Ортиқча, т", "Бажарилиши, %", "Ҳолат", "Операциялар"];
  const rows = b.contracts.map((c) => [
    c.contractNumber,
    c.farmerName,
    c.clusterName ?? "—",
    c.contractType ?? "—",
    c.contractQtyKg / 1000,
    c.acceptedKg / 1000,
    c.remainingKg / 1000,
    c.overDeliveryKg / 1000,
    c.achievementPct != null ? c.achievementPct / 100 : null,
    STATUS_LABEL_UZ[c.status] ?? c.status,
    c.operationCount
  ]);
  const lastRow = addTable(ws, headers, rows, { numberCols: [5, 6, 7, 8], pctCols: [9] });

  for (let r = 2; r <= lastRow; r++) {
    const cell = ws.getCell(r, 9);
    const val = cell.value as number | null;
    if (val == null) continue;
    if (val >= 1) cell.fill = GREEN;
    else if (val >= 0.9) cell.fill = YELLOW;
    else if (val === 0) cell.fill = RED;
  }
  autoWidth(ws, headers);
}

function buildFarmersSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("03_Farmers", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Фермер", "ИНН", "Кластер", "Шартнома, т", "Қабул, т", "Қолдиқ, т", "Бажарилиши, %", "Топшириқлар", "Ўртача намлик, %", "Ўртача ифлослик, %", "Ўртача нарх, сўм/кг", "Жами сумма, сўм"];
  const rows = b.farmers
    .sort((a, c) => (c.achievementPct ?? 0) - (a.achievementPct ?? 0))
    .map((f) => [
      f.farmerName,
      f.farmerInn ?? "—",
      f.clusterName ?? "—",
      f.contractQtyKg / 1000,
      f.acceptedKg / 1000,
      f.remainingKg / 1000,
      f.achievementPct != null ? f.achievementPct / 100 : null,
      f.deliveries,
      f.avgMoisturePct,
      f.avgImpurityPct,
      f.weightedAvgPrice,
      f.totalAmount
    ]);
  addTable(ws, headers, rows, { numberCols: [4, 5, 6, 9, 10], pctCols: [7], currencyCols: [11, 12] });
  autoWidth(ws, headers);
}

function buildClustersSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("04_Clusters", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Кластер", "Шартнома, т", "Қабул, т", "Қолдиқ, т", "Бажарилиши, %", "Фермерлар сони", "Ўртача намлик, %", "Ўртача ифлослик, %", "Жами сумма, сўм"];
  const rows = b.clusters.map((c) => [
    c.clusterName,
    c.contractQtyKg / 1000,
    c.acceptedKg / 1000,
    c.remainingKg / 1000,
    c.achievementPct != null ? c.achievementPct / 100 : null,
    c.farmerCount,
    c.avgMoisturePct,
    c.avgImpurityPct,
    c.totalAmount
  ]);
  addTable(ws, headers, rows, { numberCols: [2, 3, 4, 7, 8], pctCols: [5], currencyCols: [9] });
  autoWidth(ws, headers);
}

function buildAcceptanceSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("05_Acceptance", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Сана", "Кунлик қабул, т", "Жами (ўсиб борувчи), т"];
  const rows = b.dailyTrend.map((p) => [p.date, p.dailyAcceptedKg / 1000, p.cumulativeAcceptedKg / 1000]);
  addTable(ws, headers, rows, { numberCols: [2, 3] });
  autoWidth(ws, headers);
}

function buildQualitySheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("06_Quality", { views: [{ state: "frozen", ySplit: 1 }] });
  const q = b.quality;
  ws.getCell("A1").value = "Намлик";
  ws.getCell("A1").font = { bold: true };
  let row = addTable(ws, ["Кўрсаткич", "Қиймат, %"], [
    ["Ўртача", q.moisture.avg],
    ["Мин", q.moisture.min],
    ["Макс", q.moisture.max]
  ], { numberCols: [2], startRow: 2 }) + 2;

  ws.getCell(row, 1).value = "Намлик тақсимоти";
  ws.getCell(row, 1).font = { bold: true };
  row = addTable(ws, ["Тоифа", "Сони", "%"], q.moisture.distribution.map((d) => [d.label, d.count, d.pct / 100]), { pctCols: [3], startRow: row + 1 }) + 2;

  ws.getCell(row, 1).value = "Ифлослик";
  ws.getCell(row, 1).font = { bold: true };
  row = addTable(ws, ["Кўрсаткич", "Қиймат, %"], [
    ["Ўртача", q.impurity.avg],
    ["Мин", q.impurity.min],
    ["Макс", q.impurity.max]
  ], { numberCols: [2], startRow: row + 1 }) + 2;

  ws.getCell(row, 1).value = "Ифлослик тақсимоти";
  ws.getCell(row, 1).font = { bold: true };
  row = addTable(ws, ["Тоифа", "Сони", "%"], q.impurity.distribution.map((d) => [d.label, d.count, d.pct / 100]), { pctCols: [3], startRow: row + 1 }) + 2;

  ws.getCell(row, 1).value = "Саноат нави тақсимоти";
  ws.getCell(row, 1).font = { bold: true };
  row = addTable(ws, ["Нав", "Сони", "%"], q.industrialGradeDistribution.map((d) => [d.label, d.count, d.pct / 100]), { pctCols: [3], startRow: row + 1 }) + 2;

  ws.getCell(row, 1).value = "Синф тақсимоти";
  ws.getCell(row, 1).font = { bold: true };
  row = addTable(ws, ["Синф", "Сони", "%"], q.classDistribution.map((d) => [d.label, d.count, d.pct / 100]), { pctCols: [3], startRow: row + 1 }) + 2;

  ws.getCell(row, 1).value = "Терим услуби тақсимоти";
  ws.getCell(row, 1).font = { bold: true };
  addTable(ws, ["Услуб", "Сони", "%"], q.pickingMethodDistribution.map((d) => [d.label, d.count, d.pct / 100]), { pctCols: [3], startRow: row + 1 });

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 12;

  if (!q.thresholdsConfigured) {
    const noteRow = ws.rowCount + 2;
    ws.getCell(noteRow, 1).value =
      "Огоҳлантириш: намлик/ифлослик учун норматив чегаралар мижоз ёки манба файлидан тасдиқланмаган — config.ts даги вақтинчалик қийматлар ишлатилган.";
    ws.getCell(noteRow, 1).font = { italic: true, color: { argb: "FF8A3A3A" } };
    ws.mergeCells(noteRow, 1, noteRow, 3);
  }
}

function buildFinanceSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("07_Finance", { views: [{ state: "frozen", ySplit: 1 }] });
  const f = b.finance;
  const rows: [string, number | null][] = [
    ["Жами харид суммаси, сўм", f.totalAmount],
    ["Бугунги харид суммаси, сўм", f.todayAmount],
    ["Ўртача нарх (оддий), сўм/кг", f.simpleAvgPrice],
    ["Ўртача нарх (тортилган), сўм/кг", f.weightedAvgPrice],
    ["Мин нарх, сўм/кг", f.minPrice],
    ["Макс нарх, сўм/кг", f.maxPrice],
    ["Жами устама, сўм", f.totalMarkup],
    ["Жами чегирма, сўм", f.totalDiscount],
    ["Ташиш харажати, сўм", f.totalTransportFee],
    ["Уруғлик пахта учун тўлов, сўм", f.totalSeedCottonFee],
    ["Бошқа қўшимча тўловлар, сўм", f.totalOtherFee]
  ];
  addTable(ws, ["Кўрсаткич", "Қиймат"], rows, { currencyCols: [2] });
  ws.getCell(rows.length + 3, 1).value = `Тортилган ўртача нарх формуласи: SUM(Суммаси) / SUM(${PRICE_WEIGHT_BASIS === "conditionedKg" ? "Кондицион вазни" : "Физик вазни"})`;
  ws.getCell(rows.length + 3, 1).font = { italic: true };
  autoWidth(ws, ["Кўрсаткич", "Қиймат"], 24);
}

function buildControlSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("08_Control", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Тоифа", "Даражаси", "Сарлавҳа", "Сони", "Изоҳ", "Мисоллар"];
  const rows = b.alerts.map((a) => [a.category, a.severity, a.title, a.count, a.details, a.sampleRecords.slice(0, 5).join("; ")]);
  const lastRow = addTable(ws, headers, rows);
  for (let r = 2; r <= lastRow; r++) {
    const sev = ws.getCell(r, 2).value as string;
    const cell = ws.getCell(r, 2);
    if (sev === "RED") cell.fill = RED;
    else if (sev === "YELLOW") cell.fill = YELLOW;
    else if (sev === "GREEN") cell.fill = GREEN;
  }
  autoWidth(ws, headers);
}

function buildRawDataSheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("09_Raw_Data", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  const headers = [
    "№", "Фермер", "ИНН", "Кластер", "Шартнома", "Тури", "Сана", "ПК-17", "ПК-17 имзоланган",
    "Брутто, кг", "Тара, кг", "Физик, кг", "Ифлослик, %", "Ҳисобий, кг", "Намлик, %", "Кондицион, кг",
    "Нарх, сўм/кг", "Сумма, сўм", "Транспорт", "Такрор?"
  ];
  const rows = b.engine.allRows.map((r) => [
    r.rowNumber,
    r.farmerName,
    r.farmerInn ?? "—",
    r.clusterName ?? "—",
    r.contractNumber ?? "—",
    r.contractType ?? "—",
    r.acceptanceDate ?? "—",
    r.pk17Number ?? "—",
    r.pk17SignedAt ? "Ҳа" : "Йўқ",
    r.grossKg,
    r.tareKg,
    r.physicalKg,
    r.impurityPct,
    r.calculatedKg,
    r.moisturePct,
    r.conditionedKg,
    r.unitPrice,
    r.amount,
    r.vehiclePlate ?? "—",
    r.isDuplicate ? "Ҳа" : "Йўқ"
  ]);
  addTable(ws, headers, rows, { numberCols: [10, 11, 12, 14, 16], currencyCols: [18] });
  autoWidth(ws, headers, 10);
}

function buildDataDictionarySheet(wb: ExcelJS.Workbook, b: ReportBundle): void {
  const ws = wb.addWorksheet("10_Data_Dictionary");
  const headers = ["Устун / Кўрсаткич", "Тавсиф"];
  const rows: [string, string][] = [
    ["Шартнома миқдори (Reja)", `Манба: "Шартнома миқдори" устуни. Бирлик: ${CONTRACT_QTY_UNIT === "tons" ? "тонна (тахмин — манбада бирлик кўрсатилмаган)" : "кг"}.`],
    ["Қабул қилинган (Actual)", `SUM(${REPORTING_WEIGHT_FIELD === "conditionedKg" ? "Кондицион вазни" : REPORTING_WEIGHT_FIELD}) — асосий ҳисобот вазни (config.ts: REPORTING_WEIGHT_FIELD).`],
    ["Қолдиқ", "MAX(Шартнома − Қабул, 0)."],
    ["Ортиқча (Over-delivery)", "MAX(Қабул − Шартнома, 0) — алоҳида кўрсатилади, қолдиққа қўшилмайди."],
    ["Бажарилиши, %", "Қабул / Шартнома × 100."],
    ["Ўртача нарх (тортилган)", `SUM(Суммаси) / SUM(${PRICE_WEIGHT_BASIS === "conditionedKg" ? "Кондицион вазни" : "Физик вазни"}) — config.ts: PRICE_WEIGHT_BASIS.`],
    ["Бугунги қабул", "Кабул қилиш санаси = бугун (Asia/Tashkent) бўлган операциялар йиғиндиси. ПК-17 санаси эмас."],
    ["Такрорланган операция", "Идентификация калити (ПК-17 рақами, ёки шартнома+фермер+транспорт+сана+вазн) бир xil бўлган иккинчи ва кейинги ёзувлар."],
    ["Ҳолат (Contract status)", "NOT_STARTED / IN_PROGRESS / NEAR_COMPLETION (≥90%) / COMPLETED (≥100%) / OVER_CONTRACT (>100%). Чегаралар config.ts да созланади."],
    ["Сифат чегаралари", "Мижоз ёки манба файлидан тасдиқланмаган — config.ts даги вақтинчалик қийматлар (namlik/iflslik)."]
  ];
  addTable(ws, headers, rows);
  autoWidth(ws, headers, 30);
  ws.getColumn(2).width = 90;
  ws.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  const noteRow = ws.rowCount + 3;
  ws.getCell(noteRow, 1).value = "Ушбу ҳисобот ва тахминлар рўйхати:";
  ws.getCell(noteRow, 1).font = { bold: true };
  b.assumptions.forEach((a, i) => {
    ws.getCell(noteRow + 1 + i, 1).value = `• ${a}`;
    ws.mergeCells(noteRow + 1 + i, 1, noteRow + 1 + i, 2);
  });
}
