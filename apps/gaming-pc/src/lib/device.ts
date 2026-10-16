/**
 * Bridge between the renderer and the Tauri native core.
 * These methods call the `native` API (see lib/native.ts).
 */
import { native, isNative } from './native';

export const getDeviceFingerprint = async (): Promise<string> => {
  if (isNative()) {
    return await native.getDeviceFingerprint();
  }
  return 'web-fallback-fingerprint';
};

export const getDeviceInfo = async () => {
  if (isNative()) {
    return await native.getDeviceInfo();
  }
  return {
    hostname: 'web-host',
    osVersion: 'Web Browser',
    clientVersion: '0.0.0',
  };
};
