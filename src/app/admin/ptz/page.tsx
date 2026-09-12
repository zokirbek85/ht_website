import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { PtzUserForm } from "@/components/admin/PtzUserForm";
import { listAllReports } from "@/lib/ptz/analytics";
import { listTelegramUsers } from "@/lib/ptz/telegramUsers";
import { listAuditLog } from "@/lib/ptz/audit";
import { listWarningsForReport } from "@/lib/ptz/warnings";
import { removePtzUser } from "@/app/admin/ptz/actions";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export default async function AdminPtzPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  const reports = listAllReports(30);
  const users = listTelegramUsers();
  const auditEntries = listAuditLog(30);

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-[1.5rem] uppercase tracking-wide">PTZ Analytics</h1>
        <p className="mt-2 max-w-[65ch] text-[0.9rem] text-[var(--text-soft)]">
          Import history, authorized Telegram users and the audit log for the PTZ cotton-intake reporting bot. Reports
          themselves are viewed via the temporary dashboard links the bot sends after each import.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-[1rem] uppercase tracking-wide">Authorized Telegram users</h2>
          <PtzUserForm />
          <div className="mt-4 overflow-x-auto rounded-m border border-[var(--border)]">
            <table className="w-full min-w-[480px] text-left text-[0.82rem]">
              <thead className="bg-[var(--bg-raised)] text-[var(--text-soft)]">
                <tr>
                  <th className="px-3 py-2">Telegram ID</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Added</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-[var(--text-soft)]">
                      No users yet — bootstrap the first admin via PTZ_ADMIN_TELEGRAM_IDS in the environment.
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const removeWithId = removePtzUser.bind(null, u.telegramId);
                  return (
                    <tr key={u.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-mono">{u.telegramId}</td>
                      <td className="px-3 py-2">{u.role}</td>
                      <td className="px-3 py-2">{new Date(u.addedAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">
                        <form action={removeWithId}>
                          <button type="submit" className="text-[0.75rem] text-red-600 hover:underline">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 font-display text-[1rem] uppercase tracking-wide">Import history</h2>
          <div className="overflow-x-auto rounded-m border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-[0.82rem]">
              <thead className="bg-[var(--bg-raised)] text-[var(--text-soft)]">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Warnings</th>
                  <th className="px-3 py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-[var(--text-soft)]">
                      No reports imported yet.
                    </td>
                  </tr>
                )}
                {reports.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-3 py-2">{fmtDate(r.reportDate)}</td>
                    <td className="px-3 py-2">{r.sourceFilename}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.isActive ? "yes" : "superseded"}</td>
                    <td className="px-3 py-2">{r.warningCount}</td>
                    <td className="px-3 py-2">{r.errorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {reports[0] && <ReportWarnings reportId={reports[0].id} />}

        <section className="mt-10">
          <h2 className="mb-3 font-display text-[1rem] uppercase tracking-wide">Audit log</h2>
          <div className="max-h-96 overflow-y-auto rounded-m border border-[var(--border)] p-3 font-mono text-[0.72rem]">
            {auditEntries.length === 0 && <p className="text-[var(--text-soft)]">No activity yet.</p>}
            {auditEntries.map((e) => (
              <div key={e.id} className="border-b border-[var(--border)] py-1.5 last:border-0">
                {new Date(e.ts).toLocaleString()} — {e.action}
                {e.username ? ` (@${e.username})` : e.telegramId ? ` (${e.telegramId})` : ""}
                {e.details ? ` — ${JSON.stringify(e.details)}` : ""}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function ReportWarnings({ reportId }: { reportId: number }) {
  const warnings = listWarningsForReport(reportId);
  if (warnings.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-[1rem] uppercase tracking-wide">
        Latest report&apos;s warnings ({warnings.length})
      </h2>
      <ul className="max-h-72 list-disc space-y-1 overflow-y-auto rounded-m border border-[var(--border)] p-4 pl-8 text-[0.8rem]">
        {warnings.map((w) => (
          <li key={w.id}>
            <span className="font-mono text-[0.7rem] text-[var(--text-soft)]">[{w.severity}/{w.code}]</span> {w.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
