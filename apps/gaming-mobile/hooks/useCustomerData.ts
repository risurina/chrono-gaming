import { useState, useCallback, useEffect } from 'react';
import { useApi } from '../lib/ApiContext';
import { normalizeTransaction, RawWalletTransaction } from '../constants/schemas/wallet';
import { normalizeActiveSession, RawActiveSession } from '../constants/schemas/session';
import { tokenStorage } from '../lib/token-storage';

export interface StoredTenantContext {
  tenantSlug: string | null;
  branchCode: string | null;
}

export function useCustomerData() {
  const api = useApi();
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [tenantContext, setTenantContext] = useState<StoredTenantContext>({ tenantSlug: null, branchCode: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);

      const [tenantSlug, branchCode] = await Promise.all([
        tokenStorage.getTenantSlug(),
        tokenStorage.getBranchCode(),
      ]);
      setTenantContext({ tenantSlug, branchCode });

      const [meRes, walletBalance, walletHistory, sessionRes] = await Promise.allSettled([
        api.auth.me(),
        api.wallet.getBalance(),
        api.wallet.getHistory(),
        api.session.getActive(),
      ]);

      if (meRes.status === 'fulfilled') {
        setProfile(meRes.value);
      }

      if (walletBalance.status === 'fulfilled') {
        const transactions =
          walletHistory.status === 'fulfilled'
            ? (walletHistory.value as RawWalletTransaction[]).map(normalizeTransaction)
            : [];
        setWallet({
          balance: Number(walletBalance.value.balance) || 0,
          currency: walletBalance.value.currency,
          status: walletBalance.value.status,
          recentTransactions: transactions,
        });
      }

      if (sessionRes.status === 'fulfilled' && sessionRes.value) {
        setActiveSession(normalizeActiveSession(sessionRes.value as RawActiveSession));
      } else {
        setActiveSession(null);
      }

      // Surface failures instead of silently rendering zero/empty data.
      // Profile is always critical; wallet fetches only matter once a tenant
      // is linked (without a cafe the wallet routes legitimately reject).
      const criticalResults = [
        meRes,
        ...(tenantSlug ? [walletBalance, walletHistory] : []),
      ];
      const firstFailure = criticalResults.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (firstFailure) {
        const reason = firstFailure.reason;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    profile,
    wallet,
    activeSession,
    tenantContext,
    loading,
    error,
    refresh: async () => {
      setLoading(true);
      await fetchAll();
    },
  };
}
