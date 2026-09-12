import type { Metadata } from "next";
import { getTempAccessRecord } from "@/lib/ptz/tempAccess";
import { hasTempSession } from "@/lib/ptz/tempSession";
import { buildReportBundle } from "@/lib/ptz/reportBundle";
import { PasswordGate } from "@/components/ptz/PasswordGate";
import { Dashboard } from "@/components/ptz/Dashboard";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TempReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = getTempAccessRecord(token);

  if (!record) {
    return <StatusPage title="Ҳисобот топилмади" message="Ушбу ҳавола нотўғри ёки ўчирилган." />;
  }
  if (record.expired) {
    return <StatusPage title="Муддати тугаган" message="Ушбу вақтинчалик ҳавола муддати тугаган. Янги ҳисобот учун ботдан фойдаланинг." />;
  }

  const authorized = await hasTempSession(token);
  if (!authorized) {
    return <PasswordGate token={token} />;
  }

  const bundle = buildReportBundle(record.reportId);
  if (!bundle) {
    return <StatusPage title="Хато" message="Ҳисобот маълумотлари топилмади." />;
  }

  return <Dashboard bundle={bundle} />;
}

function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="on-dark flex min-h-screen items-center justify-center px-6 text-center text-[var(--surface-dark-text)]"
      style={{ background: "var(--surface-dark)" }}
    >
      <div>
        <div className="eyebrow justify-center">PTZ Analytics</div>
        <h1 className="heading-natural mb-2 mt-3 font-display text-xl font-semibold text-white">{title}</h1>
        <p className="text-[var(--surface-dark-text-soft)]">{message}</p>
      </div>
    </div>
  );
}
