import { logger } from '../lib/logger';
import * as SecureStore from 'expo-secure-store';

const SESSION_COOKIE_KEY = 'session_cookie';
const TENANT_ID_KEY = 'tenant_id';
const TENANT_SLUG_KEY = 'tenant_slug';
const BRANCH_ID_KEY = 'branch_id';
const BRANCH_CODE_KEY = 'branch_code';

/**
 * Utility for managing the gaming-api session securely on the device.
 * Uses iOS Keychain and Android SharedPreferences (Hardware encrypted).
 *
 * gaming-api authenticates the global customer with a cookie session
 * (`agora_customer`); the `*Token` methods store that cookie's `name=value`
 * pair, which `mobile-api-client` replays as a `Cookie` header. The method
 * names are kept (callers already use them) even though the payload is now a
 * cookie, not a bearer token.
 */
export const tokenStorage = {
  /**
   * Save the session cookie to secure storage.
   *
   * Re-throws on failure: a swallowed write leaves the caller (e.g. login)
   * navigating as if authenticated while the cookie is absent, producing an
   * unexplained 401 on the next request. Callers must handle the rejection.
   */
  async saveToken(cookie: string) {
    try {
      await SecureStore.setItemAsync(SESSION_COOKIE_KEY, cookie);
    } catch (error) {
      logger.error('Error saving session cookie to SecureStore:', error);
      throw error;
    }
  },

  /**
   * Retrieve the session cookie from secure storage.
   */
  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SESSION_COOKIE_KEY);
    } catch (error) {
      logger.error('Error retrieving session cookie from SecureStore:', error);
      return null;
    }
  },

  /**
   * Remove the session cookie from secure storage (e.g., on logout).
   *
   * Re-throws on failure so logout does not report success while the cookie
   * survives on the device.
   */
  async deleteToken() {
    try {
      await SecureStore.deleteItemAsync(SESSION_COOKIE_KEY);
    } catch (error) {
      logger.error('Error deleting session cookie from SecureStore:', error);
      throw error;
    }
  },

  /**
   * Save the tenant ID to secure storage.
   */
  async saveTenantId(tenantId: string) {
    try {
      await SecureStore.setItemAsync(TENANT_ID_KEY, tenantId);
    } catch (error) {
      logger.error('Error saving tenant ID to SecureStore:', error);
    }
  },

  /**
   * Retrieve the tenant ID from secure storage.
   */
  async getTenantId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TENANT_ID_KEY);
    } catch (error) {
      logger.error('Error retrieving tenant ID from SecureStore:', error);
      return null;
    }
  },

  /**
   * Remove the tenant ID from secure storage.
   */
  async deleteTenantId() {
    try {
      await SecureStore.deleteItemAsync(TENANT_ID_KEY);
    } catch (error) {
      logger.error('Error deleting tenant ID from SecureStore:', error);
    }
  },

  /**
   * Save the tenant slug to secure storage. Sent as the `x-tenant-slug` header
   * so gaming-api resolves the correct tenant context for member/portal routes.
   */
  async saveTenantSlug(tenantSlug: string) {
    try {
      await SecureStore.setItemAsync(TENANT_SLUG_KEY, tenantSlug);
    } catch (error) {
      logger.error('Error saving tenant slug to SecureStore:', error);
    }
  },

  /**
   * Retrieve the tenant slug from secure storage.
   */
  async getTenantSlug(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TENANT_SLUG_KEY);
    } catch (error) {
      logger.error('Error retrieving tenant slug from SecureStore:', error);
      return null;
    }
  },

  /**
   * Save the branch code to secure storage. Branch-scoped member routes
   * (e.g. active session) are addressed by branch code in the URL path.
   */
  async saveBranchCode(branchCode: string) {
    try {
      await SecureStore.setItemAsync(BRANCH_CODE_KEY, branchCode);
    } catch (error) {
      logger.error('Error saving branch code to SecureStore:', error);
    }
  },

  /**
   * Retrieve the branch code from secure storage.
   */
  async getBranchCode(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(BRANCH_CODE_KEY);
    } catch (error) {
      logger.error('Error retrieving branch code from SecureStore:', error);
      return null;
    }
  },

  /**
   * Save the branch ID to secure storage.
   */
  async saveBranchId(branchId: string) {
    try {
      await SecureStore.setItemAsync(BRANCH_ID_KEY, branchId);
    } catch (error) {
      logger.error('Error saving branch ID to SecureStore:', error);
    }
  },

  /**
   * Retrieve the branch ID from secure storage.
   */
  async getBranchId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(BRANCH_ID_KEY);
    } catch (error) {
      logger.error('Error retrieving branch ID from SecureStore:', error);
      return null;
    }
  },

  /**
   * Remove the branch ID from secure storage.
   */
  async deleteBranchId() {
    try {
      await SecureStore.deleteItemAsync(BRANCH_ID_KEY);
    } catch (error) {
      logger.error('Error deleting branch ID from SecureStore:', error);
    }
  },
  /**
   * Remove all auth-related data from secure storage (e.g., on full logout).
   *
   * Re-throws on failure so logout flows can tell the user their session could
   * not be cleared instead of navigating away as if it succeeded.
   */
  async clearAll() {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(SESSION_COOKIE_KEY),
        SecureStore.deleteItemAsync(TENANT_ID_KEY),
        SecureStore.deleteItemAsync(TENANT_SLUG_KEY),
        SecureStore.deleteItemAsync(BRANCH_ID_KEY),
        SecureStore.deleteItemAsync(BRANCH_CODE_KEY),
      ]);
    } catch (error) {
      logger.error('Error clearing all auth data from SecureStore:', error);
      throw error;
    }
  },
};
