import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ProcessTrack } from "./ProcessTrack";
import type { MediaItem } from "@/lib/media";

export function ProductionSection({
  compact = false,
  visuals = []
}: {
  compact?: boolean;
  visuals?: MediaItem[];
}) {
  const t = useTranslations("production");
  const steps = t.raw("steps") as { index: string; title: string; desc: string; tech: string }[];

  return (
    <section id="production" className="bg-[var(--bg-sunken)] py-16 sm:py-24">
      <div className="container-brand">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--text-soft)]">{t("lede")}</p>
        </div>

        <ProcessTrack steps={compact ? steps.slice(0, 3) : steps} />

        {compact && (
          <Link href="/production" className="btn-ghost mt-10 inline-flex">
            {t("title")}
          </Link>
        )}

        {!compact && visuals.length > 0 && (
          <div className="mt-16">
            <h3 className="mb-4 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-[var(--text-soft)]">
              Production floor
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visuals.map((item) => (
                <div key={item.id} className="relative aspect-[8/5] overflow-hidden rounded-m border border-[var(--border)]">
                  <Image src={item.url} alt={item.title} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
