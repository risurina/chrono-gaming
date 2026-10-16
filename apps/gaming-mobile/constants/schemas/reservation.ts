/**
 * gaming-api reservation status vocabulary (lowercase) — see
 * `reservation/contracts.ts`'s `reservationStatusSchema`.
 */
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

/**
 * Member reservation summary as returned by gaming-api
 * (`GET /portal/reservations/history` → `{ items }`), via
 * `toPortalReservationSummary`. Dates are ISO strings; `cancelledLateFeeAmount`
 * is a decimal string.
 */
export interface MemberReservation {
  id: string;
  stationId: string;
  branchId: string;
  status: ReservationStatus;
  startAt: string | null;
  endAt: string | null;
  requestedDurationMinutes: number | null;
  fromQueue: boolean;
  cancelledLateFeeAmount: string | null;
  createdAt: string;
}

export interface ReservationAvailability {
  allowed: boolean;
  reason?: string | null;
  reopensAt?: string | null;
}

export interface ReservationPolicy {
  enabled: boolean;
  gracePeriodMinutes: number;
  maxActiveReservationsPerMember: number;
  availability?: ReservationAvailability;
}

export interface ReservationRestriction {
  type: 'reservation_ban' | 'queue_ban' | 'queue_failure';
  reason: string;
  expiresAt: string | null;
}

/** Preset booking durations (minutes) offered in the reserve sheet. */
export const RESERVATION_DURATION_OPTIONS = [30, 60, 120] as const;

const ACTIVE_STATUSES: ReservationStatus[] = ['pending', 'hold', 'confirmed', 'checked_in'];

export function isReservationActive(r: MemberReservation): boolean {
  return ACTIVE_STATUSES.includes(r.status);
}

/** A hold is a live, station-locking claim window the member must confirm. */
export function isReservationHold(r: MemberReservation): boolean {
  return r.status === 'hold';
}
