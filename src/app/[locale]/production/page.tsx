import { ProductionSection } from "@/components/sections/ProductionSection";
import { buildPageMetadata } from "@/lib/seo";
import { listMediaByCategory } from "@/lib/media";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "production" });
}

export default async function ProductionPage() {
  const [factory, gallery] = await Promise.all([
    listMediaByCategory("factory"),
    listMediaByCategory("gallery")
  ]);
  return <ProductionSection visuals={[...factory, ...gallery]} />;
}
