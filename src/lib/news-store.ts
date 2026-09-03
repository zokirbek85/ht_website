import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/i18n/routing";
import type { NewsItem } from "./content-types";

export type NewsTranslation = {
  category: string;
  title: string;
  excerpt: string;
};

export type NewsRecord = {
  id: string;
  slug: string;
  date: string;
  translations: Record<Locale, NewsTranslation>;
};

const DATA_FILE = path.join(process.cwd(), "content", "news.json");

export async function listNewsRecords(): Promise<NewsRecord[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const records = JSON.parse(raw) as NewsRecord[];
    return records.sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch {
    return [];
  }
}

async function saveNewsRecords(records: NewsRecord[]): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export async function getNewsRecordById(id: string): Promise<NewsRecord | undefined> {
  const records = await listNewsRecords();
  return records.find((r) => r.id === id);
}

export type NewsInput = {
  slug: string;
  date: string;
  translations: Record<Locale, NewsTranslation>;
};

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function createNewsRecord(input: NewsInput): Promise<SaveResult> {
  const records = await listNewsRecords();
  if (records.some((r) => r.slug === input.slug)) {
    return { ok: false, error: "A news item with this slug already exists." };
  }
  const record: NewsRecord = { id: randomUUID(), ...input };
  records.unshift(record);
  await saveNewsRecords(records);
  return { ok: true, id: record.id };
}

export async function updateNewsRecord(id: string, input: NewsInput): Promise<SaveResult> {
  const records = await listNewsRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return { ok: false, error: "News item not found." };
  if (records.some((r) => r.slug === input.slug && r.id !== id)) {
    return { ok: false, error: "A news item with this slug already exists." };
  }
  records[index] = { id, ...input };
  await saveNewsRecords(records);
  return { ok: true, id };
}

export async function deleteNewsRecord(id: string): Promise<void> {
  const records = await listNewsRecords();
  await saveNewsRecords(records.filter((r) => r.id !== id));
}

export function localizeNews(record: NewsRecord, locale: Locale): NewsItem {
  const t = record.translations[locale];
  return { slug: record.slug, date: record.date, category: t.category, title: t.title, excerpt: t.excerpt };
}
