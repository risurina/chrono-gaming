/**
 * Native API — the single module through which the renderer talks to the Tauri
 * Rust core via `invoke()` / `listen()`. Every method name and payload shape is
 * defined by the `ChronoNativeApi` contract in `types/native.ts`.
 *
 * Tauri maps camelCase JS command args to snake_case Rust parameters, so the
 * argument objects below line up with the `#[tauri::command]` signatures.
 *
 * Import and call it directly — `import { native } from "../lib/native"` — there
 * is no `window` global.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ChronoNativeApi } from "../types/native";

const CLIENT_VERSION = "0.1.0";

/** Rust `local-client-state:updated` event → renderer state listeners. */
const STATE_UPDATED_EVENT = "local-client-state:updated";
const REALTIME_COMMAND_EVENT = "realtime:command";
const REALTIME_STATUS_EVENT = "realtime:status-change";

/**
 * True when running inside the Tauri webview (i.e. the native core is available).
 * Lets pure-browser contexts (e.g. `vite dev` in a plain browser) fall back
 * gracefully instead of throwing on `invoke()`.
 */
export function isNative(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Subscribe to a Tauri event, returning an unsubscribe fn. */
function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  const unlistenPromise = listen<T>(event, (e) => callback(e.payload));
  return () => {
    unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
  };
}

export const native: ChronoNativeApi = {
  getDeviceFingerprint: () => invoke<string>("get_device_fingerprint"),

  getDeviceInfo: async () => {
    // Rust returns { hostname, platform, arch, fingerprint }; reshape to the
    // renderer's { hostname, osVersion, clientVersion } contract.
    const info = await invoke<{ hostname: string; platform: string; arch: string }>(
      "get_device_info",
    );
    return {
      hostname: info.hostname,
      osVersion: `${info.platform} ${info.arch}`.trim(),
      clientVersion: CLIENT_VERSION,
    };
  },

  getDeviceToken: () => invoke<string | null>("get_device_token"),

  getLocalClientState: () => invoke<unknown>("get_local_client_state"),

  executeAllowedCommand: (command) =>
    invoke<{ success: boolean; error?: string; data?: unknown }>(
      "execute_allowed_command",
      { command },
    ),

  restartClientUI: () => {
    void invoke("restart_client_ui");
  },

  pcClient: {
    pairDevice: (payload) => invoke("pair_device", { payload }),
    authDevice: (payload) => invoke("auth_device", { payload }),
    // The device credential is resolved by the Rust core internally for all
    // of these — the renderer never supplies it (see commands/api.rs).
    getDeviceStatus: () => invoke("get_device_status"),
    sendHeartbeat: (payload) =>
      invoke("send_heartbeat", { payload: payload.payload }),
    generateQrToken: (payload) =>
      invoke("generate_qr_token", { fingerprint: payload.fingerprint }),
    fetchPendingCommands: () => invoke("fetch_pending_commands"),
    ackCommand: (payload) =>
      invoke("ack_command", {
        commandId: payload.commandId,
        result: payload.result,
      }),
    reportSecurityAlert: (payload) =>
      invoke("report_security_alert", { payload: payload.payload }),
    userLogin: (payload) => invoke("user_login", { payload }),
    startSession: (payload) => invoke("start_session", { payload }),
    endSession: (payload) => invoke("end_session", { sessionId: payload.sessionId }),
    lockSession: (payload) => invoke("lock_session", { sessionId: payload.sessionId }),
    unlockSession: (payload) =>
      invoke("unlock_session", { sessionId: payload.sessionId, password: payload.password }),
    extendGrace: (payload) =>
      invoke("extend_grace", { reservationId: payload.reservationId }),
    leaveGrace: (payload) => invoke("leave_grace", { reservationId: payload.reservationId }),

    getGames: () => invoke("get_games"),
    launchGame: (id) => invoke("launch_game", { id }),
    executeAllowedCommand: (command) =>
      invoke("execute_allowed_command", { command }),

    // Realtime — the Rust core owns the socket.io connection; these bind the
    // event bridge that carries its emissions.
    initializeRealtime: (config) => invoke("realtime_initialize", { config }),
    ackRealtimeCommand: (payload) => invoke("realtime_ack_command", { payload }),
    onDeviceCommand: (callback) => subscribe(REALTIME_COMMAND_EVENT, callback),
    onRealtimeStatusChange: (callback) => subscribe(REALTIME_STATUS_EVENT, callback),
    onRealtimeStateUpdated: (callback) => subscribe(STATE_UPDATED_EVENT, callback),
  },
};
