import { mobileApiFetch } from './mobile-api-client';
import type {
  ActivityEvent,
  ActiveSession,
  AppliedMember,
  CancelReservationResult,
  CheckoutBody,
  CreditBalance,
  CreditProduct,
  CreditLedgerEntry,
  CreditPurchaseResult,
  CustomerMe,
  CustomerMembership,
  GlobalCustomer,
  ListQuery,
  LoyaltyMe,
  LoyaltyTransaction,
  MemberOnboarding,
  MemberProfile,
  MemberRestriction,
  MyReservation,
  Paginated,
  Payment,
  PaymentCheckout,
  PaymentGatewayStatus,
  PortalSessionDetail,
  PortalSessionSummary,
  Promo,
  PublicStations,
  PublicVenueInfo,
  QrConsumeResult,
  QrResolveResult,
  RecentBranch,
  Reservation,
  ReservationAvailability,
  ReservationPolicy,
  SessionSummary,
  WalletBalance,
  WalletTransaction,
} from '../constants/schemas/api';

/** Build a `?a=1&b=2` query string, skipping empty values. No URLSearchParams
 * dependency (RN's polyfill is inconsistent). Accepts `object` so named query
 * interfaces (e.g. ListQuery) assign without an index-signature mismatch. */
function buildQuery(params?: object): string {
  if (!params) return '';
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length ? `?${pairs.join('&')}` : '';
}

const json = (body: unknown) => JSON.stringify(body);

/**
 * Typed client for the gaming-api customer surface.
 *
 * Account auth is the platform-wide global-customer pool (`/auth/customer/*`,
 * `agora_customer` cookie); a venue is selected via `x-tenant-slug` (set in
 * session-storage) and joined via `/portal/customer/apply`; all `/portal/*`
 * reads/writes then resolve for that venue through the server's global-customer
 * fallback. Mutating `/portal/*` calls carry `x-member-action: 1`.
 */
