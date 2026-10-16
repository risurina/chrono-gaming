import Constants from 'expo-constants';
import { router } from 'expo-router';
import { tokenStorage } from './token-storage';
import { logger } from './logger';

const DEFAULT_API_URL = 'http://api.localtest.me:8787';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  DEFAULT_API_URL;

// Surface configuration drift early: falling back to the hardcoded default is the
// usual cause of "tenant not resolved" / wrong-host bugs against non-local APIs.
if (!process.env.EXPO_PUBLIC_API_URL && !Constants.expoConfig?.extra?.apiUrl) {
  console.warn(
    `[mobile-api-client] EXPO_PUBLIC_API_URL is not set; falling back to default API URL ${DEFAULT_API_URL}`,
  );
}

/**
 * Error thrown for failed API calls. gaming-api returns bare-JSON errors as
 * `{ error: "message" }` (a plain string) with no machine-readable code or
 * details, so `code` is synthesised from the HTTP status (`HTTP_<status>`).
 */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Pull the `agora_customer` session cookie out of a `Set-Cookie` response
 * header and return the bare `name=value` pair to replay as a `Cookie` header.
 * RN concatenates multiple Set-Cookie values into one string, so a targeted
 * match is used rather than splitting on commas (which appear inside `Expires`).
 */
function extractSessionCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/agora_customer=[^;]+/);
  return match ? match[0] : null;
}

/**
 * Persist the session cookie from an auth/portal response when present. gaming-api
 * uses a cookie session (`agora_customer`); native cookie jars are an unreliable
 * fallback on RN, so we capture and replay the cookie header ourselves.
 */
async function captureSessionCookie(response: Response): Promise<void> {
  const cookie = extractSessionCookie(response.headers.get('set-cookie'));
  if (!cookie) return;
  try {
    await tokenStorage.saveToken(cookie);
  } catch (error) {
    logger.error('Failed to persist session cookie:', error);
  }
}

async function buildHeaders(
  endpoint: string,
  method: string,
  extra?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers({ 'Content-Type': 'application/json' });

  const [cookie, tenantSlug] = await Promise.all([
    tokenStorage.getToken(),
    tokenStorage.getTenantSlug(),
  ]);

  if (cookie) headers.set('Cookie', cookie);
  if (tenantSlug) headers.set('x-tenant-slug', tenantSlug);

  // CSRF-preflight header required by gaming-api on mutating member routes.
  // `/portal/reservations/*` mutations are exempt; `/public/qr/consume` requires it.
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const needsMemberAction =
    isMutation &&
    ((endpoint.startsWith('/portal/') && !endpoint.startsWith('/portal/reservations')) ||
      endpoint.startsWith('/public/qr/consume'));
  if (needsMemberAction) headers.set('x-member-action', '1');

  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
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
  const message =
    (typeof json?.error === 'string' ? json.error : undefined) ||
    (typeof json?.message === 'string' ? json.message : undefined) ||
    fallbackMessage;
  return new ApiError(message, `HTTP_${status}`, status);
}

/**
 * Authenticated/tenant-aware fetch for the gaming-api customer surface. Sends the
 * cookie session (`Cookie: agora_customer=...`) + `x-tenant-slug`, captures any
 * refreshed session cookie, and returns the BARE JSON body (gaming-api has no
 * `{ success, data }` envelope). Throws `ApiError` for non-2xx responses.
 */
export async function mobileApiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = await buildHeaders(endpoint, method, options.headers);
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  await captureSessionCookie(response);

  if (!response.ok) {
    if (response.status === 401) {
      await handleUnauthorized();
    }
    const errorData = await response.json().catch(() => ({} as any));
    throw toApiError(errorData, response.status, 'API request failed');
  }

  return (await response.json().catch(() => null)) as T;
}

/** The global-customer identity returned by `/auth/customer/*`. */
export interface CustomerIdentity {
  id: string;
  email: string;
  name: string | null;
  hasPassword?: boolean;
}

export interface AuthResult {
  cookie: string | null;
  customer: CustomerIdentity;
}

/**
 * Sign in as a global customer (cookie session). On success gaming-api sets the
 * `agora_customer` cookie via `Set-Cookie`; we return the extracted cookie so the
 * caller can persist it (and gate navigation on a successful save).
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/customer/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  const json = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : json.message || 'Invalid credentials');
  }

  return { cookie: extractSessionCookie(response.headers.get('set-cookie')), customer: json.customer };
}

/**
 * Register a new global customer (cookie session). gaming-api signs the customer
 * straight in and returns the `agora_customer` cookie via `Set-Cookie`.
 */
export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/customer/sign-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
    credentials: 'include',
  });

  const json = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : json.message || 'Registration failed');
  }

  return { cookie: extractSessionCookie(response.headers.get('set-cookie')), customer: json.customer };
}
