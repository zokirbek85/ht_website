"use client";

import { useMemo, useState } from "react";
import type { KunlikWebData } from "@/lib/ptz/kunlik/webView";

// Series colors: validated categorical slots 1–2 (hand = blue, machine = orange),
// stepped per theme — light #2a78d6/#eb6834, dark #3987e5/#d95926 — using the
// site's own dark selectors (OS preference and data-theme).
const HAND = "var(--kt-hand)";
const MACHINE = "var(--kt-machine)";
const SERIES_CSS = `
.kt-root { --kt-hand: #2a78d6; --kt-machine: #eb6834; }
@media (prefers-color-scheme: dark) { .kt-root { --kt-hand: #3987e5; --kt-machine: #d95926; } }
:root[data-theme="dark"] .kt-root { --kt-hand: #3987e5; --kt-machine: #d95926; }
`;

const nf = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
const tons = (t: number | null | undefined, d = 1) => (t == null ? "—" : `${nf(t, d)} т`);
const som = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("ru-RU")} сўм`);
const mln = (n: number) => `${nf(n / 1_000_000, 1)} млн сўм`;
const date = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
const dateTime = (iso: string | null | undefined) => (iso ? `${date(iso)} ${iso.slice(11, 16)}` : "—");

type Data = KunlikWebData;
const TABS = ["Умумий", "Фермерлар", "Тўловлар", "Отгрузка", "Data Quality"] as const;
type Tab = (typeof TABS)[number];

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {title && <h2 className="heading-natural mb-3 font-display text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--text)]">{title}</h2>}
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="font-mono text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">{label}</div>
      <div className="mt-1 font-display text-[1.15rem] font-semibold tabular-nums text-[var(--text)]">{value}</div>
      {sub && <div className="mt-0.5 text-[0.72rem] text-[var(--text-soft)]">{sub}</div>}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-4 text-[0.75rem] text-[var(--text-soft)]">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Table({ head, children, minWidth = 720 }: { head: React.ReactNode; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[0.78rem]" style={{ minWidth }}>
        <thead className="border-b border-[var(--border)] font-mono text-[0.64rem] uppercase tracking-wide text-[var(--text-soft)]">{head}</thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  );
}

const th = "py-2 pr-2 font-normal";
const num = "py-1.5 pr-2 text-right tabular-nums text-[var(--text)]";
const txt = "py-1.5 pr-2 text-[var(--text)]";

function DailyChart({ data }: { data: Data }) {
  const days = data.daily;
  if (days.length === 0) return <p className="text-sm text-[var(--text-soft)]">Маълумот йўқ.</p>;
  const W = 720;
  const H = 240;
  const axis = 36;
  const bottom = 22;
  const plotH = H - bottom - 14;
  const max = Math.max(...days.map((d) => d.totalT), 1);
  const step = [1, 2, 2.5, 5, 10].map((f) => f * 10 ** Math.floor(Math.log10(max / 4))).find((s) => s >= max / 4) ?? max / 4;
  const top = Math.ceil(max / step) * step;
  const slot = (W - axis) / days.length;
  const bw = Math.min(30, slot * 0.62);
  const y = (t: number) => 14 + plotH - (t / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = days.length > 16 ? Math.ceil(days.length / 12) : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Кунлик терим динамикаси">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={axis} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={0.6} />
          <text x={axis - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-soft)">
            {nf(t, 0)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = axis + i * slot + (slot - bw) / 2;
        const hH = (d.handT / top) * plotH;
        const mH = (d.machineT / top) * plotH;
        const gap = hH > 0 && mH > 0 ? 1.5 : 0;
        const isReport = d.date === data.reportDate;
        return (
          <g key={d.date}>
            <title>{`${date(d.date)}\nҚўл: ${tons(d.handT, 2)}\nМашина: ${tons(d.machineT, 2)}\nЖами: ${tons(d.totalT, 2)}`}</title>
            <rect x={x - (slot - bw) / 2} y={14} width={slot} height={plotH} fill="transparent" />
            {hH > 0 && <rect x={x} y={y(d.handT)} width={bw} height={hH} fill={HAND} rx={mH > 0 ? 0 : 2} />}
            {mH > 0 && <rect x={x} y={y(d.totalT)} width={bw} height={Math.max(mH - gap, 0)} fill={MACHINE} rx={2} />}
            {i % labelEvery === 0 && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-soft)">
                {date(d.date).slice(0, 5)}
              </text>
            )}
            {isReport && (
              <text x={x + bw / 2} y={y(d.totalT) - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text)">
                {nf(d.totalT, 1)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ShareBar({ label, hand, machine }: { label: string; hand: number; machine: number }) {
  const total = hand + machine;
  const hp = total ? (hand / total) * 100 : 0;
  return (
    <div className="mb-4">
      <div className="mb-1 text-[0.78rem] text-[var(--text-soft)]">
        {label}: <span className="font-semibold text-[var(--text)]">{tons(total)}</span>
      </div>
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-s bg-[var(--bg-sunken)] text-[0.7rem] font-semibold text-white">
        {hand > 0 && (
          <div className="flex items-center overflow-hidden whitespace-nowrap px-2" style={{ width: `${hp}%`, background: HAND }} title={`Қўл: ${tons(hand, 2)}`}>
            {hp > 12 && `${nf(hp)}%`}
          </div>
        )}
        {machine > 0 && (
          <div className="flex flex-1 items-center justify-end overflow-hidden whitespace-nowrap px-2" style={{ background: MACHINE }} title={`Машина: ${tons(machine, 2)}`}>
            {100 - hp > 12 && `${nf(100 - hp)}%`}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[0.72rem] tabular-nums text-[var(--text-soft)]">
        <span>Қўл {tons(hand)}</span>
        <span>Машина {tons(machine)}</span>
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: Data }) {
  const k = data.kpi;
  const hudud = [...data.hudud].filter((h) => h.totalT > 0).sort((a, b) => b.totalT - a.totalT);
  const maxH = Math.max(...hudud.map((h) => h.totalT), 1);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Бугунги тўлов" value={mln(k.paidToday)} sub={`жами: ${mln(k.paidTotal)}`} />
        <Kpi label="Терим пули қолдиғи (20%)" value={mln(k.pickingBalance)} sub={`20% суммаси: ${mln(k.sum20)}`} />
        <Kpi label="РКП: свободные" value={mln(k.rkpFree)} sub={`блок.: ${mln(k.rkpBlocked)}`} />
        <Kpi label="Отгрузка" value={tons(k.shippedT)} sub={`${k.shipmentDeals} битим · ${mln(k.shippedValue)}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Кунлик терим динамикаси, т" className="lg:col-span-2">
          <Legend items={[["Қўл терими", HAND], ["Машина терими", MACHINE]]} />
          <DailyChart data={data} />
        </Card>
        <Card title="Қўл ва машина улуши">
          <Legend items={[["Қўл", HAND], ["Машина", MACHINE]]} />
          <ShareBar label={`Бугун (${date(data.reportDate).slice(0, 5)})`} hand={k.todayHandT} machine={k.todayMachineT} />
          <ShareBar label="Мавсум бўйича" hand={k.seasonHandT} machine={k.seasonMachineT} />
        </Card>
      </div>

      <Card title="Ҳудудлар бўйича терим (мавсум), т">
        <div className="space-y-1.5">
          {hudud.map((h) => (
            <div key={h.hudud} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-[0.78rem]" title={`Бугун: ${tons(h.todayT, 2)} · фермерлар: ${h.farmers}`}>
              <span className="truncate text-[var(--text)]">{h.hudud}</span>
              <div className="h-3 rounded-r-sm" style={{ width: `${(h.totalT / maxH) * 100}%`, background: HAND, minWidth: 2 }} />
              <span className="tabular-nums text-[var(--text-soft)]">{nf(h.totalT)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Манба файллар">
        <Table
          minWidth={560}
          head={
            <tr>
              <th className={th}>Тур</th>
              <th className={th}>Файл</th>
              <th className={`${th} text-right`}>Қаторлар</th>
              <th className={`${th} text-right`}>Янги</th>
              <th className={`${th} text-right`}>Такрор</th>
            </tr>
          }
        >
          {data.files.map((f) => (
            <tr key={f.type}>
              <td className={txt}>{f.label}</td>
              <td className={`${txt} max-w-[22rem] truncate`}>{f.filename}</td>
              <td className={num}>{f.rows}</td>
              <td className={num}>{f.inserted}</td>
              <td className={num}>{f.duplicates}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function FarmersTab({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const [hudud, setHudud] = useState("");
  const [onlyToday, setOnlyToday] = useState(false);
  const hududs = useMemo(() => [...new Set(data.farmers.map((f) => f.hudud))], [data.farmers]);
  const rows = data.farmers.filter(
    (f) =>
      (!hudud || f.hudud === hudud) &&
      (!onlyToday || f.todayHandT + f.todayMachineT > 0) &&
      (!q || `${f.name} ${f.basketName ?? ""} ${f.inn ?? ""} ${f.contracts}`.toLowerCase().includes(q.toLowerCase()))
  );
  const sum = (fn: (f: (typeof rows)[number]) => number) => rows.reduce((a, f) => a + fn(f), 0);
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фермер, ИНН ёки шартнома…" className="min-w-[14rem] flex-1 rounded-s border border-[var(--border)] bg-transparent px-3 py-2 text-[0.85rem]" />
        <select value={hudud} onChange={(e) => setHudud(e.target.value)} className="rounded-s border border-[var(--border)] bg-transparent px-3 py-2 text-[0.85rem]">
          <option value="">Барча ҳудудлар</option>
          {hududs.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[0.8rem] text-[var(--text-soft)]">
          <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} /> Фақат бугун топширганлар
        </label>
        <span className="text-[0.75rem] text-[var(--text-soft)]">{rows.length} та</span>
      </div>
      <Table
        minWidth={1100}
        head={
          <tr>
            <th className={th}>Ҳудуд</th>
            <th className={th}>Фермер</th>
            <th className={`${th} text-right`}>Режа, т</th>
            <th className={`${th} text-right`}>Бугун қўл</th>
            <th className={`${th} text-right`}>Бугун машина</th>
            <th className={`${th} text-right`}>Жами, т</th>
            <th className={`${th} text-right`}>%</th>
            <th className={`${th} text-right`}>20% сумма</th>
            <th className={`${th} text-right`}>Бугун тўлов</th>
            <th className={`${th} text-right`}>Тўланган</th>
            <th className={`${th} text-right`}>Қолдиқ</th>
          </tr>
        }
      >
        {rows.map((f, i) => (
          <tr key={`${f.inn ?? f.name}-${i}`}>
            <td className={`${txt} text-[var(--text-soft)]`}>{f.hudud}</td>
            <td className={txt} title={[f.basketName, f.inn && `ИНН ${f.inn}`, f.contracts && `шартнома ${f.contracts}`].filter(Boolean).join(" · ")}>
              {f.name}
            </td>
            <td className={num}>{nf(f.planT, 3)}</td>
            <td className={num}>{nf(f.todayHandT, 3)}</td>
            <td className={num}>{nf(f.todayMachineT, 3)}</td>
            <td className={num}>{nf(f.totalHandT + f.totalMachineT, 3)}</td>
            <td className={num}>{f.achievementPct == null ? "—" : nf(f.achievementPct)}</td>
            <td className={num}>{Math.round(f.sum20).toLocaleString("ru-RU")}</td>
            <td className={num}>{Math.round(f.paidToday).toLocaleString("ru-RU")}</td>
            <td className={num}>{Math.round(f.paidTotal).toLocaleString("ru-RU")}</td>
            <td className={num} style={f.balance < 0 ? { color: "#b23a3a" } : undefined}>
              {Math.round(f.balance).toLocaleString("ru-RU")}
            </td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className={txt} colSpan={2}>
            Жами
          </td>
          <td className={num}>{nf(sum((f) => f.planT), 3)}</td>
          <td className={num}>{nf(sum((f) => f.todayHandT), 3)}</td>
          <td className={num}>{nf(sum((f) => f.todayMachineT), 3)}</td>
          <td className={num}>{nf(sum((f) => f.totalHandT + f.totalMachineT), 3)}</td>
          <td className={num} />
          <td className={num}>{Math.round(sum((f) => f.sum20)).toLocaleString("ru-RU")}</td>
          <td className={num}>{Math.round(sum((f) => f.paidToday)).toLocaleString("ru-RU")}</td>
          <td className={num}>{Math.round(sum((f) => f.paidTotal)).toLocaleString("ru-RU")}</td>
          <td className={num}>{Math.round(sum((f) => f.balance)).toLocaleString("ru-RU")}</td>
        </tr>
      </Table>
      <p className="mt-3 text-[0.72rem] text-[var(--text-soft)]">Суммалар сўмда. Қолдиқ = 20% суммаси − тўланган маблағ.</p>
    </Card>
  );
}

function PaymentsTab({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const rows = data.payments.filter((p) => !q || `${p.name ?? ""} ${p.inn ?? ""} ${p.deal ?? ""} ${p.farmer ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Бугунги тўлов (${date(data.reportDate)})`} value={som(data.kpi.paidToday)} />
        <Kpi label="Жами тўлов (нетто)" value={som(data.kpi.paidTotal)} />
        <Kpi label="РКП: свободные" value={som(data.kpi.rkpFree)} />
        <Kpi label="РКП: в пути" value={som(data.kpi.rkpInTransit)} />
      </section>
      <Card title="РКП ҳисоблари">
        <Table
          minWidth={560}
          head={
            <tr>
              <th className={th}>Л/с</th>
              <th className={th}>Номи</th>
              <th className={th}>Эгаси</th>
              <th className={`${th} text-right`}>Баланс, сўм</th>
            </tr>
          }
        >
          {data.accounts.map((a) => (
            <tr key={a.account}>
              <td className={`${txt} font-mono text-[0.72rem]`}>{a.account}</td>
              <td className={txt}>{a.name}</td>
              <td className={txt}>{a.owner === "OWNER" ? "Корхона" : a.owner === "FARMER" ? "Фермер" : "Аниқланмаган"}</td>
              <td className={num}>{Math.round(a.balance).toLocaleString("ru-RU")}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={`Фермерларга ўтказмалар (${data.payments.length})`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номи, ИНН ёки битим №…" className="mb-4 w-full rounded-s border border-[var(--border)] bg-transparent px-3 py-2 text-[0.85rem]" />
        <Table
          minWidth={820}
          head={
            <tr>
              <th className={th}>Сана/вақт</th>
              <th className={th}>Контрагент</th>
              <th className={th}>Фермер (ҳисобот)</th>
              <th className={th}>Битим</th>
              <th className={`${th} text-right`}>Нетто, сўм</th>
              <th className={th}>Боғланиш</th>
            </tr>
          }
        >
          {rows.map((p, i) => (
            <tr key={p.txId ?? i}>
              <td className={`${txt} whitespace-nowrap`}>{dateTime(p.at)}</td>
              <td className={txt}>{p.name}</td>
              <td className={txt}>{p.farmer ?? "—"}</td>
              <td className={txt}>{p.deal}</td>
              <td className={num} style={p.net < 0 ? { color: "#b23a3a" } : undefined}>
                {Math.round(p.net).toLocaleString("ru-RU")}
                {p.reversal ? " ↩" : ""}
              </td>
              <td className={`${txt} text-[var(--text-soft)]`}>{p.match}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function ShipmentsTab({ data }: { data: Data }) {
  return (
    <Card title={`Отгрузка шартномалар бўйича (${data.shipments.length})`}>
      <Table
        minWidth={980}
        head={
          <tr>
            <th className={th}>Битим №</th>
            <th className={th}>Фермер</th>
            <th className={`${th} text-right`}>Шартнома, т</th>
            <th className={`${th} text-right`}>Кол-во сделки, т</th>
            <th className={`${th} text-right`}>Қабул (basket), т</th>
            <th className={`${th} text-right`}>Отгрузка, т</th>
            <th className={`${th} text-right`}>Ҳужжат</th>
            <th className={`${th} text-right`}>Қиймат, сўм</th>
            <th className={`${th} text-right`}>Тўланган, сўм</th>
            <th className={th}>Охирги</th>
          </tr>
        }
      >
        {data.shipments.map((s) => (
          <tr key={s.deal}>
            <td className={txt}>{s.deal}</td>
            <td className={txt}>{s.farmer ?? s.seller}</td>
            <td className={num}>{nf(s.contractT, 3)}</td>
            <td className={num}>{nf(s.dealT, 3)}</td>
            <td className={num}>{nf(s.basketT, 3)}</td>
            <td className={num}>{nf(s.shippedT, 3)}</td>
            <td className={num}>{s.documents}</td>
            <td className={num}>{Math.round(s.value).toLocaleString("ru-RU")}</td>
            <td className={num}>{Math.round(s.paid).toLocaleString("ru-RU")}</td>
            <td className={txt}>{date(s.lastDocument)}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-[0.72rem] text-[var(--text-soft)]">
        «Кол-во сделки − отгрузка» фарқи қолдиқ сифатида тасдиқланмаган (BUSINESS_RULE_REQUIRED) — миқдорлар ёнма-ён кўрсатилган.
      </p>
    </Card>
  );
}

const SEV: Record<string, string> = { CRITICAL: "#b23a3a", WARNING: "#a8741f", INFO: "var(--text-soft)" };

function QualityTab({ data }: { data: Data }) {
  const [sev, setSev] = useState<string>("");
  const rows = data.issues.filter((i) => !sev || i.severity === sev);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="🔴 Critical" value={String(data.dq.critical)} />
        <Kpi label="🟠 Warning" value={String(data.dq.warning)} />
        <Kpi label="🔵 Info" value={String(data.dq.info)} />
        <Kpi label="🟢 Valid" value={data.dq.valid.toLocaleString("ru-RU")} />
        <Kpi label="⏳ Тортилмаган" value={String(data.dq.pending)} />
      </section>
      <Card>
        <div className="mb-4 flex gap-2">
          {["", "CRITICAL", "WARNING", "INFO"].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setSev(s)}
              className={`rounded-s border px-3 py-1 text-[0.75rem] ${sev === s ? "border-[var(--text)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-soft)]"}`}
            >
              {s || "Барчаси"}
            </button>
          ))}
        </div>
        <Table
          minWidth={820}
          head={
            <tr>
              <th className={th}>Даража</th>
              <th className={th}>Код</th>
              <th className={th}>Манба</th>
              <th className={th}>Қатор</th>
              <th className={th}>Объект</th>
              <th className={th}>Изоҳ</th>
            </tr>
          }
        >
          {rows.map((i, idx) => (
            <tr key={idx}>
              <td className={txt} style={{ color: SEV[i.severity] }}>
                {i.severity}
              </td>
              <td className={`${txt} font-mono text-[0.7rem]`}>{i.code}</td>
              <td className={txt}>{i.source}</td>
              <td className={num}>{i.row ?? ""}</td>
              <td className={txt}>{i.ref ?? ""}</td>
              <td className={txt}>{i.message}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

export function KunlikDashboard({ data }: { data: Data }) {
  const [tab, setTab] = useState<Tab>("Умумий");
  const k = data.kpi;
  return (
    <div className="kt-root min-h-screen bg-[var(--bg)]">
      <style>{SERIES_CSS}</style>
      <header className="on-dark text-[var(--surface-dark-text)]" style={{ background: "color-mix(in srgb, var(--forest-deep) 92%, transparent)" }}>
        <div className="container-brand py-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="eyebrow">Кунлик терим · HAZORASP-TEXTIL</div>
            <span className="rounded-s border border-[var(--surface-dark-border)] px-3 py-1 font-mono text-[0.72rem] text-[var(--surface-dark-text-soft)]">
              {data.dq.critical > 0 ? `🔴 ${data.dq.critical} critical` : "🟢 critical 0"} · 🟠 {data.dq.warning}
            </span>
          </div>
          <h1 className="heading-natural mt-2 font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold text-white">{date(data.reportDate)}</h1>
          <p className="mt-1 font-mono text-[0.78rem] text-[var(--surface-dark-text-soft)]">
            Маълумот янгиланди: {dateTime(data.sourceUpdatedAt ?? data.generatedAt)} · Ҳисобот: {dateTime(data.generatedAt)}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-5 sm:gap-0">
            <HeroStat label="Бугунги терим" value={tons(k.todayTotalT)} />
            <HeroStat label="Қўл (бугун)" value={tons(k.todayHandT)} />
            <HeroStat label="Машина (бугун)" value={tons(k.todayMachineT)} />
            <HeroStat label="Мавсум жами" value={tons(k.seasonTotalT)} />
            <HeroStat label="Фермерлар" value={`${k.farmersWithHarvest}`} sub={`бугун ${k.farmersToday} · шартнома ${k.contracts}`} />
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
        {tab === "Умумий" && <OverviewTab data={data} />}
        {tab === "Фермерлар" && <FarmersTab data={data} />}
        {tab === "Тўловлар" && <PaymentsTab data={data} />}
        {tab === "Отгрузка" && <ShipmentsTab data={data} />}
        {tab === "Data Quality" && <QualityTab data={data} />}

        <footer className="pb-6 text-center font-mono text-[0.7rem] text-[var(--text-soft)]">
          Вақтинчалик ҳавола{data.expiresAt ? ` · амал қилади: ${dateTime(new Date(data.expiresAt).toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" }).replace(" ", "T"))} гача` : ""}. HAZORASP-TEXTIL Кунлик терим.
        </footer>
      </main>
    </div>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-0 sm:px-5">
      <div className="font-display text-[clamp(1.3rem,2.6vw,1.9rem)] tabular-nums text-white">{value}</div>
      <div className="mt-1.5 font-display text-[0.66rem] uppercase tracking-wider text-[var(--surface-dark-text-soft)]">{label}</div>
      {sub && <div className="mt-0.5 text-[0.68rem] text-[var(--surface-dark-text-soft)]">{sub}</div>}
    </div>
  );
}
