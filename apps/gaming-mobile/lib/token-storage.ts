import { logger } from '../lib/logger';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const TENANT_ID_KEY = 'tenant_id';
const TENANT_SLUG_KEY = 'tenant_slug';
const BRANCH_ID_KEY = 'branch_id';
const BRANCH_CODE_KEY = 'branch_code';

/**
 * Utility for managing authentication tokens securely on the device.
 * Uses iOS Keychain and Android SharedPreferences (Hardware encrypted).
 */
export const tokenStorage = {
  /**
   * Save the auth token to secure storage.
   *
   * Re-throws on failure: a swallowed write leaves the caller (e.g. login)
   * navigating as if authenticated while the token is absent, producing an
   * unexplained 401 on the next request. Callers must handle the rejection.
   */
  async saveToken(token: string) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch (error) {
      logger.error('Error saving token to SecureStore:', error);
      throw error;
    }
  },

  /**
   * Retrieve the auth token from secure storage.
   */
  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      logger.error('Error retrieving token from SecureStore:', error);
      return null;
    }
  },

  /**
   * Remove the auth token from secure storage (e.g., on logout).
   *
   * Re-throws on failure so logout does not report success while the token
   * survives on the device.
   */
  async deleteToken() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch (error) {
      logger.error('Error deleting token from SecureStore:', error);
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
   * Save the tenant slug to secure storage. Used to derive the tenant hostname
   * (`x-oikos-hostname`) so the API resolves the correct tenant context.
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
        SecureStore.deleteItemAsync(TOKEN_KEY),
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
