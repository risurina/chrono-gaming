export interface TransactionItem {
  id: string;
  type: 'top-up' | 'session' | 'extension' | 'promo';
  /** Signed amount as a number, for display only (see `amountRaw`). */
  amount: number;
  /**
   * Signed, server-authoritative decimal string. Preferred over `amount` for
   * any precision-sensitive use to avoid binary-float rounding on money.
   */
  amountRaw: string;
  date: string;
  description: string;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  recentTransactions: TransactionItem[];
}

/**
 * Raw wallet transaction as returned by the Chrono API
 * (`GET /tenant/wallet/history`, serialized via the wallet module's
 * `serializeWalletTransaction`). Amounts are decimal strings; dates are ISO
 * strings; `metadata` mirrors the server's `metadataJson`.
 */
export interface RawWalletTransaction {
  id: string;
  type: string; // WalletTransactionType: TOP_UP | PAYMENT | REFUND
  status: string; // WalletTransactionStatus: PENDING | POSTED | FAILED
  amount: string;
  balanceBefore?: string;
  balanceAfter?: string;
  referenceNo?: string | null;
  createdAt: string;
  metadata?: Record<string, any> | null;
}

// Must stay aligned with the API's WalletTransactionTypeEnum
// (TOP_UP | PAYMENT | REFUND) — credits increase the balance.
const CREDIT_TYPES = new Set(['TOP_UP', 'REFUND']);

function describeTransaction(raw: RawWalletTransaction): string {
  const reason = typeof raw.metadata?.reason === 'string' ? raw.metadata.reason : undefined;
  if (reason) {
    return reason
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  switch (raw.type) {
    case 'TOP_UP':
      return 'Wallet Top-up';
    case 'REFUND':
      return 'Refund';
    case 'PAYMENT':
      return 'Session Payment';
    default:
      return raw.type.replace(/_/g, ' ');
  }
}

function mapType(raw: RawWalletTransaction): TransactionItem['type'] {
  switch (raw.type) {
    case 'TOP_UP':
      return 'top-up';
    case 'REFUND':
      return 'promo';
    default:
      return 'session';
  }
}

/**
 * Normalize a raw API transaction to the shape the UI components expect,
 * signing the amount by transaction direction.
 *
 * NOTE: `RawWalletTransaction` is a hand-written interface with no runtime
 * validation, so it can silently drift from the API serializer — treat field
 * shapes defensively here.
 *
 * Money handling: the server sends `amount` as a decimal string. We keep it as
 * the authoritative string in `amountRaw` and derive the sign from the
 * transaction TYPE rather than doing float arithmetic (Math.abs / negation) on
 * the parsed value. `amount` is coerced to a number only at this display
 * boundary because `formatCurrency` (Intl.NumberFormat) requires a number.
 */
export function normalizeTransaction(raw: RawWalletTransaction): TransactionItem {
  const isCredit = CREDIT_TYPES.has(raw.type);
  const magnitudeStr = String(raw.amount ?? '0').replace(/^-/, '');
  const signedStr = isCredit ? magnitudeStr : `-${magnitudeStr}`;
  return {
    id: raw.id,
    type: mapType(raw),
    amount: Number(signedStr) || 0,
    amountRaw: signedStr,
    date: raw.createdAt,
    description: describeTransaction(raw),
  };
}
