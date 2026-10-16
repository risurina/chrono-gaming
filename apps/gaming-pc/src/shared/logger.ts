import { createLogger } from './logger-factory';
import { CLIENT_CONFIG } from '../config/client-config';

/**
 * Simple structured logger for PC Client use.
 * In production, verbose logging is disabled by default to save disk space and reduce PII risk.
 */
export const logger = createLogger('pc-client', CLIENT_CONFIG.IS_DEV);
