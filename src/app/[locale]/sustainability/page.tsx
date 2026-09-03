import { SustainabilitySection } from "@/components/sections/SustainabilitySection";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "sustainability" });
}

export default function SustainabilityPage() {
  return <SustainabilitySection />;
}
