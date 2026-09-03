import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_CATEGORIES, type MediaCategory } from "./media-constants";

export { MEDIA_CATEGORIES };
export type { MediaCategory };

export type MediaItem = {
  id: string;
  category: MediaCategory;
  filename: string;
  originalName: string;
  url: string;
  title: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

const DATA_FILE = path.join(process.cwd(), "content", "media.json");
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "application/pdf"]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function listMedia(): Promise<MediaItem[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as MediaItem[];
  } catch {
    return [];
  }
}

export async function listMediaByCategory(category: MediaCategory): Promise<MediaItem[]> {
  const all = await listMedia();
  return all.filter((item) => item.category === category);
}

async function saveMedia(items: MediaItem[]): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(items, null, 2), "utf-8");
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export type UploadResult = { ok: true; item: MediaItem } | { ok: false; error: string };

export async function uploadMediaFile(
  file: File,
  category: MediaCategory,
  title: string
): Promise<UploadResult> {
  if (!MEDIA_CATEGORIES.includes(category)) {
    return { ok: false, error: "Invalid category" };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: "Unsupported file type. Use JPG, PNG, WEBP, SVG or PDF." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "File is larger than 10MB." };
  }

  const id = randomUUID();
  const ext = path.extname(file.name) || "";
  const base = sanitizeFilename(path.basename(file.name, ext));
  const filename = `${Date.now()}-${base || id}${ext}`;

  const dir = path.join(UPLOAD_ROOT, category);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const item: MediaItem = {
    id,
    category,
    filename,
    originalName: file.name,
    url: `/uploads/${category}/${filename}`,
    title: title.trim() || file.name,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString()
  };

  const items = await listMedia();
  items.unshift(item);
  await saveMedia(items);

  return { ok: true, item };
}

export async function deleteMediaItem(id: string): Promise<void> {
  const items = await listMedia();
  const item = items.find((m) => m.id === id);
  if (!item) return;

  const filePath = path.join(UPLOAD_ROOT, item.category, item.filename);
  try {
    await unlink(filePath);
  } catch {
    // file already gone — still remove the record
  }

  await saveMedia(items.filter((m) => m.id !== id));
}
