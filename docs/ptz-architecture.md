# PTZ Analytics — architecture, decisions, and status

This document covers the PTZ cotton-intake reporting module added to the hazorasp-textil.uz Next.js site:
what existed before, what was built, why it was built this way, and what is explicitly not done yet.

## 1. Pre-existing system (audit)

Before this feature, the repo was a Next.js 16 (App Router) + TypeScript + Tailwind + next-intl marketing
site with:

- **No database** — content lives in `messages/*.json` and `content/*.json` files.
- A minimal password-protected `/admin` (HMAC-signed cookie session, see `src/lib/auth.ts`) for media
  uploads only — no roles, no data tables.
- **Telegram used send-only**: the contact form POSTs to the Bot API to notify one fixed chat ID
  (`src/app/[locale]/contact/actions.ts`). No bot server, no webhook, no command handling.
- **Deployment**: one Next.js process under systemd, nginx in front, GitHub Actions runs
  `git reset --hard` + `npm ci` + `npm run build` + restart on every push to `main` (see `DEPLOY.md`).

None of the infrastructure the original spec assumed (database, role-based auth, file upload pipeline, PDF
engine, bot command server) existed. This is a from-scratch build of an analytics module bolted onto a
marketing site, not a modular addition to existing plumbing — so the choices below were made to fit the
*actual* single-VPS, single-process, database-less deployment rather than a generic enterprise stack.

## 2. Key architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Database | SQLite via Node's built-in `node:sqlite` | No DB existed; SQLite needs no new service on the VPS. `node:sqlite` needs zero npm dependencies (no native build step, unlike `better-sqlite3`) — but **requires Node ≥ 22.5** on the VPS (see `DEPLOY.md`). |
| Excel→field mapping | Deterministic header-path classification + keyword/fuzzy matching (`src/lib/ptz/excel-mapping.ts`) | No LLM calls, no API key, no per-import cost or latency, works offline. The interface (`classifyHeaderPath`) is isolated so an LLM fallback can be added later for headers this can't classify, without touching the parser. |
| Bot transport | Telegram webhook → `POST /api/ptz-bot/webhook`, a normal Next.js route on the existing service | No second process to deploy/monitor. The route acks Telegram immediately and continues processing in the background on the same long-running Node process (safe only because this is `next start` under systemd, not serverless — a serverless host would kill the process after the response). |
| Runtime data location | `data/ptz/` (git-ignored) | The existing deploy does `git reset --hard` on every push. Anything not git-ignored under a tracked path would be wiped on the next deploy (the site's own `public/uploads/` already isn't git-ignored, which is a pre-existing latent risk in this repo — not fixed here, but deliberately not repeated for PTZ data). `data/ptz/` holds `ptz.sqlite`, uploaded originals, and is never touched by `git reset`. |
| Scope | MVP now, phased | The original spec is ~57 sections (AI mapping, TV mode, full admin panel, 42-item test suite, 9 docs, dynamic metric registry, multi-year rollout). Building all of it unreviewed in one pass isn't safe. What's below is a working end-to-end slice; see §5 for what's deliberately deferred. |

## 3. What's implemented

**Excel ingestion** (`src/lib/ptz/parser.ts`) — no hardcoded sheet names, column letters, or row numbers:

