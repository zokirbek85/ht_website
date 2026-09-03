import { ExportSection } from "@/components/sections/ExportSection";
import { buildPageMetadata } from "@/lib/seo";
import { listMediaByCategory } from "@/lib/media";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "export", descriptionKey: "copy" });
}

export default async function ExportPage() {
  const certificates = await listMediaByCategory("certificate");
  return <ExportSection certificates={certificates} />;
}
