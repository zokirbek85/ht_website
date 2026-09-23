// Seeds data/ptz/farmer_directory.xlsx (ҳудуд blocks, display names, order)
// from a hand-maintained "Кунлик терим.xlsx" plus the matching basket export.
//
// The hand-made report has no INN and mostly Cyrillic personal names, so rows
// are linked to basket INNs deterministically, not by name: each report row's
// per-day (hand kg, machine kg) vector must equal exactly one basket farmer's
// vector. If the full range has manual edits, the longest leading run of days
// that still gives a unique match is used (confidence 0.95). Rows with no
// deliveries fall back to an exact normalized-name match, else stay INN-less
// for the business to fill in.
//
//   npm run ptz:seed-directory -- "<Кунлик терим.xlsx>" "<basket.xlsx>" [--out path] [--dry-run]
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseBasket } from "../src/lib/ptz/kunlik/parsers/basket.ts";
import { saveDirectory, directoryPath, type DirectoryEntry } from "../src/lib/ptz/kunlik/directory.ts";
import { readCell } from "../src/lib/ptz/kunlik/utils/excel.ts";
import { cleanText, normalizeFarmerName } from "../src/lib/ptz/kunlik/utils/text.ts";
import { parseNumber } from "../src/lib/ptz/kunlik/utils/numbers.ts";

const args = process.argv.slice(2);
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const [refPath, basketPath] = positional;
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1]! : directoryPath();
const dryRun = args.includes("--dry-run");
if (!refPath || !basketPath) {
  console.error('Usage: npm run ptz:seed-directory -- "<Кунлик терим.xlsx>" "<basket.xlsx>" [--out path] [--dry-run]');
  process.exit(1);
}

// ---- basket vectors ----------------------------------------------------------
const basket = await parseBasket(readFileSync(basketPath), basketPath, new Date());
const vec = new Map<string, Map<string, number>>(); // inn → "date|H" → kg
const basketName = new Map<string, string>();
for (const r of basket.records) {
  if (!r.inn || !r.acceptanceDate || !r.conditionedKg || r.method === "UNKNOWN") continue;
  basketName.set(r.inn, r.farmerName);
  const m = vec.get(r.inn) ?? new Map<string, number>();
  const key = `${r.acceptanceDate}|${r.method === "HAND" ? "H" : "M"}`;
  m.set(key, Math.round((m.get(key) ?? 0) + r.conditionedKg));
  vec.set(r.inn, m);
}
for (const r of basket.records) if (r.inn && !basketName.has(r.inn)) basketName.set(r.inn, r.farmerName);

// ---- reference report ----------------------------------------------------------
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(readFileSync(refPath) as unknown as ExcelJS.Buffer);
const ws = wb.worksheets[0]!;
const text = (r: number, c: number) => cleanText(readCell(ws.getRow(r).getCell(c)).value);
const num = (r: number, c: number) => parseNumber(readCell(ws.getRow(r).getCell(c)).value) ?? 0;

let headerRow = 0;
for (let r = 1; r <= 15 && !headerRow; r++) if (/фермер/i.test(text(r, 2)) && /режа/i.test(text(r, 3))) headerRow = r;
if (!headerRow) throw new Error("Header row (№ / Фермер хўжаликлар номи / Режа) not found in the reference report.");

// Day blocks: header cells like "11,09,26 й", each 6 columns (Кул, сумма, Машин, сумма, Жами, сумма).
const dayCols: { date: string; col: number }[] = [];
for (let c = 4; c <= ws.columnCount; c++) {
  const cell = ws.getRow(headerRow).getCell(c);
  if (cell.isMerged && cell.master.address !== cell.address) continue; // merged block echoes its label
  const m = /^(\d{2})[,.](\d{2})[,.](\d{2,4})/.exec(text(headerRow, c));
  if (m) dayCols.push({ date: `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`, col: c });
}
console.log(`Reference: header row ${headerRow}, ${dayCols.length} day blocks (${dayCols[0]?.date} … ${dayCols.at(-1)?.date})`);

