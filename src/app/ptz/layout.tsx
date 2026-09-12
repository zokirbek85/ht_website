import type { Metadata } from "next";
import { oswald, ptSans, plexMono } from "@/lib/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "PTZ Analytics | Hazorasp-Textil",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }
    ]
  }
};

export default function PtzLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" data-scroll-behavior="smooth" className={`${oswald.variable} ${ptSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-[var(--bg-sunken)] text-[var(--text)]">{children}</body>
    </html>
  );
}
