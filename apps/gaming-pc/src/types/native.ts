import {
  CommandResponse,
  PairRequest,
  PairResponse,
  AuthDeviceRequest,
  AuthDeviceResponse,
  DeviceStatusRequest,
  DeviceStatusResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  GenerateQrTokenRequest,
  GenerateQrTokenResponse,
  FetchPendingCommandsRequest,
  Command,
  AckCommandRequest,
  ReportSecurityAlertRequest,
  StartSessionRequest
} from '../features/api/contract';
// Renderer-side command shape consumed by the `realtime:command` handler
// (a subset view of the signed server command).
import type { Command as DeviceCommand } from '../features/commands/executor';
import type { LocalClientState } from '../features/local-state/local-client-state';

export interface Game {
  id: string;
  name: string;
  category: string;
  exePath: string;
  args: string[];
  iconUrl: string | null;
}

/**
 * The native API surface — the set of Tauri commands and events the renderer can
 * call. Implemented in `lib/native.ts` on top of `invoke()` / `listen()`.
 */
export interface ChronoNativeApi {
  // Device Identity & Storage (Read-Only for Renderer)
  getDeviceFingerprint: () => Promise<string>;
  getDeviceInfo: () => Promise<{
    hostname: string;
    osVersion: string;
    clientVersion: string;
  }>;
  getDeviceToken: () => Promise<string | null>;

  // Local Client State (Read-Only for Renderer)
  // Raw persisted local-client-state JSON from the Rust store. Left as `any`
  // (not `unknown`/`LocalClientState`) because the native impl resolves it via
  // `invoke<unknown>` and call sites read fields off it directly without
  // narrowing; tightening the shape here would break out-of-scope files.
  getLocalClientState: () => Promise<any | null>;

  // Command Execution
  executeAllowedCommand: (command: Command) => Promise<{ success: boolean; error?: string; data?: unknown }>;
  restartClientUI: () => void;

  // PC Client API (Namespace for Phase 0-5)
  pcClient: {
    pairDevice: (payload: PairRequest) => Promise<CommandResponse<PairResponse>>;
    authDevice: (payload: AuthDeviceRequest) => Promise<CommandResponse<AuthDeviceResponse>>;
    getDeviceStatus: (payload?: DeviceStatusRequest) => Promise<CommandResponse<DeviceStatusResponse>>;
    sendHeartbeat: (payload: HeartbeatRequest) => Promise<CommandResponse<HeartbeatResponse>>;
    generateQrToken: (payload: GenerateQrTokenRequest) => Promise<CommandResponse<GenerateQrTokenResponse>>;
    fetchPendingCommands: (payload?: FetchPendingCommandsRequest) => Promise<CommandResponse<Command[]>>;
    ackCommand: (payload: AckCommandRequest) => Promise<CommandResponse<void>>;
    reportSecurityAlert: (payload: ReportSecurityAlertRequest) => Promise<CommandResponse<void>>;
    userLogin: (payload: { email: string; password: string }) => Promise<CommandResponse<unknown>>;
    startSession: (payload: StartSessionRequest) => Promise<CommandResponse<unknown>>;
    endSession: (payload: { sessionId: string }) => Promise<CommandResponse<unknown>>;
    lockSession: (payload: { sessionId: string }) => Promise<CommandResponse<unknown>>;
    unlockSession: (payload: { sessionId: string; password: string }) => Promise<CommandResponse<unknown>>;
    extendGrace: (payload: { reservationId: string }) => Promise<CommandResponse<any>>;
    leaveGrace: (payload: { reservationId: string }) => Promise<CommandResponse<any>>;
    getGames: () => Promise<Game[]>;
    launchGame: (id: string) => Promise<{ success: boolean; error?: string }>;
    executeAllowedCommand: (command: Command) => Promise<{ success: boolean; error?: string }>;

    // Realtime (Rust core owns the WebSocket connection)
    initializeRealtime: (config: { apiUrl: string; deviceToken: string; fingerprint: string; branchId: string; pcId: string }) => Promise<{ success: boolean; error?: string }>;
    ackRealtimeCommand: (payload: { commandId: string; success: boolean; errorMessage?: string }) => Promise<{ success: boolean }>;
    // Raw server command forwarded by the Rust core for cosmetic UI side-effects
    // only (toasts, local status hints) — never a privileged action; enforcement
    // is authoritative in the Rust core (see src-tauri/src/realtime.rs).
    onDeviceCommand: (callback: (command: DeviceCommand) => void) => () => void;
    onRealtimeStatusChange: (callback: (payload: { status: string; error?: string }) => void) => () => void;
    onRealtimeStateUpdated: (callback: (state: LocalClientState) => void) => () => void;
  };
}
