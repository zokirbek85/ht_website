"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconReceive,
  IconClean,
  IconFiber,
  IconSpin,
  IconQC,
  IconYarn
} from "@/components/icons";

type Step = { index: string; title: string; desc: string; tech: string };

const ICONS = [IconReceive, IconClean, IconFiber, IconSpin, IconQC, IconYarn];

export function ProcessTrack({ steps }: { steps: Step[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<boolean[]>(() => steps.map(() => false));

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const stepEls = Array.from(track.querySelectorAll<HTMLElement>("[data-step]"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const i = Number((entry.target as HTMLElement).dataset.step);
          setActive((prev) => {
            if (prev[i]) return prev;
            const next = [...prev];
            next[i] = true;
            return next;
          });
        });
      },
      { threshold: 0.6 }
    );
    stepEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [steps.length]);

  const activeCount = active.filter(Boolean).length;
  const fillPct = steps.length ? (activeCount / steps.length) * 100 : 0;

  return (
    <div ref={trackRef} className="relative">
      <div className="relative hidden md:grid md:grid-cols-6 md:gap-6">
        <div className="absolute left-0 right-0 top-[26px] h-0.5 bg-[var(--border-strong)]">
          <div
            className="h-full bg-forest transition-[width] duration-[1400ms] ease-out"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        {steps.map((step, i) => {
          const Icon = ICONS[i % ICONS.length]!;
          const isActive = active[i];
          return (
            <div key={step.index} data-step={i} className="relative z-[1] flex flex-col gap-4">
              <div
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 transition-colors duration-500 ${
                  isActive ? "border-forest bg-forest" : "border-[var(--border-strong)] bg-[var(--bg-raised)]"
                }`}
              >
                <Icon className={`h-[22px] w-[22px] ${isActive ? "text-white" : "text-[var(--text-soft)]"}`} />
              </div>
              <div className="font-mono text-[0.66rem] text-[var(--text-soft)]">{step.index}</div>
              <h3 className="text-[0.92rem] normal-case tracking-normal">{step.title}</h3>
              <p className="text-[0.83rem] leading-relaxed text-[var(--text-soft)]">{step.desc}</p>
              <div className="mt-1 border-t border-dashed border-[var(--border-strong)] pt-2 font-mono text-[0.66rem] text-forest">
                {step.tech}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col md:hidden">
        {steps.map((step, i) => {
          const Icon = ICONS[i % ICONS.length]!;
          const isActive = active[i];
          return (
            <div
              key={step.index}
              data-step={i}
              className={`ml-[26px] flex gap-4 border-l-2 py-5 pl-6 ${
                isActive ? "border-forest" : "border-[var(--border-strong)]"
              }`}
            >
              <div
                className={`-ml-[45px] flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-500 ${
                  isActive ? "border-forest bg-forest" : "border-[var(--border-strong)] bg-[var(--bg-raised)]"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-[var(--text-soft)]"}`} />
              </div>
              <div>
                <div className="font-mono text-[0.66rem] text-[var(--text-soft)]">{step.index}</div>
                <h3 className="mt-1 text-[0.92rem] normal-case tracking-normal">{step.title}</h3>
                <p className="mt-1.5 text-[0.83rem] leading-relaxed text-[var(--text-soft)]">{step.desc}</p>
                <div className="mt-2 border-t border-dashed border-[var(--border-strong)] pt-2 font-mono text-[0.66rem] text-forest">
                  {step.tech}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
