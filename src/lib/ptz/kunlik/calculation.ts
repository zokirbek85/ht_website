// CalculationEngine — one normalized dataset in, one KunlikReport out. The
// Excel, the PDF and every Telegram message read this same object, so they
// can never disagree on a number.
//
// Rules reproduced from the hand-maintained report (DATA_PROFILE.md §6):
//   Кул/Машин терим, кг  = Σ Кондицион вазни by Кабул санаси × Терим услуби
//   100 % суммаси        = Σ Суммаси (same grouping)
//   Жами                 = Кул + Машин
//   20 % суммаси         = 100 % × PICKING_MONEY_SHARE_PCT
//   Утказилган маблаг    = Σ (Дебет − Кредит) of the farmer's statement legs
//                          (Бир кунда = on the report date; Жами = all)
//   Терим пули колдик    = 20 % − Утказилган (Жами)
//   Режа                 = Σ distinct contracts' Шартнома миқдори (t)
import { PICKING_MONEY_SHARE_PCT, SHIPMENT_COUNTED_STATUSES } from "./config.ts";
import { FarmerIndex, buildOwnerClientCodes, rkpClientCode, type MatchMethod, type MatchResult } from "./matching.ts";
import { UNASSIGNED_SECTION, type DirectoryEntry } from "./directory.ts";
import { normalizeFarmerName } from "./utils/text.ts";
import { percentOf, roundKg } from "./utils/numbers.ts";
import type { IsoDate } from "./utils/dates.ts";
import type { DataIssue, HarvestRecord, PaymentRecord, RkpAccountCategory, RkpAccountRecord, ShipmentRecord, ShipmentStatus } from "./types.ts";

export type DayCell = { handKg: number; handSum: bigint; machineKg: number; machineSum: bigint };

export type Totals = {
  planT: number;
  days: Map<IsoDate, DayCell>;
  total: DayCell;
  today: DayCell;
  sum100: bigint;
  sum20: bigint;
  paidToday: bigint;
  paidTotal: bigint;
  pickingBalance: bigint;
  shippedKg: number;
  shippedValue: bigint;
  farmerCount: number;
};

export type FarmerLine = Totals & {
  key: string;
  numberInBlock: number;
  section: string;
  hudud: string;
  displayName: string;
  basketName: string | null;
  inn: string | null;
  contracts: string[];
  contractTypes: string[];
  achievementPct: number | null;
  directoryMatch: { method: string; confidence: number | null } | null;
  deals: number;
  dealQtyKg: number;
  unknownMethodKg: number;
};

export type LayoutRow =
  | { kind: "header"; label: string }
  | { kind: "farmer"; line: FarmerLine }
  | { kind: "subtotal"; label: string; level: "hudud" | "section" | "grand"; totals: Totals };

export type PaymentView = PaymentRecord & { net: bigint; match: MatchResult; farmerDisplayName: string | null };

export type ShipmentContract = {
  dealNumber: string;
  clearingContracts: string[];
  farmerInn: string | null;
  farmerName: string | null;
  sellerName: string | null;
  match: MatchResult;
  contractQtyKg: number | null; // basket Шартнома миқдори × 1000
  dealQtyKg: number | null;
  shippedKg: number; // counted statuses only
  shippedValue: bigint;
  dealAmount: bigint | null;
  documents: number;
  statuses: ShipmentStatus[];
  basketAcceptedKg: number;
  paidNet: bigint;
  lastDocumentDate: IsoDate | null;
};

export type ShipmentFarmer = {
  inn: string | null;
  name: string;
  deals: number;
  contractQtyKg: number;
  dealQtyKg: number;
  shippedKg: number;
  shippedValue: bigint;
  basketAcceptedKg: number;
  paidNet: bigint;
};

export type AccountView = RkpAccountRecord & { ownerInn: string | null; ownerKind: "OWNER" | "FARMER" | "UNKNOWN"; match: MatchMethod; confidence: number };

export type DailyTotal = DayCell & { date: IsoDate; totalKg: number; totalSum: bigint; cumulativeKg: number };

