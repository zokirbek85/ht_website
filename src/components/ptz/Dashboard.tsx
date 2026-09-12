import type { ReportBundle } from "@/lib/ptz/reportBundle";
import { CONTRACT_TYPE_LABELS_UZ } from "@/lib/ptz/excel-mapping";
import type { ContractType, ForecastStatus } from "@/lib/ptz/types";
import { getOverallTrend } from "@/lib/ptz/analytics";

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? "—" : `${fmt(n)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const STATUS_STYLE: Record<ForecastStatus, { label: string; bg: string; fg: string }> = {
  GREEN: { label: "🟢 Режа бўйича", bg: "bg-emerald-50", fg: "text-emerald-700" },
  YELLOW: { label: "🟡 Хавф остида", bg: "bg-amber-50", fg: "text-amber-700" },
  RED: { label: "🔴 Режадан ортда", bg: "bg-red-50", fg: "text-red-700" },
  UNKNOWN: { label: "⚪ Маълумот етарли эмас", bg: "bg-slate-100", fg: "text-slate-600" }
};

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-[var(--border,#e2e8f0)] bg-white p-4 shadow-sm">
      <div className="text-[0.7rem] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-forest">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number | null }) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0));
  const color = clamped >= 100 ? "bg-emerald-500" : clamped >= 60 ? "bg-forest-mid" : "bg-red-500";
  return (
    <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full ${color} transition-[width]`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function RankingTable({
  title,
  rows
}: {
  title: string;
  rows: { name: string; region: string | null; planQty: number; cumulativeQty: number; dailyQty: number; completionPct: number | null }[];
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-forest">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-1.5 pr-2">Номи</th>
              <th className="py-1.5 pr-2">Ҳудуд</th>
              <th className="py-1.5 pr-2 text-right">Режа</th>
              <th className="py-1.5 pr-2 text-right">Қабул</th>
              <th className="py-1.5 pr-2 text-right">Бугун</th>
              <th className="py-1.5 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-slate-400">
                  Маълумот йўқ
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2 font-medium text-ink">{r.name}</td>
                <td className="py-1.5 pr-2 text-slate-500">{r.region ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.planQty)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.cumulativeQty)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.dailyQty)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{fmtPct(r.completionPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: { date: string; cumulativeQty: number; dailyQty: number }[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-slate-500">Тренд учун етарли тарихий маълумот йўқ.</p>;
  }
  const width = 640;
  const height = 140;
  const padding = 8;
  const maxDaily = Math.max(...points.map((p) => p.dailyQty), 1);

  const barWidth = (width - padding * 2) / points.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Кунлик қабул тренди">
      {points.map((p, i) => {
        const barHeight = (Math.max(p.dailyQty, 0) / maxDaily) * (height - padding * 2);
        const x = padding + i * barWidth;
        const y = height - padding - barHeight;
        return (
          <g key={p.date}>
            <rect x={x + 2} y={y} width={Math.max(barWidth - 4, 2)} height={barHeight} fill="#075F9F" rx={1}>
              <title>{`${p.date}: ${fmt(p.dailyQty)} т`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

export function Dashboard({ bundle }: { bundle: ReportBundle }) {
  const status = STATUS_STYLE[bundle.forecast.status];
  const growthPct =
    bundle.previousDailyQty && bundle.previousDailyQty !== 0
      ? ((bundle.overall.dailyQty - bundle.previousDailyQty) / bundle.previousDailyQty) * 100
      : null;
  const trend = getOverallTrend().slice(-14);

  return (
    <div className="min-h-screen bg-cotton px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-forest">HAZORASP-TEXTIL · PTZ Аналитика</h1>
            <p className="text-sm text-slate-500">Ҳисобот санаси: {fmtDate(bundle.report.reportDate)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${status.bg} ${status.fg}`}>{status.label}</span>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Умумий режа" value={`${fmt(bundle.overall.planQty)} т`} />
          <KpiCard label="Жами қабул" value={`${fmt(bundle.overall.cumulativeQty)} т`} />
          <KpiCard label="Бажарилиши" value={fmtPct(bundle.forecast.completionPct)} />
          <KpiCard
            label="Бугунги қабул"
            value={`${fmt(bundle.overall.dailyQty)} т`}
            sub={growthPct != null ? `${growthPct >= 0 ? "+" : ""}${fmt(growthPct)}% кечагига нисбатан` : undefined}
          />
          <KpiCard label="Қолдиқ" value={`${fmt(bundle.forecast.remainingQty)} т`} />
          <KpiCard label="Керакли темп" value={`${fmt(bundle.forecast.requiredDailyRate)} т/кун`} />
          <KpiCard label="Амалдаги темп" value={`${fmt(bundle.forecast.currentRunRate)} т/кун`} />
          <KpiCard label="Прогноз санаси" value={fmtDate(bundle.forecast.forecastDate)} />
          <KpiCard label="Муддат" value={fmtDate(bundle.forecast.deadline)} />
          <KpiCard label="Огоҳлантиришлар" value={String(bundle.warningMessages.length)} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-forest">Режа бажарилиши</h2>
          <ProgressBar pct={bundle.forecast.completionPct} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-forest">Кунлик қабул тренди (сўнгги {trend.length} ҳисобот)</h2>
          <TrendChart points={trend} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-forest">Шартнома турлари бўйича</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1.5 pr-2">Тур</th>
                  <th className="py-1.5 pr-2 text-right">Режа</th>
                  <th className="py-1.5 pr-2 text-right">Қабул</th>
                  <th className="py-1.5 pr-2 text-right">%</th>
                  <th className="py-1.5 pr-2 text-right">Бугун</th>
                  <th className="py-1.5 text-right">Прогноз</th>
                </tr>
              </thead>
              <tbody>
                {bundle.contractTypes.map((ct) => (
                  <tr key={ct.contractType} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-2 font-medium">{CONTRACT_TYPE_LABELS_UZ[ct.contractType as ContractType]}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(ct.planQty)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(ct.cumulativeQty)}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{fmtPct(ct.completionPct)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(ct.dailyQty)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtDate(ct.forecast.forecastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <RankingTable title="ТОП-10 ҳудудлар" rows={bundle.topRegions} />
          <RankingTable title="Орқада қолган 10 ҳудуд" rows={bundle.bottomRegions} />
          <RankingTable title="ТОП-10 фермер хўжаликлари" rows={bundle.topFarmers} />
          <RankingTable title="Орқада қолган 10 фермер хўжалиги" rows={bundle.bottomFarmers} />
        </section>

        <RankingTable title="Риск остидаги фермерлар (бажарилиши < 50%)" rows={bundle.riskFarmers} />

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-forest">Маълумот сифати бўйича огоҳлантиришлар</h2>
          {bundle.warningMessages.length === 0 ? (
            <p className="text-sm text-slate-500">Огоҳлантиришлар йўқ.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              {bundle.warningMessages.slice(0, 30).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </section>

        <footer className="pb-6 text-center text-xs text-slate-400">
          Ушбу ҳавола вақтинчалик ва фақат чекланган вақт давомида амал қилади. HAZORASP-TEXTIL PTZ Analytics.
        </footer>
      </div>
    </div>
  );
}
