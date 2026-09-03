import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getNewsBySlug } from "@/lib/get-content";
import { listNewsRecords } from "@/lib/news-store";

export async function generateStaticParams() {
  const records = await listNewsRecords();
  return routing.locales.flatMap((locale) => records.map((r) => ({ locale, slug: r.slug })));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const item = await getNewsBySlug(locale as Locale, slug);
  if (!item) return {};
  return { title: item.title, description: item.excerpt };
}

export default async function NewsDetailPage({
  params
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "news" });
  const item = await getNewsBySlug(locale as Locale, slug);
  if (!item) notFound();

  return (
    <article className="bg-[var(--bg)] py-16 sm:py-24">
      <div className="container-brand max-w-[720px]">
        <Link
          href="/news"
          className="mb-8 inline-flex items-center gap-2 font-display text-[0.78rem] uppercase tracking-wider text-forest no-underline"
        >
          <span aria-hidden="true">←</span> {t("allLink")}
        </Link>
        <span className="font-mono text-[0.66rem] uppercase tracking-wide text-forest">{item.category}</span>
        <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">{item.title}</h1>
        <time dateTime={item.date} className="mt-4 block font-mono text-[0.75rem] text-[var(--text-soft)]">
          <NewsDate date={item.date} locale={locale} />
        </time>
        <p className="mt-6 text-[1.05rem] leading-relaxed text-[var(--text-soft)]">{item.excerpt}</p>
      </div>
    </article>
  );
}

function NewsDate({ date, locale }: { date: string; locale: string }) {
  return <>{new Date(date).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}</>;
}
