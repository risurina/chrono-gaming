import { apiService } from './api-service';
import { tokenStorage } from './token-storage';
import { logger } from './logger';

export interface ResolvedTenantContext {
  tenantId: string;
  tenantSlug: string;
  branchId: string;
  branchCode: string;
  tenantName?: string;
  branchName?: string;
}

/**
 * Outcome of resolving tenant context from customer history. `empty` means the
 * lookup succeeded but the user has joined no cafe yet (a benign state), while
 * `error` means the history request itself failed — the two must not be
 * conflated so callers can surface a real failure instead of silently showing
 * "No Linked Cafe".
 */
export type TenantContextResolution =
  | { status: 'resolved'; context: ResolvedTenantContext }
  | { status: 'empty' }
  | { status: 'error'; error: unknown };

/**
 * Persist the tenant/branch context an authenticated member operates in. Storing
 * the slug + branch code lets `mobile-api-client` resolve the tenant (via
 * `x-oikos-hostname`) and address branch-scoped member routes.
 */
export async function persistTenantContext(ctx: {
  tenantId?: string;
  tenantSlug?: string | null;
  branchId?: string;
  branchCode?: string | null;
}): Promise<void> {
  if (ctx.tenantId) await tokenStorage.saveTenantId(ctx.tenantId);
  if (ctx.tenantSlug) await tokenStorage.saveTenantSlug(ctx.tenantSlug);
  if (ctx.branchId) await tokenStorage.saveBranchId(ctx.branchId);
  if (ctx.branchCode) await tokenStorage.saveBranchCode(ctx.branchCode);
}

/**
 * Persist tenant/branch context directly from a `customers/join` response.
 * Preferred over the history round-trip because it cannot be shadowed by other
 * visits and needs no extra request. Falls back to the history lookup when the
 * response is missing the tenant slug (older API).
 */
export async function persistTenantContextFromJoin(res: {
  tenantId?: string;
  tenantSlug?: string | null;
  branchId?: string;
  branch?: { code?: string | null } | null;
}): Promise<boolean> {
  if (res?.tenantId && res.tenantSlug && res.branchId && res.branch?.code) {
    await persistTenantContext({
      tenantId: res.tenantId,
      tenantSlug: res.tenantSlug,
      branchId: res.branchId,
      branchCode: res.branch.code,
    });
    return true;
  }
  logger.warn('Join response missing tenant context; falling back to history lookup');
  return (await restoreTenantContextFromHistory()).status === 'resolved';
}

/**
 * After sign-in, resolve the member's active tenant context from their most
 * recently visited cafe (customer history is user-scoped and tenant-agnostic).
 * Returns a discriminated result so callers can tell "no cafe joined yet"
 * (`empty`) apart from an actual history-fetch failure (`error`).
 */
export async function restoreTenantContextFromHistory(): Promise<TenantContextResolution> {
  try {
    const history = await apiService.customers.getHistory();
    const latest = history?.[0];
    if (!latest?.tenantSlug || !latest?.branchCode) return { status: 'empty' };

    const ctx: ResolvedTenantContext = {
      tenantId: latest.tenantId,
      tenantSlug: latest.tenantSlug,
      branchId: latest.branchId,
      branchCode: latest.branchCode,
      tenantName: latest.tenantName,
      branchName: latest.branchName,
    };
    await persistTenantContext(ctx);
    return { status: 'resolved', context: ctx };
  } catch (err) {
    logger.warn('Failed to resolve tenant context from history:', err);
    return { status: 'error', error: err };
  }
}
