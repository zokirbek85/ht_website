import { getLocale } from "next-intl/server";
import { Hero } from "@/components/sections/Hero";
import { StatsBar } from "@/components/sections/StatsBar";
import { AboutSection } from "@/components/sections/AboutSection";
import { ProductionSection } from "@/components/sections/ProductionSection";
import { ProductsSection } from "@/components/sections/ProductsSection";
import { QualitySection } from "@/components/sections/QualitySection";
import { ExportSection } from "@/components/sections/ExportSection";
import { SustainabilitySection } from "@/components/sections/SustainabilitySection";
import { NewsSection } from "@/components/sections/NewsSection";
import { CtaBand } from "@/components/sections/CtaBand";
import { getNews, getProducts } from "@/lib/get-content";
import { listMediaByCategory } from "@/lib/media";
import type { Locale } from "@/i18n/routing";

export default async function HomePage() {
  const locale = (await getLocale()) as Locale;
  const [products, news, factoryMedia, certificates] = await Promise.all([
    getProducts(locale),
    getNews(locale),
    listMediaByCategory("factory"),
    listMediaByCategory("certificate")
  ]);
  const heroImage = factoryMedia.find((item) => item.filename.startsWith("factory-building"));

  return (
    <>
      <Hero image={heroImage?.url} />
      <StatsBar />
      <AboutSection compact />
      <ProductionSection compact />
      <ProductsSection items={products} compact />
      <QualitySection compact />
      <ExportSection certificates={certificates} />
      <SustainabilitySection />
      <NewsSection items={news.slice(0, 3)} />
      <CtaBand />
    </>
  );
}
