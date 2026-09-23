# DATA PROFILE — 4 ta real kirish fayli (+ qo'lda yuritilgan hisobot)

Sana: 2026-09-23. Fayllar `~/Downloads`dan o'qildi, repoga qo'shilmagan. INN'lar niqoblangan.

| # | Fayl | Varaq | Qatorlar (ma'lumot) | Ustunlar | Merge |
|---|---|---|---|---|---|
| 1 | `basket_HAZORASP-TEXTIL MAS'ULIYATI CHEKLANGAN JAMIYAT (6).xlsx` | `Sheet1` | 1 204 (+ "ЖАМИ:" qatori) | 51 | 2 qatorli sarlavha (5–6) |
| 2 | `300074865_Историческая_выписка_260923140841.xlsx` | `Лист1` | 366 (+ "Итого:") | 11 | 12 (sarlavha bloki 1–7) |
| 3 | `Мои_лицевые_счета_в_ркп_260923140827.xlsx` | `Лист1` | 6 | 6 | 0 |
| 4 | `Shipments23_09_2026 09_11_57-….xlsx` | `Shipments` | 109 | 17 | 0 |
| 4b | `Shipments23_09_2026 09_10_47-….xlsx` | `Shipments` | 350 | 17 | 0 (bir xil sarlavha, kengroq tanlov) |
| R | `Telegram Lite/Кунлик терим.xlsx` | `Факт (2)` | 129 fermer qatori | 84 | ko'p (sana bloklari) |

## 1. Basket

- Sarlavha: 1-qator banner (`… бўйича 23 September 14:09 кунига саватда …`), 5–6-qatorlar sarlavha,
  7-qatordan ma'lumot, oxirgi qator `ЖАМИ:` (A ustunida) — `Физик` 6 002 851, `Кондицион` 5 505 295.
- Kalit ustunlar (bo'sh qiymatlar soni): `Хўжалик номи` 0, `ИННси` 0, `Шартнома раками` 0,
  `Шартнома миқдори` 0, `Кабул санаси` 0, `ПК-17 раками` 45, `Хисоб фактура раками` 584,
  `Терим услуби` **5**, `Харид баҳоси` 32, `Суммаси` 45.
- `Терим услуби`: `1-Qo\`l terimi` 891, `Mashina terimi` 308, bo'sh 5 (tortilmagan, vazni 0 qatorlar).
- `Шартнома тури`: `Fyuchers` 1 160, `Forvard` 31, `Vaqtincha saqlash` 13.
- `Вилояти/Тумани`: hammasi `Xorazm viloyati / Xazorasp tumani` → **ҳудуд (Янгибозор, Карвак…) basketda yo'q.**
- Kabul sanalari: 11.09–23.09.2026 (13 kun).
- Noyob: 81 INN = 81 nom (INN↔nom 1:1), 87 shartnoma. 3 fermerda >1 shartnoma (bittasida 5 ta).
- Dublikatlar: ПК-17 takrori 0, `Кайд раками` takrori 0.
- Narxlar: 7862 (962), 6289.6 (112), 7374.556 (50), bo'sh (32), `7862.000000000001` (25 — float
  shovqini), 0 (13).
- `Суммаси` matn sifatida saqlangan (`'32155580.0'`) — raqamga parse qilinishi kerak.
- Yangi ustunlar (parser bilmaydi): `Хисоб фактура раками`, `Хисоб фактура имзолаш холати`,
  `Манзилгача масофа, км`.

## 2. Историческая выписка

- 1–7 qatorlar: meta (`Лиц.счет клиента`, davr 01.09–23.09.2026, mijoz, INN, bank, МФО).
- 8-qator sarlavha: `№, ID транзакции, Атрибуты, Дата транзакции, Наим. контрагента, ИНН контрагента,
  Л/с контрагента, Наим.л/с, Дебет, Кредит, Детали`. Oxirgi qator `Итого:` (H ustunida).
- `Дата транзакции` — haqiqiy Excel datetime; 18.09 16:48 — 23.09 12:54.
- `ID транзакции` 366/366 noyob → **to'lov fingerprinti uchun tabiiy kalit**.
- `Атрибуты`: `C:119020; D:<bitim>;` — D = basket `Шартнома раками` (66/66 mos).
- Tuzilma: har to'lov = kompaniya qatori (INN 300074865, `Свободные средства`, kredit) + fermer qatori
  (`Денежные средства клиента в пути`, debet). 146 bloklash, 146 to'lov, 37+37 qaytarish.
- `Детали` turlari: `За Хлопок сырец (фьючерс-80%[-N]), сд.№…, согл. с/ф.№… от …, кол-во: …, сумма: …`
  va `Возврат ошибочно проведённой транзакции …`.
- Fermerlar: 65 INN, hammasi basketda bor. Net (debet − kredit) jami: **2 549 570 810.32 so'm**.
  Kunlar bo'yicha: 18.09 — 219 815 230.40; 22.09 — 1 790 773 968.56; 23.09 — 538 981 611.36.

