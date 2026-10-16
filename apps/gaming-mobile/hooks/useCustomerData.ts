import { useState, useCallback, useEffect } from 'react';
import { useApi } from '../lib/ApiContext';
import { sessionStorage } from '../lib/session-storage';
import type {
  ActiveSession,
  CustomerMe,
  MemberProfile,
  RecentBranch,
  WalletBalance,
  WalletTransaction,
} from '../constants/schemas/api';

/**
 * Aggregates the customer home dashboard data. The customer identity
 * (`customerAuth.me`) is venue-independent; everything else is tenant-scoped and
 * only fetched once a venue is selected (`noVenue` drives the "join a cafe"
 * banner). Per-call failures degrade to null rather than failing the whole load.
 */
export function useCustomerData() {
  const api = useApi();
  const [customer, setCustomer] = useState<CustomerMe | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<WalletTransaction[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [recentBranch, setRecentBranch] = useState<RecentBranch | null>(null);
  const [noVenue, setNoVenue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const me = await api.customerAuth.me().catch(() => null);
      setCustomer(me);

      const slug = await sessionStorage.getTenantSlug();
      if (!slug) {
        setNoVenue(true);
        setProfile(null);
        setWallet(null);
        setRecentTransactions([]);
        setActiveSession(null);
        setRecentBranch(null);
        return;
      }
      setNoVenue(false);

      const [profileRes, balanceRes, historyRes, sessionRes, branchRes] = await Promise.allSettled([
        api.members.me(),
        api.wallet.balance(),
        api.wallet.history({ pageSize: 5 }),
        api.sessions.active(),
        api.members.recentBranch(),
      ]);

      setProfile(profileRes.status === 'fulfilled' ? profileRes.value : null);
      setWallet(balanceRes.status === 'fulfilled' ? balanceRes.value : null);
      setRecentTransactions(historyRes.status === 'fulfilled' ? historyRes.value.items : []);
      setActiveSession(sessionRes.status === 'fulfilled' ? sessionRes.value : null);
      setRecentBranch(branchRes.status === 'fulfilled' ? branchRes.value : null);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    customer,
    profile,
    wallet,
    recentTransactions,
    activeSession,
    recentBranch,
    noVenue,
    loading,
    error,
    refresh: async () => {
      setLoading(true);
      await fetchAll();
    },
  };
}
