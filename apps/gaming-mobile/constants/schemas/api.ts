/**
 * Over-the-wire DTOs for the gaming-api customer surface.
 *
 * These mirror the server's actual response shapes exactly (see each module's
 * `contracts.ts` / `portal-routes.ts`). Conventions:
 *  - money / `numeric` columns cross the wire as decimal STRINGS ("0.00"),
 *    never numbers — parse at the display boundary.
 *  - timestamps cross as ISO strings.
 *  - list endpoints return `{ items, meta }` (see `PaginationMeta`).
 *
 * This is the single source of truth the typed client (`lib/api-service.ts`)
 * returns. UI-only shapes (quick actions, feature chips) live in `./ui`.
 */

// ── Common ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startItem: number;
  endItem: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ── Auth: global customer (platform-wide account) ────────────────────────────

export interface GlobalCustomer {
  id: string;
  email: string;
  name: string;
}

/** `GET /auth/customer/me` — superset of GlobalCustomer. */
export interface CustomerMe extends GlobalCustomer {
  hasPassword: boolean;
}

// ── Member (tenant-scoped profile for the selected venue) ─────────────────────

export type MemberApplicationStatus = 'visitor' | 'pending' | 'approved' | 'rejected';

export interface MemberProfile {
  id: string;
  tenantId: string;
  memberId: string;
  phone: string | null;
  memberCode: string | null;
  applicationStatus: MemberApplicationStatus;
  appliedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberOnboarding {
  applicationStatus: MemberApplicationStatus;
  appliedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  wallet: { balance: string; currency: string; exists: boolean };
  memberRateEligible: boolean;
}

export interface RecentBranch {
  branchId: string;
  branchName: string;
  lastActivityAt: string;
}

/** `POST /portal/customer/apply` member row. */
export interface AppliedMember {
  id: string;
  customerId: string | null;
  email: string;
  name: string;
  status: string;
}

/** `GET /portal/customer/memberships` item. */
export interface CustomerMembership {
  tenantSlug: string;
  tenantName: string;
  tenantStatus: string;
}

// ── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletBalance {
  balance: string;
  currency: string;
  exists: boolean;
}

export type WalletTransactionType = 'credit' | 'debit' | 'adjustment';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  /** Always positive; sign is implied by `type` (credit vs debit). */
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  reason: string;
  createdAt: string;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'paused' | 'ended';

export interface PortalSessionSummary {
  id: string;
  stationId: string;
  stationName: string;
  status: SessionStatus;
  startedAt: string;
  scheduledEndAt: string | null;
  endedAt: string | null;
  actualBillableSeconds: number | null;
  amountCharged: string | null;
  currency: string;
}

export interface PortalSessionDetail extends PortalSessionSummary {
  rateSnapshot: string;
  creditMinutesConsumed: number;
}

/**
 * `GET /portal/sessions/active` — NOTE: a narrower shape than
 * PortalSessionSummary (the raw active/paused row, 6 fields only).
 */
export interface ActiveSession {
  id: string;
  stationId: string;
  stationName: string;
  status: 'active' | 'paused';
  startedAt: string;
  scheduledEndAt: string | null;
}

export interface SessionTodayUsage {
  billableSeconds: number;
  sessionCount: number;
  amountCharged: string;
  currency: string;
  timezone: string;
}

export interface SessionSummary {
  active: PortalSessionSummary | null;
  today: SessionTodayUsage;
}

// ── Loyalty ──────────────────────────────────────────────────────────────────

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyMe {
  account: {
    pointsBalance: number;
    lifetimePoints: number;
    tier: LoyaltyTier;
  } | null;
  level: {
    tier: LoyaltyTier;
    nextTier: LoyaltyTier | null;
    pointsToNext: number | null;
    progressPercent: number;
  };
  memberSince: string;
}

