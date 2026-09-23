// Plain-JSON view of a Кунлик терим report for the temporary web dashboard.
// Client components can't receive bigint or Map, so money becomes so'm
// numbers and weights become tons here — presentation only; every figure is
// the same one the Excel/PDF show.
import { tiyinToSum } from "./utils/numbers.ts";
import { SOURCE_LABELS } from "./classifier.ts";
import type { ReportData } from "./service.ts";

const T = (kg: number) => Math.round(kg) / 1000;

export type KunlikWebData = ReturnType<typeof toWebView>;

export function toWebView(d: ReportData, expiresAt: string | null) {
  const r = d.report;
  const k = r.kpi;
  return {
    reportDate: r.reportDate,
    generatedAt: r.generatedAt,
    sourceUpdatedAt: r.sourceUpdatedAt,
    expiresAt,
    kpi: {
      todayHandT: T(k.todayHandKg),
      todayMachineT: T(k.todayMachineKg),
      todayTotalT: T(k.todayTotalKg),
      seasonHandT: T(k.seasonHandKg),
      seasonMachineT: T(k.seasonMachineKg),
      seasonTotalT: T(k.seasonTotalKg),
      farmersWithHarvest: k.farmersWithHarvest,
      farmersToday: k.farmersToday,
      contracts: k.contracts,
      paidToday: tiyinToSum(k.paidToday),
      paidTotal: tiyinToSum(k.paidTotal),
      pickingBalance: tiyinToSum(k.pickingBalance),
      sum20: tiyinToSum(r.grand.sum20),
      rkpFree: tiyinToSum(k.rkpFreeBalance),
      rkpBlocked: tiyinToSum(r.accountTotals.BLOCKED),
      rkpInTransit: tiyinToSum(r.accountTotals.IN_TRANSIT),
      shippedT: T(k.shippedKg),
      shippedValue: tiyinToSum(k.shippedValue),
      shipmentDeals: k.shipmentDeals
    },
    daily: r.daily.map((x) => ({ date: x.date, handT: T(x.handKg), machineT: T(x.machineKg), totalT: T(x.totalKg), cumulativeT: T(x.cumulativeKg) })),
    hudud: r.hudud.map((h) => ({ hudud: h.hudud, section: h.section, totalT: T(h.totalKg), todayT: T(h.todayKg), farmers: h.farmers })),
    farmers: r.lines.map((l) => ({
      section: l.section,
      hudud: l.hudud,
      name: l.displayName,
      basketName: l.basketName,
      inn: l.inn,
      contracts: l.contracts.join(", "),
      planT: l.planT,
      todayHandT: T(l.today.handKg),
      todayMachineT: T(l.today.machineKg),
      totalHandT: T(l.total.handKg),
      totalMachineT: T(l.total.machineKg),
      achievementPct: l.achievementPct == null ? null : Math.round(l.achievementPct * 10) / 10,
      sum100: tiyinToSum(l.sum100),
      sum20: tiyinToSum(l.sum20),
      paidToday: tiyinToSum(l.paidToday),
      paidTotal: tiyinToSum(l.paidTotal),
      balance: tiyinToSum(l.pickingBalance),
      shippedT: T(l.shippedKg)
    })),
    payments: r.payments.map((p) => ({
      at: p.opDateTime,
      txId: p.txId,
      name: p.counterpartyName,
      inn: p.counterpartyInn,
      deal: p.dealNumber,
      net: tiyinToSum(p.net),
      reversal: p.isReversal,
      farmer: p.farmerDisplayName,
      match: p.match.method
    })),
    accounts: r.accounts.map((a) => ({ account: a.account, name: a.accountName, balance: tiyinToSum(a.balance), owner: a.ownerKind })),
    shipments: r.shipmentContracts.map((c) => ({
      deal: c.dealNumber,
      farmer: c.farmerName,
      seller: c.sellerName,
      contractT: c.contractQtyKg == null ? null : T(c.contractQtyKg),
      dealT: c.dealQtyKg == null ? null : T(c.dealQtyKg),
      basketT: T(c.basketAcceptedKg),
      shippedT: T(c.shippedKg),
      documents: c.documents,
      value: tiyinToSum(c.shippedValue),
      paid: tiyinToSum(c.paidNet),
      lastDocument: c.lastDocumentDate,
      match: c.match.method
    })),
    dq: d.dq,
    issues: d.issues.slice(0, 1000).map((i) => ({ severity: i.severity, code: i.code, source: i.source, row: i.row ?? null, ref: i.ref ?? null, message: i.message })),
    files: d.files.map((f) => ({ ...f, label: SOURCE_LABELS[f.type] }))
  };
}
