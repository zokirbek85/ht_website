import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { oswald, ptSans, plexMono } from "@/lib/fonts";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/motion/PageTransition";
import { getSiteMedia } from "@/lib/site-media";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const favicon = await getSiteMedia("favicon");
  return {
    title: t("homeTitle"),
    description: t("homeDescription"),
    openGraph: {
      title: t("homeTitle"),
      description: t("homeDescription"),
      siteName: t("siteName"),
      locale,
      type: "website"
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: favicon?.url ?? "/icons/icon-512.png", sizes: "512x512", type: favicon?.mimeType ?? "image/png" }
      ],
      apple: [{ url: favicon?.url ?? "/icons/icon-512.png", sizes: "512x512", type: favicon?.mimeType ?? "image/png" }]
    },
    manifest: "/site.webmanifest"
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();
  const logo = await getSiteMedia("logo");

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${oswald.variable} ${ptSans.variable} ${plexMono.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:bg-forest focus:text-white focus:px-4 focus:py-2">
            Skip to content
          </a>
          <Header logoUrl={logo?.url} />
          <main id="main">
            <PageTransition>{children}</PageTransition>
          </main>
          <Footer logoUrl={logo?.url} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
