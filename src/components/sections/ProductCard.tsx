import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { Product, SpecLabels } from "@/lib/content-types";

export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("products");
  const specLabels = t.raw("specLabels") as SpecLabels;

  return (
    <div className="card group flex flex-col overflow-hidden">
      <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--bg-sunken)] to-[var(--steel-pale)]">
        <span className="absolute left-4 top-4 rounded-s bg-forest px-2.5 py-1 font-mono text-[0.64rem] tracking-wide text-white">
          {product.tag}
        </span>
        {product.image ? (
          <Image src={product.image} alt={product.name} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : <svg
          width="86"
          height="110"
          viewBox="0 0 86 110"
          className="transition-transform duration-500 group-hover:-translate-y-1.5 group-hover:-rotate-[2deg]"
        >
          <defs>
            <linearGradient id={`g-${product.slug}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cotton)" />
              <stop offset="1" stopColor="var(--steel-light)" />
            </linearGradient>
          </defs>
          <path
            d="M20 8 L66 8 L52 100 L34 100 Z"
            fill={`url(#g-${product.slug})`}
            stroke="var(--steel)"
            strokeWidth="1"
          />
          {[20, 34, 50, 66, 82].map((y) => (
            <line key={y} x1={22 + y * 0.09} y1={y} x2={64 - y * 0.09} y2={y} stroke="white" strokeWidth="1" opacity="0.5" />
          ))}
        </svg>}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <h3 className="text-[1.1rem] normal-case tracking-normal">{product.name}</h3>
        <p className="text-[0.86rem] text-[var(--text-soft)]">{product.desc}</p>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-4 font-mono text-[0.74rem]">
          <SpecRow label={specLabels.count} value={product.count} />
          <SpecRow label={specLabels.composition} value={product.composition} />
          <SpecRow label={specLabels.strength} value={product.strength} />
          <SpecRow label={specLabels.twist} value={product.twist} />
          <SpecRow label={specLabels.packaging} value={product.packaging} />
          <SpecRow label={specLabels.application} value={product.application} />
        </dl>

        <div className="mt-auto flex flex-wrap gap-3 pt-2">
          <Link href={product.specPdf ?? "/contact"} {...(product.specPdf ? { download: true } : {})} className="btn btn-outline flex-1 !py-2.5 !text-[0.7rem]">
            {t("actions.spec")}
          </Link>
          <Link href="/contact" className="btn btn-primary flex-1 !py-2.5 !text-[0.7rem]">
            {t("actions.quote")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.64rem] uppercase tracking-wide text-[var(--text-soft)]">{label}</dt>
      <dd className="m-0 font-medium text-[var(--text)]">{value}</dd>
    </div>
  );
}
