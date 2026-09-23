import type { Metadata } from "next";
import { getKunlikTempAccessRecord } from "@/lib/ptz/tempAccess";
import { hasTempSession } from "@/lib/ptz/tempSession";
import { buildReportData } from "@/lib/ptz/kunlik/service";
import { toWebView } from "@/lib/ptz/kunlik/webView";
import { PasswordGate } from "@/components/ptz/PasswordGate";
import { KunlikDashboard } from "@/components/ptz/KunlikDashboard";
import { unlockKunlikReport } from "./actions";

export const metadata: Metadata = { title: "Кунлик терим | Hazorasp-Textil", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function KunlikTempPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = getKunlikTempAccessRecord(token);

  if (!record) return <StatusPage title="Ҳисобот топилмади" message="Ушбу ҳавола нотўғри ёки ўчирилган." />;
  if (record.expired) {
    return <StatusPage title="Муддати тугаган" message="Ушбу вақтинчалик ҳавола муддати тугаган. Ботда /dashboard буйруғи билан янгисини олинг." />;
  }
  if (!(await hasTempSession(token))) return <PasswordGate token={token} unlock={unlockKunlikReport} title="Кунлик терим" />;

  const data = await buildReportData(record.batchId);
  return <KunlikDashboard data={toWebView(data, record.expiresAt)} />;
}

function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="on-dark flex min-h-screen items-center justify-center px-6 text-center text-[var(--surface-dark-text)]"
      style={{ background: "var(--surface-dark)" }}
    >
      <div>
        <div className="eyebrow justify-center">Кунлик терим</div>
        <h1 className="heading-natural mb-2 mt-3 font-display text-xl font-semibold text-white">{title}</h1>
        <p className="text-[var(--surface-dark-text-soft)]">{message}</p>
      </div>
    </div>
  );
}
