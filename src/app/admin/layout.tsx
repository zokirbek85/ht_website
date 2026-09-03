import type { Metadata } from "next";
import { oswald, ptSans, plexMono } from "@/lib/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "Admin | Hazorasp-Textil",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }]
  }
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${oswald.variable} ${ptSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-[var(--bg-sunken)] text-[var(--text)]">{children}</body>
    </html>
  );
}
