"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { MotionLink } from "@/components/ui/MotionLink";
import { FiberField } from "./FiberField";

const textUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0 }
};

export function Hero({ image }: { image?: string }) {
  const t = useTranslations("hero");
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "22%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={sectionRef} className="overflow-clip">
      <div className="on-dark relative flex min-h-[min(92vh,900px)] items-end bg-[var(--surface-dark)] text-[var(--surface-dark-text)]">
        <motion.div className="absolute inset-0" style={{ y: bgY }}>
          {image && <Image src={image} alt="" fill sizes="100vw" className="object-cover" priority />}
          <FiberField />
        </motion.div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 80% 15%, color-mix(in srgb, var(--brass) 30%, transparent), transparent 60%), linear-gradient(180deg, var(--surface-dark) 0%, color-mix(in srgb, var(--surface-dark) 88%, black 12%) 55%, var(--surface-dark) 100%)"
          }}
        />
        <motion.div
          className="container-brand relative z-[2] w-full pb-16 pt-32 sm:pt-40"
          style={{ y: contentY, opacity: contentOpacity }}
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.12, delayChildren: 0.1 }}
        >
          <motion.span variants={textUp} transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }} className="eyebrow">
            {t("eyebrow")}
          </motion.span>
          <motion.h1
            variants={textUp}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="mt-4 max-w-[16ch] text-[clamp(2.5rem,6.4vw,5.2rem)] leading-[1.02] text-[var(--surface-dark-text)]"
          >
            {t("titleLine1")}
            <span className="block text-[var(--accent-2)]">{t("titleLine2")}</span>
          </motion.h1>
          <motion.p
            variants={textUp}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="mt-6 max-w-[46ch] text-[1.12rem] text-[var(--surface-dark-text-soft)]"
          >
            {t("sub")}
          </motion.p>
          <motion.div
            variants={textUp}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="mt-9 flex flex-wrap gap-4"
          >
            <MotionLink href="/contact" className="btn btn-brass">
              {t("ctaPrimary")}
            </MotionLink>
            <MotionLink href="/contact" className="btn btn-outline">
              {t("ctaSecondary")}
            </MotionLink>
          </motion.div>
        </motion.div>
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
