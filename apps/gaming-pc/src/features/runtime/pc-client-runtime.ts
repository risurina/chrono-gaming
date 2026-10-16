import { logger } from '../../shared/logger';
import { CLIENT_CONFIG } from '../../config/client-config';
import { PcClientApi } from '../api/pc-client-api';
import { LocalStateStore, LocalClientState } from '../local-state/local-client-state';
import { getDeviceFingerprint, getDeviceInfo } from '../../lib/device';
import { native, isNative } from '../../lib/native';
import { initializeRealtime } from '../../lib/realtime';

export type RuntimeStatus =
  | 'UNPAIRED'
  | 'PENDING_APPROVAL'
  | 'AVAILABLE'
  | 'ACTIVE'
  | 'LOW_TIME'
  | 'EXPIRED'
  | 'LOCKED'
  | 'OFFLINE'
  | 'MAINTENANCE'
  | 'AWAY_LOCKED'
  | 'ERROR_SAFE_LOCKED'
  | 'SYSTEM_UPDATE'
  | 'RESERVED'
  | 'LOADING';

export class PcClientRuntime {
  private status: RuntimeStatus = 'UNPAIRED';
  private state: LocalClientState | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private statusSyncTimer: NodeJS.Timeout | null = null;
  private expiredRevertTimer: NodeJS.Timeout | null = null;
  private listeners: ((status: RuntimeStatus, state: LocalClientState) => void)[] = [];
  private startTime = Date.now();
  private isInitializing = false;
  // initializeRealtime() is called from initialize(), pair(), and
  // pollRegistrationStatus() — without this guard, pairing then getting
  // approved re-subscribes onRealtimeStateUpdated a second time, so every
  // authoritative state update runs the transition logic twice.
  private realtimeBound = false;

  async initialize() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    this.state = await LocalStateStore.load();

    const isWidget = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('windowMode') === 'widget';
    if (isWidget) {
      logger.info('Runtime running in WIDGET mode. Bypassing bootstrap/handshake.');
      this.setupWidgetSync();
      this.isInitializing = false;
      return;
    }

    const deviceInfo = await getDeviceInfo();
    const fingerprint = await getDeviceFingerprint();

    logger.info(`Runtime initialized. Fingerprint: ${fingerprint}, Hostname: ${deviceInfo.hostname}`);

    const token = await LocalStateStore.getToken();
    if (!token) {
      logger.info('No device pairing token found. Transitioning to UNPAIRED.');
      // State reset handled by Main if necessary; here we just reflect local view
      this.transition('UNPAIRED');
      this.isInitializing = false;
      return;
    }

    // Try to authenticate using hardware fingerprint and tokenHash
    const result = await PcClientApi.authDevice({
      fingerprintV1: fingerprint,
      hostname: deviceInfo.hostname,
      tokenHash: token,
    });

