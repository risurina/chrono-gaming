import { logger } from '../shared/logger';
import { executeCommand, Command } from '../features/commands/executor';
import { CLIENT_CONFIG } from '../config/client-config';
import { native, isNative } from './native';
import { getDeviceFingerprint } from './device';

let initialized = false;
let listenersBound = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;
let retryDelayMs = INITIAL_RETRY_DELAY_MS;

/** Bind the Tauri-core event bridges exactly once (they survive init retries). */
function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  // Listen for device commands forwarded by Tauri core
  native.pcClient.onDeviceCommand(async (command: Command) => {
    try {
      // Execute UI-side effects/sync
      await executeCommand(command);

      // No need to ACK here - the Tauri core RealtimeManager handles authoritative ACKing
    } catch (err) {
      logger.error('Failed to process incoming device command side-effects:', err);
    }
  });

  // Listen for connection status changes
  native.pcClient.onRealtimeStatusChange((payload: { status: string; error?: string }) => {
    if (payload.status === 'connected') {
      logger.info('Realtime: Connected (via Main)');
    } else if (payload.status === 'disconnected') {
      logger.warn('Realtime: Disconnected');
    } else if (payload.status === 'error') {
      logger.error('Realtime: Connection Error:', payload.error);
    }
  });
}

/** Schedule a capped exponential-backoff retry (5s → 60s) of initialization. */
function scheduleRetry(tenantId: string, branchId: string, pcId: string) {
  if (retryTimer) return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  logger.warn(`Realtime: initialization failed; retrying in ${Math.round(delay / 1000)}s`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void initializeRealtime(tenantId, branchId, pcId);
  }, delay);
}

/**
 * Initialize realtime via the Tauri core, which owns the WebSocket connection.
 * The renderer no longer maintains a direct Socket.IO connection.
 *
 * The Rust `realtime_initialize` command returns `{ success, error }` without
 * throwing — the result MUST be checked. On failure `initialized` stays false
 * and the call is retried with capped exponential backoff.
 */
export const initializeRealtime = async (tenantId: string, branchId: string, pcId: string) => {
  if (initialized) return;

  if (!isNative()) {
    logger.error('Realtime: native API not available. Cannot initialize.');
    return;
  }

  const apiUrl = new URL(CLIENT_CONFIG.API_BASE_URL).origin || 'https://chrono.api.izur.com.ph';

  // Connect with persistent device token for socket authentication
  const token = await native.getDeviceToken();

  if (!token) {
    logger.error('Realtime: Authorization token missing. Cannot connect.');
    scheduleRetry(tenantId, branchId, pcId);
    return;
  }

  // The server's device-auth handshake path matches on token + fingerprint
  // (see apps/chrono-api/src/realtime/socket.ts) — branchId/pcId aren't used
  // there, but are still accepted for forward compatibility.
  const fingerprint = await getDeviceFingerprint();

  logger.info('Realtime: Requesting initialization via Tauri core...');

  bindListeners();

  try {
    const result = await native.pcClient.initializeRealtime({
      apiUrl,
      deviceToken: token,
      fingerprint,
      branchId,
      pcId,
    });

    if (!result?.success) {
      logger.error('Realtime: initialization rejected by Tauri core:', result?.error);
      scheduleRetry(tenantId, branchId, pcId);
      return;
    }

    initialized = true;
    retryDelayMs = INITIAL_RETRY_DELAY_MS;
    logger.info('Realtime: initialized');
  } catch (err) {
    logger.error('Failed to initialize Realtime bridge:', err);
    scheduleRetry(tenantId, branchId, pcId);
  }
};

export const getSocket = () => {
  logger.warn('Realtime: getSocket() called in Renderer, but socket is now in Tauri core.');
  return null;
};
