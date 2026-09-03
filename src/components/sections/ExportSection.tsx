import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Counter } from "@/components/ui/Counter";
import { listMediaByCategory } from "@/lib/media";
import type { MediaItem } from "@/lib/media";

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

        <div className="mx-auto aspect-square w-full max-w-[460px]">
          <svg viewBox="0 0 400 400" width="100%" height="100%" role="img" aria-labelledby="export-map-title">
            <title id="export-map-title">{t("origin")} export routes</title>
            <g fill="none" stroke="var(--border-strong)" strokeWidth="1" opacity="0.55">
              <path d="M32 110H368" strokeDasharray="2 8" />
              <path d="M32 200H368" strokeDasharray="2 8" />
              <path d="M32 290H368" strokeDasharray="2 8" />
            </g>
            <g stroke="var(--accent-2)" strokeWidth="1.8" fill="none" strokeDasharray="4 5">
              <path d="M204 190 Q 145 145 76 126" />
              <path d="M204 190 Q 275 145 344 112" />
              <path d="M204 190 Q 270 245 316 306" />
            </g>
            <path
              d="M151 143 L177 133 L202 141 L224 133 L247 145 L269 142 L280 157 L267 171 L282 184 L270 198 L277 213 L253 218 L243 233 L218 226 L199 240 L178 228 L156 232 L145 214 L123 205 L130 187 L116 171 L139 160 Z"
              fill="var(--forest)"
              opacity="0.92"
              stroke="var(--accent-2)"
              strokeWidth="2"
            />
            <g fill="var(--brass)" stroke="var(--bg-sunken)" strokeWidth="3">
              <circle cx="204" cy="190" r="7" />
              <circle cx="76" cy="126" r="5" />
              <circle cx="344" cy="112" r="5" />
              <circle cx="316" cy="306" r="5" />
            </g>
            <g fontFamily="var(--font-plex-mono)" fontSize="11" fill="var(--text)" fontWeight="600">
              <text x="157" y="271">{t("origin")}</text>
              <text x="42" y="113">{markets[0] ?? ""}</text>
              <text x="300" y="99">{markets[1] ?? ""}</text>
              <text x="324" y="326">{markets[2] ?? ""}</text>
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
