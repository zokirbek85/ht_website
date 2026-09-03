# Design Improvements

## Completed

- Added `scripts/optimize-images.mjs` and the `npm run optimize-images` command. Original raster files remain in place; WebP and AVIF variants are generated beside them.
- Enabled AVIF/WebP output in Next Image and updated public media records to use WebP assets.
- Added a full-bleed factory photo to the homepage hero, sourced from `content/media.json`.
- Added optional product `image` and `specPdf` fields with an image fallback and graceful contact-page fallback for missing documents.
- Added an export catalog CTA and a certificate/document strip driven by uploaded certificate media.
- Added the `heading-natural` utility to improve long heading readability while preserving uppercase eyebrows, navigation, and buttons.
- Updated header and footer to use the supplied company logo as a 28.2 KB WebP; document icons continue to use the lightweight icon assets.

## Image sizes

The largest homepage image changed from `factory-building.png` at 5,063,816 bytes to `factory-building.webp` at 730,262 bytes, an 85.6% reduction for the referenced asset. The remaining homepage media records also point to generated WebP variants.

## Follow-ups

- No real product photo is currently available, so the existing cone illustration remains the product fallback.
- No catalog PDF is currently available, so the catalog CTA routes to the contact page until a `specPdf` or catalog asset is supplied.
- Uploaded certificate files are shown as labeled document links; dedicated certification logos can be added when supplied.

## Verification

- `npm run lint`: passes with one pre-existing warning in `postcss.config.mjs`.
- `npm run typecheck`: passes.
- `npm run build`: passes.