export interface LoyaltyTransaction {
  id: string;
  type: 'earn' | 'redeem' | 'adjustment';
  points: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

// ── Credits (prepaid time) ────────────────────────────────────────────────────

export type CreditGrantStatus = 'granted' | 'depleted' | 'expired' | 'voided';

export interface CreditGrant {
  id: string;
  productId: string | null;
  status: CreditGrantStatus;
  originalQuantity: number;
  remainingQuantity: number;
  expiresAt: string | null;
  createdAt: string;
  stationGroupId: string | null;
  stationGroupName: string | null;
}

export interface CreditBalance {
  grants: CreditGrant[];
  totalRemainingMinutes: number;
}

export interface CreditProduct {
  id: string;
  name: string;
  code: string;
  quantityMinutes: number;
  priceAmount: string;
  validityDays: number | null;
}

export interface CreditLedgerEntry {
  id: string;
  grantId: string;
  type: string;
  quantityDelta: number;
  reason: string | null;
  createdAt: string;
}

/**
 * `POST /portal/credits/purchase` — the `purchase` field is the raw DB row; we
 * only type the fields we consume (it also leaks tenantId/memberId/etc.).
 */
export interface CreditPurchaseResult {
  purchase: {
    id: string;
    status: string;
    quantityMinutes: number;
    priceAmount: string;
    currency: string;
    createdAt: string;
  };
  grant: CreditGrant;
}

// ── Venue / branch (public) ───────────────────────────────────────────────────

export interface VenueSocialLinks {
  facebook?: string | null;
  messenger?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  discord?: string | null;
}

export interface VenueRateGroup {
  id: string;
  name: string;
  hourlyRate: string;
  memberRate: string | null;
}

export interface PublicVenueInfo {
  branch: {
    name: string;
    address: string | null;
    googleMapsUrl: string | null;
    operatingHours: string | null;
    contactNumber: string | null;
    email: string | null;
    socialLinks: VenueSocialLinks | null;
    hoursConfig: unknown | null;
    openStatus: { isOpen: boolean; opensAt: string | null } | null;
  } | null;
  rateGroups: VenueRateGroup[];
}

// ── Stations (public live availability) ───────────────────────────────────────

export type StationStatus = 'available' | 'occupied' | 'maintenance' | 'offline';

export interface PublicStationAggregate {
  total: number;
  available: number;
  inUse: number;
  occupied: number;
  unavailable: number;
}

export interface PublicStation {
  id: string;
  name: string;
  stationNumber: string;
  stationType: string;
  status: StationStatus;
}

export interface PublicStationsBranch {
  id: string;
  name: string;
  code: string;
  aggregate: PublicStationAggregate;
  stations: PublicStation[];
}

export interface PublicStations {
  aggregate: PublicStationAggregate;
  branches: PublicStationsBranch[];
}

// ── QR ────────────────────────────────────────────────────────────────────────

export interface QrResolveResult {
  tenantSlug: string;
  tenantHost: string;
  stationId: string;
  stationName: string;
  branchName: string;
  requiresLogin: boolean;
  hourlyRate: string | null;
  memberRate: string | null;
  availability: {
    status: StationStatus;
    branchAvailable: number;
    branchTotal: number;
  };
}

export interface QrConsumeResult {
  resolved: boolean;
  sessionStartAvailable: boolean;
  sessionId?: string;
}

// ── Promos ─────────────────────────────────────────────────────────────────

export interface Promo {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: string;
  minSpend: string | null;
  startsAt: string | null;
  endsAt: string;
  branchName: string | null;
}

// ── Activity (unified timeline) ────────────────────────────────────────────

export type ActivityType = 'wallet' | 'credit' | 'session' | 'reservation';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  occurredAt: string;
  title: string;
  description: string;
  amount: string | null;
  status: string | null;
}

// ── Reservations ─────────────────────────────────────────────────────────────

export type ReservationStatus =
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'pending'
  | 'hold'
  | 'cancelled_late'
  | 'queue_expired';

/** The portal returns the full raw reservation row; we type the fields the UI reads. */
export interface Reservation {
  id: string;
  stationId: string;
  branchId: string;
  memberId: string | null;
  status: ReservationStatus;
  startAt: string | null;
  endAt: string | null;
  requestedDurationMinutes: number | null;
  holdExpiresAt: string | null;
  fromQueue: boolean;
  cancelledLateFeeAmount: string | null;
  createdAt: string;
}

/** `GET /portal/reservations` — the member's single active reservation/queue entry. */
export interface MyReservation {
  reservation: Reservation | null;
  queuePosition: number | null;
}

export interface ReservationPolicy {
  enabled: boolean;
  reservationAdvanceWindowMinutes: number;
  maxActiveReservationsPerMember: number;
  lateCancellationWindowMinutes: number;
  cancellationFeeEnabled: boolean;
  cancellationFeeAmount: string;
  holdPeriodMinutes: number;
  allowQueueForReservedPc: boolean;
  allowQueueForInUsePc: boolean;
}

export interface ReservationAvailability {
  date: string;
  stationId: string;
  durationMinutes: number;
  granularityMinutes: number;
  slots: { startAt: string; available: boolean }[];
}

export interface MemberRestriction {
  type: 'reservation_ban' | 'queue_ban' | 'queue_failure';
  reason: string;
  expiresAt: string | null;
}

export interface CancelReservationResult {
  reservation: Reservation;
  isLate: boolean;
  feeAmount: string | null;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface PaymentGatewayStatus {
  available: boolean;
  currency: string;
  scope?: 'tenant' | 'platform';
}

export type CheckoutBody =
  | { purpose: 'credit_purchase'; productId: string }
  | { purpose: 'wallet_topup'; amount: string };

export interface PaymentCheckout {
  paymentId: string;
  checkoutUrl: string;
}

export interface Payment {
  id: string;
  status: 'pending' | 'paid' | 'voided' | 'refunded';
  purpose: 'credit_purchase' | 'wallet_topup' | null;
  amount: string;
  currency: string;
  fulfilledAt: string | null;
  createdAt: string;
}
