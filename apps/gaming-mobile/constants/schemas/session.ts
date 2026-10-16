export type SessionStatus = 'active' | 'warning' | 'expired' | 'none';

export interface ActiveSession {
  status: SessionStatus;
  timeRemainingSeconds: number;
  branchName: string;
  stationName: string;
  startTime: string;
  estimatedEndTime: string;
  costSoFar: number;
}

/**
 * Raw active session as returned by gaming-api
 * (`GET /portal/sessions/active` → `{ session }`). Status is `active | paused`.
 */
export interface RawActiveSession {
  id: string;
  stationId: string;
  stationName: string;
  status: 'active' | 'paused';
  startedAt: string;
  scheduledEndAt: string | null;
}

/**
 * Raw member session-summary row (`GET /portal/sessions/` → `{ items }`), via
 * gaming-api's `toPortalSessionSummary`. Money is a decimal string; timestamps
 * are ISO strings.
 */
export interface RawMemberSession {
  id: string;
  stationId: string;
  stationName: string;
  status: 'active' | 'paused' | 'ended';
  startedAt: string;
  scheduledEndAt: string | null;
  endedAt: string | null;
  actualBillableSeconds: number | null;
  amountCharged: string | null;
  currency: string;
}

const WARNING_THRESHOLD_SECONDS = 5 * 60;

/**
 * Normalize a raw active session into the shape UI components expect,
 * deriving the remaining time from `scheduledEndAt`.
 *
 * Status map: `active` → active, `paused` → warning, and any session already
 * past its `scheduledEndAt` → expired.
 */
export function normalizeActiveSession(
  raw: RawActiveSession,
  branchName = '',
): ActiveSession {
  const end = raw.scheduledEndAt ? new Date(raw.scheduledEndAt).getTime() : 0;
  const remaining = end ? Math.max(0, Math.round((end - Date.now()) / 1000)) : 0;

  let status: SessionStatus = 'active';
  if (end && remaining <= 0) status = 'expired';
  else if (raw.status === 'paused') status = 'warning';
  else if (end && remaining <= WARNING_THRESHOLD_SECONDS) status = 'warning';

  return {
    status,
    timeRemainingSeconds: remaining,
    branchName,
    stationName: raw.stationName,
    startTime: raw.startedAt,
    estimatedEndTime: raw.scheduledEndAt ?? '',
    costSoFar: 0,
  };
}
