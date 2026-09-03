import { useTranslations } from "next-intl";
import { Counter } from "@/components/ui/Counter";
import { yearsOfExperience } from "@/lib/company";

export function StatsBar() {
  const t = useTranslations("stats");
  const rest = t.raw("items") as { value: number; suffix: string; label: string }[];
  const items = [{ value: yearsOfExperience(), suffix: "+", label: t("yearsLabel") }, ...rest];

  return (
    <section className="bg-[var(--forest-deep)] py-10 text-[var(--surface-dark-text)] sm:py-12">
      <div className="container-brand grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-5 sm:gap-0">
        {items.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-0 sm:px-5 ${i > 0 ? "sm:border-l sm:border-[var(--surface-dark-border)]" : ""}`}
          >
            <div className="text-[clamp(1.9rem,3.4vw,2.6rem)] text-white">
              <Counter value={stat.value} suffix={stat.suffix} />
            </div>
            <div className="mt-2 font-display text-[0.7rem] uppercase tracking-wider text-[var(--surface-dark-text-soft)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
