export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FULFILLED';

export interface MemberReservation {
  id: string;
  branchId: string | null;
  stationId: string;
  status: ReservationStatus;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  fromQueue: boolean;
  availableAt: string | null;
  graceExpiresAt: string | null;
  stationName: string | null;
  stationNumber: string | null;
  createdAt: string;
  queuePosition: number | null;
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

export interface ReservationRestrictions {
  reservationBan: { reason: string; expiresAt: string | null } | null;
  queueBan: { reason: string; expiresAt: string | null } | null;
}

/** Preset booking durations (minutes) offered in the reserve sheet. */
export const RESERVATION_DURATION_OPTIONS = [30, 60, 120] as const;

const ACTIVE_STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

export function isReservationActive(r: MemberReservation): boolean {
  return ACTIVE_STATUSES.includes(r.status);
}
