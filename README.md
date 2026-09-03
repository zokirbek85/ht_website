# Hazorasp-Textil — corporate website

Next.js 16 (App Router) + TypeScript + Tailwind CSS + next-intl (EN / RU / UZ).

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000 — redirects to `/en`. Switch language from the header/footer switcher, or visit `/ru` / `/uz` directly.

## Structure

- `src/app/[locale]/` — routes (one per site section, see below), all localized
- `src/components/sections/` — Hero, StatsBar, AboutSection, ProductionSection, ProductsSection, QualitySection, ExportSection, SustainabilitySection, NewsSection, ContactSection
- `src/components/layout/` — Header, Footer, LangSwitch
- `src/lib/company.ts` — non-translated company facts (founding year, domain, address, phone, email). `stats.yearsLabel`'s value is computed at request time from `foundingYear`, so it never goes stale.
- `messages/{en,ru,uz}.json` — all copy, per language. Edit these to change site content — no code changes needed for copy edits.
- `src/app/[locale]/contact/actions.ts` — the contact form Server Action. Currently logs the inquiry server-side only; wire in an email provider (e.g. Resend) or CRM webhook before going live.

## Content still pending real data

Everything in `messages/*.json` now reflects data provided by the company, with two deliberate exceptions kept honest rather than invented:

- `quality.certs` — no specific certification (ISO 9001, OEKO-TEX, etc.) is named until the company confirms it actually holds one. Currently shows generic, true statements about internal QA practice. **Update this the moment a real certificate exists** — and upload the certificate file itself via the future CMS/certificates page.
- `products.items[0].strength` / `.twist` / `.packaging` — shown as "Available on request" / "So'rov asosida" / "По запросу" because exact figures weren't provided. Replace with real values (cN/tex, TM, kg) as soon as you have them.
- `products.items` currently lists **only** Carded Cotton Yarn (Ne 20/1, 24/1, 26/1, 30/1 — knitting). Add more entries to the array once other yarn types are confirmed in production.
- `news.items` are illustrative placeholders (plausible dates/events grounded in real facts — the carded line, Russia/Türkiye export) but **not real announcements**. Replace with actual news before launch.
- `sustainability.items` avoid specific unconfirmed metrics (e.g. no invented kWh/kg or water-recovery numbers) — add real figures once measured.

## Assets still needed

- Original logo file (SVG or high-res PNG) — the current mark (`src/components/icons/Mark.tsx`, favicons in `public/icons/`) is a generated interpretation based on the uploaded image, not the source file
- Real factory / production photography — `factory`, `team`, and `gallery` media categories are currently filled with abstract generated placeholder graphics (brand-colored geometric compositions, not photos of real people or premises); replace via `/admin/media` once real photos exist
- Certificate scans (PDF/image) once available

## Media library placeholders

`factory`, `team`, and `gallery` categories in `/admin/media` were empty, so placeholder visuals were generated (SVG → PNG via `sharp`, brand palette, deliberately abstract/geometric — never photorealistic, since these aren't real photos of real premises or people) and wired into the public site:

- Production page (`/production`) — factory + gallery visuals in a grid below the process track
- About page (`/about`) — team visual under the CEO message

Replace any of these at any time by uploading a real photo to the matching category in `/admin/media` and deleting the placeholder — the public pages render whatever `listMediaByCategory()` returns, newest first.

## Favicons / app icons

Generated from the brand mark and wired into both root layouts (`src/app/[locale]/layout.tsx`, `src/app/admin/layout.tsx`):

- `public/favicon.ico` — 16/32/48px, simplified bold glyph (the dashed-ring detail is unreadable at tab size)
- `public/icons/icon-{16,32,48,192,512}.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- `public/icons/mark.svg` (transparent), `mark-favicon.svg` (simplified, solid bg), `mark-apple.svg` (solid bg for iOS)
- `public/site.webmanifest` — PWA icons/theme colors

Regenerate after editing the source SVGs with `node` + the `sharp` package already in `node_modules` (no ImageMagick/rsvg needed).

## Build

```bash
npm run build
npm run start
```
# ht_website
