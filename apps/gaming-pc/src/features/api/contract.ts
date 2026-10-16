import type { CleanupPolicy } from '@chrono/shared';

/**
 * Request/response DTOs for the native command layer (`lib/native.ts`).
 * These are the payload and result shapes exchanged with the Tauri Rust core.
 */

// Request/Response DTOs

// Device credential is resolved by the trusted Rust core internally, never
// supplied by the renderer — see src-tauri/src/commands/api.rs.
export type DeviceStatusRequest = Record<string, never>;

export interface DeviceStatusResponse {
  status: string;
  pcId: string;
  stationName?: string;
  name?: string;
  branchId: string;
  branchName?: string | null;
  uiConfig?: Record<string, any> | null;
  tenantHeroSlide?: {
    icon: 'platform' | 'event' | 'promo' | 'social';
    eyebrow: string;
    title: string;
    description: string;
    detail: string;
    backgroundImage?: string;
  } | null;
  activeSessionId?: string;
  scheduledEndAt?: string;
  customerName?: string;
  profileUrl?: string | null;
  startedAt?: string;
  remainingBalance?: string;
  hourlyRate?: number;
  creditMinutesRemaining?: number;
  walletMinutesRemaining?: number;
  totalMinutesRemaining?: number;
  sessionCost?: string;
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
  activeReservation?: {
    id: string;
    customerName: string;
    startTime: string;
    endTime: string;
    graceExpiresAt?: string;
    awaitingLogin?: boolean;
    topUpGrace?: boolean;
  } | null;
  specs?: Record<string, any> | null;
  deviceGroup?: {
    code?: string;
    name: string;
    description: string | null;
  } | null;
  pricingRules?: any[];
  cleanupPolicy?: CleanupPolicy | null;
  kioskPolicy?: KioskPolicy | null;
}

export interface KioskPolicy {
  disableTaskManager?: boolean;
  disableCli?: boolean;
}

export interface HeartbeatRequest {
  payload: {
    lockState?: string;
    runtimeStatus?: string;
    activeSessionId?: string;
    lastTrustedServerAt?: string;
    localTime?: string;
    uptime?: number;
    queuedEventCount?: number;
    serviceHealth?: string;
    uiHealth?: string;
  };
}

export interface HeartbeatResponse {
  status: string;
  timestamp: string;
  commandsPending: number;
  activeSessionId?: string | null;
  scheduledEndAt?: string | null;
  startedAt?: string;
  customerName?: string;
  profileUrl?: string | null;
  remainingBalance?: string;
  hourlyRate?: number;
  creditMinutesRemaining?: number;
  walletMinutesRemaining?: number;
  totalMinutesRemaining?: number;
  sessionCost?: string;
  activeSession?: {
    id: string;
    startedAt?: string;
    scheduledEndAt?: string | null;
    customerName?: string;
    profileUrl?: string | null;
    remainingBalance?: string;
    hourlyRate?: number;
    creditMinutesRemaining?: number;
    walletMinutesRemaining?: number;
    totalMinutesRemaining?: number;
    sessionCost?: string;
  } | null;
  activeReservation?: {
    id: string;
    customerName: string;
    startTime: string | null;
    endTime: string | null;
    graceExpiresAt?: string;
    title?: string;
    message?: string;
    // Phase 3b: the "reservation" is actually a billed, screen-locked session whose
    // owner has not logged in yet. Logging in resumes that same session.
    awaitingLogin?: boolean;
    // Phase 7: a free, unbilled hold for a member who ran out of balance while a
    // queue was waiting — they can top up, extend, or leave.
    topUpGrace?: boolean;
  } | null;
}

export interface GenerateQrTokenRequest {
  fingerprint: string;
}

export interface GenerateQrTokenResponse {
  qrToken: string;
  qrUrl?: string;
  expiresIn: number;
  pcId?: string;
  branchId?: string;
}

export type FetchPendingCommandsRequest = Record<string, never>;

export interface Command {
  version: string;
  id: string;
  type: string;
  tenantId: string;
  branchId: string;
  pcId: string;
  deviceId: string;
  // Opaque per-command-type payload; consumed structurally, not via a fixed
  // shape here. `unknown` forces call sites to narrow before use.
  payloadJson: unknown;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
  signedFields: string[];
}

export interface AckCommandRequest {
  commandId: string;
  result: {
    success: boolean;
    // Command-specific result payload; shape varies per command type.
    data?: unknown;
    error?: string;
    timestamp: string;
  };
}

export interface ReportSecurityAlertRequest {
  payload: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    // Extra structured context persisted server-side as the alert's metadata.
    // (Formerly `details`; the server still tolerates the legacy field name.)
    metadata?: Record<string, unknown>;
    timestamp: string;
  };
}

// Body for POST /sessions from the device. The station is derived server-side
// from the device JWT — never sent by the client. `durationMinutes` is a
// request only; the server clamps it to the balance-derived maximum.
export interface StartSessionRequest {
  // NOTE: mirrors the server's SessionModeEnum. `@chrono/shared` does not export
  // that enum, so this literal is maintained in sync by hand — if the server
  // enum changes, update this union too.
  mode?: 'PREPAID' | 'POSTPAID';
  durationMinutes?: number;
}

export interface PairRequest {
  pairingCode: string;
}

export interface PairResponse {
  tokenHash: string;
  tenantId: string;
  branchId: string;
}

export interface AuthDeviceRequest {
  fingerprintV1: string;
  hostname?: string;
  tokenHash: string;
}

export interface AuthDeviceResponse {
  status: string;
  deviceId?: string;
  tenantId?: string;
  tenantSlug?: string;
  branchId?: string;
  branchName?: string | null;
  stationId?: string;
  pcId?: string;
  stationName?: string;
  name?: string;
  activeSessionId?: string;
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
  // NOTE: the device access token is held exclusively by the Rust core
  // (`http.rs`); it is stripped before the response reaches the webview.
}

/**
 * Standard response wrapper for native command calls, matching the shape the
 * renderer's `PcClientApi` expects.
 */
export interface CommandResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
