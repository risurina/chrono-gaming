/**
 * PC Client configuration
 */
const getEnv = (key: string, fallback: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (val) return val;
    }
  } catch (e) {}

  // Handle Node.js environment
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return fallback;
};

const isDevMode = (): boolean => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env.MODE === 'development';
    }
  } catch (e) {}
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
};

export const CLIENT_CONFIG = {
  // API base URL - robustly handles environment variables and prefixes
  get API_BASE_URL(): string {
    const apiBase = getEnv('VITE_API_BASE_URL', isDevMode() ? 'http://localhost:3001' : 'https://chrono.api.izur.com.ph');
    // Ensure the /api/v1/device prefix is present if not already included in the env var
    return apiBase.includes('/api/v1/device') ? apiBase : `${apiBase.replace(/\/$/, '')}/api/v1/device`;
  },

  // Heartbeat interval in milliseconds
  HEARTBEAT_INTERVAL_MS: 30000, // 30 seconds

  // Status sync interval in milliseconds
  STATUS_SYNC_INTERVAL_MS: 60000, // 1 minute

  // Offline queue limit
  OFFLINE_QUEUE_LIMIT: 100,

  // Low-time warning threshold in seconds
  LOW_TIME_THRESHOLD_S: 300, // 5 minutes

  // Dev mode flag
  get IS_DEV(): boolean {
    return isDevMode();
  },

  // Client version, injected by vite.config.ts from package.json (the single
  // source of truth — tauri.conf.json `version` points there too). The
  // fallback is deliberately not a real version so a broken injection is
  // visible on screen instead of silently showing a stale number.
  VERSION: getEnv('VITE_APP_VERSION', '0.0.0-dev'),
};
