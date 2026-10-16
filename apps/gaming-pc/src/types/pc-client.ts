export type StationStatus =
  | 'available'
  | 'active'
  | 'lowTime'
  | 'expired'
  | 'locked'
  | 'maintenance'
  | 'reserved'
  | 'offline';

export interface SessionViewModel {
  sessionId?: string;
  stationId: string;
  stationName?: string;
  deviceName?: string;
  branchName: string;
  customerName: string;
  profileUrl?: string | null;
  status: StationStatus;
  timeRemainingSeconds: number;
  startedAt?: string;
  endsAt?: string;
  remainingBalance?: string;
  hourlyRate?: string;
  totalMinutesRemaining?: number;
  sessionCost?: string;
  latencyMs?: number;
  message?: string;
  tenantHeroSlide?: {
    icon: 'platform' | 'event' | 'promo' | 'social';
    eyebrow: string;
    title: string;
    description: string;
    detail: string;
    backgroundImage?: string;
  } | null;
  specs?: {
    cpu?: string;
    gpu?: string;
    ram?: string;
  } | null;
  deviceGroup?: {
    code?: string;
    name: string;
    description: string | null;
  } | null;
  pricingRules?: any[];
}