export type KunlikReport = {
  reportDate: IsoDate;
  generatedAt: string; // naive Tashkent datetime of report generation
  sourceUpdatedAt: string | null; // basket export timestamp from its title banner
  days: IsoDate[];
  layout: LayoutRow[];
  lines: FarmerLine[];
  grand: Totals;
  daily: DailyTotal[];
  hudud: { hudud: string; section: string; totalKg: number; todayKg: number; farmers: number }[];
  payments: PaymentView[];
  ownerLegs: { count: number; debit: bigint; credit: bigint };
  accounts: AccountView[];
  accountTotals: Record<RkpAccountCategory, bigint>;
  shipments: (ShipmentRecord & { counted: boolean; match: MatchResult; farmerName: string | null })[];
  shipmentContracts: ShipmentContract[];
  shipmentFarmers: ShipmentFarmer[];
  kpi: {
    todayHandKg: number;
    todayMachineKg: number;
    todayTotalKg: number;
    seasonHandKg: number;
    seasonMachineKg: number;
    seasonTotalKg: number;
    farmersWithHarvest: number;
    farmersToday: number;
    contracts: number;
    paidToday: bigint;
    paidTotal: bigint;
    pickingBalance: bigint;
    rkpFreeBalance: bigint;
    shippedKg: number;
    shippedValue: bigint;
    shipmentDeals: number;
  };
  issues: DataIssue[];
};

export type CalculationInput = {
  harvest: HarvestRecord[]; // all records in the current basket snapshot
  counted: HarvestRecord[]; // subset that passed validation
  payments: PaymentRecord[];
  accounts: RkpAccountRecord[];
  shipments: ShipmentRecord[];
  directory: DirectoryEntry[];
  reportDate: IsoDate;
  generatedAt: string;
  sourceUpdatedAt: string | null;
};

const emptyDay = (): DayCell => ({ handKg: 0, handSum: 0n, machineKg: 0, machineSum: 0n });

function addDay(into: DayCell, d: DayCell): void {
  into.handKg = roundKg(into.handKg + d.handKg);
  into.machineKg = roundKg(into.machineKg + d.machineKg);
  into.handSum += d.handSum;
  into.machineSum += d.machineSum;
}

function emptyTotals(): Totals {
  return {
    planT: 0,
    days: new Map(),
    total: emptyDay(),
    today: emptyDay(),
    sum100: 0n,
    sum20: 0n,
    paidToday: 0n,
    paidTotal: 0n,
    pickingBalance: 0n,
    shippedKg: 0,
    shippedValue: 0n,
    farmerCount: 0
  };
}

function aggregate(lines: Totals[]): Totals {
  const t = emptyTotals();
  for (const l of lines) {
    t.planT = roundKg(t.planT + l.planT);
    for (const [d, cell] of l.days) {
      const into = t.days.get(d) ?? emptyDay();
      addDay(into, cell);
      t.days.set(d, into);
    }
    addDay(t.total, l.total);
    addDay(t.today, l.today);
    t.sum100 += l.sum100;
    t.sum20 += l.sum20;
    t.paidToday += l.paidToday;
    t.paidTotal += l.paidTotal;
    t.pickingBalance += l.pickingBalance;
    t.shippedKg = roundKg(t.shippedKg + l.shippedKg);
    t.shippedValue += l.shippedValue;
    t.farmerCount += l.farmerCount;
  }
  return t;
}

