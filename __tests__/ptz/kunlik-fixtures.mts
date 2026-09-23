// Synthetic workbooks mirroring the four real sources' structure
// (docs/kunlik-terim/DATA_PROFILE.md): basket two-row merged header under a
// title banner, statement meta block + two-leg payments + "Итого:" footer,
// RKP accounts table, Shipments sheet. Real files can't be committed (INNs,
// amounts), so these reproduce every structural quirk the parsers rely on.
import ExcelJS from "exceljs";
import type { HarvestRecord } from "../../src/lib/ptz/kunlik/types.ts";

export const COMPANY_INN = "300074865";

export type BasketRow = {
  farmer: string;
  inn: string | null;
  contract: string | null;
  qtyT?: number;
  date: string; // dd.mm.yyyy as in the real export
  recNo: string;
  pk17?: string | null;
  method: string | null;
  physicalKg?: number | null;
  conditionedKg: number | null;
  price?: number;
  amount?: number | string | null;
  type?: string;
};

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildBasket(rows: BasketRow[], opts: { banner?: string; formulaErrorRow?: number } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.mergeCells("A1:S1");
  ws.getCell("A1").value = opts.banner ?? '"HAZORASP-TEXTIL" MAS\'ULIYATI CHEKLANGAN JAMIYAT бўйича 23 September 14:09 кунига саватда пахта ҳосилини қабул қилиш мониторинги.';
  ws.mergeCells("A2:S2");
  ws.getCell("A2").value = "МАЪЛУМОТ";
  const single: [string, string][] = [
    ["A", "№"], ["B", "Хўжалик номи"], ["C", "Хўжалик ИННси"], ["D", "Вилояти"], ["E", "Тумани"], ["F", "Шартнома тури"],
    ["G", "Шартнома раками"], ["H", "Шартнома миқдори"], ["K", "ПК-17 раками"], ["N", "Терим услуби"], ["O", "Физик вазни, кг"],
    ["P", "Кондицион вазни, кг"], ["Q", "Харид баҳоси, кг/сўм"], ["R", "Суммаси, сўм"], ["S", "Сотиб олувчи"]
  ];
  for (const [col, label] of single) {
    ws.mergeCells(`${col}5:${col}6`);
    ws.getCell(`${col}5`).value = label;
  }
  ws.mergeCells("I5:J5");
  ws.getCell("I5").value = "Кабул қилиш";
  ws.getCell("I6").value = "Санаси";
  ws.getCell("J6").value = "Кайд раками";
  ws.mergeCells("L5:M5");
  ws.getCell("L5").value = "ПК-17 Имзолаш холати";
  ws.getCell("L6").value = "Кластер";
  ws.getCell("M6").value = "Фермер";

  let r = 7;
  for (const row of rows) {
    const price = row.price ?? 7862;
    ws.getCell(`A${r}`).value = r - 6;
    ws.getCell(`B${r}`).value = row.farmer;
    ws.getCell(`C${r}`).value = row.inn;
    ws.getCell(`D${r}`).value = "Xorazm viloyati";
    ws.getCell(`E${r}`).value = "Xazorasp tumani";
    ws.getCell(`F${r}`).value = row.type ?? "Fyuchers";
    ws.getCell(`G${r}`).value = row.contract;
    ws.getCell(`H${r}`).value = row.qtyT ?? 100;
    ws.getCell(`I${r}`).value = row.date;
    ws.getCell(`J${r}`).value = row.recNo;
    ws.getCell(`K${r}`).value = row.pk17 === undefined ? `XH${row.recNo.padStart(10, "0")}` : row.pk17;
    ws.getCell(`N${r}`).value = row.method;
    ws.getCell(`O${r}`).value = row.physicalKg === undefined ? (row.conditionedKg ?? 0) + 100 : row.physicalKg;
    ws.getCell(`P${r}`).value = row.conditionedKg;
    ws.getCell(`Q${r}`).value = price;
    ws.getCell(`R${r}`).value = row.amount === undefined ? (row.conditionedKg == null ? null : `${row.conditionedKg * price}.0`) : row.amount;
    ws.getCell(`S${r}`).value = "HAZORASP-TEXTIL MCHJ";
    if (opts.formulaErrorRow === r - 6) ws.getCell(`R${r}`).value = { formula: "#REF!*2", result: { error: "#REF!" } } as unknown as ExcelJS.CellValue;
    r++;
  }
  ws.getCell(`A${r}`).value = "ЖАМИ: ";
  ws.getCell(`P${r}`).value = rows.reduce((a, x) => a + (x.conditionedKg ?? 0), 0);
  return toBuffer(wb);
}

export type PaymentLeg = {
  txId: number;
  at: Date; // naive wall-clock, stored as UTC fields (as ExcelJS reads real files)
  name: string;
  inn: string;
  account: string;
  accountName?: string;
  debit: number;
  credit: number;
  deal: string;
  details?: string;
};

