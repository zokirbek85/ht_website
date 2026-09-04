import { useTranslations } from "next-intl";
import { IconDrop, IconBolt, IconLeaf } from "@/components/icons";
import { Reveal } from "@/components/ui/Reveal";
import { StaggerGroup, StaggerItem } from "@/components/ui/Stagger";

const ICONS = [IconDrop, IconBolt, IconLeaf];

export function SustainabilitySection() {
  const t = useTranslations("sustainability");
  const items = t.raw("items") as { title: string; desc: string; metric?: string }[];

  return (
    <section id="sustainability" className="bg-[var(--bg)] py-16 sm:py-24">
      <div className="container-brand">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-8 sm:mb-14">
          <div>
            <span className="section-num">{t("sectionNum")}</span>
            <h2 className="heading-natural mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)]">{t("title")}</h2>
          </div>
          <p className="max-w-[38ch] text-[var(--text-soft)]">{t("lede")}</p>
        </Reveal>

        <StaggerGroup className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length]!;
            return (
              <StaggerItem key={item.title} className="card p-7" hover>
                <Icon className="h-[30px] w-[30px] text-forest" />
                <h3 className="mt-5 text-[1rem] normal-case tracking-normal">{item.title}</h3>
                <p className="mt-2.5 text-[0.87rem] text-[var(--text-soft)]">{item.desc}</p>
                {item.metric && (
                  <div className="mt-5 border-t border-[var(--border)] pt-3 font-mono text-[0.72rem] text-forest">
                    {item.metric}
                  </div>
                )}
              </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </section>
  );
}
