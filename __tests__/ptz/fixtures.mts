import ExcelJS from "exceljs";

export type FixtureOptions = {
  /** Grand-total row values (physical/conditioned kg) — omit to skip the row entirely. */
  grandTotal?: { physicalKg: number; conditionedKg: number };
  /** Extra rows appended after the two standard ones, as [farmerName, contractNumber, physicalKg, conditionedKg]. */
  extraRows?: { farmer: string; contract: string; pk17: string | null; physicalKg: number; conditionedKg: number }[];
};

/**
 * Builds a workbook mirroring the real "basket_<buyer>.xlsx" cotton
 * acceptance ledger export this parser was built and validated against
 * (docs/ptz-architecture.md, 2026-09-15): a two-row header (rows 5+6) under
 * wide title/"МАЪЛУМОТ" banner rows (1+2, each merged across the whole
 * width — including the word "фермер" inside the title sentence, which is
 * the exact real-world collision that used to hijack farmer-column
 * detection in the old Сводка parser), a farmer-name column vertically
 * merged across both header rows, a mislabeled ПК-17 sub-header pair
 * (position-based, not label-based, in the real file), and a sheet-wide
 * "ЖАМИ:" grand-total row whose label sits in the row-number column.
 */
export async function buildLedgerWorkbook(opts: FixtureOptions = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  const LAST_COL = "U";

  ws.mergeCells(`A1:${LAST_COL}1`);
  ws.getCell("A1").value =
    "\"HAZORASP-TEXTIL\" МЧЖ бўйича Хазорасп туманидаги фермер хўжаликлари 12 September 09:00 кунига саватда пахта ҳосилини қабул қилиш мониторинги.";
  ws.mergeCells(`A2:${LAST_COL}2`);
  ws.getCell("A2").value = "МАЪЛУМОТ";
  ws.mergeCells(`A3:${LAST_COL}4`);

  ws.mergeCells("A5:A6");
  ws.getCell("A5").value = "№";
  ws.mergeCells("B5:B6");
  ws.getCell("B5").value = "Хўжалик номи";
  ws.mergeCells("C5:C6");
  ws.getCell("C5").value = "Шартнома раками";
  ws.mergeCells("D5:D6");
  ws.getCell("D5").value = "Шартнома миқдори";
  ws.mergeCells("E5:F5");
  ws.getCell("E5").value = "Кабул қилиш";
  ws.getCell("E6").value = "Санаси";
  ws.getCell("F6").value = "Кайд раками";
  ws.mergeCells("G5:G6");
  ws.getCell("G5").value = "ПК-17 раками";
  ws.mergeCells("H5:I5");
  ws.getCell("H5").value = "ПК-17 Имзолаш холати";
  // Real-world quirk: these row-6 sub-labels are stale/wrong (verified
  // against the real export) — both columns actually hold timestamps and
  // are mapped positionally in parser.ts, not by this text.
  ws.getCell("H6").value = "Кластер";
  ws.getCell("I6").value = "Фермер";
  ws.mergeCells("J5:J6");
  ws.getCell("J5").value = "Брутто, кг";
  ws.mergeCells("K5:K6");
  ws.getCell("K5").value = "Тара, кг";
  ws.mergeCells("L5:L6");
  ws.getCell("L5").value = "Физик вазни, кг";
  ws.mergeCells("M5:M6");
  ws.getCell("M5").value = "Ифлослиги, %";
  ws.mergeCells("N5:N6");
  ws.getCell("N5").value = "Хисобий вазни, кг";
  ws.mergeCells("O5:O6");
  ws.getCell("O5").value = "Намлиги, %";
  ws.mergeCells("P5:P6");
  ws.getCell("P5").value = "Кондицион вазни, кг";
  ws.mergeCells("Q5:Q6");
  ws.getCell("Q5").value = "Харид баҳоси, кг/сўм";
  ws.mergeCells("R5:R6");
  ws.getCell("R5").value = "Суммаси, сўм";
  ws.mergeCells("S5:S6");
  ws.getCell("S5").value = "Сотиб олувчи";
  ws.mergeCells("T5:U5");
  ws.getCell("T5").value = "Транспорт";
  ws.getCell("T6").value = "тури";
  ws.getCell("U6").value = "Давлат ракам белгиси";

  let r = 7;
  const dataRows: { farmer: string; contract: string; pk17: string | null; physicalKg: number; conditionedKg: number }[] = [
    { farmer: "ISMOIL OQ OTA FX", contract: "159025", pk17: "XH0000000001", physicalKg: 4230, conditionedKg: 4090 },
    { farmer: "MAXKAM JUMANAZAROV FX", contract: "159050", pk17: "XH0000000002", physicalKg: 4100, conditionedKg: 3992 },
    ...(opts.extraRows ?? [])
  ];

  for (const row of dataRows) {
    ws.getCell(`A${r}`).value = r - 6;
    ws.getCell(`B${r}`).value = row.farmer;
    ws.getCell(`C${r}`).value = row.contract;
    ws.getCell(`D${r}`).value = 200;
    ws.getCell(`E${r}`).value = "11.09.2026";
    ws.getCell(`F${r}`).value = "140";
    ws.getCell(`G${r}`).value = row.pk17;
    ws.getCell(`H${r}`).value = "18:35:47 10.09.2026";
    ws.getCell(`I${r}`).value = row.pk17 ? "20:23:43 10.09.2026" : null; // null = not yet signed
    ws.getCell(`J${r}`).value = row.physicalKg + 7330;
    ws.getCell(`K${r}`).value = 7330;
    ws.getCell(`L${r}`).value = row.physicalKg;
    ws.getCell(`M${r}`).value = 4.8;
    ws.getCell(`N${r}`).value = row.physicalKg - 121;
    ws.getCell(`O${r}`).value = 9.5;
    ws.getCell(`P${r}`).value = row.conditionedKg;
    ws.getCell(`Q${r}`).value = 7862;
    ws.getCell(`R${r}`).value = row.conditionedKg * 7862;
    ws.getCell(`S${r}`).value = "HAZORASP-TEXTIL MCHJ";
    ws.getCell(`T${r}`).value = "Traktor";
    ws.getCell(`U${r}`).value = "90 LA 043";
    r++;
  }

  if (opts.grandTotal) {
    // Real-world quirk: the "ЖАМИ:" label sits in the row-number column
    // (verified against the real export), not the farmer-name column.
    ws.getCell(`A${r}`).value = "ЖАМИ: ";
    ws.getCell(`L${r}`).value = opts.grandTotal.physicalKg;
    ws.getCell(`P${r}`).value = opts.grandTotal.conditionedKg;
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
