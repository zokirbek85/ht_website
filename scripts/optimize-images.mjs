import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("public/uploads");
const rasterExtensions = new Set([".jpg", ".jpeg", ".png"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filePath)));
    else if (rasterExtensions.has(path.extname(entry.name).toLowerCase())) files.push(filePath);
  }
  return files;
}

const files = await walk(root);
for (const source of files) {
  const parsed = path.parse(source);
  const before = (await stat(source)).size;
  const webpPath = path.join(parsed.dir, `${parsed.name}.webp`);
  const isLogo = parsed.dir.endsWith(`${path.sep}logo`);
  const image = isLogo ? sharp(source).resize({ width: 512, withoutEnlargement: true }) : sharp(source);
  await image.webp({ quality: isLogo ? 78 : 86 }).toFile(webpPath);
  const webpSize = (await stat(webpPath)).size;
  const avifPath = path.join(parsed.dir, `${parsed.name}.avif`);
  try {
    const avifImage = isLogo ? sharp(source).resize({ width: 512, withoutEnlargement: true }) : sharp(source);
    await avifImage.avif({ quality: 68, effort: 4 }).toFile(avifPath);
  } catch {
    // AVIF is optional when the installed libvips build does not support it.
  }
  console.log(`${path.relative(process.cwd(), source)}: ${before} B -> ${webpSize} B WebP`);
}