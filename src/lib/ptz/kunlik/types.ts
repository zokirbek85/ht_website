// Normalized data model for the Кунлик терим pipeline (see docs/kunlik-terim/DATA_MODEL.md).
import type { HarvestMethod } from "./utils/text.ts";
import type { IsoDate, IsoDateTime } from "./utils/dates.ts";

export type SourceType = "BASKET" | "PAYMENTS" | "ACCOUNTS" | "SHIPMENTS";
export const SOURCE_TYPES: readonly SourceType[] = ["BASKET", "PAYMENTS", "ACCOUNTS", "SHIPMENTS"];

export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export type DataIssue = {
  severity: IssueSeverity;
  code: string;
  source: SourceType | "MATCHING" | "REPORT";
  row?: number;
  ref?: string; // farmer / contract / tx id — what the user searches for in the source file
  message: string;
};

export type HarvestRecord = {
  naturalKey: string;
  fingerprint: string;
  sourceRow: number;
  inn: string | null;
  farmerName: string;
  region: string | null;
  district: string | null;
  contractType: string | null;
  contractNumber: string | null;
  contractQtyT: number | null;
  acceptanceDate: IsoDate | null;
  /** The source cell had a value that is not a real calendar date (e.g. 31.02.2026). */
  acceptanceDateInvalid: boolean;
  recordNo: string | null;
  pk17: string | null;
  method: HarvestMethod;
  methodRaw: string | null;
  physicalKg: number | null;
  conditionedKg: number | null;
  amount: bigint | null; // tiyin
  unitPrice: number | null;
};

export type PaymentRecord = {
  naturalKey: string;
  fingerprint: string;
  sourceRow: number;
  txId: string | null;
  opDateTime: IsoDateTime | null;
  opDate: IsoDate | null;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyAccount: string | null;
  accountName: string | null;
  debit: bigint; // tiyin
  credit: bigint; // tiyin
  details: string | null;
  dealNumber: string | null;
  clearingContract: string | null;
  invoiceNo: string | null;
  isReversal: boolean;
  /** Row belongs to the statement owner itself (block/unblock legs), not a payee. */
  isCompanySide: boolean;
  statementAccount: string | null;
  clientInn: string | null;
};

export type RkpAccountCategory = "FREE" | "BLOCKED" | "IN_TRANSIT" | "OTHER";

export type RkpAccountRecord = {
  sourceRow: number;
  bankAccount: string | null;
  currency: string | null;
  accountName: string | null;
  category: RkpAccountCategory;
  account: string | null;
  balance: bigint; // tiyin
  isDefault: boolean | null;
  holderInn: string | null;
  holderName: string | null;
};

export type ShipmentStatus = "ACTIVE" | "PENDING" | "REJECTED" | "CANCELLED" | "UNKNOWN";

export type ShipmentRecord = {
  naturalKey: string;
  fingerprint: string;
  sourceRow: number;
  dealNumber: string | null;
  dealDate: IsoDate | null;
  contractNumber: string | null;
  sellerName: string | null;
  sellerBroker: string | null;
  sellerInn: string | null;
  buyerName: string | null;
  buyerBroker: string | null;
  productName: string | null;
  documentNumber: string | null;
  documentDate: IsoDate | null;
  shipmentQtyKg: number | null;
  /** Source column "Стоимость доставки". In the real export it equals Кол-во отгрузки × price, i.e. shipment value. */
  deliveryCost: bigint | null;
  dealQtyKg: number | null;
  dealAmount: bigint | null;
  unit: string | null;
  shipmentTimer: string | null;
  status: ShipmentStatus;
  statusRaw: string | null;
};

export type ParseResult<T> = {
  records: T[];
  issues: DataIssue[];
  rowCount: number;
  meta: Record<string, unknown>;
};

/** Thrown for problems the user must fix in the file itself — the message is shown verbatim in Telegram. */
export class UserFacingError extends Error {
  readonly details: string[];
  /** Which uploaded file caused it, when known — lets the bot ask for just that file again. */
  source: SourceType | null = null;
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "UserFacingError";
    this.details = details;
  }
}
