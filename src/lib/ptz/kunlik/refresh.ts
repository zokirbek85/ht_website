// Scheduled refresh — architecture hook for the planned 30/60-minute
// automatic update. Nothing here depends on Telegram: a SourceProvider
// fetches the latest exports (from whatever system provides them), the same
// processBatch() the bot uses turns them into a report, and a notifier
// decides who receives it. Today no provider exists (files arrive via the
// bot), so nothing schedules this yet; a systemd timer / node-cron / BullMQ
// worker only needs to call runScheduledRefresh() on the configured interval.
import { DEFAULT_REFRESH_INTERVAL_MINUTES, REFRESH_INTERVAL_OPTIONS } from "./config.ts";
import { getSetting, setSetting } from "../settings.ts";
import { processBatch, type InputFile, type ReportOutput } from "./service.ts";

export interface SourceProvider {
  /** Returns whichever source files have new versions; an empty list means nothing changed. */
  fetchLatest(): Promise<InputFile[]>;
}

export interface ReportNotifier {
  notify(output: ReportOutput): Promise<void>;
}

export function getRefreshIntervalMinutes(): number {
  const raw = Number(getSetting("refresh_interval_minutes") ?? DEFAULT_REFRESH_INTERVAL_MINUTES);
  return (REFRESH_INTERVAL_OPTIONS as readonly number[]).includes(raw) ? raw : 60;
}

export function setRefreshIntervalMinutes(minutes: number): void {
  if (!(REFRESH_INTERVAL_OPTIONS as readonly number[]).includes(minutes)) {
    throw new Error(`refresh_interval_minutes must be one of ${REFRESH_INTERVAL_OPTIONS.join(", ")}`);
  }
  setSetting("refresh_interval_minutes", String(minutes));
}

/** One scheduler tick. Unchanged sources are simply not re-sent; stored state fills the rest. */
export async function runScheduledRefresh(provider: SourceProvider, notifier?: ReportNotifier): Promise<ReportOutput | null> {
  const files = await provider.fetchLatest();
  if (files.length === 0) return null;
  const output = await processBatch(files, { trigger: "scheduler", userId: "scheduler" });
  await notifier?.notify(output);
  return output;
}