export const apiService = {
  /** Platform-wide customer account (not tenant-scoped). */
  customerAuth: {
    signUp: (input: { email: string; name: string; password: string }) =>
      mobileApiFetch<{ customer: GlobalCustomer }>('/auth/customer/sign-up', {
        method: 'POST',
        body: json(input),
      }).then((r) => r.customer),
    signIn: (input: { email: string; password: string }) =>
      mobileApiFetch<{ customer: GlobalCustomer }>('/auth/customer/sign-in', {
        method: 'POST',
        body: json(input),
      }).then((r) => r.customer),
    signOut: () =>
      mobileApiFetch<{ ok: true }>('/auth/customer/sign-out', { method: 'POST', body: '{}' }),
    me: () =>
      mobileApiFetch<{ customer: CustomerMe }>('/auth/customer/me').then((r) => r.customer),
    updateName: (input: { name: string }) =>
      mobileApiFetch<{ customer: GlobalCustomer }>('/auth/customer/me', {
        method: 'PATCH',
        body: json(input),
      }).then((r) => r.customer),
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      mobileApiFetch<{ ok: true }>('/auth/customer/change-password', {
        method: 'POST',
        body: json(input),
      }),
    forgot: (input: { email: string }) =>
      mobileApiFetch<{ ok: true }>('/auth/customer/forgot', { method: 'POST', body: json(input) }),
    reset: (input: { token: string; password: string }) =>
      mobileApiFetch<{ ok: true }>('/auth/customer/reset', { method: 'POST', body: json(input) }),
  },

  /** Join / list venues for the signed-in global customer. */
  venue: {
    /** Apply to (join) the venue currently selected via x-tenant-slug. */
    apply: () =>
      mobileApiFetch<{ member: AppliedMember }>('/portal/customer/apply', {
        method: 'POST',
        body: '{}',
      }).then((r) => r.member),
    memberships: () =>
      mobileApiFetch<{ memberships: CustomerMembership[] }>('/portal/customer/memberships').then(
        (r) => r.memberships,
      ),
  },

  /** Tenant-scoped member profile for the selected venue. */
  members: {
    me: () =>
      mobileApiFetch<{ profile: MemberProfile | null }>('/portal/members/me').then(
        (r) => r.profile,
      ),
    onboarding: () => mobileApiFetch<MemberOnboarding>('/portal/members/me/onboarding'),
    recentBranch: () =>
      mobileApiFetch<{ recentBranch: RecentBranch | null }>(
        '/portal/members/me/recent-branch',
      ).then((r) => r.recentBranch),
    updatePhone: (input: { phone: string }) =>
      mobileApiFetch<{ profile: MemberProfile }>('/portal/members/me', {
        method: 'PATCH',
        body: json(input),
        memberAction: true,
      }).then((r) => r.profile),
    visit: () =>
      mobileApiFetch<{ profile: MemberProfile }>('/portal/members/visit', {
        method: 'POST',
        body: '{}',
        memberAction: true,
      }).then((r) => r.profile),
  },

  wallet: {
    balance: () => mobileApiFetch<WalletBalance>('/portal/wallet/balance'),
    history: (query?: ListQuery & { type?: string }) =>
      mobileApiFetch<Paginated<WalletTransaction>>(`/portal/wallet/history${buildQuery(query)}`),
  },

  credits: {
    balance: () => mobileApiFetch<CreditBalance>('/portal/credits/balance'),
    products: () =>
      mobileApiFetch<{ items: CreditProduct[] }>('/portal/credits/products').then((r) => r.items),
    ledger: (query?: ListQuery) =>
      mobileApiFetch<Paginated<CreditLedgerEntry>>(`/portal/credits/ledger${buildQuery(query)}`),
    purchase: (input: { productId: string }, idempotencyKey?: string) =>
      mobileApiFetch<CreditPurchaseResult>('/portal/credits/purchase', {
        method: 'POST',
        body: json(input),
        memberAction: true,
        idempotencyKey,
      }),
  },

  loyalty: {
    me: () => mobileApiFetch<LoyaltyMe>('/portal/loyalty/me'),
    history: (query?: ListQuery) =>
      mobileApiFetch<Paginated<LoyaltyTransaction>>(`/portal/loyalty/history${buildQuery(query)}`),
  },

  sessions: {
    active: () =>
      mobileApiFetch<{ session: ActiveSession | null }>('/portal/sessions/active').then(
        (r) => r.session,
      ),
    summary: () => mobileApiFetch<SessionSummary>('/portal/sessions/summary'),
    list: (query?: ListQuery) =>
      mobileApiFetch<Paginated<PortalSessionSummary>>(`/portal/sessions/${buildQuery(query)}`),
    detail: (id: string) =>
      mobileApiFetch<{ session: PortalSessionDetail }>(
        `/portal/sessions/${encodeURIComponent(id)}`,
      ).then((r) => r.session),
  },

  // ── Phase 8 modules — shapes refined against each contract in Phase 8 ──
  promos: {
    list: () => mobileApiFetch<{ items: Promo[] }>('/portal/promos').then((r) => r.items),
  },

  activity: {
    list: (query?: ListQuery & { q?: string; type?: string }) =>
      mobileApiFetch<Paginated<ActivityEvent>>(`/portal/activity${buildQuery(query)}`),
  },

  reservations: {
    /** The member's single active reservation/queue entry (not a list). */
    mine: () => mobileApiFetch<MyReservation>('/portal/reservations'),
    policy: (stationId: string) =>
      mobileApiFetch<{ policy: ReservationPolicy }>(
        `/portal/reservations/policy${buildQuery({ stationId })}`,
      ).then((r) => r.policy),
    availability: (query: { stationId: string; date: string; durationMinutes?: number }) =>
      mobileApiFetch<ReservationAvailability>(
        `/portal/reservations/availability${buildQuery(query)}`,
      ),
    restrictions: () =>
      mobileApiFetch<{ restrictions: MemberRestriction[] }>(
        '/portal/reservations/restrictions',
      ).then((r) => r.restrictions),
    // Reservation mutations are gated by applied-membership only (no x-member-action).
    create: (input: { stationId: string; startAt: string; durationMinutes: number }) =>
      mobileApiFetch<{ reservation: Reservation }>('/portal/reservations', {
        method: 'POST',
        body: json(input),
      }).then((r) => r.reservation),
    joinQueue: (input: { stationId: string; durationMinutes: number }) =>
      mobileApiFetch<{ reservation: Reservation }>('/portal/reservations/queue', {
        method: 'POST',
        body: json(input),
      }).then((r) => r.reservation),
    confirm: (id: string) =>
      mobileApiFetch<{ reservation: Reservation }>(
        `/portal/reservations/${encodeURIComponent(id)}/confirm`,
        { method: 'POST', body: '{}' },
      ).then((r) => r.reservation),
    cancel: (id: string, reason?: string) =>
      mobileApiFetch<CancelReservationResult>(
        `/portal/reservations/${encodeURIComponent(id)}/cancel`,
        { method: 'POST', body: json({ reason }) },
      ),
  },

  payments: {
    gateway: () => mobileApiFetch<PaymentGatewayStatus>('/portal/payments/gateway'),
    checkout: (input: CheckoutBody, idempotencyKey?: string) =>
      mobileApiFetch<PaymentCheckout>('/portal/payments/checkout', {
        method: 'POST',
        body: json(input),
        memberAction: true,
        idempotencyKey,
      }),
    get: (id: string) => mobileApiFetch<Payment>(`/portal/payments/${encodeURIComponent(id)}`),
  },

  /** Unauthenticated, host-resolved (still send x-tenant-slug for resolution). */
  public: {
    venueInfo: () => mobileApiFetch<PublicVenueInfo>('/public/venue-info'),
    stations: () => mobileApiFetch<PublicStations>('/public/stations'),
  },

  qr: {
    resolve: (token: string) =>
      mobileApiFetch<QrResolveResult>(`/public/qr/resolve${buildQuery({ token })}`),
    /** Member-gated start-session (requires an applied membership). */
    consume: (token: string) =>
      mobileApiFetch<QrConsumeResult>('/public/qr/consume', {
        method: 'POST',
        body: json({ token }),
        memberAction: true,
      }),
  },
};

export type ApiService = typeof apiService;
