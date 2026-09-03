import { AboutSection } from "@/components/sections/AboutSection";
import { buildPageMetadata } from "@/lib/seo";
import { listMediaByCategory } from "@/lib/media";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "about" });
}

export default async function AboutPage() {
  const team = await listMediaByCategory("team");
  return <AboutSection teamImage={team[0]} />;
}