function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function calculate(input: CalculationInput): KunlikReport {
  const issues: DataIssue[] = [];
  const index = new FarmerIndex(input.harvest, input.payments);

  // ---- farmers from the basket snapshot -------------------------------------
  type Acc = {
    inn: string;
    basketName: string;
    contracts: Map<string, { qtyT: number | null; type: string | null }>;
    days: Map<IsoDate, DayCell>;
    unknownMethodKg: number;
  };
  const farmers = new Map<string, Acc>();
  for (const r of input.harvest) {
    if (!r.inn) continue;
    const acc = farmers.get(r.inn) ?? { inn: r.inn, basketName: r.farmerName, contracts: new Map(), days: new Map(), unknownMethodKg: 0 };
    if (r.contractNumber && !acc.contracts.has(r.contractNumber)) acc.contracts.set(r.contractNumber, { qtyT: r.contractQtyT, type: r.contractType });
    if (r.method === "UNKNOWN" && (r.conditionedKg ?? 0) > 0) acc.unknownMethodKg = roundKg(acc.unknownMethodKg + (r.conditionedKg ?? 0));
    farmers.set(r.inn, acc);
  }
  for (const r of input.counted) {
    const acc = r.inn ? farmers.get(r.inn) : undefined;
    if (!acc || !r.acceptanceDate) continue;
    const cell = acc.days.get(r.acceptanceDate) ?? emptyDay();
    const kg = r.conditionedKg ?? 0;
    const sum = r.amount ?? 0n;
    if (r.method === "HAND") {
      cell.handKg = roundKg(cell.handKg + kg);
      cell.handSum += sum;
    } else {
      cell.machineKg = roundKg(cell.machineKg + kg);
      cell.machineSum += sum;
    }
    acc.days.set(r.acceptanceDate, cell);
  }

  const contractQtyKg = new Map<string, number | null>();
  const basketKgByContract = new Map<string, number>();
  for (const r of input.harvest) if (r.contractNumber && !contractQtyKg.has(r.contractNumber)) contractQtyKg.set(r.contractNumber, r.contractQtyT == null ? null : roundKg(r.contractQtyT * 1000));
  for (const r of input.counted) if (r.contractNumber) basketKgByContract.set(r.contractNumber, roundKg((basketKgByContract.get(r.contractNumber) ?? 0) + (r.conditionedKg ?? 0)));

  // ---- payments ---------------------------------------------------------------
  const paidTotal = new Map<string, bigint>();
  const paidToday = new Map<string, bigint>();
  const paidByDeal = new Map<string, bigint>();
  const payments: PaymentView[] = [];
  const ownerLegs = { count: 0, debit: 0n, credit: 0n };
  for (const p of input.payments) {
    if (p.isCompanySide) {
      ownerLegs.count++;
      ownerLegs.debit += p.debit;
      ownerLegs.credit += p.credit;
      continue;
    }
    const net = p.debit - p.credit;
    const match = index.match({ inn: p.counterpartyInn, contract: p.dealNumber, account: p.counterpartyAccount, name: p.counterpartyName });
    if (match.inn) {
      paidTotal.set(match.inn, (paidTotal.get(match.inn) ?? 0n) + net);
      if (p.opDate === input.reportDate) paidToday.set(match.inn, (paidToday.get(match.inn) ?? 0n) + net);
      const basketName = index.names.get(match.inn);
      if (match.method === "INN" && basketName && p.counterpartyName && normalizeFarmerName(basketName) !== normalizeFarmerName(p.counterpartyName)) {
        const sim = index.matchName(p.counterpartyName);
        if (sim.inn !== match.inn) {
          issues.push({ severity: "WARNING", code: "NAME_MISMATCH", source: "MATCHING", row: p.sourceRow, ref: p.txId ?? undefined, message: `ИНН ${match.inn} бўйича боғланди, лекин номлар фарқ қилади: "${p.counterpartyName}" ↔ "${basketName}".` });
        }
      }
    } else {
      issues.push({
        severity: "WARNING",
        code: "PAYMENT_NOT_MATCHED",
        source: "MATCHING",
        row: p.sourceRow,
        ref: p.txId ?? undefined,
        message: `Тўлов фермерга боғланмади: "${p.counterpartyName ?? "—"}" (ИНН ${p.counterpartyInn ?? "—"}, битим ${p.dealNumber ?? "—"})${match.candidate ? `; эҳтимолий: ${match.candidate.name} (${match.candidate.confidence})` : ""}.`
      });
    }
    if (p.dealNumber) paidByDeal.set(p.dealNumber, (paidByDeal.get(p.dealNumber) ?? 0n) + net);
    payments.push({ ...p, net, match, farmerDisplayName: null });
  }

  // ---- shipments ------------------------------------------------------------------
  const counted = new Set(SHIPMENT_COUNTED_STATUSES);
  const shipments: KunlikReport["shipments"] = [];
  const byDeal = new Map<string, ShipmentContract>();
  for (const s of input.shipments) {
    const match = index.match({ inn: s.sellerInn, contract: s.dealNumber, name: s.sellerName });
    const isCounted = counted.has(s.status);
    const farmerName = match.inn ? (index.names.get(match.inn) ?? null) : null;
    shipments.push({ ...s, counted: isCounted, match, farmerName });
    const deal = s.dealNumber ?? "—";
    const c =
      byDeal.get(deal) ??
      ({
        dealNumber: deal,
        clearingContracts: [],
        farmerInn: match.inn,
        farmerName,
        sellerName: s.sellerName,
        match,
        contractQtyKg: contractQtyKg.get(deal) ?? null,
        dealQtyKg: s.dealQtyKg,
        shippedKg: 0,
        shippedValue: 0n,
        dealAmount: s.dealAmount,
        documents: 0,
        statuses: [],
        basketAcceptedKg: basketKgByContract.get(deal) ?? 0,
        paidNet: paidByDeal.get(deal) ?? 0n,
        lastDocumentDate: null
      } satisfies ShipmentContract);
    if (s.contractNumber && !c.clearingContracts.includes(s.contractNumber)) c.clearingContracts.push(s.contractNumber);
    if (!c.statuses.includes(s.status)) c.statuses.push(s.status);
    c.documents++;
    if (isCounted) {
      c.shippedKg = roundKg(c.shippedKg + (s.shipmentQtyKg ?? 0));
      c.shippedValue += s.deliveryCost ?? 0n;
    }
    if (s.dealQtyKg != null && c.dealQtyKg != null && s.dealQtyKg !== c.dealQtyKg) {
      issues.push({ severity: "WARNING", code: "DEAL_QTY_INCONSISTENT", source: "SHIPMENTS", row: s.sourceRow, ref: deal, message: `Битта битимда турли "Кол-во сделки": ${c.dealQtyKg} ва ${s.dealQtyKg}.` });
    }
    if (s.documentDate && (!c.lastDocumentDate || s.documentDate > c.lastDocumentDate)) c.lastDocumentDate = s.documentDate;
    byDeal.set(deal, c);
  }
  const shipmentContracts = [...byDeal.values()].sort((a, b) => b.shippedKg - a.shippedKg);
  for (const c of shipmentContracts) {
    if (!c.farmerInn) {
      issues.push({ severity: "WARNING", code: "SHIPMENT_NOT_MATCHED", source: "MATCHING", ref: c.dealNumber, message: `Отгрузка фермерга боғланмади: битим ${c.dealNumber}, сотувчи "${c.sellerName ?? "—"}"${c.match.candidate ? `; эҳтимолий: ${c.match.candidate.name} (${c.match.candidate.confidence})` : ""}.` });
    } else if (c.match.method !== "CONTRACT" && c.match.method !== "INN") {
      issues.push({ severity: "WARNING", code: "CONTRACT_NOT_FOUND", source: "MATCHING", ref: c.dealNumber, message: `Битим ${c.dealNumber} basketда йўқ; фермерга ном бўйича боғланди (${c.match.confidence.toFixed(2)}).` });
    }
    if (c.contractQtyKg != null && c.dealQtyKg != null && Math.abs(c.contractQtyKg - c.dealQtyKg) > 1) {
      issues.push({ severity: "WARNING", code: "CONTRACT_QTY_MISMATCH", source: "MATCHING", ref: c.dealNumber, message: `Шартнома миқдори basketда ${c.contractQtyKg} кг, Shipmentsда ${c.dealQtyKg} кг.` });
    }
  }
  const shippedByInn = new Map<string, { kg: number; value: bigint; deals: number; dealQtyKg: number }>();
  for (const c of shipmentContracts) {
    if (!c.farmerInn) continue;
    const s = shippedByInn.get(c.farmerInn) ?? { kg: 0, value: 0n, deals: 0, dealQtyKg: 0 };
    s.kg = roundKg(s.kg + c.shippedKg);
    s.value += c.shippedValue;
    s.deals++;
    s.dealQtyKg = roundKg(s.dealQtyKg + (c.dealQtyKg ?? 0));
    shippedByInn.set(c.farmerInn, s);
  }

  // ---- RKP accounts ---------------------------------------------------------------
  const ownerCodes = buildOwnerClientCodes(input.payments);
  const accounts: AccountView[] = input.accounts.map((a) => {
    if (a.holderInn && index.hasInn(a.holderInn)) return { ...a, ownerInn: a.holderInn, ownerKind: "FARMER", match: "INN", confidence: 1 };
    const code = rkpClientCode(a.account);
    const owner = (a.holderInn && [...ownerCodes.values()].includes(a.holderInn) ? a.holderInn : null) ?? (code ? ownerCodes.get(code) : undefined);
    if (owner) return { ...a, ownerInn: owner, ownerKind: "OWNER", match: a.holderInn ? "INN" : "ACCOUNT", confidence: a.holderInn ? 1 : 0.9 };
    const m = index.match({ account: a.account, name: a.holderName });
    if (m.inn) return { ...a, ownerInn: m.inn, ownerKind: "FARMER", match: m.method, confidence: m.confidence };
    issues.push({ severity: "WARNING", code: "ACCOUNT_NOT_MATCHED", source: "MATCHING", row: a.sourceRow, ref: a.account ?? undefined, message: `РКП ҳисоби эгаси аниқланмади: ${a.account} (${a.accountName ?? "—"}).` });
    return { ...a, ownerInn: null, ownerKind: "UNKNOWN", match: "NONE", confidence: 0 };
  });
  const accountTotals: Record<RkpAccountCategory, bigint> = { FREE: 0n, BLOCKED: 0n, IN_TRANSIT: 0n, OTHER: 0n };
  for (const a of accounts) if (a.ownerKind === "OWNER") accountTotals[a.category] += a.balance;

  // ---- directory ↔ farmers -----------------------------------------------------------
  const byInnDir = new Map<string, DirectoryEntry>();
  for (const e of input.directory) if (e.inn) byInnDir.set(e.inn, e);
  const innLessDir = input.directory.filter((e) => !e.inn);
  const innLessByNorm = new Map<string, DirectoryEntry[]>();
  for (const e of innLessDir) {
    for (const n of new Set([normalizeFarmerName(e.displayName), normalizeFarmerName(e.basketName)])) {
      if (!n) continue;
      innLessByNorm.set(n, [...(innLessByNorm.get(n) ?? []), e]);
    }
  }
  const claimed = new Set<DirectoryEntry>();
  const linked = new Map<string, { entry: DirectoryEntry | null; method: string; confidence: number | null }>();
  for (const [inn, acc] of farmers) {
    const direct = byInnDir.get(inn);
    if (direct) {
      linked.set(inn, { entry: direct, method: direct.matchMethod ?? "INN", confidence: direct.confidence ?? 1 });
      continue;
    }
    const cands = (innLessByNorm.get(normalizeFarmerName(acc.basketName)) ?? []).filter((e) => !claimed.has(e));
    if (cands.length === 1) {
      claimed.add(cands[0]!);
      linked.set(inn, { entry: cands[0]!, method: "NAME", confidence: 0.8 });
      issues.push({ severity: "INFO", code: "DIRECTORY_LINKED_BY_NAME", source: "MATCHING", ref: inn, message: `"${acc.basketName}" маълумотномадаги "${cands[0]!.displayName}" га ном бўйича боғланди — маълумотномага ИНН киритинг.` });
    } else {
      linked.set(inn, { entry: null, method: "NONE", confidence: null });
      issues.push({ severity: "WARNING", code: "FARMER_NOT_MATCHED", source: "MATCHING", ref: inn, message: `"${acc.basketName}" (ИНН ${inn}) ҳудуд маълумотномасида йўқ — "${UNASSIGNED_SECTION}" блокида кўрсатилди.` });
    }
  }

  // ---- farmer lines ------------------------------------------------------------------
  const allDates = input.counted.map((r) => r.acceptanceDate).filter((d): d is IsoDate => !!d).sort();
  const firstDate = allDates[0] ?? input.reportDate;
  const lastDate = [allDates[allDates.length - 1] ?? input.reportDate, input.reportDate].sort()[1]!;
  const days = dateRange(firstDate, lastDate);

  function buildLine(p: {
    key: string;
    entry: DirectoryEntry | null;
    acc: Acc | null;
    directoryMatch: FarmerLine["directoryMatch"];
  }): FarmerLine {
    const { entry, acc } = p;
    const inn = acc?.inn ?? entry?.inn ?? null;
    const t = emptyTotals();
    if (acc) {
      for (const [d, cell] of acc.days) {
        t.days.set(d, { ...cell });
        addDay(t.total, cell);
      }
      const today = acc.days.get(input.reportDate);
      if (today) addDay(t.today, today);
    }
    const contractQtys = acc ? [...acc.contracts.values()].map((c) => c.qtyT) : [];
    t.planT = acc && contractQtys.some((q) => q != null) ? roundKg(contractQtys.reduce<number>((a, q) => a + (q ?? 0), 0)) : (entry?.planT ?? 0);
    t.sum100 = t.total.handSum + t.total.machineSum;
    t.sum20 = percentOf(t.sum100, PICKING_MONEY_SHARE_PCT);
    t.paidTotal = inn ? (paidTotal.get(inn) ?? 0n) : 0n;
    t.paidToday = inn ? (paidToday.get(inn) ?? 0n) : 0n;
    t.pickingBalance = t.sum20 - t.paidTotal;
    const ship = inn ? shippedByInn.get(inn) : undefined;
    t.shippedKg = ship?.kg ?? 0;
    t.shippedValue = ship?.value ?? 0n;
    t.farmerCount = 1;
    const totalKg = t.total.handKg + t.total.machineKg;
    return {
      ...t,
      key: p.key,
      numberInBlock: 0,
      section: entry?.section || UNASSIGNED_SECTION,
      hudud: entry?.hudud || UNASSIGNED_SECTION,
      displayName: entry?.displayName ?? acc?.basketName ?? "—",
      basketName: acc?.basketName ?? entry?.basketName ?? null,
      inn,
      contracts: acc ? [...acc.contracts.keys()] : [],
      contractTypes: acc ? [...new Set([...acc.contracts.values()].map((c) => c.type).filter((x): x is string => !!x))] : [],
      achievementPct: t.planT > 0 ? (totalKg / (t.planT * 1000)) * 100 : null,
      directoryMatch: p.directoryMatch,
      deals: ship?.deals ?? 0,
      dealQtyKg: ship?.dealQtyKg ?? 0,
      unknownMethodKg: acc?.unknownMethodKg ?? 0
    };
  }

  const lines: FarmerLine[] = [];
  const innOfEntry = new Map<DirectoryEntry, string>();
  for (const [inn, l] of linked) if (l.entry) innOfEntry.set(l.entry, inn);
  for (const entry of input.directory) {
    const inn = innOfEntry.get(entry) ?? null;
    const acc = inn ? (farmers.get(inn) ?? null) : null;
    const link = inn ? linked.get(inn) : undefined;
    lines.push(buildLine({ key: inn ?? `dir:${entry.order}`, entry, acc, directoryMatch: link ? { method: link.method, confidence: link.confidence } : entry.inn ? { method: "NOT_IN_BASKET", confidence: null } : null }));
  }
  // Режа keeps the existing module's rule (Σ distinct contract quantities);
  // the hand-made report deviates for some multi-contract farmers, so every
  // difference is surfaced rather than silently picking one (BUSINESS_RULE_REQUIRED).
  for (const l of lines) {
    const entry = input.directory.find((e) => e.displayName === l.displayName && e.hudud === l.hudud);
    if (l.inn && entry?.planT != null && farmers.has(l.inn) && Math.abs(entry.planT - l.planT) > 0.001) {
      issues.push({
        severity: "WARNING",
        code: "PLAN_DIFFERS_FROM_DIRECTORY",
        source: "REPORT",
        ref: `${l.displayName} (${l.contracts.join(", ")})`,
        message: `Режа basket шартномалари бўйича ${l.planT} т, маълумотномада ${entry.planT} т. BUSINESS_RULE_REQUIRED: кўп шартномали фермер режаси қандай ҳисобланиши тасдиқлансин.`
      });
    }
  }
  const unassigned = [...farmers.values()].filter((a) => !linked.get(a.inn)?.entry).sort((a, b) => a.basketName.localeCompare(b.basketName));
  for (const acc of unassigned) lines.push(buildLine({ key: acc.inn, entry: null, acc, directoryMatch: null }));

  // ---- layout (sections → ҳудуд blocks → farmers, with subtotals) ----------------------
  const layout: LayoutRow[] = [];
  const sections: string[] = [];
  for (const l of lines) if (!sections.includes(l.section)) sections.push(l.section);
  const sectionTotals: Totals[] = [];
  for (const section of sections) {
    const inSection = lines.filter((l) => l.section === section);
    const hududs: string[] = [];
    for (const l of inSection) if (!hududs.includes(l.hudud)) hududs.push(l.hudud);
    const single = hududs.length === 1 && hududs[0] === section;
    for (const h of hududs) {
      const block = inSection.filter((l) => l.hudud === h);
      layout.push({ kind: "header", label: h });
      block.forEach((l, i) => {
        l.numberInBlock = i + 1;
        layout.push({ kind: "farmer", line: l });
      });
      if (!single) layout.push({ kind: "subtotal", label: "Ҳудуд жами", level: "hudud", totals: aggregate(block) });
    }
    const st = aggregate(inSection);
    sectionTotals.push(st);
    layout.push({ kind: "subtotal", label: single ? "Жами" : `${section} жами`, level: "section", totals: st });
  }
  const grand = aggregate(sectionTotals);
  layout.push({ kind: "subtotal", label: "Хаммаси", level: "grand", totals: grand });

  // ---- daily series / regions / KPIs ------------------------------------------------------
  let cumulative = 0;
  const daily: DailyTotal[] = days.map((d) => {
    const c = grand.days.get(d) ?? emptyDay();
    const totalKg = roundKg(c.handKg + c.machineKg);
    cumulative = roundKg(cumulative + totalKg);
    return { ...c, date: d, totalKg, totalSum: c.handSum + c.machineSum, cumulativeKg: cumulative };
  });

  const hududMap = new Map<string, { hudud: string; section: string; totalKg: number; todayKg: number; farmers: number }>();
  for (const l of lines) {
    const h = hududMap.get(l.hudud) ?? { hudud: l.hudud, section: l.section, totalKg: 0, todayKg: 0, farmers: 0 };
    h.totalKg = roundKg(h.totalKg + l.total.handKg + l.total.machineKg);
    h.todayKg = roundKg(h.todayKg + l.today.handKg + l.today.machineKg);
    if (l.total.handKg + l.total.machineKg > 0) h.farmers++;
    hududMap.set(l.hudud, h);
  }

  const shipmentFarmers: ShipmentFarmer[] = [];
  const sfMap = new Map<string, ShipmentFarmer>();
  for (const c of shipmentContracts) {
    const key = c.farmerInn ?? `name:${c.sellerName ?? c.dealNumber}`;
    const f = sfMap.get(key) ?? { inn: c.farmerInn, name: c.farmerName ?? c.sellerName ?? "—", deals: 0, contractQtyKg: 0, dealQtyKg: 0, shippedKg: 0, shippedValue: 0n, basketAcceptedKg: 0, paidNet: 0n };
    f.deals++;
    f.contractQtyKg = roundKg(f.contractQtyKg + (c.contractQtyKg ?? 0));
    f.dealQtyKg = roundKg(f.dealQtyKg + (c.dealQtyKg ?? 0));
    f.shippedKg = roundKg(f.shippedKg + c.shippedKg);
    f.shippedValue += c.shippedValue;
    f.basketAcceptedKg = roundKg(f.basketAcceptedKg + c.basketAcceptedKg);
    f.paidNet += c.paidNet;
    sfMap.set(key, f);
  }
  shipmentFarmers.push(...[...sfMap.values()].sort((a, b) => b.shippedKg - a.shippedKg));

  const displayByInn = new Map(lines.filter((l) => l.inn).map((l) => [l.inn!, l.displayName]));
  for (const p of payments) p.farmerDisplayName = p.match.inn ? (displayByInn.get(p.match.inn) ?? null) : null;
  for (const f of shipmentFarmers) if (f.inn) f.name = displayByInn.get(f.inn) ?? f.name;

  const farmersWithHarvest = lines.filter((l) => l.total.handKg + l.total.machineKg > 0).length;
  const kpi: KunlikReport["kpi"] = {
    todayHandKg: grand.today.handKg,
    todayMachineKg: grand.today.machineKg,
    todayTotalKg: roundKg(grand.today.handKg + grand.today.machineKg),
    seasonHandKg: grand.total.handKg,
    seasonMachineKg: grand.total.machineKg,
    seasonTotalKg: roundKg(grand.total.handKg + grand.total.machineKg),
    farmersWithHarvest,
    farmersToday: lines.filter((l) => l.today.handKg + l.today.machineKg > 0).length,
    contracts: new Set(input.counted.map((r) => r.contractNumber).filter(Boolean)).size,
    paidToday: grand.paidToday,
    paidTotal: grand.paidTotal,
    pickingBalance: grand.pickingBalance,
    rkpFreeBalance: accountTotals.FREE,
    shippedKg: shipmentContracts.reduce((a, c) => roundKg(a + c.shippedKg), 0),
    shippedValue: shipmentContracts.reduce((a, c) => a + c.shippedValue, 0n),
    shipmentDeals: shipmentContracts.length
  };

  return {
    reportDate: input.reportDate,
    generatedAt: input.generatedAt,
    sourceUpdatedAt: input.sourceUpdatedAt,
    days,
    layout,
    lines,
    grand,
    daily,
    hudud: [...hududMap.values()],
    payments,
    ownerLegs,
    accounts,
    accountTotals,
    shipments,
    shipmentContracts,
    shipmentFarmers,
    kpi,
    issues
  };
}
