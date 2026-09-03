import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/x-adobe-dng",
  "image/dng",
  "application/dng",
  "application/pdf"
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isAllowedFile(file: File): boolean {
  return ALLOWED_TYPES.has(file.type) || path.extname(file.name).toLowerCase() === ".dng";
}

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

type PreparedFile = { buffer: Buffer; filename: string; mimeType: string; size: number };

async function prepareFile(file: File): Promise<PreparedFile | { error: string }> {
  if (file.size <= MAX_SIZE_BYTES) {
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type,
      size: file.size
    };
  }

  if (!COMPRESSIBLE_TYPES.has(file.type)) {
    return { error: "Files larger than 10MB can only be auto-compressed when they are JPG, PNG or WEBP images." };
  }

  const source = Buffer.from(await file.arrayBuffer());
  let quality = 88;
  let buffer = await sharp(source).webp({ quality }).toBuffer();
  while (buffer.length > MAX_SIZE_BYTES && quality > 45) {
    quality -= 8;
    buffer = await sharp(source).webp({ quality }).toBuffer();
  }

  if (buffer.length > MAX_SIZE_BYTES) {
    return { error: "The image is still larger than 10MB after compression." };
  }

  return {
    buffer,
    filename: `${path.basename(file.name, path.extname(file.name))}.webp`,
    mimeType: "image/webp",
    size: buffer.length
  };
}

export async function uploadMediaFile(
  file: File,
  category: MediaCategory,
  title: string
): Promise<UploadResult> {
  if (!MEDIA_CATEGORIES.includes(category)) {
    return { ok: false, error: "Invalid category" };
  }
  if (!isAllowedFile(file)) {
    return { ok: false, error: "Unsupported file type. Use JPG, PNG, WEBP, SVG, DNG or PDF." };
  }
  const prepared = await prepareFile(file);
  if ("error" in prepared) return { ok: false, error: prepared.error };

  const id = randomUUID();
  const ext = path.extname(prepared.filename) || "";
  const base = sanitizeFilename(path.basename(prepared.filename, ext));
  const filename = `${Date.now()}-${base || id}${ext}`;

  const dir = path.join(UPLOAD_ROOT, category);
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, filename), prepared.buffer);

  const item: MediaItem = {
    id,
    category,
    filename,
    originalName: file.name,
    url: `/uploads/${category}/${filename}`,
    title: title.trim() || file.name,
    mimeType: prepared.mimeType,
    size: prepared.size,
    uploadedAt: new Date().toISOString()
  };

  const items = await listMedia();
  items.unshift(item);
  await saveMedia(items);

  return { ok: true, item };
}

export async function updateMediaFile(
  id: string,
  file: File | undefined,
  category: MediaCategory,
  title: string
): Promise<UploadResult> {
  if (!MEDIA_CATEGORIES.includes(category)) return { ok: false, error: "Invalid category" };
  const items = await listMedia();
  const current = items.find((item) => item.id === id);
  if (!current) return { ok: false, error: "Media item not found." };

  let prepared: PreparedFile | undefined;
  if (file && file.size > 0) {
    if (!isAllowedFile(file)) {
      return { ok: false, error: "Unsupported file type. Use JPG, PNG, WEBP, SVG, DNG or PDF." };
    }
    const result = await prepareFile(file);
    if ("error" in result) return { ok: false, error: result.error };
    prepared = result;
  }

  const nextItem: MediaItem = {
    ...current,
    category,
    title: title.trim() || (prepared ? file?.name ?? current.title : current.title),
    ...(prepared
      ? {
          filename: `${Date.now()}-${sanitizeFilename(path.basename(prepared.filename, path.extname(prepared.filename))) || current.id}${path.extname(prepared.filename)}`,
          originalName: file?.name ?? current.originalName,
          mimeType: prepared.mimeType,
          size: prepared.size
        }
      : {})
  };
  nextItem.url = `/uploads/${category}/${nextItem.filename}`;

  const oldPath = path.join(UPLOAD_ROOT, current.category, current.filename);
  const nextPath = path.join(UPLOAD_ROOT, category, nextItem.filename);
  await mkdir(path.dirname(nextPath), { recursive: true });
  if (prepared) await writeFile(nextPath, prepared.buffer);
  if (oldPath !== nextPath) {
    if (!prepared) {
      try {
        await rename(oldPath, nextPath);
      } catch {
        return { ok: false, error: "The existing media file could not be moved." };
      }
    } else {
      try {
        await unlink(oldPath);
      } catch {
        // The old file may already be missing.
      }
    }
  }

  await saveMedia(items.map((item) => (item.id === id ? nextItem : item)));
  return { ok: true, item: nextItem };
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
