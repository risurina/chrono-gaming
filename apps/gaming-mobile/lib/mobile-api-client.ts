import Constants from 'expo-constants';
import { router } from 'expo-router';
import { tokenStorage } from './token-storage';

const DEFAULT_API_URL = 'https://chrono.api.izur.com.ph/api/v1';
// Root domain used to derive the tenant hostname sent via `x-oikos-hostname`.
// Must equal chrono-api's ROOT_DOMAIN (default: chrono.izur.com.ph) so
// tenantContextMiddleware resolves the tenant slug from the leading label.
const DEFAULT_TENANT_ROOT_DOMAIN = 'chrono.izur.com.ph';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  DEFAULT_API_URL;

const TENANT_ROOT_DOMAIN =
  process.env.EXPO_PUBLIC_TENANT_ROOT_DOMAIN ||
  Constants.expoConfig?.extra?.tenantRootDomain ||
  DEFAULT_TENANT_ROOT_DOMAIN;

// Surface configuration drift early: falling back to hardcoded defaults is the
// usual cause of "tenant not resolved" bugs against non-production APIs.
if (!process.env.EXPO_PUBLIC_API_URL && !Constants.expoConfig?.extra?.apiUrl) {
  console.warn(
    `[mobile-api-client] EXPO_PUBLIC_API_URL is not set; falling back to default API URL ${DEFAULT_API_URL}`,
  );
}
if (!process.env.EXPO_PUBLIC_TENANT_ROOT_DOMAIN && !Constants.expoConfig?.extra?.tenantRootDomain) {
  console.warn(
    `[mobile-api-client] EXPO_PUBLIC_TENANT_ROOT_DOMAIN is not set; falling back to default root domain ${DEFAULT_TENANT_ROOT_DOMAIN} (must match chrono-api ROOT_DOMAIN)`,
  );
}

/**
 * Error thrown for failed API calls. Preserves the machine-readable envelope
 * error code and details so screens can branch on specific failures
 * (e.g. INSUFFICIENT_BALANCE, RESERVATIONS_PAUSED with `details.reopensAt`).
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, any>;

  constructor(message: string, code: string, status: number, details?: Record<string, any>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Build the tenant hostname the API uses to resolve tenant context. The API
 * reads `x-oikos-hostname` (its trusted tenant-injection header) and parses the
 * leading label as the tenant slug. Member routes are user-scoped, so this only
 * selects which tenant's own data the authenticated user sees.
 */
function tenantHostname(tenantSlug: string): string {
  return `${tenantSlug}.${TENANT_ROOT_DOMAIN}`;
}

async function buildHeaders(extra?: HeadersInit, includeTenantHost = true): Promise<Headers> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = await tokenStorage.getToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (includeTenantHost) {
    const tenantSlug = await tokenStorage.getTenantSlug();
    if (tenantSlug) headers.set('x-oikos-hostname', tenantHostname(tenantSlug));
  }
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
}

export interface MobileFetchOptions {
  /**
   * Whether to send the tenant-resolution header (`x-oikos-hostname`).
   * Defaults to true. Set false for user-scoped, tenant-agnostic customer
   * endpoints that use strict `requireAuth` (e.g. join/history/profile), which
   * 403 a membership-less customer once a tenant is resolved from the host.
   */
  includeTenantHost?: boolean;
}

async function handleUnauthorized() {
  await tokenStorage.deleteToken();
  try {
    router.replace('/');
  } catch {
    // Router not mounted yet — ignore.
  }
}

function toApiError(json: any, status: number, fallbackMessage: string): ApiError {
  const envelopeError = json?.error && typeof json.error === 'object' ? json.error : undefined;
  const message =
    envelopeError?.message ||
    (typeof json?.error === 'string' ? json.error : undefined) ||
    json?.message ||
    fallbackMessage;
  const code = envelopeError?.code || `HTTP_${status}`;
  return new ApiError(message, code, status, envelopeError?.details);
}

/**
 * Authenticated/tenant-aware fetch for the Chrono member API. Unwraps the
 * `{ success, data }` envelope and returns `data`. Throws `ApiError` (with
 * `code`, `status`, and `details`) for non-2xx responses AND for 2xx responses
 * whose envelope reports `success: false`.
 */
export async function mobileApiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  fetchOptions: MobileFetchOptions = {},
): Promise<T> {
  const headers = await buildHeaders(options.headers, fetchOptions.includeTenantHost ?? true);
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    if (response.status === 401) {
      await handleUnauthorized();
    }
    const errorData = await response.json().catch(() => ({} as any));
    throw toApiError(errorData, response.status, 'API request failed');
  }

  const json = await response.json().catch(() => null);
  // A 2xx with an explicit `success: false` envelope is still a failure.
  if (json && json.success === false) {
    throw toApiError(json, response.status, 'API request failed');
  }
  return json?.data as T;
}

export interface SignInResult {
  token: string;
  user: { id: string; email: string; name?: string | null };
}

/**
 * Sign in against Better Auth (email/password). With the bearer plugin enabled
 * on the API, the session token is returned in the `set-auth-token` response
 * header; we fall back to the response body's `token` if present.
 */
export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const response = await fetch(`${API_BASE_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const json = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(json.error?.message || json.message || 'Invalid credentials');
  }

  const token = response.headers.get('set-auth-token') || json.token;
  if (!token) {
    throw new Error('Sign-in did not return an auth token');
  }

  return { token, user: json.user };
}

/**
 * Register a new customer account via Better Auth email/password sign-up.
 */
export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<SignInResult | null> {
  const response = await fetch(`${API_BASE_URL}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

  const json = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(json.error?.message || json.message || 'Registration failed');
  }

  const token = response.headers.get('set-auth-token') || json.token;
  return token ? { token, user: json.user } : null;
}
