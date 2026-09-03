import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { COMPANY } from "@/lib/company";
import enMessages from "../../messages/en.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? COMPANY.siteUrl;

const STATIC_PATHS = [
  "",
  "/about",
  "/production",
  "/products",
  "/quality",
  "/export",
  "/sustainability",
  "/news",
  "/contact"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const productSlugs = enMessages.products.items.map((p) => `/products/${p.slug}`);
  const newsSlugs = enMessages.news.items.map((n) => `/news/${n.slug}`);
  const paths = [...STATIC_PATHS, ...productSlugs, ...newsSlugs];

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]))
      }
    }))
  );
}
