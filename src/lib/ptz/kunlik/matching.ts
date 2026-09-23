// Matching engine — links payments, shipments, RKP accounts and directory
// rows to farmers. Priority is fixed (INN → contract/deal → account →
// normalized name) and every lookup is a Map hit, so matching stays O(n)
// for 100k-row inputs; the name fallback is cached per distinct name.
// Name matches below MATCH_MIN_CONFIDENCE are never auto-accepted: they come
// back unmatched with the best candidate for manual review.
import { MATCH_CONFIDENCE, MATCH_MIN_CONFIDENCE, RKP_CLIENT_CODE_LENGTH } from "./config.ts";
import { nameSimilarity, normalizeFarmerName } from "./utils/text.ts";
import type { HarvestRecord, PaymentRecord } from "./types.ts";

export type MatchMethod = "INN" | "CONTRACT" | "ACCOUNT" | "NAME" | "NONE";

export type MatchResult = {
  inn: string | null;
  method: MatchMethod;
  confidence: number;
  /** Best rejected candidate when method is NONE — shown in Data Quality for manual review. */
  candidate?: { inn: string; name: string; confidence: number };
};

export type MatchQuery = {
  inn?: string | null;
  contract?: string | null;
  account?: string | null;
  name?: string | null;
};

export function rkpClientCode(account: string | null | undefined): string | null {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length > RKP_CLIENT_CODE_LENGTH ? digits.slice(-RKP_CLIENT_CODE_LENGTH) : null;
}

export class FarmerIndex {
  readonly names = new Map<string, string>(); // inn → basket name
  private readonly byContract = new Map<string, string>();
  private readonly byClientCode = new Map<string, string>();
  private readonly byNormName = new Map<string, Set<string>>();
  private readonly nameCache = new Map<string, MatchResult>();

  constructor(harvest: HarvestRecord[], payments: PaymentRecord[] = []) {
    for (const h of harvest) {
      if (!h.inn) continue;
      if (!this.names.has(h.inn)) this.names.set(h.inn, h.farmerName);
      if (h.contractNumber && !this.byContract.has(h.contractNumber)) this.byContract.set(h.contractNumber, h.inn);
      const norm = normalizeFarmerName(h.farmerName);
      if (norm) {
        const set = this.byNormName.get(norm) ?? new Set<string>();
        set.add(h.inn);
        this.byNormName.set(norm, set);
      }
    }
    // Learn account → farmer from statement legs that carry a known farmer INN,
    // so a later leg with only an account number can still be attributed.
    for (const p of payments) {
      const code = rkpClientCode(p.counterpartyAccount);
      if (code && p.counterpartyInn && this.names.has(p.counterpartyInn) && !this.byClientCode.has(code)) {
        this.byClientCode.set(code, p.counterpartyInn);
      }
    }
  }

  hasInn(inn: string | null | undefined): boolean {
    return !!inn && this.names.has(inn);
  }

  innForContract(contract: string | null | undefined): string | null {
    return contract ? (this.byContract.get(contract) ?? null) : null;
  }

  match(q: MatchQuery): MatchResult {
    if (q.inn && this.names.has(q.inn)) return { inn: q.inn, method: "INN", confidence: MATCH_CONFIDENCE.INN };
    const byContract = this.innForContract(q.contract);
    if (byContract) return { inn: byContract, method: "CONTRACT", confidence: MATCH_CONFIDENCE.CONTRACT };
    const code = rkpClientCode(q.account);
    const byAccount = code ? this.byClientCode.get(code) : undefined;
    if (byAccount) return { inn: byAccount, method: "ACCOUNT", confidence: MATCH_CONFIDENCE.ACCOUNT };
    if (q.name) return this.matchName(q.name);
    return { inn: null, method: "NONE", confidence: 0 };
  }

  matchName(name: string): MatchResult {
    const norm = normalizeFarmerName(name);
    if (!norm) return { inn: null, method: "NONE", confidence: 0 };
    const cached = this.nameCache.get(norm);
    if (cached) return cached;

    let result: MatchResult;
    const exact = this.byNormName.get(norm);
    if (exact && exact.size === 1) {
      result = { inn: [...exact][0]!, method: "NAME", confidence: MATCH_CONFIDENCE.NAME_STRONG };
    } else {
      let best: { inn: string; name: string; confidence: number } | undefined;
      for (const [candNorm, inns] of this.byNormName) {
        if (inns.size !== 1) continue;
        const confidence = MATCH_CONFIDENCE.NAME_STRONG * nameSimilarity(norm, candNorm);
        if (!best || confidence > best.confidence) {
          const inn = [...inns][0]!;
          best = { inn, name: this.names.get(inn) ?? candNorm, confidence };
        }
      }
      result =
        best && best.confidence >= MATCH_MIN_CONFIDENCE
          ? { inn: best.inn, method: "NAME", confidence: best.confidence }
          : { inn: null, method: "NONE", confidence: 0, ...(best ? { candidate: { ...best, confidence: Math.round(best.confidence * 100) / 100 } } : {}) };
    }
    this.nameCache.set(norm, result);
    return result;
  }
}

/**
 * RKP accounts belong to the statement owner or to a farmer. Owner accounts
 * are recognized by client code (learned from the statement's own legs and
 * its "Лиц.счет клиента"); farmer accounts through the FarmerIndex.
 */
export function buildOwnerClientCodes(payments: PaymentRecord[]): Map<string, string> {
  const codes = new Map<string, string>();
  for (const p of payments) {
    if (!p.clientInn) continue;
    const own = [p.statementAccount, p.isCompanySide ? p.counterpartyAccount : null];
    for (const acc of own) {
      const code = rkpClientCode(acc);
      if (code) codes.set(code, p.clientInn);
    }
  }
  return codes;
}
