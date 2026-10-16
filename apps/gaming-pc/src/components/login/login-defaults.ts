import { StationStatus } from '../../types/pc-client';

export const tenantLoginDefaults = {
  tenantName: 'IZUR Gaming Lounge & Kafe',
  branchLocation: 'San Jose Del Monte, Bulacan',
  platformName: 'CHRONO',
  platformTagline: 'Gaming Lounge Platform',
  qrRefreshSeconds: 300,
};

export type LoginSlide = {
  icon: 'platform' | 'event' | 'promo' | 'social' | 'monitor';
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  backgroundImage?: string;
};

export const loginSlides: LoginSlide[] = [
  {
    icon: 'monitor',
    eyebrow: 'GAMING LOUNGE & CAFÉ',
    title: 'PLAY, COMPETE, and CHILL @ IZUR',
    description: 'High-end rigs, cozy vibes, and epic tournaments—all powered by Chrono. Perfect for PC gamers who want the best.',
    detail: 'Powered by Chrono Platform',
  },
  {
    icon: 'social',
    eyebrow: 'Follow Us',
    title: '@izurgamingloungekafe',
    description: 'Get tournament announcements, promos, and station availability updates.',
    detail: 'IZUR Gaming Lounge & Kafe',
  },
];

export function isConnectionError(error?: string | null): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('network error') ||
    normalized.includes('error sending request') ||
    normalized.includes('connection error') ||
    normalized.includes('no internet')
  );
}

export function formatStationLabel(stationId: string) {
  const numeric = stationId.match(/\d+/)?.[0];
  return numeric ? `PC #${Number(numeric)}` : 'PC Station';
}

export function formatStationStatus(status: StationStatus) {
  if (status === 'available') return 'Ready to Play';
  if (status === 'reserved') return 'Reserved';
  if (status === 'maintenance') return 'Maintenance';
  if (status === 'offline') return 'Offline';
  return 'Available';
}
