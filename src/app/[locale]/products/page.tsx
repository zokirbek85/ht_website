import { ProductsSection } from "@/components/sections/ProductsSection";
import { buildPageMetadata } from "@/lib/seo";
import { getProducts } from "@/lib/get-content";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "products" });
}

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const products = await getProducts(locale as Locale);
  return <ProductsSection items={products} />;
}
