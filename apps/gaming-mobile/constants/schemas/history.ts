import { RawMemberSession } from './session';

export interface SessionHistoryItem {
  id: string;
  date: string;
  branchName: string;
  stationName: string;
  durationMinutes: number;
  cost: number;
  status: 'completed' | 'ongoing';
}

/**
 * Map a raw member session summary (`GET /portal/sessions/`) to the history UI
 * shape. The summary is tenant-scoped (not branch-scoped), so the station name
 * headlines the row. gaming-api session status is `active | paused | ended`:
 * `ended` sessions are finished ("completed"); everything else is in progress
 * ("ongoing").
 *
 * NOTE: `RawMemberSession` is a hand-written interface with no runtime
 * validation, so it can silently drift from the API serializer.
 *
 * Money: `amountCharged` is the server's decimal string (null for an unbilled,
 * still-running session). It is coerced to a number only at this display
 * boundary.
 */
export function normalizeMemberSession(raw: RawMemberSession): SessionHistoryItem {
  const durationMinutes = raw.actualBillableSeconds
    ? Math.round(raw.actualBillableSeconds / 60)
    : 0;
  const status: SessionHistoryItem['status'] = raw.status === 'ended' ? 'completed' : 'ongoing';

  return {
    id: raw.id,
    date: raw.startedAt,
    branchName: raw.stationName || 'Session',
    stationName: '',
    durationMinutes,
    cost: Number(raw.amountCharged ?? 0) || 0,
    status,
  };
}
