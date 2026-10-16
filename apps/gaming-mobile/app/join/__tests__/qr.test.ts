import { describe, it, expect } from 'vitest';
import { extractQrToken } from '../../../lib/qr';

describe('extractQrToken', () => {
  it('should extract correct qrToken from standard URL', () => {
    const data = 'https://example.izur.com.ph/login?type=player&qrToken=qr-dev1-12345-nonce:sig';
    expect(extractQrToken(data)).toBe('qr-dev1-12345-nonce:sig');
  });

  it('should extract token from the main-domain redirect URL (?t=)', () => {
    const data =
      'https://chrono.izur.com.ph/q?t=qr-dev1-12345-nonce:sig';
    expect(extractQrToken(data)).toBe('qr-dev1-12345-nonce:sig');
  });

  it('should use raw data if no URL structure', () => {
    const data = 'qr-dev2-67890-n:s';
    expect(extractQrToken(data)).toBe('qr-dev2-67890-n:s');
  });

  it('should use original data if URL lacks qrToken', () => {
    const data = 'https://example.com/login?type=player';
    expect(extractQrToken(data)).toBe('https://example.com/login?type=player');
  });

  it('should use original data if malformed URL', () => {
    const data = 'https://example.com/::malformed::';
    expect(extractQrToken(data)).toBe('https://example.com/::malformed::');
  });

  it('should leave plain cafe/branch codes untouched', () => {
    expect(extractQrToken('IZUR-01')).toBe('IZUR-01');
  });
});
