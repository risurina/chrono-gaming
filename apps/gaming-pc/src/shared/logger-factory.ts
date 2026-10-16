export interface Logger {
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
  debug: (message: string, meta?: any) => void;
}

/**
 * Redacts sensitive fields from an object.
 */
export const redactForTelemetry = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactForTelemetry);

  const sensitiveKeys = [
    'token', 'accessToken', 'refreshToken', 'deviceToken', 'qrToken',
    'password', 'pin', 'secret', 'authorization', 'cookie',
    'email', 'customerName', 'profileUrl', 'name'
  ];

  const redacted: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactForTelemetry(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
};

export const createLogger = (namespace: string, isVerbose: boolean): Logger => {
  // The renderer runs in the webview and cannot write log files directly; file
  // logging is handled natively by tauri-plugin-log, so this logs to console only.
  const canWriteLogFiles = false;
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
  let logFilePath: string | null = null;
  let fs: any = null;

  if (canWriteLogFiles && isDev && isVerbose) {
    try {
      fs = require('fs');
      const path = require('path');
      
      // Determine logs directory relative to project structure
      const cwd = process.cwd();
      let logsDir = '';
      
      if (cwd.endsWith('chrono-pc-client')) {
        logsDir = path.join(cwd, 'logs');
      } else if (fs.existsSync(path.join(cwd, 'apps/chrono-pc-client'))) {
        logsDir = path.join(cwd, 'apps/chrono-pc-client/logs');
      } else {
        // Fallback to a path relative to the bundled output if possible
        logsDir = path.join(__dirname, '../../logs');
      }

      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const date = new Date().toISOString().split('T')[0];
      logFilePath = path.join(logsDir, `${date}.log`);
    } catch (err) {
      // Fail silently to avoid crashing the app due to logging issues
    }
  }

  const formatMeta = (meta: any) => {
    if (meta === null || meta === undefined) return {};
    if (meta instanceof Error) {
      return {
        error: {
          message: meta.message,
          stack: meta.stack,
        }
      };
    }

    // Redact sensitive info before logging
    const redactedMeta = redactForTelemetry(meta);

    if (typeof redactedMeta === 'object' && !Array.isArray(redactedMeta)) return redactedMeta;
    return { metadata: redactedMeta };
  };

  const log = (level: string, message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const logData = { timestamp, level, namespace, message, ...formatMeta(meta) };
    const entry = JSON.stringify(logData);
    
    if (level === 'error') console.error(entry);
    else if (level === 'warn') console.warn(entry);
    else if (level === 'debug') console.debug(entry);
    else console.log(entry);

    if (fs && logFilePath) {
      try {
        fs.appendFileSync(logFilePath, entry + '\n');
      } catch (err) {
        // Fail silently
      }
    }
  };

  return {
    info: (message: string, meta?: any) => {
      if (isVerbose) log('info', message, meta);
    },
    warn: (message: string, meta?: any) => {
      // Always log warnings
      log('warn', message, meta);
    },
    error: (message: string, meta?: any) => {
      // Always log errors
      log('error', message, meta);
    },
    debug: (message: string, meta?: any) => {
      if (isVerbose) log('debug', message, meta);
    }
  };
};
