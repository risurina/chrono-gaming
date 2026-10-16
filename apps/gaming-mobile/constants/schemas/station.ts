export type StationStatus = 'available' | 'inUse' | 'reserved' | 'maintenance' | 'locked' | 'offline';

export interface PublicStation {
  id: string;
  stationCode: string;
  status: StationStatus;
  connectivityStatus?: 'ONLINE' | 'OFFLINE' | 'SLEEP' | 'CONNECTING' | 'UNSTABLE' | null;
  branchName?: string;
  branchCode?: string;
  specs?: {
    cpu?: string;
    gpu?: string;
    ram?: string;
    monitorHz?: number;
  };
  updatedAt: string;
  scheduledEndAt?: string | null;
  currentSessionLabel?: string | null;
  hourlyRate?: number | null;
  currency?: string;
  reservationStatus?: 'held' | 'queued' | null;
  queueLength?: number;
}

export interface StationAvailabilitySummary {
  available: number;
  inUse: number;
  reserved: number;
  maintenance: number;
  offline?: number;
}

export interface StationAvailabilityResponse {
  summary: StationAvailabilitySummary;
  stations: PublicStation[];
  updatedAt: string;
}

export const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  available: 'Available',
  inUse: 'In Use',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
  locked: 'Locked',
  offline: 'Offline',
};

/** A station a member can reserve right now. */
export function isStationReservable(station: PublicStation): boolean {
  return station.status === 'available';
}
