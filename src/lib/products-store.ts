import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/i18n/routing";
import type { Product } from "./content-types";

export type ProductTranslation = {
  tag: string;
  name: string;
  desc: string;
  composition: string;
  strength: string;
  twist: string;
  packaging: string;
  application: string;
};

export type ProductRecord = {
  id: string;
  slug: string;
  count: string;
  translations: Record<Locale, ProductTranslation>;
};

const DATA_FILE = path.join(process.cwd(), "content", "products.json");

export async function listProductRecords(): Promise<ProductRecord[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as ProductRecord[];
  } catch {
    return [];
  }
}

async function saveProductRecords(records: ProductRecord[]): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export async function getProductRecordById(id: string): Promise<ProductRecord | undefined> {
  const records = await listProductRecords();
  return records.find((r) => r.id === id);
}

export type ProductInput = {
  slug: string;
  count: string;
  translations: Record<Locale, ProductTranslation>;
};

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function createProductRecord(input: ProductInput): Promise<SaveResult> {
  const records = await listProductRecords();
  if (records.some((r) => r.slug === input.slug)) {
    return { ok: false, error: "A product with this slug already exists." };
  }
  const record: ProductRecord = { id: randomUUID(), ...input };
  records.push(record);
  await saveProductRecords(records);
  return { ok: true, id: record.id };
}

export async function updateProductRecord(id: string, input: ProductInput): Promise<SaveResult> {
  const records = await listProductRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return { ok: false, error: "Product not found." };
  if (records.some((r) => r.slug === input.slug && r.id !== id)) {
    return { ok: false, error: "A product with this slug already exists." };
  }
  records[index] = { id, ...input };
  await saveProductRecords(records);
  return { ok: true, id };
}

export async function deleteProductRecord(id: string): Promise<void> {
  const records = await listProductRecords();
  await saveProductRecords(records.filter((r) => r.id !== id));
}

export function localizeProduct(record: ProductRecord, locale: Locale): Product {
  const t = record.translations[locale];
  return {
    slug: record.slug,
    count: record.count,
    tag: t.tag,
    name: t.name,
    desc: t.desc,
    composition: t.composition,
    strength: t.strength,
    twist: t.twist,
    packaging: t.packaging,
    application: t.application
  };
}
