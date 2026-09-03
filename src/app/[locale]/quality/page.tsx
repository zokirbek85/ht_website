import { QualitySection } from "@/components/sections/QualitySection";
import { buildPageMetadata } from "@/lib/seo";
import { listMediaByCategory } from "@/lib/media";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "quality" });
}

export default async function QualityPage() {
  const certificates = await listMediaByCategory("certificate");
  return <QualitySection certificates={certificates} />;
}
