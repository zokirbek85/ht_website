import ExcelJS from "exceljs";

/**
 * Builds a workbook mirroring the structure described in the PTZ spec
 * (section 4/43): multi-row headers under Futures/Forward/Temporary
 * Storage/Total zones, a region separator row, a subtotal row, and a
 * #REF! formula error — since the real "Сводка 11,09,26.xlsx" sample was
 * not available in the repo, this fixture is the regression baseline
 * until it can be validated against the real file.
 */
export async function buildSampleWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Факт");

  // Row 1: zone headers
  ws.mergeCells("A1:A4");
  ws.getCell("A1").value = "№";
  ws.mergeCells("B1:B4");
  ws.getCell("B1").value = "Фермер хўжалик номи";

  ws.mergeCells("C1:E1");
  ws.getCell("C1").value = "Фьючерс";
  ws.mergeCells("F1:H1");
  ws.getCell("F1").value = "Форвард";
  ws.mergeCells("I1:K1");
  ws.getCell("I1").value = "Вақтинча сақлаш";
  ws.mergeCells("L1:N1");
  ws.getCell("L1").value = "Жами";

  // Row 2: Режа / Кабул килинди
  ws.mergeCells("C2:C4");
  ws.getCell("C2").value = "Режа";
  ws.mergeCells("D2:E2");
  ws.getCell("D2").value = "Кабул килинди";

  ws.mergeCells("F2:F4");
  ws.getCell("F2").value = "Режа";
  ws.mergeCells("G2:H2");
  ws.getCell("G2").value = "Кабул килинди";

  ws.mergeCells("I2:I4");
  ws.getCell("I2").value = "Режа";
  ws.mergeCells("J2:K2");
  ws.getCell("J2").value = "Кабул килинди";

  ws.mergeCells("L2:L4");
  ws.getCell("L2").value = "Режа";
  ws.mergeCells("M2:N2");
  ws.getCell("M2").value = "Кабул килинди";

  // Row 3/4: Бир кунда / Жами (cumulative) under "Кабул килинди"
  ws.getCell("D3").value = "Бир кунда";
  ws.getCell("E3").value = "Жами";
  ws.getCell("G3").value = "Бир кунда";
  ws.getCell("H3").value = "Жами";
  ws.getCell("J3").value = "Бир кунда";
  ws.getCell("K3").value = "Жами";
  ws.getCell("M3").value = "Бир кунда";
  ws.getCell("N3").value = "Жами";

  let r = 5;

  // Region 1
  ws.getCell(`B${r}`).value = "Янгибозор ҳудуди";
  r++;

  ws.getCell(`A${r}`).value = 1;
  ws.getCell(`B${r}`).value = "Aliyev Vali fermer xo'jaligi";
  ws.getCell(`C${r}`).value = 100;
  ws.getCell(`D${r}`).value = 5;
  ws.getCell(`E${r}`).value = 50;
  ws.getCell(`F${r}`).value = 50;
  ws.getCell(`G${r}`).value = 2;
  ws.getCell(`H${r}`).value = 20;
  ws.getCell(`I${r}`).value = 20;
  ws.getCell(`J${r}`).value = 0;
  ws.getCell(`K${r}`).value = 5;
  ws.getCell(`L${r}`).value = 170;
  ws.getCell(`M${r}`).value = 7;
  ws.getCell(`N${r}`).value = 75;
  r++;

  // Row with a #REF! formula error in one cumulative cell
  ws.getCell(`A${r}`).value = 2;
  ws.getCell(`B${r}`).value = "Karimov Anvar fermer xo'jaligi";
  ws.getCell(`C${r}`).value = 200;
  ws.getCell(`D${r}`).value = 10;
  ws.getCell(`E${r}`).value = { formula: "X1", result: { error: "#REF!" } };
  ws.getCell(`F${r}`).value = 0;
  ws.getCell(`G${r}`).value = 0;
  ws.getCell(`H${r}`).value = 0;
  ws.getCell(`I${r}`).value = 0;
  ws.getCell(`J${r}`).value = 0;
  ws.getCell(`K${r}`).value = 0;
  ws.getCell(`L${r}`).value = 200;
  ws.getCell(`M${r}`).value = 10;
  ws.getCell(`N${r}`).value = 90;
  r++;

  // Region 2
  ws.getCell(`B${r}`).value = "Хива ҳудуди";
  r++;

  ws.getCell(`A${r}`).value = 3;
  ws.getCell(`B${r}`).value = "Yusupova Dilnoza fermer xo'jaligi";
  ws.getCell(`C${r}`).value = 80;
  ws.getCell(`D${r}`).value = 1;
  ws.getCell(`E${r}`).value = 10;
  ws.getCell(`F${r}`).value = 0;
  ws.getCell(`G${r}`).value = 0;
  ws.getCell(`H${r}`).value = 0;
  ws.getCell(`I${r}`).value = 0;
  ws.getCell(`J${r}`).value = 0;
  ws.getCell(`K${r}`).value = 0;
  ws.getCell(`L${r}`).value = 80;
  ws.getCell(`M${r}`).value = 1;
  ws.getCell(`N${r}`).value = 10;
  r++;

  // Subtotal row (no row number, has figures) — must be skipped, not a farmer
  ws.getCell(`B${r}`).value = "Жами:";
  ws.getCell(`E${r}`).value = 60;
  ws.getCell(`N${r}`).value = 175;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
