import { ContactSection } from "@/components/sections/ContactSection";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildPageMetadata({ locale, namespace: "contact" });
}

export default function ContactPage() {
  return <ContactSection />;
}
