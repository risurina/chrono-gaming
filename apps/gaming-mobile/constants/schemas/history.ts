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
 * Map a raw member session (`GET /member/sessions`) to the history UI shape.
 * The endpoint is not branch-scoped, so branch name is not available; the
 * station name headlines the row and the session mode is shown as detail.
 *
 * The API session status enum is ACTIVE | PAUSED | ENDED | AWAY_LOCKED:
 * ENDED sessions are finished ("completed"); everything else is still in
 * progress ("ongoing").
 *
 * NOTE: `RawMemberSession` is a hand-written interface with no runtime
 * validation, so it can silently drift from the API serializer.
 *
 * Money: `cost` is a hard-coded placeholder (0) — this endpoint does not return
 * a session cost yet, so no float arithmetic is performed on money here. When
 * the API begins returning a cost, keep it as the server's decimal string and
 * avoid float math (see `normalizeTransaction` in `wallet.ts`).
 */
export function normalizeMemberSession(raw: RawMemberSession): SessionHistoryItem {
  const durationMinutes = raw.actualDurationSeconds
    ? Math.round(raw.actualDurationSeconds / 60)
    : 0;
  const status: SessionHistoryItem['status'] = raw.status === 'ENDED' ? 'completed' : 'ongoing';

  return {
    id: raw.id,
    date: raw.startedAt || raw.createdAt,
    branchName: raw.stationName || 'Session',
    stationName: raw.mode || '',
    durationMinutes,
    cost: 0,
    status,
  };
}
