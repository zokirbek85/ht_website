import type { Locale } from "@/i18n/routing";
import type { NewsItem, Product } from "./content-types";
import { listNewsRecords, localizeNews } from "./news-store";
import { listProductRecords, localizeProduct } from "./products-store";

export async function getProducts(locale: Locale): Promise<Product[]> {
  const records = await listProductRecords();
  return records.map((r) => localizeProduct(r, locale));
}

export async function getProductBySlug(locale: Locale, slug: string): Promise<Product | undefined> {
  const products = await getProducts(locale);
  return products.find((p) => p.slug === slug);
}

export async function getNews(locale: Locale): Promise<NewsItem[]> {
  const records = await listNewsRecords();
  return records.map((r) => localizeNews(r, locale));
}

export async function getNewsBySlug(locale: Locale, slug: string): Promise<NewsItem | undefined> {
  const news = await getNews(locale);
  return news.find((n) => n.slug === slug);
}
