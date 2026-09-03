import { NewsSection } from "@/components/sections/NewsSection";
import { buildPageMetadata } from "@/lib/seo";
import { getNews } from "@/lib/get-content";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "news" });
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const news = await getNews(locale as Locale);
  return <NewsSection items={news} />;
}
