import { Children } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LangSwitch } from "./LangSwitch";

export function Footer() {
  const tNav = useTranslations("nav");
  const tFooter = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[var(--forest-deep)] pb-6 pt-16 text-[var(--surface-dark-text-soft)]">
      <div className="container-brand">
        <div className="grid grid-cols-1 gap-10 border-b border-[var(--surface-dark-border)] pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-3 text-[var(--surface-dark-text)] no-underline">
              <Image src="/uploads/logo/1788427254322-1784123853563-logo.webp" alt="Hazorasp-Textil" width={142} height={58} className="h-12 w-auto object-contain" />
            </Link>
            <p className="mt-4 max-w-[34ch] text-[0.85rem]">{tFooter("tagline")}</p>
          </div>

          <FooterCol title={tFooter("companyTitle")}>
            <Link href="/about">{tNav("about")}</Link>
            <Link href="/production">{tNav("production")}</Link>
            <Link href="/sustainability">{tNav("sustainability")}</Link>
            <Link href="/news">{tNav("news")}</Link>
          </FooterCol>

          <FooterCol title={tFooter("productsTitle")}>
            <Link href="/products">{tNav("products")}</Link>
            <Link href="/quality">{tFooter("certificates")}</Link>
            <Link href="/export">{tNav("export")}</Link>
          </FooterCol>

          <FooterCol title={tFooter("resourcesTitle")}>
            <Link href="/contact">{tFooter("requestCatalog")}</Link>
            <Link href="/contact">{tNav("contact")}</Link>
          </FooterCol>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 text-[0.76rem]">
          <span>
            © {year} Hazorasp-Textil MCHJ. {tFooter("rights")}
          </span>
          <LangSwitch className="border-[var(--surface-dark-border)]" />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-4 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-[var(--surface-dark-text)]">
        {title}
      </h4>
      <ul className="flex list-none flex-col gap-2.5 p-0 text-[0.85rem] [&_a]:text-[var(--surface-dark-text-soft)] [&_a]:no-underline [&_a:hover]:text-[var(--accent-2)]">
        {Children.map(children, (child, i) => (
          <li key={i}>{child}</li>
        ))}
      </ul>
    </div>
  );
}
