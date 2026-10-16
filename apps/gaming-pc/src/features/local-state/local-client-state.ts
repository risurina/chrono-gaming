import {
  getLocalClientState as getPersistedState,
  getDeviceToken
} from '../../lib/storage';
import type { CleanupPolicy } from '@chrono/shared';

export interface ActiveSessionData {
  customerName: string;
  profileUrl?: string | null;
  startedAt: string;
  remainingBalance: string;
  hourlyRate?: number;
  creditMinutesRemaining?: number;
  walletMinutesRemaining?: number;
  totalMinutesRemaining?: number;
  sessionCost?: string;
}

export interface PricingRule {
  type?: string;
  price?: number | string;
}

export interface ActiveReservationData {
  id: string;
  customerName: string;
  startTime: string;
  endTime: string;
  graceExpiresAt?: string;
  // Phase 3b: this "reservation" is a billed, screen-locked session awaiting the
  // owner's login (which resumes it). Purely informational on the client.
  awaitingLogin?: boolean;
  // Phase 7: a free, unbilled hold for a member who ran out of balance while a queue
  // was waiting — the locked screen offers top-up / extend / leave.
  topUpGrace?: boolean;
}

/**
 * Local durable state for the PC client
 */
export interface LocalClientState {
  deviceId: string;
  tenantId: string;
  branchId: string;
  branchName?: string;
  fingerprintV1?: string;
  pcId?: string;
  stationName?: string;
  approvalStatus: 'UNPAIRED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  lockState: 'LOCKED' | 'UNLOCKED' | 'SAFE_LOCKED' | 'AWAY_LOCKED';
  activeSessionId?: string;
  scheduledEndAt?: string; // ISO string
  activeSessionData?: ActiveSessionData;
  activeReservation?: ActiveReservationData | null;
  lastTrustedServerAt?: string; // ISO string
  lastHeartbeatAt?: string; // ISO string
  lastHeartbeatLatencyMs?: number;
  offlineQueue: unknown[]; // Deprecated: move to OfflineQueue
  lastKnownStatus?: string;
  tamperFlags: string[];
  isMaintenance?: boolean;
  // Opaque tenant-configured JSON, rendered structurally (JSON Render) rather
  // than accessed by field here — `unknown` forces call sites to narrow
  // before use instead of silently accepting any shape.
  uiConfig?: Record<string, unknown> | null;
  tenantHeroSlide?: {
    icon: 'platform' | 'event' | 'promo' | 'social';
    eyebrow: string;
    title: string;
    description: string;
    detail: string;
    backgroundImage?: string;
  } | null;
  specs?: Record<string, unknown>;
  deviceGroup?: {
    code?: string;
    name: string;
    description: string | null;
  } | null;
  pricingRules?: PricingRule[];
  cleanupPolicy?: CleanupPolicy | null;
  kioskPolicy?: { disableTaskManager?: boolean; disableCli?: boolean } | null;
  seenCommandIds?: Record<string, number>; // commandId -> expiresAt timestamp
  seenCommandNonces?: Record<string, number>; // nonce -> expiresAt timestamp
}

const DEFAULT_STATE: LocalClientState = {
  deviceId: '',
  tenantId: '',
  branchId: '',
  approvalStatus: 'UNPAIRED',
  lockState: 'LOCKED',
  offlineQueue: [],
  tamperFlags: [],
  uiConfig: null,
  fingerprintV1: undefined,
  seenCommandIds: {},
  seenCommandNonces: {},
};

export class LocalStateStore {
  private static currentState: LocalClientState | null = null;

  static async load(): Promise<LocalClientState> {
    const persisted = await getPersistedState();
    this.currentState = persisted || { ...DEFAULT_STATE };
    return this.currentState!;
  }

  static async save(state: Partial<LocalClientState>): Promise<void> {
    if (!this.currentState) await this.load();
    this.currentState = { ...this.currentState!, ...state };
  }

  static async get(): Promise<LocalClientState> {
    if (!this.currentState) return await this.load();
    return this.currentState;
  }

  static async getToken(): Promise<string | null> {
    return await getDeviceToken();
  }
}
