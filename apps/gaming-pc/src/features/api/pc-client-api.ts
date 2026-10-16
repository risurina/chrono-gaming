import {
  PairRequest,
  AuthDeviceRequest,
  HeartbeatRequest,
  AckCommandRequest,
  ReportSecurityAlertRequest,
  StartSessionRequest
} from './contract';
import { native } from '../../lib/native';

/**
 * PcClientApi acts as a clean facade for the renderer to communicate with the
 * backend via the Tauri native core. It preserves the expected contract
 * { success, data?, error? } for all callers.
 */
export class PcClientApi {
  /**
   * Pair a device using Client Pairing Code.
   */
  static async pairDevice(payload: PairRequest) {
    return native.pcClient.pairDevice(payload);
  }

  /**
   * Authenticate a device using hardware fingerprint.
   */
  static async authDevice(payload: AuthDeviceRequest) {
    return native.pcClient.authDevice(payload);
  }

  /**
   * Sync device approval and pairing status.
   * [API-LINK: Device approval/status sync]
   */
  static async getDeviceStatus() {
    return native.pcClient.getDeviceStatus();
  }

  /**
   * Send periodic heartbeat with local state.
   * [API-LINK: Heartbeat]
   */
  static async sendHeartbeat(payload: HeartbeatRequest['payload']) {
    return native.pcClient.sendHeartbeat({ payload });
  }

  /**
   * Generate a one-time QR token for mobile pairing/login.
   * [API-LINK: QR token generation]
   */
  static async generateQrToken(fingerprint: string) {
    return native.pcClient.generateQrToken({ fingerprint });
  }

  /**
   * Fetch pending commands for the agent.
   * [API-LINK: Fetch pending commands]
   */
  static async fetchPendingCommands() {
    return native.pcClient.fetchPendingCommands();
  }

  /**
   * Acknowledge command execution result.
   * [API-LINK: Command ACK]
   */
  static async ackCommand(commandId: string, result: AckCommandRequest['result']) {
    return native.pcClient.ackCommand({ commandId, result });
  }

  /**
   * Report a security or tamper alert.
   * [API-LINK: Security alert reporting]
   */
  static async reportSecurityAlert(payload: ReportSecurityAlertRequest['payload']) {
    return native.pcClient.reportSecurityAlert({ payload });
  }

  /**
   * Login a user with email and password.
   */
  static async signIn(payload: any) {
    return native.pcClient.userLogin(payload);
  }

  /**
   * Start a new session for a user. The station is resolved server-side from
   * the device JWT — never supplied by the renderer.
   */
  static async startSession(payload: StartSessionRequest) {
    return native.pcClient.startSession(payload);
  }

  /**
   * End the current user session.
   */
  static async endSession(sessionId: string) {
    return native.pcClient.endSession({ sessionId });
  }

  static async lockSession(sessionId: string) {
    return native.pcClient.lockSession({ sessionId });
  }

  static async unlockSession(sessionId: string, password: string) {
    return native.pcClient.unlockSession({ sessionId, password });
  }

  static async extendGrace(reservationId: string) {
    return native.pcClient.extendGrace({ reservationId });
  }

  static async leaveGrace(reservationId: string) {
    return native.pcClient.leaveGrace({ reservationId });
  }

  static async getGames() {
    return native.pcClient.getGames();
  }

  static async launchGame(id: string) {
    return native.pcClient.launchGame(id);
  }
}
