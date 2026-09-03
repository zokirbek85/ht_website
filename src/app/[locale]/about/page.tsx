import { AboutSection } from "@/components/sections/AboutSection";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "about" });
}

export default async function AboutPage() {
  return <AboutSection />;
}
