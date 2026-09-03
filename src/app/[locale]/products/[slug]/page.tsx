import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import type { SpecLabels } from "@/lib/content-types";
import { getProductBySlug } from "@/lib/get-content";
import { listProductRecords } from "@/lib/products-store";

export async function generateStaticParams() {
  const records = await listProductRecords();
  return routing.locales.flatMap((locale) => records.map((r) => ({ locale, slug: r.slug })));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const product = await getProductBySlug(locale as Locale, slug);
  if (!product) return {};
  return { title: product.name, description: product.desc };
}

export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "products" });
  const product = await getProductBySlug(locale as Locale, slug);
  if (!product) notFound();

  const specLabels = t.raw("specLabels") as SpecLabels;
  const rows: [string, string][] = [
    [specLabels.count, product.count],
    [specLabels.composition, product.composition],
    [specLabels.strength, product.strength],
    [specLabels.twist, product.twist],
    [specLabels.packaging, product.packaging],
    [specLabels.application, product.application]
  ];

  return (
    <section className="bg-[var(--bg)] py-16 sm:py-24">
      <div className="container-brand">
        <Link
          href="/products"
          className="mb-8 inline-flex items-center gap-2 font-display text-[0.78rem] uppercase tracking-wider text-forest no-underline"
        >
          <span aria-hidden="true">←</span> {t("title")}
        </Link>
        <span className="eyebrow">{product.tag}</span>
        <h1 className="mt-3 max-w-[24ch] text-[clamp(1.9rem,3.6vw,2.8rem)]">{product.name}</h1>
        <p className="mt-4 max-w-[60ch] text-[1.02rem] text-[var(--text-soft)]">{product.desc}</p>

        <dl className="mt-10 grid max-w-[640px] grid-cols-2 gap-x-8 gap-y-6 border-t border-[var(--border)] pt-8 font-mono sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[0.66rem] uppercase tracking-wide text-[var(--text-soft)]">{label}</dt>
              <dd className="mt-1 text-[0.9rem] font-medium text-[var(--text)]">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/contact" className="btn btn-outline">
            {t("actions.spec")}
          </Link>
          <Link href="/contact" className="btn btn-primary">
            {t("actions.quote")}
          </Link>
        </div>
      </div>
    </section>
  );
}
