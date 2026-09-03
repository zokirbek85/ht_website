import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/ui/Reveal";
import type { MediaItem } from "@/lib/media";

export function AboutSection({
  compact = false,
  teamImage
}: {
  compact?: boolean;
  teamImage?: MediaItem;
}) {
  const t = useTranslations("about");
  const values = t.raw("values") as { title: string; desc: string }[];
  const ceoParagraphs = t("ceoMessage").split("\n\n");

  return (
    <section id="about" className="bg-[var(--bg)] py-16 sm:py-24">
      <div className="container-brand">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="heading-natural mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--text-soft)]">{t("lede")}</p>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal>
            <div className="relative aspect-[4/5] overflow-hidden rounded-m bg-gradient-to-br from-forest to-[var(--forest-deep)]">
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-7 text-[#EDEAE0]">
                <p className="font-display text-[1.05rem] normal-case leading-snug tracking-normal">
                  &ldquo;{t("quote")}&rdquo;
                </p>
                <span className="mt-3 block font-mono text-[0.68rem] tracking-wide text-[var(--accent-2)]">
                  — {t("quoteAuthor")}
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="space-y-4 text-[1.03rem] text-[var(--text-soft)]">
              <p>
                <strong className="text-[var(--text)]">{t("historyTitle")}.</strong> {t("history")}
              </p>
              <p>
                <strong className="text-[var(--text)]">{t("missionTitle")}.</strong> {t("mission")}
              </p>
              {!compact && (
                <p>
                  <strong className="text-[var(--text)]">{t("visionTitle")}.</strong> {t("vision")}
                </p>
              )}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-m border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
              {(compact ? values.slice(0, 2) : values).map((v) => (
                <div key={v.title} className="bg-[var(--bg-raised)] p-5">
                  <b className="font-display text-[0.85rem]">{v.title}</b>
                  <p className="mt-1.5 text-[0.86rem] text-[var(--text-soft)]">{v.desc}</p>
                </div>
              ))}
            </div>

            {compact && (
              <Link href="/about" className="btn-ghost mt-6 inline-flex">
                {t("title")}
              </Link>
            )}
          </Reveal>
        </div>

        {!compact && (
          <Reveal delay={120}>
            <div className="mt-16 rounded-m border border-[var(--border)] bg-[var(--bg-sunken)] p-8 sm:p-12">
              <span className="section-num">{t("ceoMessageTitle")}</span>
              <div className="mt-5 max-w-[70ch] space-y-4 text-[1.03rem] leading-relaxed text-[var(--text-soft)]">
                {ceoParagraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <span className="mt-6 block font-mono text-[0.72rem] tracking-wide text-forest">
                — {t("quoteAuthor")}
              </span>
            </div>
          </Reveal>
        )}

        {!compact && teamImage && (
          <Reveal delay={160}>
            <div className="mt-10">
              <h3 className="mb-4 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-[var(--text-soft)]">
                Our team
              </h3>
              <div className="relative aspect-[4/3] max-w-[560px] overflow-hidden rounded-m border border-[var(--border)]">
                <Image src={teamImage.url} alt={teamImage.title} fill sizes="(min-width: 640px) 560px, 100vw" className="object-cover" />
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
