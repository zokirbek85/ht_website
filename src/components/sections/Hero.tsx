import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FiberField } from "./FiberField";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="overflow-clip">
      <div className="on-dark relative flex min-h-[min(92vh,900px)] items-end bg-[var(--surface-dark)] text-[var(--surface-dark-text)]">
        <FiberField />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 80% 15%, color-mix(in srgb, var(--brass) 30%, transparent), transparent 60%), linear-gradient(180deg, var(--surface-dark) 0%, color-mix(in srgb, var(--surface-dark) 88%, black 12%) 55%, var(--surface-dark) 100%)"
          }}
        />
        <div className="container-brand relative z-[2] w-full pb-16 pt-32 sm:pt-40">
          <span className="eyebrow">{t("eyebrow")}</span>
          <h1 className="mt-4 max-w-[16ch] text-[clamp(2.5rem,6.4vw,5.2rem)] leading-[1.02] text-[var(--surface-dark-text)]">
            {t("titleLine1")}
            <span className="block text-[var(--accent-2)]">{t("titleLine2")}</span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-[1.12rem] text-[var(--surface-dark-text-soft)]">{t("sub")}</p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/contact" className="btn btn-brass">
              {t("ctaPrimary")}
            </Link>
            <Link href="/contact" className="btn btn-outline">
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>
        <div className="absolute bottom-6 right-6 z-[2] hidden items-center gap-3 font-mono text-[0.68rem] tracking-wide text-[var(--surface-dark-text-soft)] sm:flex">
          <span>{t("scrollLabel")}</span>
          <span className="relative h-px w-[34px] overflow-hidden bg-[var(--surface-dark-border)]">
            <span className="absolute inset-0 animate-scrollx bg-[var(--accent-2)]" />
          </span>
        </div>
      </div>
    </section>
  );
}
