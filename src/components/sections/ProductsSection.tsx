import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/content-types";

export function ProductsSection({
  items,
  compact = false
}: {
  items: Product[];
  compact?: boolean;
}) {
  const t = useTranslations("products");
  const shown = compact ? items.slice(0, 2) : items;

  return (
    <section id="products" className="bg-[var(--bg)] py-16 sm:py-24">
      <div className="container-brand">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="heading-natural mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--text-soft)]">{t("lede")}</p>
        </div>

        {shown.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {shown.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-[0.9rem] text-[var(--text-soft)]">{t("empty")}</p>
        )}

        {compact && (
          <Link href="/products" className="btn-ghost mt-10 inline-flex">
            {t("title")}
          </Link>
        )}
      </div>
    </section>
  );
}
