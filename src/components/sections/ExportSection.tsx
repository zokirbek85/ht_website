import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Counter } from "@/components/ui/Counter";
import { listMediaByCategory } from "@/lib/media";
import type { MediaItem } from "@/lib/media";
import uzbekistanMap from "@svg-maps/uzbekistan";

export function ExportSection({ certificates = [] }: { certificates?: MediaItem[] }) {
  const t = useTranslations("export");
  const stats = t.raw("stats") as { value: number; suffix?: string; label: string }[];
  const markets = t.raw("markets") as string[];

  return (
    <section id="export" className="bg-[var(--bg-sunken)] py-16 sm:py-24">
      <div className="container-brand grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
        <div>
          <span className="section-num">{t("sectionNum")}</span>
          <h2 className="heading-natural mt-2 max-w-[14ch] text-[clamp(1.8rem,3.4vw,2.6rem)]">{t("title")}</h2>
          <p className="mt-5 max-w-[52ch] text-[1.02rem] text-[var(--text-soft)]">{t("copy")}</p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {markets.map((market) => (
              <span
                key={market}
                className="rounded-s border border-[var(--border-strong)] bg-[var(--bg-raised)] px-3.5 py-1.5 font-mono text-[0.74rem] tracking-wide text-[var(--text)]"
              >
                {market}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-9">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[1.5rem] text-forest">
                  <Counter value={s.value} suffix={s.suffix} />
                </div>
                <span className="text-[0.75rem] text-[var(--text-soft)]">{s.label}</span>
              </div>
            ))}
          </div>

          <Link href="/contact" className="btn btn-primary mt-8 inline-flex">
            {t("cta")}
          </Link>
          <Link href="/contact" className="btn btn-outline ml-3 mt-8 inline-flex">
            {t("catalogCta")}
          </Link>
        </div>

        <div className="mx-auto aspect-[793/517] w-full max-w-[560px]">
          <svg viewBox={uzbekistanMap.viewBox} width="100%" height="100%" role="img" aria-labelledby="export-map-title">
            <title id="export-map-title">{t("origin")} export routes</title>
            <g fill="none" stroke="var(--border-strong)" strokeWidth="1" opacity="0.55">
              <path d="M20 130H773" strokeDasharray="2 8" />
              <path d="M20 260H773" strokeDasharray="2 8" />
              <path d="M20 390H773" strokeDasharray="2 8" />
            </g>
            <g stroke="var(--accent-2)" strokeWidth="1.8" fill="none" strokeDasharray="4 5">
              <path d="M650 252 Q 390 170 112 122" />
              <path d="M650 252 Q 710 180 766 158" />
              <path d="M650 252 Q 690 355 716 470" />
            </g>
            <g fill="var(--forest)" opacity="0.92" stroke="var(--accent-2)" strokeWidth="1.2">
              {uzbekistanMap.locations.map((location: { id: string; path: string }) => <path key={location.id} d={location.path} />)}
            </g>
            <g fill="var(--brass)" stroke="var(--bg-sunken)" strokeWidth="3">
              <circle cx="650" cy="252" r="7" />
              <circle cx="112" cy="122" r="5" />
              <circle cx="766" cy="158" r="5" />
              <circle cx="716" cy="470" r="5" />
            </g>
            <g fontFamily="var(--font-plex-mono)" fontSize="11" fill="var(--text)" fontWeight="600">
              <text x="603" y="285">{t("origin")}</text>
              <text x="78" y="105">{markets[0] ?? ""}</text>
              <text x="700" y="140">{markets[1] ?? ""}</text>
              <text x="726" y="492">{markets[2] ?? ""}</text>
            </g>
          </svg>
        </div>
      </div>
      {certificates.length > 0 && (
        <div className="container-brand mt-12 border-t border-[var(--border)] pt-6">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[var(--text-soft)]">{t("certifications")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {certificates.map((certificate) => (
              <a key={certificate.id} href={certificate.url} target="_blank" rel="noreferrer" className="rounded-s border border-[var(--border-strong)] px-3 py-2 font-mono text-[0.72rem] grayscale transition-[filter,border-color,color] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:grayscale-0">
                {certificate.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
