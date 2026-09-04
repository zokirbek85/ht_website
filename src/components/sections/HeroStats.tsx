"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { Counter } from "@/components/ui/Counter";
import { yearsOfExperience } from "@/lib/company";

export function HeroStats() {
  const t = useTranslations("stats");
  const items = t.raw("items") as { value: number; suffix: string; label: string }[];
  const reduceMotion = useReducedMotion();

  return (
    <div className="container-brand pointer-events-none absolute inset-y-0 right-0 z-[2] hidden items-center lg:flex">
      <motion.div
        className="pointer-events-auto relative ml-auto w-[300px] xl:w-[340px]"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
          transition={reduceMotion ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className="pointer-events-none absolute -inset-10 -z-10 rounded-full opacity-70 blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brass) 22%, transparent), transparent 70%)" }}
          />
          <div className="rounded-m border border-white/[0.12] bg-white/[0.05] p-6 backdrop-blur-md">
            <div className="flex items-baseline justify-between border-b border-white/[0.12] pb-4">
              <div className="text-[2.4rem] leading-none text-white">
                <Counter value={yearsOfExperience()} suffix="+" />
              </div>
              <span className="max-w-[9ch] text-right font-mono text-[0.64rem] uppercase leading-tight tracking-wide text-[var(--surface-dark-text-soft)]">
                {t("yearsLabel")}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              {items.map((item) => (
                <div key={item.label}>
                  <div className="text-[1.3rem] text-[var(--accent-2)]">
                    <Counter value={item.value} suffix={item.suffix} />
                  </div>
                  <div className="mt-1 font-mono text-[0.6rem] uppercase leading-tight tracking-wide text-[var(--surface-dark-text-soft)]">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
