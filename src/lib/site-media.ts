import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listMedia, type MediaItem } from "./media";
import { SITE_MEDIA_ROLES, type SiteMediaRole, type SiteMediaSettings } from "./site-media-constants";

export { SITE_MEDIA_ROLES } from "./site-media-constants";
export type { SiteMediaRole, SiteMediaSettings } from "./site-media-constants";

const DATA_FILE = path.join(process.cwd(), "content", "site-media.json");

const DEFAULT_SETTINGS: SiteMediaSettings = {
  logo: null,
  hero: null,
  product: null,
  favicon: null
};

export async function getSiteMediaSettings(): Promise<SiteMediaSettings> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SiteMediaSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function getSiteMedia(role: SiteMediaRole): Promise<MediaItem | undefined> {
  const [settings, items] = await Promise.all([getSiteMediaSettings(), listMedia()]);
  const id = settings[role];
  return id ? items.find((item) => item.id === id) : undefined;
}

export async function saveSiteMediaSettings(settings: SiteMediaSettings): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(settings, null, 2), "utf-8");
}
