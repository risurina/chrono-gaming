import Constants from 'expo-constants';
import { router } from 'expo-router';
import { sessionStorage } from './session-storage';

/**
 * API origin (server root — NOT a /api/v1 or /portal prefix; callers pass the
 * full path, e.g. '/portal/wallet/balance'). Resolution order: build-time env,
 * then app.json `extra.apiUrl`, then the local-dev default.
 */
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://api.localtest.me:8787';

export interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  /**
   * Send the `x-member-action: 1` CSRF header. Required by every mutating
   * `/portal/*` route; harmless elsewhere. Set on non-GET portal calls.
   */
  memberAction?: boolean;
  /** Optional `Idempotency-Key` for safe retries of a mutation. */
  idempotencyKey?: string;
}

function safeRedirectToWelcome() {
  try {
    router.replace('/');
  } catch {
    // Router not mounted yet (e.g. during the initial session check) — ignore.
  }
}

/**
 * Low-level fetch against the gaming-api.
 *
 * Auth is cookie-session based: we attach the stored session cookie
 * (`agora_customer` / `agora_member`, see session-storage) as a `Cookie` header
 * and capture any Set-Cookie the server returns (sign-in / sign-up / sign-out).
 * `credentials: 'include'` keeps the native cookie jar working as a fallback on
 * runtimes that hide Set-Cookie from fetch.
 *
 * Tenant is selected by the `x-tenant-slug` / `x-tenant-host` header — the
 * server never trusts a tenant id from client input.
 *
 * Responses are bare JSON (no `{ data }` envelope); the caller picks the named
 * key it wants (e.g. `.profile`, `.balance`, `.items`). Errors are `{ error }`.
 */
export async function mobileApiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { memberAction, idempotencyKey, headers: optHeaders, ...rest } = options;

  const [cookie, tenantSlug, tenantHost] = await Promise.all([
    sessionStorage.getCookie(),
    sessionStorage.getTenantSlug(),
    sessionStorage.getTenantHost(),
  ]);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
    ...(tenantHost ? { 'x-tenant-host': tenantHost } : {}),
    ...(memberAction ? { 'x-member-action': '1' } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...optHeaders,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...rest,
    credentials: 'include',
    headers,
  });

  // Persist any session cookie the server set/cleared on this response.
  await sessionStorage.applySetCookie(response.headers.get('set-cookie'));

  if (!response.ok) {
    if (response.status === 401) {
      await sessionStorage.clearSession();
      safeRedirectToWelcome();
    }
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(
      errorBody.error || errorBody.message || `Request failed (${response.status})`,
    );
  }

  // 204 No Content / empty body (e.g. some sign-out responses).
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
