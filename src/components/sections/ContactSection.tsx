import { useTranslations } from "next-intl";
import { ContactForm } from "./ContactForm";

export function ContactSection() {
  const t = useTranslations("contact");
  const info = t.raw("info") as Record<string, string>;

  const rows = [
    { title: info.officeTitle, body: info.office },
    { title: info.salesTitle, body: `${info.email}\n${info.phone}` },
    { title: info.hoursTitle, body: info.hours },
    { title: info.langTitle, body: info.langs }
  ];

  return (
    <section id="contact" className="on-dark bg-[var(--surface-dark)] py-16 text-[var(--surface-dark-text)] sm:py-24">
      <div className="container-brand">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="heading-natural mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)] text-[var(--surface-dark-text)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--surface-dark-text-soft)]">{t("lede")}</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div className="flex flex-col gap-6">
            {rows.map((row, i) => (
              <div key={row.title} className={i > 0 ? "border-t border-[var(--surface-dark-border)] pt-6" : ""}>
                <b className="block font-mono text-[0.68rem] uppercase tracking-wide text-[var(--accent-2)]">
                  {row.title}
                </b>
                <p className="mt-2 whitespace-pre-line text-[0.95rem] text-[var(--surface-dark-text)]">{row.body}</p>
              </div>
            ))}
          </div>

          <ContactForm />
        </div>
      </div>
    </section>
  );
}
