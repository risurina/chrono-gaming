import { apiService } from './api-service';
import { sessionStorage } from './session-storage';

export type LandingRoute = '/customer' | '/join';

/**
 * Where to send a customer once their session is known valid:
 *  - a venue is already selected → straight to the dashboard;
 *  - no venue selected but they belong to exactly one → auto-select it;
 *  - otherwise → venue selection (pick an existing one or join a new cafe).
 *
 * Never throws — any lookup failure falls through to venue selection.
 */
export async function resolveLandingRoute(): Promise<LandingRoute> {
  const slug = await sessionStorage.getTenantSlug();
  if (slug) return '/customer';

  try {
    const memberships = await apiService.venue.memberships();
    if (memberships.length === 1) {
      await sessionStorage.setTenantSlug(memberships[0].tenantSlug);
      return '/customer';
    }
  } catch {
    // ignore — fall through to venue selection
  }
  return '/join';
}
