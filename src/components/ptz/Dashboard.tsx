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

const STATUS_STYLE: Record<ForecastStatus, { label: string; className: string }> = {
  GREEN: { label: "🟢 Режа бўйича", className: "border-[#3f7a4a] bg-[color-mix(in_srgb,#2e7d3f_18%,transparent)] text-[#8fe6a0]" },
  YELLOW: { label: "🟡 Хавф остида", className: "border-[#8a7a2e] bg-[color-mix(in_srgb,#a8901f_18%,transparent)] text-[#f0d778]" },
  RED: { label: "🔴 Режадан ортда", className: "border-[#8a3a3a] bg-[color-mix(in_srgb,#b23a3a_18%,transparent)] text-[#f4a6a6]" },
  UNKNOWN: { label: "⚪ Маълумот етарли эмас", className: "border-[var(--surface-dark-border)] bg-white/5 text-[var(--surface-dark-text-soft)]" }
};

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-0 sm:px-5">
      <div className="font-display text-[clamp(1.3rem,2.6vw,1.9rem)] text-white">{value}</div>
      <div className="mt-1.5 font-display text-[0.66rem] uppercase tracking-wider text-[var(--surface-dark-text-soft)]">
        {label}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[0.68rem] text-[var(--surface-dark-text-soft)]">{sub}</div>}
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

type Row = { name: string; region: string | null; planQty: number; cumulativeQty: number; dailyQty: number; completionPct: number | null };

function RankingTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="card p-5">
      <h3 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-[0.78rem]">
          <thead>
            <tr className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
              <th className="pb-2 pr-2 font-normal">Номи</th>
              <th className="pb-2 pr-2 font-normal">Ҳудуд</th>
              <th className="pb-2 pr-2 text-right font-normal">Режа</th>
              <th className="pb-2 pr-2 text-right font-normal">Қабул</th>
              <th className="pb-2 pr-2 text-right font-normal">Бугун</th>
              <th className="pb-2 text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-[var(--text-soft)]">
                  Маълумот йўқ
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <td className="py-2 pr-2 font-medium text-[var(--text)]">{r.name}</td>
                <td className="py-2 pr-2 text-[var(--text-soft)]">{r.region ?? "—"}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.planQty)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.cumulativeQty)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(r.dailyQty)}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtPct(r.completionPct)}</td>
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
    return <p className="text-sm text-[var(--text-soft)]">Тренд учун етарли тарихий маълумот йўқ.</p>;
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
          <rect key={p.date} x={x + 2} y={y} width={Math.max(barWidth - 4, 2)} height={barHeight} fill="var(--forest-mid)" rx={1}>
            <title>{`${p.date}: ${fmt(p.dailyQty)} т`}</title>
          </rect>
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
    <div className="min-h-screen bg-[var(--bg)]">
      <header
        className="on-dark text-[var(--surface-dark-text)]"
        style={{ background: "color-mix(in srgb, var(--forest-deep) 92%, transparent)" }}
      >
        <div className="container-brand py-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="eyebrow">PTZ Analytics</div>
            <span
              className={`rounded-s border px-3 py-1 font-display text-[0.72rem] font-semibold uppercase tracking-wide ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <h1 className="heading-natural mt-2 font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold text-white">
            HAZORASP-TEXTIL
          </h1>
          <p className="mt-1 font-mono text-[0.78rem] text-[var(--surface-dark-text-soft)]">
            Ҳисобот санаси: {fmtDate(bundle.report.reportDate)}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-5 sm:gap-0">
            <HeroStat label="Умумий режа" value={`${fmt(bundle.overall.planQty)} т`} />
            <HeroStat label="Жами қабул" value={`${fmt(bundle.overall.cumulativeQty)} т`} />
            <HeroStat label="Бажарилиши" value={fmtPct(bundle.forecast.completionPct)} />
            <HeroStat
              label="Бугунги қабул"
              value={`${fmt(bundle.overall.dailyQty)} т`}
              sub={growthPct != null ? `${growthPct >= 0 ? "+" : ""}${fmt(growthPct)}% кечагига нисбатан` : undefined}
            />
            <HeroStat label="Прогноз санаси" value={fmtDate(bundle.forecast.forecastDate)} />
          </div>
        </div>
      </header>

      <main className="container-brand space-y-6 py-8 sm:py-10">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Қолдиқ", `${fmt(bundle.forecast.remainingQty)} т`],
            ["Керакли темп", `${fmt(bundle.forecast.requiredDailyRate)} т/кун`],
            ["Амалдаги темп", `${fmt(bundle.forecast.currentRunRate)} т/кун`],
            ["Муддат", fmtDate(bundle.forecast.deadline)]
          ].map(([label, value]) => (
            <div key={label} className="card p-4">
              <div className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">{label}</div>
              <div className="mt-1 font-display text-[1.15rem] font-semibold text-[var(--text)]">{value}</div>
            </div>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">
            Режа бажарилиши
          </h2>
          <ProgressBar pct={bundle.forecast.completionPct} />
        </section>

        <section className="card p-5">
          <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">
            Кунлик қабул тренди <span className="text-[var(--text-soft)]">(сўнгги {trend.length} ҳисобот)</span>
          </h2>
          <TrendChart points={trend} />
        </section>

        <section className="card p-5">
          <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">
            Шартнома турлари бўйича
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[0.78rem]">
              <thead>
                <tr className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">
                  <th className="pb-2 pr-2 font-normal">Тур</th>
                  <th className="pb-2 pr-2 text-right font-normal">Режа</th>
                  <th className="pb-2 pr-2 text-right font-normal">Қабул</th>
                  <th className="pb-2 pr-2 text-right font-normal">%</th>
                  <th className="pb-2 pr-2 text-right font-normal">Бугун</th>
                  <th className="pb-2 text-right font-normal">Прогноз</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {bundle.contractTypes.map((ct) => (
                  <tr key={ct.contractType}>
                    <td className="py-2 pr-2 font-medium text-[var(--text)]">
                      {CONTRACT_TYPE_LABELS_UZ[ct.contractType as ContractType]}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(ct.planQty)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(ct.cumulativeQty)}</td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtPct(ct.completionPct)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-[var(--text)]">{fmt(ct.dailyQty)}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text-soft)]">{fmtDate(ct.forecast.forecastDate)}</td>
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

        <section className="card p-5">
          <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">
            Маълумот сифати бўйича огоҳлантиришлар
          </h2>
          {bundle.warningMessages.length === 0 ? (
            <p className="text-sm text-[var(--text-soft)]">Огоҳлантиришлар йўқ.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-[0.82rem] text-[var(--text-soft)]">
              {bundle.warningMessages.slice(0, 30).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </section>

        <footer className="pb-6 text-center font-mono text-[0.7rem] text-[var(--text-soft)]">
          Ушбу ҳавола вақтинчалик ва фақат чекланган вақт давомида амал қилади. HAZORASP-TEXTIL PTZ Analytics.
        </footer>
      </main>
    </div>
  );
}
