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
 * Raw active session as returned by the Chrono API
 * (`GET /tenant/{branchCode}/sessions/active`).
 */
export interface RawActiveSession {
  id: string;
  stationId: string;
  stationName: string;
  startedAt: string;
  scheduledEndAt: string | null;
  status: string;
  mode: string;
}

/**
 * Raw member session-history row (`GET /member/sessions`).
 */
export interface RawMemberSession {
  id: string;
  stationId: string | null;
  stationName: string | null;
  status: string;
  mode: string;
  startedAt: string;
  scheduledEndAt: string | null;
  endedAt: string | null;
  actualDurationSeconds: number | null;
  createdAt: string;
}

const WARNING_THRESHOLD_SECONDS = 5 * 60;

/**
 * Normalize a raw active session into the shape UI components expect,
 * deriving the remaining time from `scheduledEndAt`.
 */
export function normalizeActiveSession(
  raw: RawActiveSession,
  branchName = '',
): ActiveSession {
  const end = raw.scheduledEndAt ? new Date(raw.scheduledEndAt).getTime() : 0;
  const remaining = end ? Math.max(0, Math.round((end - Date.now()) / 1000)) : 0;

  let status: SessionStatus = 'active';
  if (end && remaining <= 0) status = 'expired';
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
