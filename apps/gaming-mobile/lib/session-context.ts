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
 * Outcome of resolving tenant context from the customer's joined cafes. `empty`
 * means the lookup succeeded but the user has joined no cafe yet (a benign
 * state), while `error` means the cafes request itself failed — the two must not
 * be conflated so callers can surface a real failure instead of silently showing
 * "No Linked Cafe".
 */
export type TenantContextResolution =
  | { status: 'resolved'; context: ResolvedTenantContext }
  | { status: 'empty' }
  | { status: 'error'; error: unknown };

interface CafeBranch {
  branchId: string;
  branchCode: string;
  branchName: string;
}

interface Cafe {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  branches: CafeBranch[];
}

/**
 * Persist the tenant/branch context an authenticated member operates in. Storing
 * the slug + branch code lets `mobile-api-client` resolve the tenant (via
 * `x-tenant-slug`) and gives screens display context. Note the slug alone scopes
 * every member/portal call now; branch context is display-only (gaming-api has no
 * branch-addressed member session route).
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

/** Build a resolved context from a cafe + its first branch. */
function toResolvedContext(cafe: Cafe): ResolvedTenantContext | null {
  const branch = cafe.branches?.[0];
  if (!cafe.tenantSlug) return null;
  return {
    tenantId: cafe.tenantId,
    tenantSlug: cafe.tenantSlug,
    branchId: branch?.branchId ?? '',
    branchCode: branch?.branchCode ?? '',
    tenantName: cafe.tenantName,
    branchName: branch?.branchName,
  };
}

/**
 * Persist tenant/branch context after a `customer.apply`. The apply response
 * carries no tenant/branch detail, but `apiService.customers.join` has already
 * stored the applied slug — so we resolve the full context (tenant name + first
 * branch) from the cafes listing, matching on that slug.
 */
export async function persistTenantContextFromJoin(_applied?: unknown): Promise<boolean> {
  try {
    const appliedSlug = await tokenStorage.getTenantSlug();
    const cafes = (await apiService.customers.getCafes()) as Cafe[];
    const cafe = appliedSlug
      ? cafes.find((c) => c.tenantSlug === appliedSlug) ?? cafes[0]
      : cafes[0];
    if (!cafe) return false;
    const ctx = toResolvedContext(cafe);
    if (!ctx) return false;
    await persistTenantContext(ctx);
    return true;
  } catch (err) {
    logger.warn('Failed to persist tenant context after join:', err);
    return false;
  }
}

/**
 * After sign-in, resolve the member's active tenant context from their joined
 * cafes. Returns a discriminated result so callers can tell "no cafe joined yet"
 * (`empty`) apart from an actual cafes-fetch failure (`error`).
 */
export async function restoreTenantContextFromHistory(): Promise<TenantContextResolution> {
  try {
    const cafes = (await apiService.customers.getCafes()) as Cafe[];
    const cafe = cafes?.[0];
    if (!cafe) return { status: 'empty' };

    const ctx = toResolvedContext(cafe);
    if (!ctx) return { status: 'empty' };

    await persistTenantContext(ctx);
    return { status: 'resolved', context: ctx };
  } catch (err) {
    logger.warn('Failed to resolve tenant context from cafes:', err);
    return { status: 'error', error: err };
  }
}
