// Runs the Кунлик терим pipeline from files on disk — same service the
// Telegram bot uses. For manual runs, real-data checks, and as the entry
// point a cron/systemd timer can call every 30/60 minutes once source files
// are downloaded automatically.
//
//   npm run ptz:kunlik -- <file.xlsx> [<file.xlsx> …] [--out <dir>]
//
// File types are detected like in the bot (filename, then content).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyFile, SOURCE_LABELS } from "../src/lib/ptz/kunlik/classifier.ts";
import { processBatch, type InputFile } from "../src/lib/ptz/kunlik/service.ts";
import { UserFacingError } from "../src/lib/ptz/kunlik/types.ts";
import { formatNumber, formatSum } from "../src/lib/ptz/kunlik/utils/numbers.ts";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1]! : process.cwd();
const paths = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (paths.length === 0) {
  console.error("Usage: npm run ptz:kunlik -- <file.xlsx> [...] [--out <dir>]");
  process.exit(1);
}

const files: InputFile[] = [];
for (const p of paths) {
  const buffer = readFileSync(p);
  const cls = await classifyFile(path.basename(p), buffer);
  if (!cls) {
    console.error(`❓ Cannot determine the file type of ${p}`);
    process.exit(2);
  }
  console.log(`✓ ${SOURCE_LABELS[cls.type].padEnd(24)} ← ${path.basename(p)} (by ${cls.by})`);
  files.push({ type: cls.type, filename: path.basename(p), buffer });
}

try {
  const t0 = performance.now();
  const out = await processBatch(files, { trigger: "cli", userId: "cli" });
  mkdirSync(outDir, { recursive: true });
  const xlsx = path.join(outDir, `${out.baseName}.xlsx`);
  const pdf = path.join(outDir, `${out.baseName}.pdf`);
  writeFileSync(xlsx, out.excel);
  writeFileSync(pdf, out.pdf);
  const k = out.report.kpi;
  const t = (kg: number) => `${formatNumber(kg, 0)} kg`;
  console.log(
    [
      "",
      "REAL DATA TEST",
      "----------------",
      ...out.files.map((f) => `${SOURCE_LABELS[f.type]} rows: ${f.rows}  (inserted ${f.inserted}, updated ${f.updated}, duplicates ${f.duplicates}, errors ${f.errors}, warnings ${f.warnings})`),
      "",
      `Report date: ${out.report.reportDate}   generated: ${out.report.generatedAt}`,
      `Farmers (with harvest): ${k.farmersWithHarvest}   Contracts: ${k.contracts}`,
      "",
      "Harvest (today):",
      `  Hand: ${t(k.todayHandKg)}   Machine: ${t(k.todayMachineKg)}   Total: ${t(k.todayTotalKg)}`,
      "Harvest (season):",
      `  Hand: ${t(k.seasonHandKg)}   Machine: ${t(k.seasonMachineKg)}   Total: ${t(k.seasonTotalKg)}`,
      "",
      "Payments:",
      `  Today: ${formatSum(k.paidToday)}   Total: ${formatSum(k.paidTotal)}   Picking-money balance: ${formatSum(k.pickingBalance)}`,
      `  RKP free balance: ${formatSum(k.rkpFreeBalance)}`,
      "",
      "Shipments:",
      `  Deals: ${k.shipmentDeals}   Quantity: ${t(k.shippedKg)}   Amount: ${formatSum(k.shippedValue)}`,
      "",
      "Data Quality:",
      `  Critical: ${out.dq.critical}   Warning: ${out.dq.warning}   Info: ${out.dq.info}   Valid: ${out.dq.valid}   Pending weighing: ${out.dq.pending}`,
      "",
      `PROCESSING TIME: ${((performance.now() - t0) / 1000).toFixed(2)} s`,
      `Output: ${xlsx}`,
      `        ${pdf}`
    ].join("\n")
  );
} catch (err) {
  if (err instanceof UserFacingError) {
    console.error(`❌ ${err.message}\n${err.details.map((d) => `   • ${d}`).join("\n")}`);
    process.exit(3);
  }
  throw err;
}
