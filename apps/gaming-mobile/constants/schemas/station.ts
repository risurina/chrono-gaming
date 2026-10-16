export type StationStatus = 'available' | 'occupied' | 'maintenance' | 'offline';

/**
 * A station as returned by gaming-api `GET /public/stations` (grouped under its
 * branch). The public contract is deliberately thin — no rate/queue data.
 */
export interface PublicStation {
  id: string;
  name: string;
  stationNumber: string;
  stationType: string;
  status: StationStatus;
}

export interface StationAggregate {
  total: number;
  available: number;
  inUse: number;
  occupied: number;
  unavailable: number;
}

export interface BranchStations {
  id: string;
  name: string;
  code: string;
  aggregate: StationAggregate;
  stations: PublicStation[];
}

/**
 * `GET /public/stations` response — a top-level aggregate plus per-branch groups.
 */
export interface StationAvailabilityResponse {
  aggregate: StationAggregate;
  branches: BranchStations[];
}

export const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  available: 'Available',
  occupied: 'In Use',
  maintenance: 'Maintenance',
  offline: 'Offline',
};

/** Flatten every branch's stations into a single list for grid rendering. */
export function getAllStations(res: StationAvailabilityResponse): PublicStation[] {
  return res.branches.flatMap((b) => b.stations);
}

/** Display label for a station — its name, falling back to its number. */
export function stationLabel(station: PublicStation): string {
  return station.name || `#${station.stationNumber}`;
}

/** A station a member can reserve right now. */
export function isStationReservable(station: PublicStation): boolean {
  return station.status === 'available';
}
