"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { en: "EN", ru: "RU", uz: "UZ" };

export function LangSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className={`flex overflow-hidden rounded-s border border-[var(--border-strong)] ${className ?? ""}`}>
      {routing.locales.map((code, i) => (
        <button
          key={code}
          type="button"
          onClick={() => router.replace(pathname, { locale: code })}
          className={`px-[0.55rem] py-[0.4rem] font-mono text-[0.68rem] tracking-wide transition-colors ${
            i > 0 ? "border-l border-[var(--border-strong)]" : ""
          } ${code === locale ? "bg-forest text-white" : "text-[var(--text-soft)] hover:text-[var(--text)]"}`}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}
