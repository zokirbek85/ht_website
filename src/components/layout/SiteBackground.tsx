"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    HazoraspBG?: { init: (cfg: Record<string, unknown>) => { canvas: HTMLCanvasElement } | undefined };
  }
}

const IMAGES = [
  "/images/bg/factory-01.jpg",
  "/images/bg/factory-02.jpg",
  "/images/bg/factory-03.jpg",
  "/images/bg/factory-05.jpg",
  "/images/bg/factory-06.jpg",
  "/images/bg/factory-07.jpg"
];

const SCRIM = "color-mix(in srgb, var(--bg) 26%, transparent)";

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Yuklanmadi: ${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Yuklanmadi: ${src}`));
    document.head.appendChild(script);
  });
}

export function SiteBackground() {
  useEffect(() => {
    if (typeof window === "undefined" || window.HazoraspBG) return;

    let cancelled = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 640px)").matches;

    loadScript("/hazorasp-bg.js")
      .then(() => {
        if (cancelled || !window.HazoraspBG) return;
        window.HazoraspBG.init({
          images: IMAGES,
          hold: 5.2,
          trans: 1.7,
          intensity: isSmallScreen ? 0.7 : 1,
          zIndex: 0,
          parallax: !reduceMotion,
          scrim: SCRIM,
          threeUrl: "/vendor/three.min.js"
        });
      })
      .catch((err) => {
        console.warn("[SiteBackground]", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
