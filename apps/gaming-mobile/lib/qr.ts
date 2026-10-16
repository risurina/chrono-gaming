/**
 * Extract the Chrono QR token from scanned QR data.
 *
 * Station-login QR codes may encode either the raw token (`qr-...`) or a URL
 * that carries the token in a query parameter. Two URL shapes exist: the stable
 * main-domain redirect the PC renders (`{mainBase}/q?t=<token>`) and the resolved
 * login link it redirects to (`.../login?...&qrToken=<token>`). Both param names
 * are accepted. Any other payload is returned unchanged so callers can decide how
 * to handle it (e.g. cafe/branch join codes).
 */
export function extractQrToken(data: string): string {
  if (data.startsWith('http://') || data.startsWith('https://')) {
    try {
      const url = new URL(data);
      const urlQrToken = url.searchParams.get('qrToken') ?? url.searchParams.get('t');
      if (urlQrToken) {
        return urlQrToken;
      }
    } catch {
      // Malformed URL — fall through and return the raw data.
    }
  }
  return data;
}
