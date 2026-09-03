import { ExportSection } from "@/components/sections/ExportSection";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "export", descriptionKey: "copy" });
}

export default function ExportPage() {
  return <ExportSection />;
}
