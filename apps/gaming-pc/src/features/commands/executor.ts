import { logger } from '../../shared/logger';
/**
 * Safe command executor for PC Client.
 * Only allowlisted commands are executed.
 */

import { runtime } from '../runtime/pc-client-runtime';
import { LocalStateStore } from '../local-state/local-client-state';
import { native } from '../../lib/native';

export type CommandType =
  | 'LOCK'
  | 'UNLOCK'
  | 'END_SESSION'
  | 'SHOW_MESSAGE'
  | 'SYNC_CONFIG'
  | 'FORCE_SYNC'
  | 'RESTART'
  | 'SHUTDOWN'
  | 'RESTART_APP'
  | 'EXIT_APP'
  | 'SLEEP'
  | 'HIBERNATE'
  | 'MAINTENANCE_ON'
  | 'MAINTENANCE_OFF'
  | 'SCREENSHOT'
  | 'VOLUME_SET'
  | 'MUTE'
  | 'UNMUTE'
  | 'KILL_PROCESS'
  | 'MONITOR_OFF'
  | 'MONITOR_ON'
  | 'OPEN_URL'
  | 'CLEAR_TEMP'
  | 'LOCK_INPUT'
  | 'UNLOCK_INPUT'
  | 'RESTART_CLIENT_UI';

export interface Command {
  id: string;
  type: CommandType;
  tenantId: string;
  branchId: string;
  pcId: string;
  deviceId: string;
  expiresAt?: string;
  payloadJson?: any;
}

export interface CommandResult {
  success: boolean;
  commandId: string;
  executedAt: string;
  errorMessage?: string;
  data?: any;
}

const ALLOWED_COMMANDS: CommandType[] = [
  'LOCK',
  'UNLOCK',
  'END_SESSION',
  'SHOW_MESSAGE',
  'SYNC_CONFIG',
  'FORCE_SYNC',
  'RESTART',
  'SHUTDOWN',
  'RESTART_APP',
  'EXIT_APP',
  'SLEEP',
  'HIBERNATE',
  'MAINTENANCE_ON',
  'MAINTENANCE_OFF',
  'SCREENSHOT',
  'VOLUME_SET',
  'MUTE',
  'UNMUTE',
  'KILL_PROCESS',
  'MONITOR_OFF',
  'MONITOR_ON',
  'OPEN_URL',
  'CLEAR_TEMP',
  'LOCK_INPUT',
  'UNLOCK_INPUT',
  'RESTART_CLIENT_UI',
];

export const executeCommand = async (command: Command): Promise<CommandResult> => {
  logger.info(`Received command: ${command.type} (${command.id})`);

  const result: CommandResult = {
    success: false,
    commandId: command.id,
    executedAt: new Date().toISOString(),
  };

  // 1. Validate allowlist
  if (!ALLOWED_COMMANDS.includes(command.type)) {
    result.errorMessage = `Command type ${command.type} is not allowed`;
    return result;
  }

  // 2. Validate expiration
  if (command.expiresAt && new Date(command.expiresAt) < new Date()) {
    result.errorMessage = 'Command has expired';
    return result;
  }

  // 3. Basic validation of targets (match against local state)
  const currentState = await LocalStateStore.get();
  if (command.pcId !== currentState.pcId) {
    result.errorMessage = `PC ID mismatch: ${command.pcId} vs ${currentState.pcId}`;
    return result;
  }

  try {
    // 4. Dispatch to safe implementation
    switch (command.type) {
      case 'LOCK':
        logger.info('Executing LOCK (UI only)');
        // Enforcement moved to Tauri core
        runtime.forceStatus('AVAILABLE');
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station locked by administrator', type: 'warning' }
        }));
        break;
      case 'UNLOCK':
        logger.info('Executing UNLOCK (UI only)');
        // Enforcement moved to Tauri core
        runtime.forceStatus('ACTIVE');
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station unlocked. Session started!', type: 'success' }
        }));
        break;
      case 'END_SESSION':
        logger.info('Executing END_SESSION (UI only)');
        // Enforcement moved to Tauri core
        runtime.forceStatus('AVAILABLE');
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Session ended by administrator', type: 'info' }
        }));
        break;
      case 'SHOW_MESSAGE':
        logger.info('Showing message:', command.payloadJson?.message);
        window.dispatchEvent(new CustomEvent('chrono-toast', { 
          detail: { 
            message: command.payloadJson?.message || 'New message from server',
            type: command.payloadJson?.type || 'info'
          } 
        }));
        break;
      case 'SYNC_CONFIG':
      case 'FORCE_SYNC': {
        logger.info('Syncing config');
        const syncSuccess = await runtime.syncConfig();

        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: {
            message: syncSuccess
              ? 'Configuration synced with server'
              : 'Failed to sync configuration',
            type: syncSuccess ? 'success' : 'danger'
          }
        }));

        if (!syncSuccess) {
          result.errorMessage = 'Sync failed';
          return result;
        }
        break;
      }
      case 'RESTART':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station is rebooting...', type: 'warning' }
        }));
        break;
      case 'SHUTDOWN':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station is shutting down...', type: 'danger' }
        }));
        break;
      case 'RESTART_APP':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Application is restarting...', type: 'info' }
        }));
        break;
      case 'EXIT_APP':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Application is exiting...', type: 'warning' }
        }));
        break;
      case 'SLEEP':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station is entering sleep mode...', type: 'info' }
        }));
        break;
      case 'HIBERNATE':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station is hibernating...', type: 'info' }
        }));
        break;
      case 'MAINTENANCE_ON':
        runtime.forceStatus('MAINTENANCE');
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station entered Maintenance Mode', type: 'warning' }
        }));
        break;
      case 'MAINTENANCE_OFF':
        runtime.forceStatus('AVAILABLE');
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Station exited Maintenance Mode', type: 'success' }
        }));
        break;
      case 'VOLUME_SET':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: `Volume set to ${command.payloadJson?.volume}%`, type: 'info' }
        }));
        break;
      case 'MUTE':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Audio muted', type: 'info' }
        }));
        break;
      case 'UNMUTE':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Audio unmuted', type: 'info' }
        }));
        break;
      case 'KILL_PROCESS':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: `Terminating: ${command.payloadJson?.processName || 'process'}`, type: 'warning' }
        }));
        break;
      case 'MONITOR_OFF':
        // No toast, screen going off
        break;
      case 'OPEN_URL':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'Opening requested link...', type: 'info' }
        }));
        break;
      case 'CLEAR_TEMP':
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: 'System optimization complete', type: 'success' }
        }));
        break;
      case 'SCREENSHOT':
        // No toast for silent capture, handled in Main
        break;
      case 'RESTART_CLIENT_UI':
        logger.info('Restarting UI');
        if (native?.restartClientUI) {
          native.restartClientUI();
        }
        break;
      default:
        result.errorMessage = `Implementation for ${command.type} missing`;
        return result;
    }

    result.success = true;
    return result;
  } catch (error) {
    logger.error('Command execution failed:', error);
    result.errorMessage = error instanceof Error ? error.message : 'Internal error';
    return result;
  }
};

export const initializeCommandListener = () => {
  // This will eventually hook into WebSocket/MQTT
  logger.info('PC Client safe command listener initialized');
};
