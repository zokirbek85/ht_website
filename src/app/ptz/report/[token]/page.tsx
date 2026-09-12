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
    <div className="flex min-h-screen items-center justify-center bg-[#0b1220] px-6 text-center text-white">
      <div>
        <h1 className="mb-2 text-xl font-semibold">{title}</h1>
        <p className="text-white/60">{message}</p>
      </div>
    </div>
  );
}
