import { mobileApiFetch } from './mobile-api-client';
import { tokenStorage } from './token-storage';

/**
 * gaming-api customer surface. All reads/writes target the agora foundation
 * contract:
 * - `/auth/customer/*`   — global-customer identity (cookie session)
 * - `/portal/*`          — member self-service (tenant resolved via x-tenant-slug)
 * - `/public/*`          — unauthenticated reads (stations, QR)
 *
 * Responses are bare JSON (no `{ success, data }` envelope); lists are
 * `{ items, meta }` and are unwrapped to `.items` here.
 */
export const apiService = {
  auth: {
    // Identity comes from `/auth/customer/me`; the tenant-scoped member profile
    // (memberCode / applicationStatus / phone …) from `/portal/members/me` when a
    // cafe is linked. Merge them, with identity fields winning so id/email/name
    // always reflect the signed-in customer.
    me: async () => {
      const { customer } = await mobileApiFetch<{ customer: any }>('/auth/customer/me');
      let profile: any = null;
      const tenantSlug = await tokenStorage.getTenantSlug();
      if (tenantSlug) {
        try {
          const res = await mobileApiFetch<{ profile: any }>('/portal/members/me');
          profile = res.profile;
        } catch {
          // No membership in this tenant yet — identity alone is enough.
        }
      }
      return {
        ...(profile ?? {}),
        id: customer.id,
        email: customer.email,
        name: customer.name,
        hasPassword: customer.hasPassword,
      };
    },
  },
  customers: {
    // Every tenant the customer has joined, each with its branches.
    getCafes: () =>
      mobileApiFetch<{ cafes: any[] }>('/portal/customer/cafes').then((r) => r.cafes ?? []),
    // Apply to a tenant by its slug: persist the slug (so x-tenant-slug resolves
    // the tenant) then self-service apply.
    join: async (code: string) => {
      await tokenStorage.saveTenantSlug(code);
      return mobileApiFetch<{
        member: { id: string; customerId: string; email: string; name: string; status: string };
      }>('/portal/customer/apply', { method: 'POST', body: JSON.stringify({}) });
    },
  },
  wallet: {
    getBalance: () =>
      mobileApiFetch<{ balance: string; currency: string; exists: boolean }>(
        '/portal/wallet/balance',
      ),
    getHistory: () =>
      mobileApiFetch<{ items: any[]; meta: any }>('/portal/wallet/history').then(
        (r) => r.items ?? [],
      ),
  },
  loyalty: {
    getBalance: () =>
      mobileApiFetch<{ account: any | null; level: any; memberSince: string }>('/portal/loyalty/me'),
  },
  session: {
    getActive: () =>
      mobileApiFetch<{ session: any | null }>('/portal/sessions/active').then((r) => r.session),
    getHistory: () =>
      mobileApiFetch<{ items: any[]; meta: any }>('/portal/sessions/').then((r) => r.items ?? []),
  },
  credits: {
    getSummary: () =>
      mobileApiFetch<{ grants: any[]; totalRemainingMinutes: number }>('/portal/credits/balance'),
    getProducts: () =>
      mobileApiFetch<{ items: any[] }>('/portal/credits/products').then((r) => r.items ?? []),
  },
  stations: {
    // Tenant resolved via x-tenant-slug (no slug in the path).
    availability: () => mobileApiFetch<any>('/public/stations'),
  },
  reservations: {
    list: () =>
      mobileApiFetch<{ items: any[]; meta: any }>('/portal/reservations/history').then(
        (r) => r.items ?? [],
      ),
    policy: (stationId: string) =>
      mobileApiFetch<{ policy: any }>(
        `/portal/reservations/policy?stationId=${encodeURIComponent(stationId)}`,
      ).then((r) => r.policy),
    restrictions: () =>
      mobileApiFetch<{ restrictions: any }>('/portal/reservations/restrictions').then(
        (r) => r.restrictions,
      ),
    create: (data: { stationId: string; startAt: string; durationMinutes: number }) =>
      mobileApiFetch<{ reservation: any }>('/portal/reservations', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.reservation),
    confirm: (id: string) =>
      mobileApiFetch<{ reservation: any }>(`/portal/reservations/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({}),
      }).then((r) => r.reservation),
    cancel: (id: string, reason?: string) =>
      mobileApiFetch<{ reservation: any; isLate: boolean; feeAmount: string | null }>(
        `/portal/reservations/${id}/cancel`,
        { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) },
      ),
  },
};

export type ApiService = typeof apiService;