type RefRow = { row: number; name: string; planT: number; section: string; hudud: string; vector: Map<string, number> };
const refRows: RefRow[] = [];
let section = "";
let hudud = "";
let firstSection = "";
for (let r = headerRow + 4; r <= ws.rowCount; r++) {
  const a = readCell(ws.getRow(r).getCell(1)).value;
  const name = text(r, 2);
  if (!name) continue;
  const lower = name.toLowerCase();
  if (/жами|хаммаси/.test(lower)) {
    if (/худуди жами|ҳудуди жами/.test(lower) && !/^ҳудуд жами/.test(lower)) section = ""; // end of the multi-ҳудуд section
    continue;
  }
  if (typeof a !== "number") {
    if (/ҳудуди$|худуди$/i.test(name)) {
      if (!section) {
        firstSection = firstSection || "Хазорасп ҳудуди";
        section = firstSection;
      }
      hudud = name;
    } else {
      section = name;
      hudud = name;
    }
    continue;
  }
  const vector = new Map<string, number>();
  for (const d of dayCols) {
    vector.set(`${d.date}|H`, Math.round(num(r, d.col) * 1000));
    vector.set(`${d.date}|M`, Math.round(num(r, d.col + 2) * 1000));
  }
  refRows.push({ row: r, name, planT: num(r, 3), section: section || hudud, hudud: hudud || section, vector });
}

function sameOnDays(ref: Map<string, number>, inn: string, days: string[]): boolean {
  const b = vec.get(inn)!;
  return days.every((d) => (ref.get(`${d}|H`) ?? 0) === (b.get(`${d}|H`) ?? 0) && (ref.get(`${d}|M`) ?? 0) === (b.get(`${d}|M`) ?? 0));
}

const used = new Set<string>();
const entries: DirectoryEntry[] = [];
const allDays = dayCols.map((d) => d.date);
let byVector = 0;
let byPrefix = 0;
let byName = 0;
let unlinked = 0;
for (const [i, ref] of refRows.entries()) {
  const delivered = [...ref.vector.values()].some((v) => v > 0);
  let inn: string | null = null;
  let method: string | null = null;
  let confidence: number | null = null;
  if (delivered) {
    for (let n = allDays.length; n >= 3 && !inn; n--) {
      const days = allDays.slice(0, n);
      const cands = [...vec.keys()].filter((k) => !used.has(k) && sameOnDays(ref.vector, k, days));
      if (cands.length === 1 && [...ref.vector.entries()].some(([k, v]) => v > 0 && days.includes(k.split("|")[0]!))) {
        inn = cands[0]!;
        method = n === allDays.length ? "VECTOR" : `VECTOR_${n}D`;
        confidence = n === allDays.length ? 1 : 0.95;
        if (n === allDays.length) byVector++;
        else byPrefix++;
      }
    }
  }
  if (!inn) {
    const norm = normalizeFarmerName(ref.name);
    const cands = [...basketName.entries()].filter(([k, n]) => !used.has(k) && normalizeFarmerName(n) === norm);
    if (cands.length === 1) {
      inn = cands[0]![0];
      method = "NAME";
      confidence = 0.8;
      byName++;
    }
  }
  if (inn) used.add(inn);
  else unlinked++;
  entries.push({
    order: i + 1,
    section: ref.section,
    hudud: ref.hudud,
    displayName: ref.name,
    inn,
    planT: ref.planT || null,
    basketName: inn ? (basketName.get(inn) ?? null) : null,
    matchMethod: method,
    confidence
  });
}

const notInReport = [...basketName.keys()].filter((k) => !used.has(k));
console.log(`Rows: ${refRows.length} · vector ${byVector} · vector-prefix ${byPrefix} · name ${byName} · unlinked ${unlinked}`);
console.log(`Basket farmers not in the reference report: ${notInReport.length}${notInReport.length ? ` → ${notInReport.map((k) => basketName.get(k)).join("; ")}` : ""}`);
const sections = [...new Set(entries.map((e) => `${e.section} › ${e.hudud}`))];
console.log(`Blocks: ${sections.join(" | ")}`);

if (dryRun) {
  console.log("--dry-run: nothing written.");
} else {
  await saveDirectory(entries, out);
  console.log(`Written: ${out}  — review the "ИНН" / "Боғланиш усули" columns, fill INNs for unlinked farmers when known.`);
}
