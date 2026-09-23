// ValidationService — Data Quality rules for harvest records (spec §24).
// Parsers already emit source-level issues (bad dates/amounts in the
// statement, unknown shipment status…); matching-level warnings are added by
// calculation.ts. This file decides, per basket record, whether it may enter
// the Кунлик терим totals.
import type { DataIssue, HarvestRecord } from "./types.ts";
import type { InFileDuplicate } from "./repository.ts";

export type HarvestValidation = {
  issues: DataIssue[];
  /** Records that enter the daily totals: real positive weight, valid date, HAND/MACHINE. */
  counted: HarvestRecord[];
  validCount: number;
  criticalRecordCount: number;
  pendingCount: number;
};

export function validateHarvest(records: HarvestRecord[], inFileDuplicates: InFileDuplicate[] = []): HarvestValidation {
  const issues: DataIssue[] = [];
  const counted: HarvestRecord[] = [];
  let validCount = 0;
  let criticalRecordCount = 0;
  let pendingCount = 0;
  const namesByInn = new Map<string, Set<string>>();

  for (const r of records) {
    const ref = `${r.farmerName}${r.contractNumber ? ` / ${r.contractNumber}` : ""}`;
    const push = (severity: DataIssue["severity"], code: string, message: string) =>
      issues.push({ severity, code, source: "BASKET", row: r.sourceRow, ref, message });
    let critical = false;
    const crit = (code: string, message: string) => {
      push("CRITICAL", code, message);
      critical = true;
    };

    const weight = r.conditionedKg;
    // A registered truck that has not been weighed yet has no weight, no
    // harvest method and no ПК-17 — a normal pipeline state, not an error.
    const notYetWeighed = (weight == null || weight === 0) && !r.methodRaw && !r.pk17;

    if (!r.inn) crit("MISSING_INN", "Хўжалик ИННси йўқ.");
    if (!r.contractNumber) crit("MISSING_CONTRACT", "Шартнома рақами йўқ.");
    if (r.acceptanceDateInvalid) crit("INVALID_DATE", "Қабул санаси нотўғри (мавжуд бўлмаган сана).");
    else if (!r.acceptanceDate) crit("MISSING_DATE", "Қабул санаси йўқ.");

    if (notYetWeighed) {
      push("INFO", "PENDING_WEIGHING", "Ҳали тортилмаган (вазн, терим усули ва ПК-17 йўқ) — ҳисобга киритилмади.");
      pendingCount++;
    } else {
      if ((weight ?? 0) < 0 || (r.physicalKg ?? 0) < 0) crit("NEGATIVE_WEIGHT", `Манфий вазн: кондицион ${weight}, физик ${r.physicalKg}.`);
      else if ((weight == null || weight === 0) && !r.pk17) {
        // Weighing or the lab (moisture/impurity) result that produces the
        // conditioned weight is still in progress and no ПК-17 is signed yet —
        // a pipeline state, not bad data. With a signed ПК-17 it is an error.
        push(
          "WARNING",
          "CONDITIONED_WEIGHT_PENDING",
          (r.physicalKg ?? 0) > 0
            ? `Физик вазн ${r.physicalKg} кг, кондицион вазн ҳали йўқ (лаборатория) — ҳисобга киритилмади.`
            : "Тортиш тугалланмаган (физик/кондицион вазн йўқ, ПК-17 йўқ) — ҳисобга киритилмади."
        );
      } else if (weight == null || weight === 0) crit("INVALID_WEIGHT", "ПК-17 имзоланган, лекин кондицион вазн йўқ ёки 0.");
      if (r.method === "UNKNOWN") crit("UNKNOWN_HARVEST_TYPE", `Терим усули аниқланмади: "${r.methodRaw ?? ""}".`);
      if (r.amount == null) {
        if (r.pk17) crit("INVALID_AMOUNT", "ПК-17 бор, лекин сумма йўқ.");
        else push("WARNING", "AMOUNT_PENDING", "Сумма ҳали йўқ (ПК-17 имзоланмаган) — вазн ҳисобга олинди, сумма 0.");
      } else if (r.amount < 0n) crit("INVALID_AMOUNT", "Манфий сумма.");
    }

    if (r.inn) {
      const set = namesByInn.get(r.inn) ?? new Set<string>();
      set.add(r.farmerName);
      namesByInn.set(r.inn, set);
    }

    const awaitingLab = !critical && !notYetWeighed && (weight == null || weight === 0);
    if (critical) criticalRecordCount++;
    else if (awaitingLab) pendingCount++;
    else if (!notYetWeighed) validCount++;

    const countable =
      !notYetWeighed && r.acceptanceDate && !r.acceptanceDateInvalid && weight != null && weight > 0 && r.method !== "UNKNOWN";
    if (countable) counted.push(r);
  }

  for (const [inn, names] of namesByInn) {
    if (names.size > 1) {
      issues.push({ severity: "WARNING", code: "NAME_MISMATCH", source: "BASKET", ref: inn, message: `Битта ИНН турли номлар билан: ${[...names].join(" | ")}.` });
    }
  }
  for (const d of inFileDuplicates) {
    issues.push({ severity: "WARNING", code: "DUPLICATE", source: "BASKET", row: d.sourceRow, ref: d.naturalKey, message: "Файл ичида такрорланган қатор — иккинчи марта ҳисобланмади." });
  }

  return { issues, counted, validCount, criticalRecordCount, pendingCount };
}
