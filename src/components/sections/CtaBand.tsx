import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function CtaBand() {
  const t = useTranslations("contact");

  return (
    <section className="on-dark bg-[var(--surface-dark)] py-16 text-center text-[var(--surface-dark-text)] sm:py-20">
      <div className="container-brand">
        <span className="eyebrow justify-center">{t("eyebrow")}</span>
        <h2 className="mx-auto mt-3 max-w-[20ch] text-[clamp(1.7rem,3.2vw,2.4rem)] text-[var(--surface-dark-text)]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-[46ch] text-[var(--surface-dark-text-soft)]">{t("lede")}</p>
        <Link href="/contact" className="btn btn-brass mt-8 inline-flex">
          {t("title")}
        </Link>
      </div>
    </section>
  );
}
