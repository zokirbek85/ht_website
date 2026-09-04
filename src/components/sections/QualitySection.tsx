import { useTranslations } from "next-intl";
import { IconFlask, IconRuler, IconDrop, IconCheck } from "@/components/icons";
import { Reveal } from "@/components/ui/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/ui/Stagger";
import type { MediaItem } from "@/lib/media";

const ITEM_ICONS = [IconFlask, IconRuler, IconDrop, IconCheck];

export function QualitySection({
  compact = false,
  certificates = []
}: {
  compact?: boolean;
  certificates?: MediaItem[];
}) {
  const t = useTranslations("quality");
  const items = t.raw("items") as { title: string; desc: string }[];
  const certs = t.raw("certs") as { name: string; desc: string }[];
  const uploadedCerts = compact ? [] : certificates;

  return (
    <section id="quality" className="on-dark relative overflow-hidden bg-[var(--surface-dark)] py-16 text-[var(--surface-dark-text)] sm:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, color-mix(in srgb, var(--accent-2) 6%, transparent) 0 1px, transparent 1px 34px)"
        }}
      />
      <div className="container-brand relative">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="heading-natural mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)] text-[var(--surface-dark-text)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--surface-dark-text-soft)]">{t("lede")}</p>
        </Reveal>

        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <StaggerGroup className="flex flex-col">
            {items.map((item, i) => {
              const Icon = ITEM_ICONS[i % ITEM_ICONS.length]!;
              return (
                <StaggerItem
                  key={item.title}
                  className={`flex gap-5 py-5 ${i > 0 ? "border-t border-[var(--surface-dark-border)]" : ""} ${
                    i === items.length - 1 ? "border-b border-[var(--surface-dark-border)]" : ""
                  }`}
                >
                  <Icon className="mt-0.5 h-[26px] w-[26px] flex-shrink-0 text-[var(--accent-2)]" />
                  <div>
                    <h3 className="text-[0.9rem] normal-case tracking-normal text-[var(--surface-dark-text)]">{item.title}</h3>
                    <p className="mt-1.5 text-[0.84rem] text-[var(--surface-dark-text-soft)]">{item.desc}</p>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerGroup>

          <Reveal delay={120} className="rounded-m border border-[var(--surface-dark-border)] bg-white/[0.04] p-7">
            <h3 className="mb-5 font-mono text-[0.78rem] tracking-[0.1em] text-[var(--surface-dark-text-soft)]">
              {t("certPanelTitle")}
            </h3>
            {(compact ? certs.slice(0, 2) : certs).map((cert, i) => (
              <div
                key={cert.name}
                className={`flex items-center gap-3.5 py-3.5 ${i > 0 ? "border-t border-[var(--surface-dark-border)]" : ""}`}
              >
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--accent-2)]" />
                <div>
                  <b className="block font-mono text-[0.78rem] text-[var(--surface-dark-text)]">{cert.name}</b>
                  <span className="text-[0.72rem] text-[var(--surface-dark-text-soft)]">{cert.desc}</span>
                </div>
              </div>
            ))}
          </Reveal>
        </div>

        {uploadedCerts.length > 0 && (
          <div className="mt-10">
            <h3 className="mb-4 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-[var(--surface-dark-text-soft)]">
              Certificates
            </h3>
            <div className="flex flex-wrap gap-4">
              {uploadedCerts.map((cert) => (
                <a
                  key={cert.id}
                  href={cert.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-s border border-[var(--surface-dark-border)] bg-white/[0.04] px-4 py-3 font-mono text-[0.78rem] text-[var(--surface-dark-text)] transition-colors hover:border-[var(--accent-2)] hover:text-[var(--accent-2)]"
                >
                  {cert.title} ↗
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
