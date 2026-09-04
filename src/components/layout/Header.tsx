"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link, usePathname } from "@/i18n/navigation";
import { MotionLink } from "@/components/ui/MotionLink";
import { LangSwitch } from "./LangSwitch";

const NAV_ITEMS = [
  { href: "/about", key: "about" },
  { href: "/production", key: "production" },
  { href: "/products", key: "products" },
  { href: "/quality", key: "quality" },
  { href: "/export", key: "export" },
  { href: "/sustainability", key: "sustainability" },
  { href: "/news", key: "news" },
  { href: "/contact", key: "contact" }
] as const;

export function Header({ logoUrl }: { logoUrl?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[100] border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="container-brand flex h-[76px] items-center gap-8">
        <Link href="/" className="flex flex-shrink-0 items-center gap-3 text-[var(--text)] no-underline">
          <Image src={logoUrl ?? "/icons/icon-192.png"} alt="Hazorasp-Textil" width={142} height={58} className="h-12 w-auto object-contain" priority />
          <span className="font-display text-[1.05rem] font-bold uppercase tracking-wide text-[var(--text)]">
            Hazorasp-Textil
          </span>
        </Link>

        <nav
          className={`font-display text-[0.78rem] font-medium uppercase tracking-wider md:mx-auto md:flex md:gap-7 ${
            open
              ? "fixed inset-x-0 top-[76px] bottom-0 flex flex-col gap-0 overflow-y-auto bg-[var(--bg)] p-6"
              : "hidden"
          } md:static md:flex md:bg-transparent md:p-0`}
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`relative border-b border-[var(--border)] py-3.5 text-[var(--text-soft)] no-underline transition-colors hover:text-[var(--text)] md:border-none md:py-1 ${
                  active ? "text-[var(--text)]" : ""
                }`}
              >
                {t(item.key)}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-x-0 -bottom-px hidden h-[2px] bg-[var(--accent)] md:block"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-shrink-0 items-center gap-4">
          <div className="hidden md:block">
            <LangSwitch />
          </div>
          <MotionLink
            href="/contact"
            className="btn btn-primary hidden !py-2.5 !px-5 !text-[0.72rem] md:inline-flex"
          >
            {t("contactCta")}
          </MotionLink>
          <motion.button
            type="button"
            aria-label={t("toggleMenu")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            whileTap={{ scale: 0.9 }}
            className="relative h-9 w-9 rounded-s border border-[var(--border-strong)] md:hidden"
          >
            <span
              className={`absolute left-[9px] right-[9px] top-[17px] h-[1.5px] bg-[var(--text)] transition-transform ${
                open ? "translate-y-[0px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-[9px] right-[9px] top-[23px] h-[1.5px] bg-[var(--text)] transition-transform ${
                open ? "-translate-y-[6px] -rotate-45" : ""
              }`}
            />
          </motion.button>
        </div>
      </div>
    </header>
  );
}