## 3. Мои лицевые счета в РКП

Sarlavha: `№, Счет РКП, Наим. л/с, Л/с, Баланс, По умолчанию счет`. 2 ta bank hisobi × 3 turdagi
shaxsiy hisob (`Свободные средства`, `Блокированные средства`, `Денежные средства клиента в пути`).
Bu **kompaniyaning o'z** hisoblari — fermer yoki INN ustuni yo'q. Balanslar: 38 800 052.90;
1 334 919 666.84; 158 205 617.65; qolganlari 0.

## 4. Shipments

- Sarlavha spetsifikatsiyadagi 17 ustun bilan aynan mos.
- `Номер контракта`: barcha 109 qatorda `119020` (birja kliring shartnomasi, fermerga xos emas).
- `Номер сделки`: 66 noyob, 66/66 basket `Шартнома раками`da bor.
- `Кол-во сделки` (kg) = basket `Шартнома миқдори` × 1000 — 66/66 mos (tonna birligi tasdiqlandi).
- `Стоимость доставки` = `Кол-во отгрузки × 7862` 96/109 qatorda (qolgani boshqa narx) → bu yuk qiymati.
- `Статус`: `Approved` 109/109; `Ед. изм`: `килограмм`; `Товар`: `Хлопок сырец (фьючерс)`.
- `Номер документа`: `HF-1`, `HF-2`, `11`, `15`… (fermerning hisob-faktura raqami, to'lov
  `согл. с/ф.№`ga mos). `Дата документа` 13.09–21.09.
- Kompozit kalit (`сделка+документ+дата+кол-во`) bo'yicha dublikat 0.
- Sanalar matn (`'19.01.2026'`), raqamlar haqiqiy son. Ikkala eksport (109 va 350 qator) bir
  tizimdan, turli filtr bilan.

## 5. Qo'lda yuritilgan `Кунлик терим.xlsx`

- Sarlavha: `№, Фермер хўжаликлар номи, Режа`, keyin har kun uchun 6 ustun
  (`Кул терим, 100 % суммаси, Машин терим, 100 % суммаси, Жами Кг, Жами 100 % суммаси`),
  so'ng `Хаммаси` (+ `20 % суммаси`), `Терим учун утказилган маблаг (Бир кунда, Жами)`,
  `Терим пули учун колдик`.
- Birliklar: vazn **tonna** (3 kasr), summa **ming so'm**.
- Guruhlar: Янгибозор, Карвак, Овшар, Мухомон, Бешта, Бўстон, Саноат, Пичоқчи ҳудудлари
  (har biri "Ҳудуд жами") → "Хазорасп худуди жами" → "Кластер" → "Жами" → "Шартнома килмаганлар"
  (28 qator) → "Хаммаси".
- `(2)` versiyasi: 28+ qator va jami qatorlarida `#REF!`.

## 6. Qayta hisoblash (reconciliation)

Basket → `SUM(Кондицион)/1000` sana × terim usuli bo'yicha, qo'lda hisobot `Хаммаси` qatori bilan:

| Sana | Qo'l (basket / hisobot) | Mashina (basket / hisobot) |
|---|---|---|
| 11.09 | 67.117 / 67.117 | 0 / 0 |
| 15.09 | 229.203 / 229.203 | 193.330 / 193.330 |
| 18.09 | 294.443 / 294.443 | 292.597 / 292.597 |
| 19.09 | 582.557 / 582.557 | 88.840 / 88.840 |
| 20.09 | 535.001 / 535.001 | 122.044 / 117.317 |
| 21.09 | 528.395 / 518.635 | 148.299 / 153.026 |
| 22.09 | 550.719 / 560.479 | 142.212 / 142.212 |

11–19.09: to'liq mos. 20–22.09: 3 kunlik jami bir xil (2 026.67 t), ichida qo'lda ko'chirishlar bor.

To'lovlar: ko'chirma bo'yicha fermer net debeti = hisobotdagi `Терим учун утказилган маблаг — Жами`
(jami va fermerma-fermer, masalan 88 214.7848 ming so'm). `Бир кунда` = oxirgi kun (23.09) net summasi.

## 7. Fayl turini aniqlash signallari

| Tur | Fayl nomi | Ichki belgi |
|---|---|---|
| BASKET | `basket` | banner `саватда пахта`, sarlavha `Хўжалик ИННси` + `Терим услуби` |
| PAYMENTS | `Историческая_выписка` / `выписка` | A1 `Историческая выписка`, sarlavha `ID транзакции` |
| ACCOUNTS | `лицевые_счета` | sarlavha `Счет РКП` + `Баланс` |
| SHIPMENTS | `Shipments` | varaq `Shipments`, sarlavha `Номер сделки` + `Кол-во отгрузки` |

Eslatma: fayl nomlarida bo'sh joy o'rniga `_` ishlatiladi (`Историческая_выписка`), klassifikator
ikkalasini ham qabul qilishi kerak.
