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
 * Raw wallet transaction as returned by gaming-api
 * (`GET /portal/wallet/history`, items via `toPortalWalletTransactionDto`).
 * Amounts/balances are decimal strings; `createdAt` is an ISO string; `reason`
 * is a free-text description of the entry.
 */
export interface RawWalletTransaction {
  id: string;
  type: 'credit' | 'debit' | 'adjustment';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  reason: string;
  createdAt: string;
}

// gaming-api signs transactions by type: `credit` increases the balance,
// `debit` decreases it, `adjustment` is a signed correction (sign carried in
// the stored amount).
const CREDIT_TYPES = new Set<RawWalletTransaction['type']>(['credit']);

function describeTransaction(raw: RawWalletTransaction): string {
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason) {
    return reason
      .toLowerCase()
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  switch (raw.type) {
    case 'credit':
      return 'Wallet Credit';
    case 'debit':
      return 'Wallet Debit';
    case 'adjustment':
      return 'Adjustment';
    default:
      return 'Transaction';
  }
}

function mapType(raw: RawWalletTransaction): TransactionItem['type'] {
  switch (raw.type) {
    case 'credit':
      return 'top-up';
    case 'adjustment':
      return 'promo';
    default:
      return 'session';
  }
}

/**
 * Normalize a raw API transaction to the shape the UI components expect.
 *
 * NOTE: `RawWalletTransaction` is a hand-written interface with no runtime
 * validation, so it can silently drift from the API serializer — treat field
 * shapes defensively here.
 *
 * Money handling: `amount` is a decimal string. We keep it as the authoritative
 * string in `amountRaw` and derive the sign from the transaction TYPE rather
 * than float arithmetic. `adjustment` carries its own sign in the stored string,
 * so it is passed through unchanged. `amount` is coerced to a number only at this
 * display boundary because `formatCurrency` (Intl.NumberFormat) requires one.
 */
export function normalizeTransaction(raw: RawWalletTransaction): TransactionItem {
  const rawStr = String(raw.amount ?? '0');
  let signedStr: string;
  if (raw.type === 'adjustment') {
    // Already signed by the server — do not re-sign.
    signedStr = rawStr;
  } else {
    const magnitudeStr = rawStr.replace(/^-/, '');
    signedStr = CREDIT_TYPES.has(raw.type) ? magnitudeStr : `-${magnitudeStr}`;
  }
  return {
    id: raw.id,
    type: mapType(raw),
    amount: Number(signedStr) || 0,
    amountRaw: signedStr,
    date: raw.createdAt,
    description: describeTransaction(raw),
  };
}
