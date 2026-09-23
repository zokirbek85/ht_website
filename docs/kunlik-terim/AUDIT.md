# AUDIT — mavjud PTZ bot va "Кунлик терим" hisoboti

Sana: 2026-09-23 · Holat: PHASE 1 (faqat o'qildi, kod o'zgartirilmadi)
Baseline: `npm test` → 31 test, 31 passed, 0 failed.

## 1. Current architecture

Bot alohida Python loyiha **emas**. U `hazorasp-textil.uz` Next.js 16 (TypeScript) saytining ichidagi
"PTZ Analytics" moduli:

| Qatlam | Fayl | Vazifa |
|---|---|---|
| Transport | `src/app/api/ptz-bot/webhook/route.ts` | Telegram webhook, secret-token tekshiruvi, darhol `200`, fon rejimida ishlov |
| Bot | `src/lib/ptz/bot.ts` | Avtorizatsiya, komandalar, hujjat qabul qilish |
| Telegram API | `src/lib/ptz/telegram.ts` | `sendMessage`, `sendDocument`, `downloadTelegramFile` (framework yo'q, `fetch`) |
| Parser | `src/lib/ptz/parser.ts`, `excel-mapping.ts`, `normalize.ts` | Faqat **basket** faylini o'qiydi (ExcelJS) |
| Import | `src/lib/ptz/importer.ts`, `identity.ts`, `validation.ts` | SHA-256 dedup, snapshot almashtirish, validatsiya |
| DB | `src/lib/ptz/db.ts` | SQLite (`node:sqlite`, Node ≥ 22.5), `data/ptz/ptz.sqlite` |
| Hisob | `src/lib/ptz/analytics.ts` | `CottonAcceptanceAnalytics` — shartnoma bajarilishi, fermerlar, sifat, moliya |
| Eksport | `src/lib/ptz/reports/xlsx.ts`, `reports/pdf.ts`, `reportBundle.ts` | 10 varaqli XLSX, 10 bo'limli PDF (PDFKit, PT Sans) |
| Web | `src/app/ptz/report/[token]/`, `src/components/ptz/Dashboard.tsx` | Parolli vaqtinchalik dashboard |
| Admin | `src/app/admin/ptz/` | Import tarixi, foydalanuvchilar, ogohlantirishlar |

Deploy: bitta `next start` jarayoni (systemd + nginx), GitHub Actions `git reset --hard` → `npm ci` →
`build` → restart (`DEPLOY.md`). Python runtime VPSda ishlatilmaydi.

## 2. Current data flow

```
Telegram (1 ta .xlsx) → webhook → bot.handleDocument → importer.importExcelReport
  → sha256 dedup → parser.parseWorkbook (basket) → validation → SQLite (imports/operations)
  → reportBundle → PDF + XLSX + web link → Telegram
```

Har bir yangi basket fayl **butun snapshotni almashtiradi** (`is_active` import bo'yicha).

## 3. Current Excel sources

Faqat bitta: `basket_*.xlsx`. Историческая выписка, Мои лицевые счета, Shipments — **umuman o'qilmaydi**.

## 4. Current columns

`excel-mapping.ts` → `COLUMN_DEFS`: 47 ta ustun, 5+6-qator sarlavhasi bo'yicha aniq matn (normalize
qilingan) mapping. ПК-17 ichki ustunlari pozitsiya bo'yicha. Muhim: `pickingMethod` (Терим услуби),
`acceptanceDate` (Кабул қилиш › Санаси), `conditionedKg` (Кондицион вазни), `amount` (Суммаси),
`contractNumber`, `contractQty`, `farmerInn`.

## 5. Current calculations

- Hisobot vazni: `REPORTING_WEIGHT_FIELD = "conditionedKg"` (mijoz tasdiqlagan, `config.ts`).
- `contractQty` birligi: tonna (`CONTRACT_QTY_TO_KG = 1000`) — hujjatda "tasdiqlanmagan" deb yozilgan.
  **Bu audit uni tasdiqladi**: Shipments `Кол-во сделки` (kg) = basket `Шартнома миқдори` × 1000, 66/66 bitim.
- O'rtacha narx = `SUM(amount) / SUM(conditionedKg)`.
- Dublikat: `pk17:<raqam>` yoki kompozit hash.
- **Terim usuli (qo'l/mashina) bo'yicha hisob YO'Q** — `pickingMethod` faqat taqsimot sifatida ko'rsatiladi.
- **Kunlik (sana × terim usuli) jadval YO'Q.**
- **To'lov, 20%, qoldiq, ҳудуд hisoblari YO'Q.**

## 6. Current business rules ("Кунлик терим" uchun)

Mavjud kodda `Кунлик терим` **yaratilmaydi**. Yagona manba — qo'lda yuritilgan
`Кунлик терим.xlsx` (varaq `Факт (2)`) va `Кунлик терим (2).xlsx` (varaq `Факт (3)`). Real fayllar
bilan qayta hisoblab tekshirildi (DATA_PROFILE.md §6):

| Qoida | Manba | Tekshiruv |
|---|---|---|
| Kunlik vazn = `SUM(Кондицион вазни) / 1000` (tonna) | basket | 11–19.09 barcha kunlar aniq mos |
| Sana = `Кабул қилиш › Санаси` | basket | yuqoridagi bilan birga tasdiqlandi |
| Qo'l/Mashina = `Терим услуби` (`1-Qo\`l terimi` / `Mashina terimi`) | basket | aniq mos |
| "100 % суммаси" = `SUM(Суммаси) / 1000` (ming so'm) | basket | MARIYA 13.09: 31 408 690 → 31 408.69 |
| `Жами = Кул + Машин` (kg va summa) | formula | `=+D10+F10` |
| `20 % суммаси = 100 % × 20%` | formula | `=+H10*20%` |
| "Терим учун утказилган маблаг — Жами" = fermerning bank ko'chirmasidagi **net** debeti (to'lov − qaytarish) | выписка | Jami 2 549 570 810.32 so'm aniq mos; fermer bo'yicha ham mos |
| "Бир кунда" = ko'chirmadagi oxirgi kun net to'lovi | выписка | 538 981 611.36 aniq mos |
| `Терим пули учун колдик = 20 % − Жами утказилган` | formula | `=+I10-K10` |
| Режа = `Шартнома миқдори` (tonna) | basket | MARIYA 64.351 = Shipments 64 351 kg |
| Qator guruhlash: ҳудуд bloklari + "Ҳудуд жами", "Хазорасп худуди жами", "Кластер", "Шартнома килмаганлар", "Хаммаси" | faqat qo'lda | **BUSINESS_RULE_REQUIRED** (§11) |

20.09–22.09 uchun qo'lda hisobotda bir nechta qator boshqa kun/usulga o'tkazilgan (3 kunlik jami
2 026.67 t ikkala tomonda ham bir xil). Yangi tizim basketdagi qiymatni ishlatadi; qo'lda tuzatishlar
qayta tiklanmaydi.

## 7. Current Telegram workflow

Avtorizatsiya `telegram_users` jadvali (+ `PTZ_ADMIN_TELEGRAM_IDS` bootstrap). Bitta fayl → darhol
ishlov → PDF + XLSX + parolli web link. Komandalar: `/start /help /report /today /history /dashboard
/reprocess /settings`. Sessiya/holat mashinasi yo'q; ko'p faylli oqim yo'q.

## 8. Current report structure

- XLSX: `01_Summary … 10_Data_Dictionary` (analitik, "Пахта қабули"), qiymatlar ExcelJS orqali yoziladi —
  formulalar yo'q, `#REF!` xavfi yo'q.
- PDF: 10 bo'lim, A4 landscape, Uzbek kirill.
- Qo'lda yuritiladigan `Кунлик терим.xlsx` — formulalar bilan; `(2)` versiyasida 28+ qatorda
  `=+#REF!+#REF!…` (varaqlar o'chirilgani uchun).

## 9. Current database

SQLite, `SCHEMA_VERSION 2.0.0`: `imports, farmers (INN unique), contracts (contract_number unique),
buyers, clusters, preparation_points, operations, import_warnings, telegram_users, audit_log,
temp_access(_log), settings`. To'lov, hisobvaraq, shipment, batch, sessiya jadvallari yo'q.

## 10. Current dependencies

Node 25 (lokal) / ≥ 22.5 talab; `exceljs 4.4`, `pdfkit 0.20`, `next 16.2`, `zod`. Testlar:
`node --test` + `--experimental-strip-types`. Python kutubxonalari yo'q.

## 11. Known bugs / risklar

1. **Basket formati o'zgargan.** Real `basket (6)`da yangi ustunlar bor: `Хисоб фактура раками`,
   `Хисоб фактура имзолаш холати (Фермер/Кластер)`, `Манзилгача масофа, км`; eski `Кластер` ustuni
   yo'q. Parser ularni `COLUMN_NOT_MAPPED` (INFO) deb o'tkazib yuboradi — yiqilmaydi, lekin
   `clusterName` endi har doim `null`.
2. `normNumber("1 234,56")` → to'g'ri, lekin `"1.234,56"` → `1.234` (minglik nuqta qo'llanmaydi).
3. Pul `float` (REAL) sifatida saqlanadi va yig'iladi — spetsifikatsiya `Decimal` talab qiladi.
4. `summary().todayAcceptedKg` "bugun"ni server soatiga emas, `REPORT_TIMEZONE`ga bog'laydi — to'g'ri;
   lekin basket ertalab yuklansa "bugun" = 0 bo'ladi (hisobot sanasi = fayl sanasi emas).
5. Shipments `Номер контракта` — barcha qatorlarda `119020` (xaridorning birja kliring shartnomasi).
   Fermer shartnomasi kaliti — `Номер сделки` (= basket `Шартнома раками` = to'lov `D:` atributi).
   Spetsifikatsiyadagi "Shipments.Номер контракта = Basket contract" **noto'g'ri** — shunday
   ulansa hamma shipment bitta shartnomaga tushadi.
6. Shipments `Стоимость доставки` aslida yuk qiymati (`Кол-во отгрузки × narx`, 96/109 qatorda
   `× 7862`), yetkazib berish narxi emas. Nomi bo'yicha talqin qilinmasin.
7. Выписка har bir to'lovni 2 qator bilan beradi (kompaniya bloklashi + fermerga o'tkazma) va
   37 juft "Возврат ошибочно проведённой транзакции". Faqat fermer qatorlarini (INN ≠ 300074865)
   `Дебет − Кредит` bilan olish to'g'ri natija beradi; kompaniya qatorlarini qo'shish ikki marta hisoblaydi.
8. Qo'lda hisobotdagi fermer nomlari ko'pincha kirillcha shaxs ismi ("Абдували Аллаёр"), basketda esa
   lotin yuridik nomi ("ABDUVALI OLLAYOROV FX"); INN yo'q. 129 qatordan faqat 4 tasi nomi aynan mos.

## 12. Recommended migration plan

1. **Runtime**: yangi tizimni mavjud TypeScript modul ichida quramiz (Python emas) — deploy, SQLite,
   avtorizatsiya, testlar saqlanadi, VPSga ikkinchi jarayon qo'shilmaydi. Spetsifikatsiyadagi
   `bot/services/*.py` tuzilmasi `src/lib/ptz/kunlik/*` TS modullariga 1:1 mos keltiriladi.
   Pul — `bigint` tiyin (Decimal ekvivalenti, float yo'q).
2. Yangi jadvallar qo'shiladi (migration, eski jadvallar tegilmaydi): `import_batches, import_files,
   harvest_records, payments, rkp_accounts, shipments, upload_sessions, processing_log, farmer_directory`.
3. Mavjud `parser.ts` basket uchun qayta ishlatiladi (dublikat parser yozilmaydi); yangi 3 parser qo'shiladi.
4. Bot: 4 faylli sessiya oqimi; eski "Пахта қабули" paketi alohida komandada saqlanadi.
5. ҳудуд bloklari uchun `farmer_directory` (INN → ҳудуд, ko'rsatiladigan nom, tartib) — qo'lda
   hisobotdan deterministik ravishda (kunlik vazn vektori + to'lov summasi tengligi) to'ldiriladi,
   foydalanuvchi tasdiqlaydi.
