/**
 * Persistent local storage backed by the Tauri native core.
 * These methods call the `native` API (see lib/native.ts).
 */
import { native, isNative } from './native';

export const getDeviceToken = async (): Promise<string | null> => {
  if (isNative()) {
    return await native.getDeviceToken();
  }
  return null;
};

export const getLocalClientState = async (): Promise<any | null> => {
  if (isNative()) {
    return await native.getLocalClientState();
  }
  return null;
};
