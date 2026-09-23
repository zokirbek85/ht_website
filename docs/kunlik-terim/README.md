# Кунлик терим — runbook

The PTZ Telegram bot takes four Excel exports and returns **Кунлик_терим_YYYY-MM-DD.xlsx** and
**.pdf**. Background: [AUDIT.md](AUDIT.md) · [DATA_PROFILE.md](DATA_PROFILE.md) · [DATA_MODEL.md](DATA_MODEL.md).

## Architecture

```
Telegram webhook ─► bot.ts (handlers only) ─► session.ts (per-user, <tmp>/harvest/<session_id>/)
                                               │
CLI / future scheduler (refresh.ts) ───────────┼─► service.processBatch()
                                               ▼
   classifier ─► parsers/{basket,payments,accounts,shipments} ─► repository (SQLite, upsert/dedup)
                                               ▼
   validation ─► matching (INN → deal → account → name) ─► calculation (one KunlikReport)
                                               ▼
                         exporters/excel.ts  +  exporters/pdf.ts ─► Telegram
```

| Spec layout (Python) | Here (TypeScript, `src/lib/ptz/kunlik/`) |
|---|---|
| `handlers/*.py` | `../bot.ts` |
| `services/*_parser.py` | `parsers/basket.ts` (wraps the existing `../parser.ts`), `payments.ts`, `accounts.ts`, `shipments.ts` |
| `normalization_service.py`, `utils/*` | `utils/text.ts`, `numbers.ts`, `dates.ts`, `excel.ts`, `hashing.ts` |
| `matching_service.py` | `matching.ts` |
| `validation_service.py` | `validation.ts` |
| `calculation_service.py` + harvest/payment/shipment | `calculation.ts` |
| `report_service.py` | `service.ts` |
| `exporters/` | `exporters/excel.ts`, `exporters/pdf.ts` |
| `models/`, `repositories/` | `types.ts`, `repository.ts` |
| `config/` | `config.ts` |

## Run

```bash
npm ci                                   # Node ≥ 22.5 (node:sqlite)
npm test                                 # 61 tests; the real-data test is skipped unless KT_REAL_DIR is set
KT_REAL_DIR=/path/to/exports npm test    # also run the real-data regression test

# One-time: seed the ҳудуд directory from the hand-made report + a basket export.
# Writes data/ptz/farmer_directory.xlsx. Review it and fill INNs for farmers marked unlinked.
npm run ptz:seed-directory -- "/path/Кунлик терим.xlsx" "/path/basket_….xlsx"

# Generate a report from files on disk (same pipeline as the bot):
npm run ptz:kunlik -- basket_….xlsx "Историческая_выписка_….xlsx" "Мои_лицевые_счета_….xlsx" Shipments….xlsx --out ./out

npm run build && npm start               # the bot runs inside the site; webhook: npm run ptz:set-webhook
```

## Telegram

Send the four files in any order. Type detection is by filename, then by content; if both fail, the bot
asks with buttons. When all four have arrived, the bot shows a progress screen, then the summary plus
Excel and PDF. If one file is bad, only that file is requested again.

Commands: `/start` (new session), `/help`, `/report`, `/today`, `/farmers`, `/payments`, `/shipments`,
`/status`, `/cancel`, `/settings` (admin; `/settings refresh 30|60`).

## Configuration

| Env / setting | Default | Meaning |
|---|---|---|
| `PTZ_BOT_TOKEN`, `PTZ_BOT_WEBHOOK_SECRET`, `PTZ_ADMIN_TELEGRAM_IDS` | — | unchanged, see DEPLOY.md |
| `PTZ_DATA_DIR` | `data/ptz` | SQLite DB + `farmer_directory.xlsx` |
| `PTZ_DIRECTORY_PATH` | `$PTZ_DATA_DIR/farmer_directory.xlsx` | ҳудуд directory |
| `PTZ_TMP_DIR` | `$TMPDIR/harvest` | per-session upload dirs, deleted after processing |
| `PTZ_REFRESH_INTERVAL_MINUTES` / setting `refresh_interval_minutes` | 60 | 30 or 60, for the scheduler |
| `config.ts` | — | 20 % share, counted shipment statuses, match thresholds |

## Automatic refresh (next step)

`refresh.ts` defines `SourceProvider.fetchLatest()` and `runScheduledRefresh()`. Once the exports can be
downloaded automatically, implement a provider and call it from a systemd timer (or a BullMQ/Redis worker)
every `refresh_interval_minutes`. Parsing, storage and calculation need no change.

## Limits

- ExcelJS loads whole workbooks: 100 000 basket rows took 6.8 s but about 2.3 GB RSS in a benchmark.
  Current exports are about 1 200 rows. Before files grow past about 30 000 rows on the VPS, switch the
  flat parsers to ExcelJS's streaming reader.
- SQLite assumes the single `next start` process (as the rest of PTZ does).
