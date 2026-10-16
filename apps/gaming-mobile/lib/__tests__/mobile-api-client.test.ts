import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTokenStorage, mockRouter } = vi.hoisted(() => ({
  mockTokenStorage: {
    getToken: vi.fn<() => Promise<string | null>>().mockResolvedValue('agora_customer=sess-123'),
    getTenantSlug: vi.fn<() => Promise<string | null>>().mockResolvedValue('acme'),
    saveToken: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deleteToken: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
  mockRouter: { replace: vi.fn() },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

vi.mock('expo-router', () => ({
  router: mockRouter,
}));

vi.mock('../token-storage', () => ({
  tokenStorage: mockTokenStorage,
}));

import { mobileApiFetch, ApiError } from '../mobile-api-client';

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('mobileApiFetch (gaming-api bare JSON)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenStorage.getToken.mockResolvedValue('agora_customer=sess-123');
    mockTokenStorage.getTenantSlug.mockResolvedValue('acme');
  });

  it('returns the bare JSON body and attaches cookie + tenant headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ balance: '50.00', currency: 'PHP', exists: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await mobileApiFetch<{ balance: string }>('/portal/wallet/balance');

    expect(result).toEqual({ balance: '50.00', currency: 'PHP', exists: true });
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Cookie')).toBe('agora_customer=sess-123');
    expect(headers.get('x-tenant-slug')).toBe('acme');
    expect(init.credentials).toBe('include');
    // GET requests never carry the member-action header.
    expect(headers.get('x-member-action')).toBeNull();
  });

  it('adds x-member-action on mutating /portal/* requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ member: { id: 'm1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await mobileApiFetch('/portal/customer/apply', { method: 'POST', body: '{}' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('x-member-action')).toBe('1');
  });

  it('does NOT add x-member-action on mutating reservation requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ reservation: { id: 'r1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await mobileApiFetch('/portal/reservations', { method: 'POST', body: '{}' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('x-member-action')).toBeNull();
  });

  it('throws ApiError with HTTP_<status> for a bare { error } string body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Insufficient balance' }, 402)),
    );

    const err: any = await mobileApiFetch('/portal/reservations/history').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Insufficient balance');
    expect(err.code).toBe('HTTP_402');
    expect(err.status).toBe(402);
  });

  it('purges the stored session on a 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401)));

    const err: any = await mobileApiFetch('/portal/members/me').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(mockTokenStorage.deleteToken).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('falls back to HTTP_<status> when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway error', { status: 502 })));

    const err: any = await mobileApiFetch('/portal/members/me').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('HTTP_502');
    expect(err.status).toBe(502);
  });
});