/** A full farmer payment = company "block" leg + farmer leg, like the real statement. */
export function paymentPair(p: { txId: number; at: Date; farmer: string; inn: string; farmerAccount: string; amount: number; deal: string; reversal?: boolean }): PaymentLeg[] {
  const details = `${p.reversal ? "Возврат ошибочно проведённой транзакции " : ""}00011 За Хлопок сырец (фьючерс-80%-1), сд.№${p.deal}, согл. с/ф.№HF-1 от 20.09.2026, ИНН: ${COMPANY_INN} HAZORASP-TEXTIL MCHJ`;
  const company: PaymentLeg = { txId: p.txId, at: p.at, name: "HAZORASP-TEXTIL MCHJ", inn: COMPANY_INN, account: "201018600010350000078930001", accountName: "Свободные средства", debit: p.reversal ? p.amount : 0, credit: p.reversal ? 0 : p.amount, deal: p.deal, details: p.reversal ? details : "Блокировка полного оплата сделки" };
  const farmer: PaymentLeg = { txId: p.txId + 1, at: p.at, name: p.farmer, inn: p.inn, account: p.farmerAccount, accountName: "Денежные средства клиента в пути", debit: p.reversal ? 0 : p.amount, credit: p.reversal ? p.amount : 0, deal: p.deal, details };
  return [company, farmer];
}

export async function buildStatement(legs: PaymentLeg[], opts: { badDateTx?: number } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Лист1");
  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = "Историческая выписка";
  ws.mergeCells("A2:K2");
  ws.getCell("A2").value = "Лиц.счет клиента : 202038600010390000078930001; Дата тран. от : 01.09.2026; Дата тран. до : 23.09.2026; ";
  ws.mergeCells("A4:B4");
  ws.getCell("A4").value = "Клиент:";
  ws.mergeCells("C4:D4");
  ws.getCell("C4").value = "HAZORASP-TEXTIL MCHJ";
  ws.mergeCells("A5:B5");
  ws.getCell("A5").value = "Клиент ИНН:";
  ws.mergeCells("C5:D5");
  ws.getCell("C5").value = COMPANY_INN;
  const headers = ["№ ", "ID транзакции", "Атрибуты", "Дата транзакции", "Наим. контрагента", "ИНН контрагента", "Л/с контрагента", "Наим.л/с", "Дебет", "Кредит", "Детали"];
  headers.forEach((h, i) => (ws.getRow(8).getCell(i + 1).value = h));
  let r = 9;
  for (const [i, l] of legs.entries()) {
    const row = ws.getRow(r++);
    const at = new Date(Date.UTC(l.at.getFullYear(), l.at.getMonth(), l.at.getDate(), l.at.getHours(), l.at.getMinutes(), l.at.getSeconds()));
    [i + 1, l.txId, `C:119020; D:${l.deal}; `, opts.badDateTx === l.txId ? "31.02.2026" : at, l.name, l.inn, l.account, l.accountName ?? "", l.debit, l.credit, l.details ?? ""].forEach(
      (v, c) => (row.getCell(c + 1).value = v as ExcelJS.CellValue)
    );
  }
  const total = legs.reduce((a, l) => a + l.debit, 0);
  ws.getRow(r).getCell(8).value = "Итого:";
  ws.getRow(r).getCell(9).value = total;
  ws.getRow(r).getCell(10).value = legs.reduce((a, l) => a + l.credit, 0);
  return toBuffer(wb);
}

export async function buildAccounts(rows: { account: string; name: string; balance: number }[] = defaultAccounts()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Лист1");
  ["№", "Счет РКП", "Наим. л/с", "Л/с", "Баланс", "По умолчанию счет"].forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  rows.forEach((a, i) => {
    [i + 1, "20208000000600257007 (UZS)", a.name, a.account, a.balance, "Да"].forEach((v, c) => (ws.getRow(i + 2).getCell(c + 1).value = v));
  });
  return toBuffer(wb);
}

export function defaultAccounts() {
  return [
    { account: "201018600010350000078930001", name: "Свободные средства", balance: 1000000.5 },
    { account: "202038600010390000078930001", name: "Блокированные средства", balance: 250000 },
    { account: "221018600010300000078930001", name: "Денежные средства клиента в пути", balance: 0 }
  ];
}

export type ShipmentRow = { deal: string; seller: string; doc: string; docDate: string; qtyKg: number; dealQtyKg: number; status?: string; contract?: string };

