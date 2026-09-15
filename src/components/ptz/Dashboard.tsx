"use client";

import { useMemo, useState } from "react";
import type { OperationEntity, ClusterAnalytics, ContractPerformance, FarmerAnalytics, FinanceDashboard, ManagementSummary, QualityDashboard, TrendPoint, WeightBridgeStage } from "@/lib/ptz/analytics";
import type { Alert, AlertSeverity, ImportRecord } from "@/lib/ptz/types";

export type DashboardData = {
  import: ImportRecord;
  summary: ManagementSummary;
  contracts: ContractPerformance[];
  farmers: FarmerAnalytics[];
  topFarmers: FarmerAnalytics[];
  bottomFarmers: FarmerAnalytics[];
  clusters: ClusterAnalytics[];
  quality: QualityDashboard;
  finance: FinanceDashboard;
  weightBridge: WeightBridgeStage[];
  dailyTrend: TrendPoint[];
  alerts: Alert[];
  assumptions: string[];
  operations: OperationEntity[];
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

const SEVERITY_STYLE: Record<AlertSeverity, { label: string; className: string }> = {
  RED: { label: "🔴 Критик", className: "border-[#8a3a3a] bg-[color-mix(in_srgb,#b23a3a_18%,transparent)] text-[#f4a6a6]" },
  YELLOW: { label: "🟡 Огоҳлантириш", className: "border-[#8a7a2e] bg-[color-mix(in_srgb,#a8901f_18%,transparent)] text-[#f0d778]" },
  GREEN: { label: "🟢 Норма", className: "border-[#3f7a4a] bg-[color-mix(in_srgb,#2e7d3f_18%,transparent)] text-[#8fe6a0]" },
  INFO: { label: "⚪ Маълумот", className: "border-[var(--surface-dark-border)] bg-white/5 text-[var(--surface-dark-text-soft)]" }
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">{label}</div>
      <div className="mt-1 font-display text-[1.15rem] font-semibold text-[var(--text)]">{value}</div>
      {sub && <div className="mt-0.5 text-[0.72rem] text-[var(--text-soft)]">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number | null }) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0));
  const color = clamped >= 100 ? "#2e7d3f" : clamped >= 60 ? "var(--forest-mid)" : "#b23a3a";
  return (
    <div className="h-3 w-full overflow-hidden rounded-s bg-[var(--bg-sunken)]">
      <div className="h-full transition-[width]" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <p className="text-sm text-[var(--text-soft)]">Тренд учун етарли тарихий маълумот йўқ.</p>;
  const width = 640;
  const height = 140;
  const padding = 8;
  const maxDaily = Math.max(...points.map((p) => p.dailyAcceptedKg), 1);
  const barWidth = (width - padding * 2) / points.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Кунлик қабул тренди">
      {points.map((p, i) => {
        const barHeight = (Math.max(p.dailyAcceptedKg, 0) / maxDaily) * (height - padding * 2);
        const x = padding + i * barWidth;
        const y = height - padding - barHeight;
        return (
          <rect key={p.date} x={x + 2} y={y} width={Math.max(barWidth - 4, 2)} height={barHeight} fill="var(--forest-mid)" rx={1}>
            <title>{`${fmtDate(p.date)}: ${fmtTons(p.dailyAcceptedKg)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const TABS = ["Раҳбарият", "Операцион", "Назорат маркази"] as const;
type Tab = (typeof TABS)[number];

export function Dashboard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<Tab>("Раҳбарият");
  const status = overallStatus(data.alerts);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="on-dark text-[var(--surface-dark-text)]" style={{ background: "color-mix(in srgb, var(--forest-deep) 92%, transparent)" }}>
        <div className="container-brand py-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="eyebrow">Пахта қабули аналитикаси</div>
            <span className={`rounded-s border px-3 py-1 font-display text-[0.72rem] font-semibold uppercase tracking-wide ${status.className}`}>{status.label}</span>
          </div>
          <h1 className="heading-natural mt-2 font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold text-white">HAZORASP-TEXTIL</h1>
          <p className="mt-1 font-mono text-[0.78rem] text-[var(--surface-dark-text-soft)]">
            Ҳисобот санаси: {fmtDate(data.import.reportGeneratedAt)} · Маълумот даври: {fmtDate(data.import.dataPeriodStart)} — {fmtDate(data.import.dataPeriodEnd)}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-5 sm:gap-0">
            <HeroStat label="Шартнома миқдори" value={fmtTons(data.summary.contractQtyKg)} />
            <HeroStat label="Қабул қилинган" value={fmtTons(data.summary.acceptedKg)} />
            <HeroStat label="Бажарилиши" value={fmtPct(data.summary.achievementPct)} />
            <HeroStat label="Бугунги қабул" value={fmtTons(data.summary.todayAcceptedKg)} />
            <HeroStat label="Фермерлар" value={String(data.summary.farmerCount)} />
          </div>

          <div className="mt-8 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-s px-4 py-2 font-display text-[0.78rem] font-semibold uppercase tracking-wide transition-colors ${
                  tab === t ? "bg-white text-[var(--forest-deep)]" : "border border-[var(--surface-dark-border)] text-[var(--surface-dark-text-soft)] hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container-brand space-y-6 py-8 sm:py-10">
        {tab === "Раҳбарият" && <ManagementTab data={data} />}
        {tab === "Операцион" && <OperationalTab data={data} />}
        {tab === "Назорат маркази" && <ControlCenterTab data={data} />}

        <footer className="pb-6 text-center font-mono text-[0.7rem] text-[var(--text-soft)]">
          Ушбу ҳавола вақтинчалик ва фақат чекланган вақт давомида амал қилади. HAZORASP-TEXTIL Пахта Қабули Аналитикаси.
        </footer>
      </main>
    </div>
  );
}

function overallStatus(alerts: Alert[]): { label: string; className: string } {
  if (alerts.some((a) => a.severity === "RED")) return { label: "🔴 Диққат талаб этади", className: "border-[#8a3a3a] bg-[color-mix(in_srgb,#b23a3a_18%,transparent)] text-[#f4a6a6]" };
  if (alerts.some((a) => a.severity === "YELLOW")) return { label: "🟡 Огоҳлантиришлар мавжуд", className: "border-[#8a7a2e] bg-[color-mix(in_srgb,#a8901f_18%,transparent)] text-[#f0d778]" };
  return { label: "🟢 Яхши ҳолатда", className: "border-[#3f7a4a] bg-[color-mix(in_srgb,#2e7d3f_18%,transparent)] text-[#8fe6a0]" };
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-0 sm:px-5">
      <div className="font-display text-[clamp(1.3rem,2.6vw,1.9rem)] text-white">{value}</div>
      <div className="mt-1.5 font-display text-[0.66rem] uppercase tracking-wider text-[var(--surface-dark-text-soft)]">{label}</div>
    </div>
  );
}

// --- Раҳбарият (Management) ------------------------------------------------

function ManagementTab({ data }: { data: DashboardData }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Қолдиқ" value={fmtTons(data.summary.remainingKg)} />
        <KpiTile label="Шартномадан ортиқча" value={fmtTons(data.summary.overDeliveryKg)} />
        <KpiTile label="Харид суммаси" value={fmtSum(data.summary.totalAmount)} />
        <KpiTile label="Ўртача нарх (тортилган)" value={data.summary.weightedAvgPrice != null ? `${fmt(data.summary.weightedAvgPrice, 0)} сўм/кг` : "—"} />
        <KpiTile label="Шартномалар сони" value={String(data.summary.contractCount)} />
        <KpiTile label="Қабул операциялари" value={String(data.summary.operationCount)} />
        <KpiTile label="Бугунги харид суммаси" value={fmtSum(data.finance.todayAmount)} />
        <KpiTile label="Огоҳлантиришлар" value={String(data.alerts.reduce((a, al) => a + al.count, 0))} />
      </section>

      <Card>
        <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Режа бажарилиши (жами)</h2>
        <ProgressBar pct={data.summary.achievementPct} />
      </Card>

      <Card>
        <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">
          Кунлик қабул тренди <span className="text-[var(--text-soft)]">({data.dailyTrend.length} кун)</span>
        </h2>
        <TrendChart points={data.dailyTrend} />
      </Card>

      <Card>
        <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Шартномалар бўйича бажарилиш</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[0.78rem]">
            <thead>
              <tr className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
                <th className="pb-2 pr-2 font-normal">Шартнома</th>
                <th className="pb-2 pr-2 font-normal">Фермер</th>
                <th className="pb-2 pr-2 text-right font-normal">Шартнома, т</th>
                <th className="pb-2 pr-2 text-right font-normal">Қабул, т</th>
                <th className="pb-2 pr-2 text-right font-normal">Қолдиқ, т</th>
                <th className="pb-2 text-right font-normal">%</th>
                <th className="pb-2 pl-2 text-right font-normal">Ҳолат</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.contracts.slice(0, 30).map((c) => (
                <tr key={c.contractNumber}>
                  <td className="py-2 pr-2 font-medium text-[var(--text)]">{c.contractNumber}</td>
                  <td className="py-2 pr-2 text-[var(--text-soft)]">{c.farmerName}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(c.contractQtyKg / 1000)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(c.acceptedKg / 1000)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(c.remainingKg / 1000)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtPct(c.achievementPct)}</td>
                  <td className="py-2 pl-2 text-right text-[0.72rem] text-[var(--text-soft)]">{STATUS_LABEL[c.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.contracts.length > 30 && <p className="mt-2 text-[0.72rem] text-[var(--text-soft)]">... яна {data.contracts.length - 30} та шартнома (тўлиқ рўйхат — XLSX ҳисоботда).</p>}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <RankingTable title="ТОП-10 фермер хўжаликлари" rows={data.topFarmers} />
        <RankingTable title="Орқада қолган 10 фермер хўжалиги" rows={data.bottomFarmers} />
      </section>

      <Card>
        <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Кластерлар таҳлили</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[0.78rem]">
            <thead>
              <tr className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
                <th className="pb-2 pr-2 font-normal">Кластер</th>
                <th className="pb-2 pr-2 text-right font-normal">Шартнома, т</th>
                <th className="pb-2 pr-2 text-right font-normal">Қабул, т</th>
                <th className="pb-2 text-right font-normal">%</th>
                <th className="pb-2 pl-2 text-right font-normal">Фермерлар</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.clusters.map((c) => (
                <tr key={c.clusterName}>
                  <td className="py-2 pr-2 font-medium text-[var(--text)]">{c.clusterName}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(c.contractQtyKg / 1000)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(c.acceptedKg / 1000)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtPct(c.achievementPct)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums text-[var(--text-soft)]">{c.farmerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Сифат кўрсаткичлари</h2>
          <div className="grid grid-cols-2 gap-3 text-[0.82rem]">
            <div>Намлик (ўртача): <b>{fmtPct(data.quality.moisture.avg)}</b></div>
            <div>Ифлослик (ўртача): <b>{fmtPct(data.quality.impurity.avg)}</b></div>
            <div>Намлик (мин/макс): {fmtPct(data.quality.moisture.min)} / {fmtPct(data.quality.moisture.max)}</div>
            <div>Ифлослик (мин/макс): {fmtPct(data.quality.impurity.min)} / {fmtPct(data.quality.impurity.max)}</div>
          </div>
          {!data.quality.thresholdsConfigured && (
            <p className="mt-3 text-[0.72rem] text-[var(--text-soft)]">⚠️ Сифат меъёрлари мижоз томонидан тасдиқланмаган — вақтинчалик қийматлар ишлатилмоқда.</p>
          )}
        </Card>
        <Card>
          <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Вазн кўприги</h2>
          <div className="space-y-2">
            {data.weightBridge.map((s) => (
              <div key={s.stage} className="flex items-center justify-between border-b border-[var(--border)] py-1.5 text-[0.8rem] last:border-0">
                <span className="text-[var(--text-soft)]">{s.stage}</span>
                <span className="tabular-nums text-[var(--text)]">
                  {fmt(s.totalKg, 0)} кг {s.diffFromPrevPct != null && <span className="text-[var(--text-soft)]">({fmtPct(s.diffFromPrevPct)})</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Бошланмаган",
  IN_PROGRESS: "Жараёнда",
  NEAR_COMPLETION: "Якунга яқин",
  COMPLETED: "Якунланган",
  OVER_CONTRACT: "Ортиқча"
};

function RankingTable({ title, rows }: { title: string; rows: FarmerAnalytics[] }) {
  return (
    <Card>
      <h3 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-[0.78rem]">
          <thead>
            <tr className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
              <th className="pb-2 pr-2 font-normal">Номи</th>
              <th className="pb-2 pr-2 text-right font-normal">Шартнома, т</th>
              <th className="pb-2 pr-2 text-right font-normal">Қабул, т</th>
              <th className="pb-2 text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[var(--text-soft)]">Маълумот йўқ</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.farmerName}-${i}`}>
                <td className="py-2 pr-2 font-medium text-[var(--text)]">{r.farmerName}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.contractQtyKg / 1000)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.acceptedKg / 1000)}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtPct(r.achievementPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// --- Операцион (Operational drill-down) ------------------------------------

function OperationalTab({ data }: { data: DashboardData }) {
  const [farmer, setFarmer] = useState("");
  const [date, setDate] = useState("");
  const [contract, setContract] = useState("");

  const farmers = useMemo(() => [...new Set(data.operations.map((r) => r.farmerName))].sort(), [data.operations]);
  const dates = useMemo(() => [...new Set(data.operations.map((r) => r.acceptanceDate).filter(Boolean))].sort() as string[], [data.operations]);
  const contracts = useMemo(() => [...new Set(data.operations.map((r) => r.contractNumber).filter(Boolean))].sort() as string[], [data.operations]);

  const filtered = useMemo(
    () =>
      data.operations.filter(
        (r) => (!farmer || r.farmerName === farmer) && (!date || r.acceptanceDate === date) && (!contract || r.contractNumber === contract)
      ),
    [data.operations, farmer, date, contract]
  );

  return (
    <>
      <Card>
        <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Фильтрлар</h2>
        <div className="flex flex-wrap gap-3">
          <select value={date} onChange={(e) => setDate(e.target.value)} className="rounded-s border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[0.82rem]">
            <option value="">Барча саналар</option>
            {dates.map((d) => (
              <option key={d} value={d}>{fmtDate(d)}</option>
            ))}
          </select>
          <select value={farmer} onChange={(e) => setFarmer(e.target.value)} className="rounded-s border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[0.82rem]">
            <option value="">Барча фермерлар</option>
            {farmers.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select value={contract} onChange={(e) => setContract(e.target.value)} className="rounded-s border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[0.82rem]">
            <option value="">Барча шартномалар</option>
            {contracts.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="self-center text-[0.78rem] text-[var(--text-soft)]">{filtered.length} та операция</span>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[0.76rem]">
            <thead>
              <tr className="font-mono text-[0.64rem] uppercase tracking-wide text-[var(--text-soft)]">
                <th className="pb-2 pr-2 font-normal">Сана</th>
                <th className="pb-2 pr-2 font-normal">Фермер</th>
                <th className="pb-2 pr-2 font-normal">Шартнома</th>
                <th className="pb-2 pr-2 font-normal">ПК-17</th>
                <th className="pb-2 pr-2 text-right font-normal">Физик, кг</th>
                <th className="pb-2 pr-2 text-right font-normal">Кондицион, кг</th>
                <th className="pb-2 pr-2 text-right font-normal">Намлик, %</th>
                <th className="pb-2 pr-2 text-right font-normal">Ифлослик, %</th>
                <th className="pb-2 font-normal">Транспорт</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.slice(0, 300).map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-2 text-[var(--text-soft)]">{fmtDate(r.acceptanceDate)}</td>
                  <td className="py-1.5 pr-2 font-medium text-[var(--text)]">{r.farmerName}</td>
                  <td className="py-1.5 pr-2 text-[var(--text-soft)]">{r.contractNumber ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-[var(--text-soft)]">{r.pk17Number ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.physicalKg, 0)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.conditionedKg, 0)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.moisturePct)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.impurityPct)}</td>
                  <td className="py-1.5 text-[var(--text-soft)]">{r.vehiclePlate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 && <p className="mt-2 text-[0.72rem] text-[var(--text-soft)]">... яна {filtered.length - 300} та ёзув (XLSX ҳисоботда тўлиқ рўйхат).</p>}
        </div>
      </Card>
    </>
  );
}

// --- Назорат маркази (Control center) --------------------------------------

function ControlCenterTab({ data }: { data: DashboardData }) {
  const categories = [
    { key: "CONTRACT" as const, label: "Шартнома огоҳлантиришлари" },
    { key: "DATA" as const, label: "Маълумот сифати огоҳлантиришлари" },
    { key: "QUALITY" as const, label: "Сифат огоҳлантиришлари" }
  ];

  if (data.alerts.length === 0) {
    return (
      <Card>
        <p className="text-[var(--text-soft)]">Огоҳлантиришлар аниқланмади.</p>
      </Card>
    );
  }

  return (
    <>
      {categories.map(({ key, label }) => {
        const alerts = data.alerts.filter((a) => a.category === key);
        if (alerts.length === 0) return null;
        return (
          <Card key={key}>
            <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">{label}</h2>
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.code} className="rounded-s border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-s border px-2 py-0.5 font-display text-[0.68rem] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[a.severity].className}`}>
                      {SEVERITY_STYLE[a.severity].label}
                    </span>
                    <span className="font-medium text-[var(--text)]">{a.title}</span>
                    <span className="text-[0.78rem] text-[var(--text-soft)]">{a.count} та</span>
                  </div>
                  {a.sampleRecords.length > 0 && (
                    <p className="mt-2 text-[0.76rem] text-[var(--text-soft)]">{a.sampleRecords.join("; ")}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      <Card>
        <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">Ҳисоблаш усуллари ва тахминлар</h2>
        <ul className="list-disc space-y-1 pl-5 text-[0.8rem] text-[var(--text-soft)]">
          {data.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
