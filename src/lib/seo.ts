import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function buildPageMetadata({
  locale,
  namespace,
  descriptionKey = "lede"
}: {
  locale: string;
  namespace: string;
  descriptionKey?: string;
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  const site = await getTranslations({ locale, namespace: "meta" });

  const title = `${t("title")} | ${site("titleSuffix")}`;
  const description = t.has(descriptionKey) ? t(descriptionKey) : site("homeDescription");

  return {
    title,
    description,
    openGraph: { title, description, locale, type: "website" }
  };
}