export async function buildShipments(rows: ShipmentRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Shipments");
  const headers = ["Номер сделки", "Дата сделки", "Номер контракта", "Имя продавца", "Имя брокера продавца", "Имя покупатель", "Имя брокера покупатель", "Наименование товара", "Номер документа", "Дата документа", "Кол-во отгрузки", "Стоимость доставки", "Кол-во сделки", "Сумма сделки", "Ед. изм", "Таймер отгрузки", "Статус"];
  headers.forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  rows.forEach((s, i) => {
    [s.deal, "19.01.2026", s.contract ?? "119020", s.seller, "БК 12277", "HAZORASP-TEXTIL MCHJ", "БК 10907", "Хлопок сырец (фьючерс)", s.doc, s.docDate, s.qtyKg, s.qtyKg * 7862, s.dealQtyKg, s.dealQtyKg * 7862, "килограмм", "0", s.status ?? "Approved"].forEach(
      (v, c) => (ws.getRow(i + 2).getCell(c + 1).value = v)
    );
  });
  return toBuffer(wb);
}

export async function buildEmptyWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Sheet1");
  return toBuffer(wb);
}

/** Standard scenario: 3 farmers, 2 days, hand+machine; one farmer with 2 contracts; payments incl. a reversal. */
export const FARMERS = {
  a: { name: "ISMOIL OQ OTA FX", inn: "204858134", contract: "159025", account: "221018600010390000133150001" },
  b: { name: "POLVON QO_SHAR FX", inn: "303575374", contract: "159050", account: "221018600010350000139080001" },
  c: { name: "HAZORASP AGROTEX MCHJ", inn: "312583409", contract: "159408", contract2: "159409", account: "221018600010380000234760001" }
};

export function standardBasket(): BasketRow[] {
  const { a, b, c } = FARMERS;
  return [
    { farmer: a.name, inn: a.inn, contract: a.contract, qtyT: 223.989, date: "22.09.2026", recNo: "1", method: "1-Qo`l terimi", conditionedKg: 4090 },
    { farmer: a.name, inn: a.inn, contract: a.contract, qtyT: 223.989, date: "23.09.2026", recNo: "2", method: "1-Qo`l terimi", conditionedKg: 3992 },
    { farmer: b.name, inn: b.inn, contract: b.contract, qtyT: 248.593, date: "22.09.2026", recNo: "3", method: "Mashina terimi", conditionedKg: 11995 },
    { farmer: b.name, inn: b.inn, contract: b.contract, qtyT: 248.593, date: "23.09.2026", recNo: "4", method: "1-Qo`l terimi", conditionedKg: 3111 },
    { farmer: c.name, inn: c.inn, contract: c.contract, qtyT: 500, date: "23.09.2026", recNo: "5", method: "Mashina terimi", conditionedKg: 20000, type: "Forvard" },
    { farmer: c.name, inn: c.inn, contract: c.contract2, qtyT: 300, date: "23.09.2026", recNo: "6", method: "1-Qo`l terimi", conditionedKg: 1000, type: "Forvard" }
  ];
}

export function standardPayments(): PaymentLeg[] {
  const { a, b } = FARMERS;
  return [
    ...paymentPair({ txId: 100, at: new Date(2026, 8, 22, 16, 48, 6), farmer: `"${a.name}"`, inn: a.inn, farmerAccount: a.account, amount: 25_725_000.4, deal: a.contract }),
    ...paymentPair({ txId: 200, at: new Date(2026, 8, 23, 12, 54, 56), farmer: b.name, inn: b.inn, farmerAccount: b.account, amount: 1_000_000, deal: b.contract }),
    ...paymentPair({ txId: 300, at: new Date(2026, 8, 23, 13, 0, 0), farmer: b.name, inn: b.inn, farmerAccount: b.account, amount: 1_000_000, deal: b.contract, reversal: true })
  ];
}

export function standardShipments(): ShipmentRow[] {
  const { a, b } = FARMERS;
  return [
    { deal: a.contract, seller: a.name, doc: "HF-1", docDate: "21.09.2026", qtyKg: 4090, dealQtyKg: 223989 },
    { deal: a.contract, seller: a.name, doc: "HF-2", docDate: "22.09.2026", qtyKg: 3992, dealQtyKg: 223989 },
    { deal: b.contract, seller: b.name, doc: "HF-1", docDate: "22.09.2026", qtyKg: 11995, dealQtyKg: 248593 }
  ];
}

/** HarvestRecord for pure calculation tests. */
export function harvest(p: Partial<HarvestRecord> & { inn: string | null; conditionedKg: number | null }): HarvestRecord {
  return {
    naturalKey: `rec:${p.contractNumber ?? ""}:${p.recordNo ?? Math.random()}`,
    fingerprint: "x",
    sourceRow: p.sourceRow ?? 7,
    farmerName: p.farmerName ?? "TEST FX",
    region: null,
    district: null,
    contractType: "Fyuchers",
    contractNumber: "159025",
    contractQtyT: 100,
    acceptanceDate: "2026-09-23",
    acceptanceDateInvalid: false,
    recordNo: "1",
    pk17: "XH1",
    method: "HAND",
    methodRaw: "1-Qo`l terimi",
    physicalKg: (p.conditionedKg ?? 0) + 100,
    amount: p.conditionedKg == null ? null : BigInt(Math.round(p.conditionedKg * 786200)),
    unitPrice: 7862,
    ...p
  };
}
