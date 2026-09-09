import { useTranslations } from "next-intl";
import { ContactForm } from "./ContactForm";
import { Reveal } from "@/components/ui/Reveal";
import { IconPhone, IconTelegram, IconWhatsApp } from "@/components/icons";

type PersonContact = {
  name: string;
  role: string;
  email: string;
  phones: string[];
};

function digitsOnly(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function PhoneLinks({ phone }: { phone: string }) {
  const digits = digitsOnly(phone);
  return (
    <span className="inline-flex items-center gap-2">
      <span>{phone}</span>
      <a
        href={`tel:+${digits}`}
        aria-label={`Call ${phone}`}
        className="inline-flex text-[var(--surface-dark-text-soft)] transition-colors hover:text-[var(--surface-dark-text)]"
      >
        <IconPhone className="h-4 w-4" />
      </a>
      <a href={`https://t.me/+${digits}`} target="_blank" rel="noopener noreferrer" aria-label={`Telegram ${phone}`} className="inline-flex">
        <IconTelegram className="h-4 w-4" />
      </a>
      <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${phone}`} className="inline-flex">
        <IconWhatsApp className="h-4 w-4" />
      </a>
    </span>
  );
}

export function ContactSection() {
  const t = useTranslations("contact");
  const info = t.raw("info") as Record<string, unknown>;
  const contacts = info.contacts as PersonContact[];

  const office = { title: info.officeTitle as string, body: info.office as string };
  const rows = [
    { title: info.hoursTitle as string, body: info.hours as string },
    { title: info.langTitle as string, body: info.langs as string }
  ];

  return (
    <section
      id="contact"
      className="on-dark py-16 text-[var(--surface-dark-text)] sm:py-24"
      style={{ background: "color-mix(in srgb, var(--surface-dark) 80%, transparent)" }}
    >
      <div className="container-brand">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="heading-natural mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)] text-[var(--surface-dark-text)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--surface-dark-text-soft)]">{t("lede")}</p>
        </Reveal>

        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal className="flex flex-col gap-6">
            <div>
              <b className="block font-mono text-[0.68rem] uppercase tracking-wide text-[var(--accent-2)]">
                {office.title}
              </b>
              <p className="mt-2 whitespace-pre-line text-[0.95rem] text-[var(--surface-dark-text)]">{office.body}</p>
            </div>

            <div className="border-t border-[var(--surface-dark-border)] pt-6">
              <b className="block font-mono text-[0.68rem] uppercase tracking-wide text-[var(--accent-2)]">
                {info.contactsTitle as string}
              </b>
              <ul className="mt-3 flex flex-col gap-4">
                {contacts.map((person) => (
                  <li key={person.email}>
                    <p className="text-[0.95rem] font-medium text-[var(--surface-dark-text)]">{person.name}</p>
                    <p className="text-[0.82rem] text-[var(--surface-dark-text-soft)]">{person.role}</p>
                    <p className="mt-1 text-[0.9rem] text-[var(--surface-dark-text)]">
                      <a href={`mailto:${person.email}`} className="hover:text-[var(--accent-2)]">
                        {person.email}
                      </a>
                    </p>
                    <div className="mt-1 flex flex-col gap-1 text-[0.9rem] text-[var(--surface-dark-text)]">
                      {person.phones.map((phone) => (
                        <PhoneLinks key={phone} phone={phone} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {rows.map((row) => (
              <div key={row.title} className="border-t border-[var(--surface-dark-border)] pt-6">
                <b className="block font-mono text-[0.68rem] uppercase tracking-wide text-[var(--accent-2)]">
                  {row.title}
                </b>
                <p className="mt-2 whitespace-pre-line text-[0.95rem] text-[var(--surface-dark-text)]">{row.body}</p>
              </div>
            ))}
          </Reveal>

          <Reveal delay={100}>
            <ContactForm />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
