import * as SecureStore from 'expo-secure-store';
import { logger } from './logger';

const COOKIE_KEY = 'session_cookie';
const TENANT_SLUG_KEY = 'tenant_slug';
const TENANT_HOST_KEY = 'tenant_host';

/**
 * The gaming-api authenticates customers with httpOnly session cookies
 * (`agora_customer` for the platform-wide global-customer pool, `agora_member`
 * for a tenant-scoped member). React Native's native networking exposes
 * Set-Cookie on fetch responses (unlike a browser), so we capture those cookies
 * on sign-in and replay them as a `Cookie` header on every request, persisting
 * them in the device keychain so the session survives app restarts.
 *
 * We only track the two session cookies by name — their attributes (Path,
 * HttpOnly, Expires, …) are irrelevant once we replay them to the same origin,
 * and parsing full Set-Cookie attribute lists (whose Expires value contains
 * commas) is exactly the ambiguity we avoid by matching `name=value` only.
 */
const SESSION_COOKIE_NAMES = ['agora_customer', 'agora_member'] as const;

/** Parse a stored `a=1; b=2` Cookie header into a map. */
function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) map.set(name, value);
  }
  return map;
}

/** Serialize a cookie map back into a `Cookie` header value. */
function serializeCookieHeader(map: Map<string, string>): string {
  return Array.from(map.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Extract our session cookies from a raw Set-Cookie header. Returns a map of
 * name → value; an empty value marks a cleared cookie (server sign-out / expiry).
 */
function extractSessionCookies(setCookieHeader: string): Map<string, string | null> {
  const found = new Map<string, string | null>();
  for (const name of SESSION_COOKIE_NAMES) {
    // name=value, value runs up to the next attribute delimiter (';') — value
    // itself never contains ';' or whitespace. Allow empty (cookie cleared).
    const match = setCookieHeader.match(new RegExp(`${name}=([^;,\\s]*)`));
    if (!match) continue;
    const value = match[1];
    found.set(name, value.length > 0 ? value : null);
  }
  return found;
}

export const sessionStorage = {
  /** The `Cookie` header value to send, or null if no session is stored. */
  async getCookie(): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(COOKIE_KEY);
      return value && value.length > 0 ? value : null;
    } catch (error) {
      logger.error('Error reading session cookie:', error);
      return null;
    }
  },

  /**
   * Merge the cookies from a response's Set-Cookie header into the stored
   * session. Sets non-empty values, removes cleared ones. No-op if the header
   * carries none of our session cookies.
   */
  async applySetCookie(setCookieHeader: string | null): Promise<void> {
    if (!setCookieHeader) return;
    const incoming = extractSessionCookies(setCookieHeader);
    if (incoming.size === 0) return;
    try {
      const current = parseCookieHeader(await SecureStore.getItemAsync(COOKIE_KEY));
      for (const [name, value] of incoming) {
        if (value === null) current.delete(name);
        else current.set(name, value);
      }
      const serialized = serializeCookieHeader(current);
      if (serialized.length > 0) await SecureStore.setItemAsync(COOKIE_KEY, serialized);
      else await SecureStore.deleteItemAsync(COOKIE_KEY);
    } catch (error) {
      logger.error('Error persisting session cookie:', error);
    }
  },

  /** Drop the session cookie (on logout or a 401), keeping venue selection. */
  async clearSession(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(COOKIE_KEY);
    } catch (error) {
      logger.error('Error clearing session cookie:', error);
    }
  },

  /** The selected venue's tenant slug, sent as `x-tenant-slug`. */
  async getTenantSlug(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TENANT_SLUG_KEY);
    } catch (error) {
      logger.error('Error reading tenant slug:', error);
      return null;
    }
  },

  async setTenantSlug(slug: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TENANT_SLUG_KEY, slug);
    } catch (error) {
      logger.error('Error saving tenant slug:', error);
    }
  },

  /** A custom venue host, sent as `x-tenant-host` (set instead of slug). */
  async getTenantHost(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TENANT_HOST_KEY);
    } catch (error) {
      logger.error('Error reading tenant host:', error);
      return null;
    }
  },

  async setTenantHost(host: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TENANT_HOST_KEY, host);
    } catch (error) {
      logger.error('Error saving tenant host:', error);
    }
  },

  /** Forget the selected venue (slug + host). */
  async clearTenant(): Promise<void> {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(TENANT_SLUG_KEY),
        SecureStore.deleteItemAsync(TENANT_HOST_KEY),
      ]);
    } catch (error) {
      logger.error('Error clearing tenant selection:', error);
    }
  },

  /** Full reset: session cookie + venue selection (on full sign-out). */
  async clearAll(): Promise<void> {
    await Promise.all([this.clearSession(), this.clearTenant()]);
  },
};
