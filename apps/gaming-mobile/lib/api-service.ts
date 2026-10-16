import { mobileApiFetch } from './mobile-api-client';
import { tokenStorage } from './token-storage';

/**
 * Chrono member (customer) API surface. Endpoints match the live chrono-api:
 * - `/member/*`         — user-scoped member portal (profile, sessions, reservations)
 * - `/tenant/wallet/*`  — member wallet (tenant resolved via x-oikos-hostname)
 * - `/tenant/{branchCode}/sessions/active` — active session for the current branch
 * - `/public/tenants/{slug}/station-availability` — live station view (no auth)
 */
export const apiService = {
  auth: {
    // Sign-in/sign-up are handled by Better Auth directly in mobile-api-client
    // (signInWithEmail / signUpWithEmail). `me` returns the member profile.
    me: () => mobileApiFetch<any>('/member/profile'),
  },
  customers: {
    // Visited cafes (tenant + branch + slug/code) for the current user.
    // These use strict requireAuth and are user-scoped, so we must NOT send the
    // tenant host header (a membership-less customer would 403 once resolved).
    getHistory: () =>
      mobileApiFetch<{ history: any[] }>(
        '/tenant/~/customers/history',
        {},
        { includeTenantHost: false },
      ).then((r) => r.history ?? []),
    join: (code: string) =>
      mobileApiFetch<{
        tenantId: string;
        tenantSlug?: string | null;
        tenantName?: string | null;
        branchId: string;
        branch: { id: string; code: string; name?: string | null } & Record<string, any>;
      }>(
        '/tenant/~/customers/join',
        { method: 'POST', body: JSON.stringify({ code }) },
        { includeTenantHost: false },
      ),
  },
  wallet: {
    getBalance: () =>
      mobileApiFetch<{ id: string | null; balance: string | number; currency: string; status: string }>(
        '/tenant/wallet/balance',
      ),
    getHistory: () => mobileApiFetch<any[]>('/tenant/wallet/history'),
  },
  loyalty: {
    getBalance: () => mobileApiFetch<{ balance: number; id?: string }>('/tenant/~/loyalty/balance'),
  },
  session: {
    getActive: async () => {
      const branchCode = (await tokenStorage.getBranchCode()) || '~';
      return mobileApiFetch<any>(`/tenant/${branchCode}/sessions/active`);
    },
    getHistory: () => mobileApiFetch<any[]>('/member/sessions'),
  },
  credits: {
    getSummary: () => mobileApiFetch<{ grants: any[] }>('/member/credit-summary'),
    getProducts: () => mobileApiFetch<any[]>('/member/credit-products'),
  },
  stations: {
    availability: (tenantSlug: string) =>
      mobileApiFetch<any>(`/public/tenants/${tenantSlug}/station-availability`),
  },
  reservations: {
    list: () => mobileApiFetch<any[]>('/member/reservations'),
    policy: () => mobileApiFetch<any>('/member/reservations/policy'),
    restrictions: () => mobileApiFetch<any>('/member/reservations/restrictions'),
    create: (data: { stationId: string; durationMinutes: number }) =>
      mobileApiFetch<any>('/member/reservations', { method: 'POST', body: JSON.stringify(data) }),
    confirm: (id: string) =>
      mobileApiFetch<any>(`/member/reservations/${id}/confirm`, { method: 'POST' }),
    cancel: (id: string) =>
      mobileApiFetch<any>(`/member/reservations/${id}/cancel`, { method: 'POST' }),
  },
};

export type ApiService = typeof apiService;