    if (result.success && result.data) {
      const serverStatus = result.data.status;
      logger.info(`PC client authenticated. Status: ${serverStatus}`);

      this.state = await LocalStateStore.load();

      if (serverStatus === 'APPROVED') {
        const synced = await this.syncConfig();
        this.state = await LocalStateStore.load();

        if (this.state.activeSessionId) {
          this.transition('ACTIVE');
        } else if (this.state.activeReservation) {
          this.transition('RESERVED');
        } else {
          this.transition(synced ? 'AVAILABLE' : 'OFFLINE');
        }

        this.startCountdown();
        this.initializeRealtime();
      } else if (serverStatus === 'PENDING_APPROVAL') {
        this.transition('PENDING_APPROVAL');
        this.startStatusSync();
      } else {
        this.transition('UNPAIRED');
      }
    } else {
      // Authentication failed/invalid token on backend
      logger.warn(`PC client auth failed: ${result.error || 'Unknown error'}. Transitioning to UNPAIRED.`);
      this.transition('UNPAIRED');
    }
    this.isInitializing = false;
  }

  private async initializeRealtime() {
    if (this.state?.tenantId && this.state?.branchId && this.state?.pcId) {
      await initializeRealtime(this.state.tenantId, this.state.branchId, this.state.pcId);

      if (this.realtimeBound) return;
      this.realtimeBound = true;

      // Listen for authoritative state updates from Tauri core
      native.pcClient.onRealtimeStateUpdated(async (newState: LocalClientState) => {
        logger.info('Runtime: Authoritative state sync from Main');
        const oldStatus = this.status;
        this.state = newState;

        // Handle Maintenance Mode Priority
        if (newState.isMaintenance) {
          this.transition('MAINTENANCE');
          return;
        }

        // Handle Safe Locked State (Security/Hardening)
        if (newState.lockState === 'SAFE_LOCKED') {
          this.transition('ERROR_SAFE_LOCKED');
          return;
        }

        // Map lockState to runtime status if needed
        if (newState.lockState === 'LOCKED') {
          // If we were active or low time, transition to EXPIRED first for UI feedback
          if (oldStatus === 'ACTIVE' || oldStatus === 'LOW_TIME') {
            this.transition('EXPIRED');
          } else if (newState.activeReservation) {
            this.transition('RESERVED');
          } else {
            this.transition('AVAILABLE');
          }
        } else if (newState.lockState === 'AWAY_LOCKED') {
          this.transition('AWAY_LOCKED');
          this.startCountdown();
        } else if (newState.lockState === 'UNLOCKED' && this.status !== 'ACTIVE') {
          this.transition('ACTIVE');
          this.startCountdown();
        } else {
          // Revert to AVAILABLE if was in MAINTENANCE but flag cleared
          if (oldStatus === 'MAINTENANCE' && !newState.isMaintenance) {
            this.transition('AVAILABLE');
          } else {
            // Self-healing: if state is unlocked but no session, it's ambiguous
            if (newState.lockState === 'UNLOCKED' && !newState.activeSessionId) {
              logger.error('[Runtime] Ambiguous state detected: UNLOCKED without activeSessionId. Triggering SAFE_LOCKED.');
              this.transition('ERROR_SAFE_LOCKED');
              return;
            }
            this.notify();
          }
        }
      });
    }
  }

  getStatus() {
    return this.status;
  }

  getState() {
    return this.state;
  }

  goToLogin() {
    if (this.status === 'EXPIRED') {
      logger.info('[Runtime] Manually transitioned from EXPIRED to AVAILABLE');
      this.transition('AVAILABLE');
    }
  }

  subscribe(listener: (status: RuntimeStatus, state: LocalClientState) => void) {
    this.listeners.push(listener);
    if (this.state) listener(this.status, this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private transition(newStatus: RuntimeStatus) {
    // Guards to prevent triggering update or loading while system is locked
    if ((newStatus === 'SYSTEM_UPDATE' || newStatus === 'LOADING') && this.state?.lockState === 'LOCKED') {
      logger.warn(`[Runtime] Guard blocked transition to ${newStatus} while system is LOCKED`);
      return;
    }

    logger.info(`Runtime transition: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
    if (newStatus === 'ACTIVE' || newStatus === 'LOW_TIME') {
      this.startCountdown();
    } else {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }

    if (this.expiredRevertTimer) {
      clearTimeout(this.expiredRevertTimer);
      this.expiredRevertTimer = null;
    }
    if (newStatus === 'EXPIRED') {
      this.expiredRevertTimer = setTimeout(() => {
        this.expiredRevertTimer = null;
        if (this.status === 'EXPIRED') {
          logger.info('[Runtime] Auto-transition from EXPIRED to AVAILABLE');
          this.transition('AVAILABLE');
        }
      }, 10000);
    }

    if (this.state) {
      this.state.lastKnownStatus = newStatus;
      LocalStateStore.save(this.state);
    }

    this.notify();
  }

  private applyActiveSessionFromServer(data: {
    activeSessionId?: string;
    activeSession?: {
      id: string;
      startedAt?: string;
      scheduledEndAt?: string;
      customerName?: string;
      profileUrl?: string | null;
      remainingBalance?: string;
      hourlyRate?: number;
      creditMinutesRemaining?: number;
      walletMinutesRemaining?: number;
      totalMinutesRemaining?: number;
      sessionCost?: string;
    } | null;
    scheduledEndAt?: string;
    startedAt?: string;
    customerName?: string;
    profileUrl?: string | null;
    remainingBalance?: string;
    hourlyRate?: number;
    creditMinutesRemaining?: number;
    walletMinutesRemaining?: number;
    totalMinutesRemaining?: number;
    sessionCost?: string;
  }) {
    if (!this.state) return;

    const activeSession = data.activeSession;
    this.state.activeSessionId = data.activeSessionId || activeSession?.id;
    this.state.scheduledEndAt = data.scheduledEndAt || activeSession?.scheduledEndAt;
    this.state.activeSessionData = {
      customerName: data.customerName || activeSession?.customerName || 'Customer',
      profileUrl: data.profileUrl !== undefined ? data.profileUrl : activeSession?.profileUrl,
      startedAt: data.startedAt || activeSession?.startedAt || new Date().toISOString(),
      remainingBalance: data.remainingBalance || activeSession?.remainingBalance || '₱0.00',
      hourlyRate: data.hourlyRate ?? activeSession?.hourlyRate,
      creditMinutesRemaining: data.creditMinutesRemaining ?? activeSession?.creditMinutesRemaining,
      walletMinutesRemaining: data.walletMinutesRemaining ?? activeSession?.walletMinutesRemaining,
      totalMinutesRemaining: data.totalMinutesRemaining ?? activeSession?.totalMinutesRemaining,
      sessionCost: data.sessionCost ?? activeSession?.sessionCost,
    };
    this.state.lockState = 'UNLOCKED';
  }

  private clearActiveSessionFromServer() {
    if (!this.state) return;

    this.state.activeSessionId = undefined;
    this.state.scheduledEndAt = undefined;
    this.state.activeSessionData = undefined;
    this.state.lockState = 'LOCKED';
  }

  private notify() {
    if (this.state) {
      this.listeners.forEach(l => l(this.status, this.state!));
    }
  }

  async pair(pairingCode: string) {
    logger.info('Attempting manual device pairing...');
    const result = await PcClientApi.pairDevice({ pairingCode });

    if (result.success && result.data) {
      const { tokenHash } = result.data;
      logger.info('Pairing successful. Token received.');

      // Now authenticate the device immediately to register it
      const fingerprint = await getDeviceFingerprint();
      const deviceInfo = await getDeviceInfo();

      const authResult = await PcClientApi.authDevice({
        fingerprintV1: fingerprint,
        hostname: deviceInfo.hostname,
        tokenHash: tokenHash,
      });

      if (authResult.success && authResult.data) {
        const serverStatus = authResult.data.status;
        logger.info(`Authentication successful after pairing. Status: ${serverStatus}`);

        // Tauri core handles persisting token and state from pairDevice and authDevice.
        // We just need to trigger the config sync to get full device details.
        await this.syncConfig();
        this.state = await LocalStateStore.load();

        if (serverStatus === 'PENDING_APPROVAL') {
          this.transition('PENDING_APPROVAL');
          this.startStatusSync();
        } else if (serverStatus === 'APPROVED') {
          this.transition(this.state.activeSessionId ? 'ACTIVE' : this.state.activeReservation ? 'RESERVED' : 'AVAILABLE');
          this.initializeRealtime();
        } else {
          this.transition('UNPAIRED');
        }
      } else {
        logger.error(`Authentication failed after pairing: ${authResult.error}`);
        this.transition('UNPAIRED');
        return { success: false, error: authResult.error || 'Authentication failed after pairing' };
      }
    }
    return result;
  }

  async syncConfig(): Promise<boolean> {
    const token = await LocalStateStore.getToken();
    if (!token) return false;

    const result = await PcClientApi.getDeviceStatus();
    if (result.success && result.data) {
      const serverStatus = result.data.status;
      logger.info(`syncConfig: Device status from server: ${serverStatus}`);

      // Tauri core handles persisting and broadcasting updated state
      // from getDeviceStatus response.
      this.state = await LocalStateStore.load();
      return true;
    } else if (result.error === 'DEVICE_REVOKED') {
      // Server rejected the device credential (revoked/disabled). The Tauri core
      // has already cleared the stored token; reflect it as UNPAIRED rather than
      // OFFLINE so the operator knows the device must be re-paired.
      logger.warn('Device revoked by server. Transitioning to UNPAIRED.');
      this.transition('UNPAIRED');
      return false;
    } else {
      // Network error or invalid token
      if (this.status !== 'UNPAIRED' && this.status !== 'PENDING_APPROVAL') {
        this.transition('OFFLINE');
      }
      return false;
    }
  }

  private async pollRegistrationStatus(): Promise<boolean> {
    const token = await LocalStateStore.getToken();
    if (!token) {
      logger.warn('pollRegistrationStatus: No device token found.');
      this.transition('UNPAIRED');
      return false;
    }
    const fingerprint = await getDeviceFingerprint();
    const result = await PcClientApi.authDevice({
      fingerprintV1: fingerprint,
      tokenHash: token
    });

    if (result.success && result.data) {
      const serverStatus = result.data.status;
      if (serverStatus === 'APPROVED') {
        logger.info('PC client approved.');
        // Tauri core authDevice handles state updates and broadcast
        await this.syncConfig();
        this.initializeRealtime();
        return true;
      } else if (serverStatus === 'REJECTED' || serverStatus === 'REVOKED' || serverStatus === 'SUSPENDED') {
        logger.warn(`Device registration was ${serverStatus}. State reset handled by Main.`);
        this.transition('UNPAIRED');
        return true;
      }
    } else {
      logger.warn(`pollRegistrationStatus auth failed: ${result.error}. Transitioning to UNPAIRED.`);
      this.transition('UNPAIRED');
      return true;
    }
    return false;
  }

  private startStatusSync() {
    // Guard against a second overlapping poll loop if this is called again
    // (e.g. initialize() then pollRegistrationStatus()) while one is already
    // running for the same PENDING_APPROVAL window.
    if (this.statusSyncTimer) {
      clearInterval(this.statusSyncTimer);
    }
    // Poll status more frequently when pending approval
    this.statusSyncTimer = setInterval(async () => {
      if (this.status !== 'PENDING_APPROVAL') {
        if (this.statusSyncTimer) {
          clearInterval(this.statusSyncTimer);
          this.statusSyncTimer = null;
        }
        return;
      }
      await this.pollRegistrationStatus();
    }, 5000);
  }

  private startCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      if (!this.state?.scheduledEndAt) return;

      const endAt = new Date(this.state.scheduledEndAt).getTime();
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.floor((endAt - now) / 1000));

      if (remainingSeconds <= 0) {
        if (this.status === 'ACTIVE' || this.status === 'LOW_TIME') {
          logger.info('Countdown: Time is up. Transitioning to EXPIRED.');
          this.transition('EXPIRED');
        }
      } else if (remainingSeconds < CLIENT_CONFIG.LOW_TIME_THRESHOLD_S) {
        if (this.status === 'ACTIVE') {
          this.transition('LOW_TIME');
        } else {
          // Push tick so UI can update remaining time display
          this.notify();
        }
      } else {
        // Push tick so UI can update remaining time display every second
        this.notify();
      }
    }, 1000);
  }

  // Used by command executor to change state
  forceStatus(s: RuntimeStatus) {
    this.transition(s);
  }

  private setupWidgetSync() {
    // 1. Initial status mapping
    if (this.state) {
      if (this.state.isMaintenance) {
        this.status = 'MAINTENANCE';
      } else if (this.state.lockState === 'UNLOCKED') {
        this.status = 'ACTIVE';
        if (this.state.scheduledEndAt) {
          const endAt = new Date(this.state.scheduledEndAt).getTime();
          const remainingSeconds = Math.max(0, Math.floor((endAt - Date.now()) / 1000));
          if (remainingSeconds < CLIENT_CONFIG.LOW_TIME_THRESHOLD_S) {
            this.status = 'LOW_TIME';
          }
        }
      } else {
        this.status = 'AVAILABLE';
      }
      this.notify();

      if (this.status === 'ACTIVE' || this.status === 'LOW_TIME') {
        this.startCountdown();
      }
    }

    // 2. Listen for authoritative updates from the Tauri core
    if (isNative()) {
      native.pcClient.onRealtimeStateUpdated(async (newState: LocalClientState) => {
        logger.info('Widget Runtime: Authoritative state sync from Main');
        this.state = newState;

        if (newState.isMaintenance) {
          this.transition('MAINTENANCE');
          return;
        }

        if (newState.lockState === 'LOCKED') {
          this.transition('AVAILABLE');
        } else if (newState.lockState === 'UNLOCKED') {
          const oldStatus = this.status;
          if (oldStatus !== 'ACTIVE' && oldStatus !== 'LOW_TIME') {
            this.transition('ACTIVE');
            this.startCountdown();
          }
        } else {
          this.notify();
        }
      });
    }
  }
}

export const runtime = new PcClientRuntime();
