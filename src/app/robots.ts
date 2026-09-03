import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? COMPANY.siteUrl;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
