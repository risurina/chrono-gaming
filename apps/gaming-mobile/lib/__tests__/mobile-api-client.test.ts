import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTokenStorage, mockRouter } = vi.hoisted(() => ({
  mockTokenStorage: {
    getToken: vi.fn<() => Promise<string | null>>().mockResolvedValue('token-123'),
    getTenantSlug: vi.fn<() => Promise<string | null>>().mockResolvedValue('acme'),
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

describe('mobileApiFetch envelope handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenStorage.getToken.mockResolvedValue('token-123');
    mockTokenStorage.getTenantSlug.mockResolvedValue('acme');
  });

  it('unwraps `data` from a successful envelope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { balance: '50.00' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await mobileApiFetch<{ balance: string }>('/tenant/wallet/balance');

    expect(result).toEqual({ balance: '50.00' });
    // Auth + tenant headers are attached.
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('x-oikos-hostname')).toContain('acme.');
  });

  it('throws ApiError (preserving code/details) for success:false on a 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: false,
          error: {
            code: 'RESERVATIONS_PAUSED',
            message: 'Reservations are paused right now.',
            details: { reopensAt: '2026-07-11T09:00:00.000Z' },
          },
        }),
      ),
    );

    const err: any = await mobileApiFetch('/member/reservations').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('RESERVATIONS_PAUSED');
    expect(err.message).toBe('Reservations are paused right now.');
    expect(err.details).toEqual({ reopensAt: '2026-07-11T09:00:00.000Z' });
    expect(err.status).toBe(200);
  });

  it('throws ApiError with envelope code for non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: { code: 'INSUFFICIENT_BALANCE', message: 'Top up first.' },
          },
          402,
        ),
      ),
    );

    const err: any = await mobileApiFetch('/member/reservations').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.status).toBe(402);
  });

  it('purges the stored token on a 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401),
      ),
    );

    const err: any = await mobileApiFetch('/member/profile').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(mockTokenStorage.deleteToken).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('falls back to HTTP_<status> code when the error body is not an envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('gateway error', { status: 502 })),
    );

    const err: any = await mobileApiFetch('/member/profile').catch((e: any) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('HTTP_502');
    expect(err.status).toBe(502);
  });
});