- Picks the sheet by fuzzy name match (`/факт|fact/i`), falls back to the first sheet.
- Locates the farmer-name and row-number columns by keyword, uses the farmer column's vertical merge span
  to find where the header block ends (with a row-scan fallback if the header isn't merged that way).
- Flattens multi-row/merged headers into a path per column (e.g. `["Фьючерс", "Кабул килинди", "Жами"]`)
  and classifies each path into a contract type × field (`FUTURES.CUMULATIVE`, etc.) via
  `excel-mapping.ts`. Unrecognized columns are logged and ignored, never guessed.
- Detects region-separator rows (label with no row number, no figures) vs. subtotal rows (label with no
  row number but *with* figures) vs. real farmer rows, and never lets either become a fake farmer.
- Reads Excel formula-error cells (`#REF!`, `#VALUE!`, etc.) as `null` + a warning — **never** silently
  coerces them to `0`.
- Report date priority: filename (e.g. `Сводка 11,09,26.xlsx` → `2026-09-11`) → a date found in the sheet
  → Telegram upload timestamp, each recorded as `date_detection_method`.

**Import pipeline** (`src/lib/ptz/importer.ts`):

- Dedupes on `sha256(file bytes)` — a byte-identical re-upload is a no-op, not a duplicate history entry.
- A new file for a date that already has an active report **replaces** it: the old report row is kept
  (`is_active = 0`) for audit, the new one becomes active, and all *future* delta calculations use it.
- Daily delta = current cumulative − the latest **active** prior-dated snapshot for that farmer/series
  (not "yesterday" literally) — so a gap in reporting doesn't break the math.
- `source_daily_qty` (the sheet's own "Бир кунда") and `calculated_daily_delta` are stored **separately**,
  never merged — if they disagree beyond a threshold, a `DATA_CONSISTENCY_WARNING` is recorded per spec §47.
- Cross-checks Futures + Forward + Temporary-Storage against the sheet's own "Жами" total per farmer and
  flags `TOTALS_MISMATCH` (in Uzbek Cyrillic, per spec §28) when they disagree.
- Every warning is stored in `import_warnings` (see `/admin/ptz`), not just logged to the console.

**Analytics & forecast** (`src/lib/ptz/analytics.ts`): completion %, current run rate (trailing N days,
configurable, anchored to the nearest real snapshot at/before the window cutoff — never interpolated),
required daily pace against a season deadline, forecast date, and a GREEN/YELLOW/RED/UNKNOWN status that
factors in pace vs. deadline, not completion % alone.

**PDF** (`src/lib/ptz/pdf.ts`): A4 landscape, Uzbek Cyrillic (PT Sans TTF embedded, license: SIL OFL, from
Google Fonts), five sections — executive summary, contract types, regional top/bottom 10, farmer top/bottom
10 + risk list, forecast & data-quality warnings.

**Telegram bot** (`src/lib/ptz/bot.ts`, `src/app/api/ptz-bot/webhook/route.ts`): authorization check against
`telegram_users` (seeded via `PTZ_ADMIN_TELEGRAM_IDS` for the first admin), `/start /help /report /today
/history /dashboard /settings`, Excel document handling with the progress messages from spec §3, and the
summary/PDF/link/password sequence from spec §26.

**Temporary dashboard** (`src/app/ptz/report/[token]/`): cryptographically random token (24 bytes,
base64url) + a separate auto-generated password (scrypt-hashed), 60-minute expiry (configurable via the
`settings` table), password attempts logged to `temp_access_log`. A signed cookie (reusing the site's
`ADMIN_SESSION_SECRET`) avoids re-prompting for the password on every page view within the token's window.
The dashboard itself (`src/components/ptz/Dashboard.tsx`) covers KPIs, a completion bar, a daily-intake
trend chart, contract-type breakdown, region/farmer rankings, risk farmers, and data-quality warnings — all
in Uzbek Cyrillic.

**Admin visibility** (`/admin/ptz`, reuses the existing site-admin password/session): import history,
authorized Telegram users (add/remove), the latest report's warnings, and a rolling audit log.

**Tests** (`__tests__/ptz/*.test.mts`, run with `npm test`): parser (multi-row headers, regions, subtotals,
`#REF!`), date detection (including a real regex bug this caught — see §6), duplicate/replacement import
behavior and delta recomputation, forecast status transitions, and temp-link password/expiry logic.

## 4. Data model

SQLite tables (`src/lib/ptz/db.ts`): `regions`, `farmers`, `reports` (one row per import, `is_active` flags
the current one per date, `source_hash` enforces dedup), `farmer_metrics` (one row per farmer × series ×
report — series is one of `FUTURES/FORWARD/TEMPORARY_STORAGE/TOTAL/DELIVERED`, extensible without a schema
change), `import_warnings`, `telegram_users`, `audit_log`, `temp_access` / `temp_access_log`, `settings`
(season deadline, forecast window, link TTL — editable by inserting into the table directly for now; no
settings-editing UI yet, see §5).

## 5. Deliberately deferred (not built)

- **AI/LLM semantic mapping** — deterministic + keyword matching only, per the scope decision in §2. The
  classifier interface is isolated so this can be added later.
- **TV/wall-display auto-rotating mode** — the dashboard works on any screen size but doesn't auto-rotate
  between screens.
- **Settings-editing UI** — season deadline, forecast window, link TTL live in the `settings` SQLite table;
  editing them today means a direct DB write (or extending `/admin/ptz` with a form — straightforward, just
  not built yet).
- **Dynamic metric registry UI** — new business columns (e.g. "Средний вес") are logged as
  `COLUMN_NOT_MAPPED` and ignored, not auto-added as dashboard KPIs.
- **Multi-process safety** — `node:sqlite` access assumes a single Node process (true of this deployment
  today). If the site is ever scaled to multiple app instances behind a load balancer, the SQLite file
  needs to move to a shared location or the DB needs to change.
- **Full 42-item test matrix from the original spec** — 15 tests cover the highest-risk logic (parser
  robustness, dedup/replacement, forecast math, temp-link security). Not covered: PDF pixel-level output,
  live Telegram API calls (no bot token in this environment to test against), TV mode (not built).
- **The other 8 documents from spec §53** (separate API docs, admin guide, troubleshooting guide, etc.) —
  this one document covers architecture, schema, and decisions; expand it if the team wants those split out.

## 6. Important open item: no real sample file

The spec's sample file ("Сводка 11,09,26.xlsx") was **not present in this repository**. The parser was
built against the structure described in the spec (§4/§43) and validated against a synthetic fixture that
reproduces it (`__tests__/ptz/fixtures.mts`), including a deliberate `#REF!` cell, a region-separator row,
and a subtotal row. Building this fixture caught one real bug (a filename date-detection regex that
misfired on stray digits, e.g. `day2-11,09,26.xlsx` parsing as `2009-11-02` instead of `2026-09-11` — fixed
in `src/lib/ptz/dateDetect.ts` and covered by a regression test).

**Send the real Excel file through the bot (or attach it to this repo) before trusting this in
production** — a real file may have quirks (extra columns, different merge patterns, a % sub-column this
fixture didn't include) that only show up against real data. Watch `/admin/ptz`'s warnings panel on the
first few real imports.

## 7. How to extend

- **New contract type**: add it to `CONTRACT_TYPES` in `src/lib/ptz/types.ts` and a label in
  `CONTRACT_TYPE_LABELS_UZ` (`excel-mapping.ts`) — the parser, dashboard, and PDF pick it up automatically
  since they iterate that list rather than hardcoding FUTURES/FORWARD/TEMPORARY_STORAGE.
- **New Excel header synonym**: add it to the pattern arrays in `src/lib/ptz/excel-mapping.ts`.
- **Add an LLM mapping fallback**: call it from `parser.ts` only when `classifyHeaderPath` returns
  `confidence < threshold`, cache the result keyed by header path so repeat imports don't re-call it.

## 8. Deployment

See `DEPLOY.md` → "PTZ Analytics setup" for the environment variables, Node version requirement, and
one-time webhook registration (`npm run ptz:set-webhook`).
