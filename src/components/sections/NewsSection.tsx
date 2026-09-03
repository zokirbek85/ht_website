import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { NewsItem } from "@/lib/content-types";

export function NewsSection({ items }: { items: NewsItem[] }) {
  const t = useTranslations("news");
  const locale = useLocale();

  return (
    <section id="news" className="bg-[var(--bg-sunken)] py-16 sm:py-24">
      <div className="container-brand">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)]">{t("title")}</h2>
          </div>
          <Link href="/news" className="btn-ghost">
            {t("allLink")}
          </Link>
        </div>

        {items.length === 0 && <p className="text-[0.9rem] text-[var(--text-soft)]">{t("empty")}</p>}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {items.map((item) => (
            <article key={item.slug} className="card overflow-hidden">
              <div className="relative flex aspect-[16/10] items-end bg-gradient-to-br from-[var(--forest-deep)] to-forest p-4">
                <span className="font-mono text-[0.68rem] tracking-wide text-[var(--accent-2)]">{item.category}</span>
              </div>
              <div className="p-6">
                <span className="font-mono text-[0.64rem] uppercase tracking-wide text-forest">{item.category}</span>
                <h3 className="mt-2.5 text-[0.98rem] font-semibold normal-case leading-snug tracking-normal">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-[0.83rem] text-[var(--text-soft)]">{item.excerpt}</p>
                <time
                  dateTime={item.date}
                  className="mt-3 block font-mono text-[0.7rem] text-[var(--text-soft)]"
                >
                  {new Date(item.date).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
                </time>
                <Link href={`/news/${item.slug}`} className="btn-ghost mt-3 inline-flex !text-[0.76rem] normal-case tracking-normal">
                  {t("readMore")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
